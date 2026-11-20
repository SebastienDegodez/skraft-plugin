// What an agent did in each turn of a trial, and where its turns went.
//
// A turn is one model call: everything between a turn_start and its turn_end. Its tool calls
// run between them; a turn that calls one read-only tool is a turn a batched read would save.

const TEST = /\b(?:dotnet\s+test|npm\s+(?:run\s+)?test|npx\s+vitest|vitest|pytest|jest|mvn\s+(?:-\S+\s+)*test|gradle\w*\s+test|go\s+test)\b/
const MUTATION = /\bstryker\b|\bpitest\b|\bmutmut\b/i
const BUILD = /\b(?:dotnet\s+(?:build|restore|format)|npm\s+(?:run\s+)?(?:build|lint)|tsc|mvn\s+(?:-\S+\s+)*(?:compile|package)|gradle\w*\s+build)\b/
const GIT = /^\s*git\b|&&\s*git\s+commit\b/
const READ_TOOLS = new Set(['view', 'read', 'read_file', 'glob', 'grep', 'search', 'list', 'ls', 'find'])
const EDIT_TOOLS = new Set(['edit', 'create', 'write', 'str_replace', 'str_replace_editor', 'apply_patch', 'insert'])
const SKILL_TOOLS = new Set(['skill', 'Skill'])

const timeOf = (event) => {
  const value = new Date(event?.timestamp ?? NaN).getTime()
  return Number.isFinite(value) ? value : null
}

const argsOf = (call) => call?.data?.arguments ?? {}

const commandOf = (call) => {
  const args = argsOf(call)
  return typeof args === 'string' ? args : String(args.command ?? args.cmd ?? '')
}

const targetOf = (call) => {
  const args = argsOf(call)
  if (typeof args === 'string') return args
  return String(args.path ?? args.file_path ?? args.filePath ?? args.pattern ?? args.skill ?? args.name ?? args.command ?? '')
}

/** The kind of work a tool call does, by its tool and, for a shell, its command. */
export function categoryOf(toolName, command = '') {
  if (SKILL_TOOLS.has(toolName)) return 'skill'
  if (READ_TOOLS.has(toolName)) return 'read'
  if (EDIT_TOOLS.has(toolName)) return 'edit'
  if (toolName !== 'bash' && toolName !== 'shell' && toolName !== 'powershell') return 'other'
  if (MUTATION.test(command)) return 'mutation'
  // A heredoc or redirect into a file is a write, whatever runs after it.
  if (/^\s*(?:cat|tee|printf|echo)\b[^|]*(?:>|\btee\b)/.test(command)) {
    return TEST.test(command) ? 'edit+test' : 'edit'
  }
  if (TEST.test(command)) return GIT.test(command) ? 'test+commit' : 'test'
  if (BUILD.test(command)) return 'build'
  if (GIT.test(command)) return 'git'
  if (/^\s*(?:cat|head|tail|sed\s+-n|ls|find|grep|rg|wc)\b/.test(command)) return 'read'
  return 'shell'
}

const resultLength = (event) => {
  const data = event?.data?.result
  if (data == null) return 0
  if (typeof data === 'string') return data.length
  return String(data.content ?? data.detailedContent ?? JSON.stringify(data)).length
}

const openTurn = (event, index) => ({
  index,
  start: timeOf(event),
  end: null,
  inputTokens: 0,
  outputTokens: 0,
  calls: [],
})

/** Groups a trial's events into turns, each with its tool calls, their time and output size. */
export function turnsOf(events = []) {
  const turns = []
  const pending = new Map()
  let current = null
  const ensure = (event) => {
    if (current === null) {
      current = openTurn(event, turns.length + 1)
      turns.push(current)
    }
    return current
  }
  for (const event of events) {
    if (event?.type === 'turn_start') {
      current = openTurn(event, turns.length + 1)
      turns.push(current)
    } else if (event?.type === 'turn_end') {
      if (current) current.end = timeOf(event)
      current = null
    } else if (event?.type === 'token_usage') {
      const turn = ensure(event)
      turn.inputTokens += Number(event.data?.inputTokens ?? 0)
      turn.outputTokens += Number(event.data?.outputTokens ?? 0)
    } else if (event?.type === 'tool_call') {
      const turn = ensure(event)
      const call = {
        tool: event.data?.toolName ?? 'unknown',
        target: targetOf(event),
        category: categoryOf(event.data?.toolName ?? 'unknown', commandOf(event)),
        start: timeOf(event),
        durationMs: 0,
        outputChars: 0,
      }
      turn.calls.push(call)
      pending.set(JSON.stringify([event.agentId ?? null, event.data?.toolCallId]), call)
    } else if (event?.type === 'tool_result') {
      const key = JSON.stringify([event.agentId ?? null, event.data?.toolCallId])
      const call = pending.get(key)
      if (call) {
        pending.delete(key)
        const end = timeOf(event)
        call.durationMs = call.start !== null && end !== null ? Math.max(0, end - call.start) : 0
        call.outputChars = resultLength(event)
      }
    }
  }
  return turns.map((turn) => ({ ...turn, durationMs: turn.start !== null && turn.end !== null ? turn.end - turn.start : null }))
}

const READ_ONLY = new Set(['read', 'skill'])

/**
 * Where the turns went: per category, how many calls, how long and how much output; how many
 * turns made no call, one read-only call (a batched read saves them), or ran a test alone.
 */
export function turnSummary(turns) {
  const categories = {}
  for (const call of turns.flatMap((turn) => turn.calls)) {
    const entry = (categories[call.category] ??= { calls: 0, durationMs: 0, outputChars: 0 })
    entry.calls += 1
    entry.durationMs += call.durationMs
    entry.outputChars += call.outputChars
  }
  const single = (predicate) => turns.filter((turn) => turn.calls.length === 1 && predicate(turn.calls[0])).length
  return {
    turns: turns.length,
    noTool: turns.filter((turn) => turn.calls.length === 0).length,
    singleRead: single((call) => READ_ONLY.has(call.category)),
    singleTest: single((call) => call.category === 'test'),
    parallel: turns.filter((turn) => turn.calls.length > 1).length,
    categories,
  }
}

const seconds = (ms) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)} s`)
const short = (text, width = 70) => {
  const line = String(text).replace(/\s+/g, ' ').trim()
  return line.length > width ? `${line.slice(0, width - 1)}…` : line
}

/** Markdown: the summary, then one line per turn. */
export function renderTurns(turns, { title = 'Tours' } = {}) {
  const summary = turnSummary(turns)
  const lines = [
    `## ${title}`,
    '',
    `${summary.turns} tours — sans outil : ${summary.noTool} · une seule lecture : ${summary.singleRead} · un seul lancement de tests : ${summary.singleTest} · plusieurs appels : ${summary.parallel}`,
    '',
    '| Catégorie | Appels | Temps | Sortie (car.) |',
    '|---|---|---|---|',
    ...Object.entries(summary.categories)
      .sort(([, left], [, right]) => right.calls - left.calls)
      .map(([name, entry]) => `| ${name} | ${entry.calls} | ${seconds(entry.durationMs)} | ${entry.outputChars} |`),
    '',
    '| # | Durée | Tokens entrée | Appels |',
    '|---|---|---|---|',
    ...turns.map((turn) => {
      const calls = turn.calls.map((call) => `${call.category}: ${short(call.target, 50)} (${seconds(call.durationMs)})`).join(' · ')
      return `| ${turn.index} | ${seconds(turn.durationMs)} | ${turn.inputTokens} | ${calls || '— réponse sans outil'} |`
    }),
  ]
  return `${lines.join('\n')}\n`
}
