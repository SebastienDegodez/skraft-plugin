// `claude plugin test`, run by ../run-plugin-test.mjs on a copy of the plugin: the real
// hooks module inside the engine's own runtime. The test's hooks stand for the engine
// beneath the mod: a file system in a Map and the Agent tool. The kit drops the agentId a
// hook answers `agent.spawn` with (core alone sets it), so here every spawn reaches the
// researcher and then counts as not started; the Node tests beside this folder drive the
// answered path (turn.complete) with scripted `$` functions.
import { describe, expect, mock, test } from 'claude-code/testing'
import { PLUGIN_FILES } from './plugin-files'

const CWD = '/work'
const PANE = 'skraft-pipeline'
const NOT_STARTED = 'skraft checkout: blocked (agent-unavailable) — skraft:solution-researcher was not started'
const TEMPLATE = '<!-- markdownlint-disable-file -->\n# Research: {{topic}}\n'
const PHASES = '▶ RESEARCH\n· DESIGN\n· DISTILL\n· DELIVER\n· PUBLISH'

/** A file the plugin ships (the workflow, its agents), served by its path under the plugin root. */
const shipped = (path: string) => Object.entries(PLUGIN_FILES).find(([relative]) => path.endsWith(`/${relative}`))?.[1]

type Spawn = { prompt: string; subagentType?: string; description?: string }

const outputsOf = (prompt: string) => {
  const lines = prompt.split('\n')
  const from = lines.findIndex((line) => line.startsWith('- Fill each output')) + 1
  const paths: string[] = []
  for (const line of lines.slice(from)) {
    if (!line.startsWith('- /')) break
    paths.push(line.slice(2))
  }
  return paths
}

/** The home folder node names on this machine, where the environment names none. */
const HOME = '/home/dev'
/** A new key per call, as the real command makes one: its id and key from how many it made. */
const newKey = (files: Map<string, string>, home: string) => {
  const made = [...files.keys()].filter((path) => path.startsWith(`${home}/.skraft/journal-keys/`)).length + 1
  return { id: String(made).padStart(32, '0'), key: String(made).padStart(64, 'a') }
}

/**
 * The machine beneath `$.process.run`: node runs the engine's lock-file command, its home
 * folder and its lock writes on the Map; any other program fails, as in a folder that is no repository.
 */
const machine = (files: Map<string, string>, argv: readonly string[]) => {
  if (argv[0] !== 'node') return { exitCode: 128, stdout: '', stderr: 'not a repository' }
  const [verb, path, ...texts] = argv.slice(2)
  if (verb === 'home') return { exitCode: 0, stdout: `${HOME}\n`, stderr: '' }
  const [first, second] = texts.map(decodeURIComponent)
  const done = (ok: boolean) => ({ exitCode: ok ? 0 : 3, stdout: '', stderr: '' })
  if (verb === 'make-key') {
    const { id, key } = newKey(files, path)
    files.set(`${path}/.skraft/journal-keys/${id}.key`, `${key}\n`)
    return { exitCode: 0, stdout: JSON.stringify({ id, key }), stderr: '' }
  }
  if (verb === 'create') return done(!files.has(path) && Boolean(files.set(path, first)))
  if (files.get(path) !== first) return done(false)
  if (verb === 'remove') return done(files.delete(path))
  return done(Boolean(files.set(path, second)))
}

// A repository that answered the consent to open its pull request: no question before the researcher.
const ANSWERED = { publish: { pullRequest: false } }

const world = ($: any, on: any, config: object = ANSWERED) => {
  const files = new Map<string, string>([[`${CWD}/skraft-config.json`, JSON.stringify(config)]])
  const spawns: Spawn[] = []
  const seen: Array<string | null> = []
  const logs: string[] = []

  on('session.start', ($$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', ($$: any, e: any) => ({ value: { command: e.name } }))
  on('tool.register', ($$: any, e: any) => ({ value: { tool: `mcp__skraft__${e.name}` } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: CWD }))
  on('env.get', () => ({ value: undefined }))
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [] } }))
  on('process.run', ($$: any, e: any) => ({ value: machine(files, e.argv) }))
  on('fs.exists', ($$: any, e: any) => ({ value: files.has(e.path) || shipped(e.path) !== undefined }))
  on('fs.read', ($$: any, e: any) => {
    if (e.path.endsWith('/assets/templates/research.template.md')) return { value: TEMPLATE }
    if (shipped(e.path) !== undefined) return { value: shipped(e.path) }
    if (!files.has(e.path)) return { deny: `ENOENT: ${e.path}` }
    return { value: files.get(e.path) }
  })
  on('fs.write', ($$: any, e: any) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('ui.log', ($$: any, e: any) => {
    logs.push(typeof e === 'string' ? e : e.text)
    return { value: undefined }
  })
  on('agent.spawn', ($$: any, e: any) => {
    spawns.push({ prompt: e.prompt, subagentType: e.subagentType ?? e.subagent_type, description: e.description })
    seen.push(...outputsOf(e.prompt).map((path) => files.get(path) ?? null))
    return { model: 'test', agentId: `agent-${spawns.length}` }
  })
  on('turn.complete', () => ({ text: '' }))
  return { files, spawns, seen, logs }
}

const settle = async (clock: any) => {
  for (let i = 0; i < 200; i += 1) await clock.settle()
}

describe('skraft mod', () => {
  test('/skraft <slug> starts a run in the background that spawns the researcher on its pre-created document', { timeoutMs: 20_000 } as any, async ($, on) => {
    const clock = mock.clock(on)
    const { files, spawns, seen, logs } = world($, on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: CWD } as any)

    const started = await $.command.run({ command: 'skraft', args: 'checkout #42 Pay by card' } as any)
    expect(started.text).toBe('skraft checkout started — progress in the Skraft pane.')
    expect(spawns).toEqual([])
    await settle(clock)

    expect(spawns.map((spawn) => spawn.subagentType)).toEqual(['skraft:solution-researcher'])
    expect(spawns[0].description).toBe('skraft checkout · research · attempt 1')
    expect(spawns[0].prompt).toMatch(/- Story: #42 — Pay by card/)
    const [output] = outputsOf(spawns[0].prompt)
    expect(output).toMatch(/^\/work\/\.copilot-tracking\/skraft-plans\/checkout\/research\/\d{4}-\d{2}-\d{2}\/checkout-research\.md$/)
    expect(seen).toEqual([TEMPLATE])
    expect(files.get(`${CWD}/.copilot-tracking/skraft-plans/.active-slug`)).toBe('checkout\n')
    expect(logs).toEqual([NOT_STARTED])
    expect([...files.keys()].filter((path) => path.startsWith(`${HOME}/.skraft/journal-keys/`))).toHaveLength(1)
    const journal = [...files].find(([path]) => path.endsWith('/checkout/events.jsonl'))?.[1] ?? ''
    expect(journal.trim().split('\n').every((line) => /,"sig":"[0-9a-f]{64}"}$/.test(line))).toBe(true)
    const runStarted = JSON.parse(journal.split('\n')[0])
    expect([runStarted.story, runStarted.artifacts, runStarted.issueUnread]).toEqual([{ issue: 42, title: 'Pay by card' }, [], 'the working copy has no Git remote whose URL names a host and a repository'])

    const status = await $.command.run({ command: 'skraft', args: '' } as any)
    expect(status.text).toBe(`skraft checkout — blocked\n${PHASES}\nskraft:solution-researcher was not started\nagent: solution-researcher (research, attempt 1)`)
    const decided = await $.command.run({ command: 'skraft', args: 'decide yes' } as any)
    expect(decided.text).toBe('skraft: not recorded — no question to answer; no question is waiting')
  })

  test('the pane draws the run on the terminal and the desktop', { timeoutMs: 20_000 } as any, async ($, on) => {
    const clock = mock.clock(on)
    world($, on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: CWD } as any)
    await $.command.run({ command: 'skraft', args: 'checkout' } as any)
    await settle(clock)

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: 'skraft',
        surface,
        component: 'Pane',
        requestId: PANE,
        props: { title: 'Skraft', isFocused: false, bodyColumns: 80, placement: 'dock' },
      } as any)
      expect(await ui.find({ type: 'Text', text: 'skraft checkout — blocked' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '▶ RESEARCH' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '  ▶ research — solution-researcher' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '  · design — solution-architect' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'agent: solution-researcher (research, attempt 1)' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: NOT_STARTED })).toBeDefined()
      await ui.unmount()
    }
  })

  test('a dismissed consent dialog leaves the question in the pane, whose pressed button records the answer by host and resumes the run', { timeoutMs: 20_000 } as any, async ($, on) => {
    const clock = mock.clock(on)
    const { files } = world($, on, {})
    on('tool.call', { tool: 'AskUserQuestion' }, () => ({ deny: 'dismissed' }))
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: CWD } as any)
    await $.command.run({ command: 'skraft', args: 'checkout' } as any)
    await settle(clock)
    const events = (type: string) => ([...files].find(([path]) => path.endsWith('/checkout/events.jsonl'))?.[1] ?? '')
      .trim().split('\n').map((line) => JSON.parse(line)).filter((event) => event.type === type)
    const answered = () => events('question.answered')

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'skraft', surface, component: 'Pane', requestId: PANE, props: { title: 'Skraft', isFocused: false, bodyColumns: 80, placement: 'dock' } } as any)
      expect(await ui.find({ type: 'Text', text: 'skraft checkout — waiting' })).toBeDefined()
      expect((await ui.findAll({ type: 'Button' })).map((button: any) => button.key)).toEqual(['answer-publish_consent-1-ACCEPTED', 'answer-publish_consent-1-DECLINED'])
      await ui.unmount()
    }
    expect(answered()).toEqual([])

    const ui = await $.ui.mount({ plugin: 'skraft', surface: 'terminal', component: 'Pane', requestId: PANE, props: { title: 'Skraft', isFocused: false, bodyColumns: 80, placement: 'dock' } } as any)
    await ui.press({ key: 'answer-publish_consent-1-DECLINED' })
    await settle(clock)
    await ui.unmount()

    expect(answered().map(({ key, answer, by }: any) => [key, answer, by])).toEqual([['publish_consent-1', 'DECLINED', 'host']])
    expect(events('step.started').map(({ step }: any) => step)).toEqual(['publish_consent', 'visuals_consent', 'research'])
  })

  test('the run_pipeline tool with no slug and no active pipeline is refused', { timeoutMs: 20_000 } as any, async ($, on) => {
    mock.clock(on)
    const { spawns } = world($, on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: CWD } as any)

    const called = await $.tool.call({ tool: 'mcp__skraft__run_pipeline' } as any)
    expect((called as any).result).toMatch(/^skraft: refused \(no-active-pipeline\) — no active pipeline in this working copy/)
    expect(spawns).toEqual([])
  })
})
