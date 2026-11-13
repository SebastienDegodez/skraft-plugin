#!/usr/bin/env node
// Claude Code sub-agent MCP reach probe (#581): does a tool of the plugin's MCP server reach a
// sub-agent, and does the sub-agent's own tool list decide it? Two `claude -p` sessions, each one
// dispatching one sub-agent that holds no file tool, so the plugin version it reports can only come
// from the tool. One arm declares the tool, the other does not. It spends credits.
//
//   node eng/host-probe/claude-subagent-mcp-probe.mjs [--claude <binary>] [--out <dir>] [--keep] [--max-budget-usd <n>]
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { platform, release, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MCP_PREFIX, streamSummary, subagentCalls } from '../lib/claude-stream.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PLUGIN_ROOT = join(REPO_ROOT, 'plugins', 'skraft-framework')
export const REACH_TOOL = `${MCP_PREFIX}skraft_doctor`
const AGENT = 'mcp-reach'
const NO_TOOL = 'NO SKRAFT TOOL AVAILABLE'
const TIMEOUT = 300_000
export const EXPECTED = "Un sous-agent de profondeur 1 reçoit un outil du serveur MCP du plugin quand son descripteur le nomme, et ne le reçoit pas sinon : le bras qui déclare `skraft_doctor` l'appelle et rend la version du plugin, le bras témoin n'appelle aucun outil skraft (#581)."

/** The probe agent: no file tool, so the version it reports can only come from the MCP tool. */
export const agentDefinition = (tools) => ({
  [AGENT]: {
    description: 'Probe: reports what the skraft MCP server says about this installation.',
    prompt: [
      'You are a probe. Call the skraft_doctor tool now. It is your only tool.',
      "Then reply with exactly one line: the plugin version it reports.",
      `If you have no such tool available, reply with exactly: ${NO_TOOL}.`,
      'Never guess a version number.',
    ].join('\n'),
    tools,
  },
})

export const dispatchPrompt = [
  `Dispatch the \`${AGENT}\` subagent with the Task tool; tell it only to run its probe and report the plugin version.`,
  'You have no skraft tool yourself and must not try to use one.',
  'Then reply with exactly one line: the line the subagent reported, verbatim.',
].join('\n')

/** The `claude` arguments of one arm: the main session dispatches, and only the arm's tool is granted. */
export const claudeArgs = ({ pluginRoot, agents, declared, maxBudgetUsd }) => [
  '-p', dispatchPrompt, '--plugin-dir', pluginRoot, '--agents', agents,
  '--output-format', 'stream-json', '--verbose', '--tools', 'Task',
  '--allowedTools', 'Task', ...(declared ? [REACH_TOOL] : []),
  '--permission-prompts', 'none', '--no-session-persistence', '--max-budget-usd', String(maxBudgetUsd),
]

/** What one arm shows: who called the tool, and whether the version came back. */
export const armReading = (summary, version) => ({
  dispatched: summary.dispatches.map(({ type, depth }) => ({ type, depth })),
  subagentCalledTool: subagentCalls(summary.attributed).some(({ name }) => name === REACH_TOOL),
  anyCallOfTool: summary.attributed.some(({ name }) => name === REACH_TOOL),
  quotedVersion: summary.reply === null ? null : summary.reply.includes(version),
  saidNoTool: summary.reply === null ? null : summary.reply.includes(NO_TOOL),
  reply: summary.reply?.slice(0, 200) ?? null, costUsd: summary.costUsd, model: summary.model,
})

/** The declared arm must reach the tool from inside the sub-agent; the control arm must not reach it at all. */
export const reachVerdict = ({ declared, control }) => {
  if (declared.reply === null || control.reply === null) return 'inconclusive'
  const reached = declared.subagentCalledTool && declared.quotedVersion === true
  const denied = !control.anyCallOfTool && control.quotedVersion === false
  return reached && denied ? 'pass' : 'fail'
}

const parseArgs = (argv) => {
  const options = { claude: 'claude', out: 'host-probe-results', keep: false, maxBudgetUsd: 1 }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--claude') options.claude = argv[++index]
    else if (arg === '--out') options.out = argv[++index]
    else if (arg === '--max-budget-usd') options.maxBudgetUsd = Number(argv[++index])
    else if (arg === '--keep') options.keep = true
    else throw new Error('usage: node eng/host-probe/claude-subagent-mcp-probe.mjs [--claude <binary>] [--out <dir>] [--keep] [--max-budget-usd <n>]')
  }
  return options
}

/** One arm: its agent file, its session, its reading. */
const runArm = async ({ options, root, version }, declared) => {
  const agents = join(root, `agents-${declared ? 'declared' : 'control'}.json`)
  await writeFile(agents, `${JSON.stringify(agentDefinition(declared ? [REACH_TOOL] : ['Glob']), null, 2)}\n`)
  const run = spawnSync(options.claude, claudeArgs({ pluginRoot: PLUGIN_ROOT, agents, declared, maxBudgetUsd: options.maxBudgetUsd }), { cwd: root, encoding: 'utf8', timeout: TIMEOUT, maxBuffer: 64 * 1024 * 1024 })
  const summary = streamSummary(run.stdout ?? '')
  return { exitCode: run.status, offeredToMain: summary.skraftTools.length, ...armReading(summary, version) }
}

const pluginVersion = async () => JSON.parse(await readFile(join(PLUGIN_ROOT, 'engine', 'package.json'), 'utf8')).version

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  const claudeCode = spawnSync(options.claude, ['--version'], { encoding: 'utf8' }).stdout?.trim() ?? null
  const version = await pluginVersion()
  const root = await mkdtemp(join(tmpdir(), 'skraft-claude-reach-'))
  console.log(`skraft Claude Code sub-agent MCP reach probe — ${claudeCode ?? '?'} — plugin ${version}`)
  const declared = await runArm({ options, root, version }, true)
  const control = await runArm({ options, root, version }, false)
  const verdict = reachVerdict({ declared, control })
  const report = {
    date: new Date().toISOString(), environment: { claudeCode, node: process.version, os: `${platform()} ${release()}` },
    check: { id: 'claude-subagent-mcp-reach', issue: 581, expected: EXPECTED, verdict, observed: { tool: REACH_TOOL, pluginVersion: version, declared, control } },
  }
  await mkdir(options.out, { recursive: true })
  const file = join(options.out, `claude-subagent-mcp-probe-${report.date.replace(/[:.]/g, '-')}.json`)
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`${verdict.padEnd(12)} claude-subagent-mcp-reach (#581)`)
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
