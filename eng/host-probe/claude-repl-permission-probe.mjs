#!/usr/bin/env node
// Claude Code permission probe for skraft_repl and skraft_repl_reset (lot D): once a host allows
// skraft_repl, any program runs through it, outside the host's per-command Bash rules, so the
// host's own gate is the only one; skraft_repl_reset ends the kernel and its runs, so allowing
// skraft_repl must not allow it. Four `claude -p` sessions, each asked to call one tool once
// (skraft_repl with a cell that starts no program, skraft_repl_reset with no argument): skraft_repl
// unlisted, then allowed by its name; skraft_repl_reset with only skraft_repl allowed, then with
// both allowed. The headless session cannot prompt, so a prompt shows as a denial. Bash is denied
// in all four. Both tools refuse a call outside an open attempt, so what answers is the engine's
// fixed refusal, not a program's output. It spends credits (about 0.6 USD). It measures the first call in `-p`; whether "always allow" persists, the
// behaviour in an interactive session, in VS Code and in Copilot CLI are not measured here.
//
//   node eng/host-probe/claude-repl-permission-probe.mjs [--claude <binary>] [--out <dir>] [--keep] [--max-budget-usd <n>]
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { platform, release, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MCP_PREFIX, streamSummary } from '../lib/claude-stream.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PLUGIN_ROOT = join(REPO_ROOT, 'plugins', 'skraft-framework')
export const REPL_TOOL = `${MCP_PREFIX}skraft_repl`
export const RESET_TOOL = `${MCP_PREFIX}skraft_repl_reset`
/** What the engine answers a call made outside an open attempt (domain/repl/refusals.mjs). */
export const REFUSAL = 'repl-unavailable'
const TIMEOUT = 300_000
export const EXPECTED = "Claude Code ne laisse pas passer un premier appel de `skraft_repl` ou de `skraft_repl_reset` que la session n'a pas autorisé (en `-p`, l'invite se lit comme un refus de permission), autoriser `skraft_repl` n'autorise pas `skraft_repl_reset`, et chacun passe jusqu'au moteur quand il est autorisé par son nom, malgré `Bash` refusé : seule la permission de l'hôte garde chaque outil."

/** The sessions of the probe: the tool each calls, the tools each allows by name. */
export const ARMS = Object.freeze([
  { name: 'unlisted', tool: REPL_TOOL, allowed: [] },
  { name: 'allowed', tool: REPL_TOOL, allowed: [REPL_TOOL] },
  { name: 'resetUnlisted', tool: RESET_TOOL, allowed: [REPL_TOOL] },
  { name: 'resetAllowed', tool: RESET_TOOL, allowed: [REPL_TOOL, RESET_TOOL] },
])

/** What a session is asked: one call of its tool, then the start of the answer. */
export const promptFor = (tool) => [
  tool === REPL_TOOL ? `Call the ${tool} tool exactly once with the argument code set to the text 1+1.` : `Call the ${tool} tool exactly once with no argument.`,
  'Then reply with exactly one line: the first 20 characters of what the tool answered.',
  'If you could not call it, reply with exactly: NOT CALLED.',
].join('\n')

/** The `claude` arguments of one arm: Bash is always denied; the arm names the tools it allows. */
export const claudeArgs = ({ pluginRoot, arm, maxBudgetUsd }) => [
  '-p', promptFor(arm.tool), '--plugin-dir', pluginRoot, '--output-format', 'stream-json', '--verbose',
  '--disallowedTools', 'Bash', ...(arm.allowed.length > 0 ? ['--allowedTools', arm.allowed.join(',')] : []),
  '--no-session-persistence', '--max-budget-usd', String(maxBudgetUsd),
]

/** What one arm shows of its tool: whether it was offered, called, denied, and what answered. */
export const armReading = (summary, tool) => ({
  offered: summary.skraftTools.includes(tool),
  called: summary.attributed.some(({ name }) => name === tool),
  denied: summary.denials.some((denial) => String(denial.tool_name ?? denial.name ?? '') === tool),
  reachedEngine: summary.reply === null ? null : summary.reply.includes(REFUSAL),
  reply: summary.reply?.slice(0, 200) ?? null, costUsd: summary.costUsd, model: summary.model,
})

const stopped = (arm) => arm.denied && arm.reachedEngine === false
const through = (arm) => arm.called && !arm.denied && arm.reachedEngine === true

/** An arm whose tool is not allowed must be stopped by the host and never reach the engine; one whose tool is allowed must reach the engine, no denial. */
export const permissionVerdict = ({ unlisted, allowed, resetUnlisted, resetAllowed }) => {
  if ([unlisted, allowed, resetUnlisted, resetAllowed].some((arm) => arm.reply === null)) return 'inconclusive'
  return stopped(unlisted) && through(allowed) && stopped(resetUnlisted) && through(resetAllowed) ? 'pass' : 'fail'
}

const parseArgs = (argv) => {
  const options = { claude: 'claude', out: 'host-probe-results', keep: false, maxBudgetUsd: 0.5 }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--claude') options.claude = argv[++index]
    else if (arg === '--out') options.out = argv[++index]
    else if (arg === '--max-budget-usd') options.maxBudgetUsd = Number(argv[++index])
    else if (arg === '--keep') options.keep = true
    else throw new Error('usage: node eng/host-probe/claude-repl-permission-probe.mjs [--claude <binary>] [--out <dir>] [--keep] [--max-budget-usd <n>]')
  }
  return options
}

/** One arm: its session, its reading. */
const runArm = ({ options, root }, arm) => {
  const run = spawnSync(options.claude, claudeArgs({ pluginRoot: PLUGIN_ROOT, arm, maxBudgetUsd: options.maxBudgetUsd }), { cwd: root, encoding: 'utf8', timeout: TIMEOUT, maxBuffer: 64 * 1024 * 1024 })
  return { exitCode: run.status, tool: arm.tool, allowed: arm.allowed, ...armReading(streamSummary(run.stdout ?? ''), arm.tool) }
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  const claudeCode = spawnSync(options.claude, ['--version'], { encoding: 'utf8' }).stdout?.trim() ?? null
  const root = await mkdtemp(join(tmpdir(), 'skraft-claude-repl-'))
  console.log(`skraft Claude Code skraft_repl and skraft_repl_reset permission probe — ${claudeCode ?? '?'}`)
  const arms = Object.fromEntries(ARMS.map((arm) => [arm.name, runArm({ options, root }, arm)]))
  const verdict = permissionVerdict(arms)
  const report = {
    date: new Date().toISOString(), environment: { claudeCode, node: process.version, os: `${platform()} ${release()}` },
    check: { id: 'claude-repl-permission', expected: EXPECTED, verdict, observed: arms },
  }
  await mkdir(options.out, { recursive: true })
  const file = join(options.out, `claude-repl-permission-probe-${report.date.replace(/[:.]/g, '-')}.json`)
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`${verdict.padEnd(12)} claude-repl-permission`)
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
