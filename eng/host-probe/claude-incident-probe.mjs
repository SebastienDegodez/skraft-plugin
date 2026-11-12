#!/usr/bin/env node
// Claude Code incident probe (#566): one `claude -p` session, with the plugin loaded from this
// checkout, is asked to settle the environment question an unforeseen failure left. It may use
// only Read and the skraft MCP server's skraft_status and skraft_answer; anything else that would
// prompt is denied. One prompt to the host default model: it spends credits.
//
//   node eng/host-probe/claude-incident-probe.mjs [--claude <binary>] [--out <dir>] [--keep] [--max-budget-usd <n>]
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, platform, release, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { INCIDENT_SLUG, questionEvents, writeIncidentRepo } from './fixtures.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PLUGIN_ROOT = join(REPO_ROOT, 'plugins', 'skraft-framework')
const MCP_PREFIX = 'mcp__plugin_skraft_skraft__'
export const INCIDENT_TOOLS = Object.freeze(['Read', `${MCP_PREFIX}skraft_status`, `${MCP_PREFIX}skraft_answer`])
const TIMEOUT = 300_000
const EXPECTED = "Une session Claude Code `-p` (modèle par défaut de l'hôte), à qui le développeur délègue la décision, lit la question `environment` d'un échec imprévu par `skraft_status`, ouvre le fichier de sortie qu'elle nomme, enregistre une option du menu par `skraft_answer {key, answer}` une seule fois (`by: decide`), et cite le jeton que seul ce fichier contient (#566)."

export const incidentPrompt = () => [
  'The skraft pipeline of this working copy is paused on a question. I delegate this decision to you: do not ask anyone.',
  '1. Read the pending question with the skraft_status tool.',
  '2. Open the output file the question names and read what the failing command printed.',
  '3. Choose one of the offered options and record it with the skraft_answer tool {key, answer}, once.',
  'Then reply with one line: the identifier that follows "Error:" in that output, and the option you recorded.',
].join('\n')

/** The `claude` arguments of the probe session: no tool beyond INCIDENT_TOOLS, nothing prompts. */
export const claudeArgs = ({ pluginRoot, maxBudgetUsd }) => [
  '-p', incidentPrompt(), '--plugin-dir', pluginRoot, '--output-format', 'stream-json', '--verbose',
  '--tools', 'Read', '--allowedTools', ...INCIDENT_TOOLS, '--permission-prompts', 'none',
  '--no-session-persistence', '--max-budget-usd', String(maxBudgetUsd),
]

const parseLine = (line) => {
  try { return JSON.parse(line) } catch { return null }
}

/** What the stream of one `claude -p --output-format stream-json` run shows. */
export const streamSummary = (text) => {
  const events = text.split(/\r?\n/).map(parseLine).filter((event) => event !== null)
  const init = events.find((event) => event.type === 'system' && event.subtype === 'init') ?? {}
  const result = events.find((event) => event.type === 'result') ?? null
  const calls = events.filter((event) => event.type === 'assistant').flatMap((event) => event.message?.content ?? [])
    .filter((part) => part.type === 'tool_use').map(({ name, input }) => ({ name, input }))
  return {
    model: init.model ?? null, claudeCode: init.claude_code_version ?? null,
    skraftTools: (init.tools ?? []).filter((name) => name.includes('skraft')),
    mcpServers: (init.mcp_servers ?? []).filter(({ name }) => name.includes('skraft')),
    plugins: init.plugins ?? null, calls,
    reply: result?.result ?? null, isError: result?.is_error ?? null, costUsd: result?.total_cost_usd ?? null,
    modelUsage: result?.modelUsage ?? null, denials: result?.permission_denials ?? [],
  }
}

/** Whether the session read, then answered once from the menu, and quoted what only the log holds. */
export const incidentVerdict = ({ summary, answered, token, options }) => {
  if (summary.reply === null) return 'inconclusive'
  const read = summary.calls.some(({ name }) => name === `${MCP_PREFIX}skraft_status`)
  const recorded = answered.length === 1 && options.includes(answered[0].answer) && answered[0].by === 'decide'
  return read && recorded && summary.reply.includes(token) ? 'pass' : 'fail'
}

const parseArgs = (argv) => {
  const options = { claude: 'claude', out: 'host-probe-results', keep: false, maxBudgetUsd: 1 }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--claude') options.claude = argv[++index]
    else if (arg === '--out') options.out = argv[++index]
    else if (arg === '--max-budget-usd') options.maxBudgetUsd = Number(argv[++index])
    else if (arg === '--keep') options.keep = true
    else throw new Error('usage: node eng/host-probe/claude-incident-probe.mjs [--claude <binary>] [--out <dir>] [--keep] [--max-budget-usd <n>]')
  }
  return options
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  const version = spawnSync(options.claude, ['--version'], { encoding: 'utf8' }).stdout?.trim() ?? null
  const root = await mkdtemp(join(tmpdir(), 'skraft-claude-probe-'))
  const repo = join(root, 'incident')
  const token = `skraft-probe-incident-${Date.now().toString(36)}`
  const fixture = await writeIncidentRepo(repo, PLUGIN_ROOT, homedir(), token)
  console.log(`skraft Claude Code incident probe — ${version ?? '?'}`)
  const run = spawnSync(options.claude, claudeArgs({ pluginRoot: PLUGIN_ROOT, maxBudgetUsd: options.maxBudgetUsd }), { cwd: repo, encoding: 'utf8', timeout: TIMEOUT, maxBuffer: 64 * 1024 * 1024 })
  const summary = streamSummary(run.stdout ?? '')
  const answered = (await questionEvents(repo, INCIDENT_SLUG)).filter((event) => event.type === 'question.answered').map(({ key, answer, by }) => ({ key, answer, by }))
  const verdict = incidentVerdict({ summary, answered, token, options: fixture.options })
  const report = {
    date: new Date().toISOString(), environment: { claudeCode: version, node: process.version, os: `${platform()} ${release()}` },
    check: { id: 'claude-incident-read-answered', issue: 566, expected: EXPECTED, verdict, observed: { exitCode: run.status, signal: run.signal, quotedToken: summary.reply?.includes(token) ?? false, answered, ...summary, reply: summary.reply?.slice(0, 300) ?? null } },
  }
  await mkdir(options.out, { recursive: true })
  const file = join(options.out, `claude-incident-probe-${report.date.replace(/[:.]/g, '-')}.json`)
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`${verdict.padEnd(12)} claude-incident-read-answered (#566)`)
  console.log(`report: ${resolve(file)}`)
  if (!options.keep) await rm(root, { recursive: true, force: true })
  else console.log(`fixture kept in ${root}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(String(error?.message ?? error))
    process.exitCode = 1
  })
}
