#!/usr/bin/env node
// Claude Code permission probe for skraft_repl (lot D): once a host allows the tool, any program
// runs through it, outside the host's per-command Bash rules, so the host's own gate is the only
// one. Two `claude -p` sessions, each asked to call skraft_repl once with a cell that starts no
// program: one with the tool unlisted (the headless session cannot prompt, so a prompt shows as a
// denial), one with the tool allowed by its name. Bash is denied in both. The tool refuses a call
// outside an open attempt, so what answers is the engine's fixed refusal, not a program's output.
// It spends credits. It measures the first call in `-p`; whether "always allow" persists, the
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
/** What the engine answers a call made outside an open attempt (domain/repl/refusals.mjs). */
export const REFUSAL = 'repl-unavailable'
const TIMEOUT = 300_000
export const EXPECTED = "Claude Code ne laisse pas passer un premier appel de `skraft_repl` que la session n'a pas autorisé (en `-p`, l'invite se lit comme un refus de permission), et le laisse passer jusqu'au moteur quand l'outil est autorisé par son nom, malgré `Bash` refusé : seule la permission de l'hôte garde l'outil."

export const prompt = [
  `Call the ${REPL_TOOL} tool exactly once with the argument code set to the text 1+1.`,
  'Then reply with exactly one line: the first 20 characters of what the tool answered.',
  'If you could not call it, reply with exactly: NOT CALLED.',
].join('\n')

/** The `claude` arguments of one arm: Bash is always denied; the arm that allows the tool names it. */
export const claudeArgs = ({ pluginRoot, allowed, maxBudgetUsd }) => [
  '-p', prompt, '--plugin-dir', pluginRoot, '--output-format', 'stream-json', '--verbose',
  '--disallowedTools', 'Bash', ...(allowed ? ['--allowedTools', REPL_TOOL] : []),
  '--no-session-persistence', '--max-budget-usd', String(maxBudgetUsd),
]

/** What one arm shows: whether the tool was offered, called, denied, and what answered. */
export const armReading = (summary) => ({
  offered: summary.skraftTools.includes(REPL_TOOL),
  called: summary.attributed.some(({ name }) => name === REPL_TOOL),
  denied: summary.denials.some((denial) => String(denial.tool_name ?? denial.name ?? '').includes('skraft_repl')),
  reachedEngine: summary.reply === null ? null : summary.reply.includes(REFUSAL),
  reply: summary.reply?.slice(0, 200) ?? null, costUsd: summary.costUsd, model: summary.model,
})

/** The unlisted arm must be stopped by the host and never reach the engine; the allowed arm must reach the engine, no denial. */
export const permissionVerdict = ({ unlisted, allowed }) => {
  if (unlisted.reply === null || allowed.reply === null) return 'inconclusive'
  const stopped = unlisted.denied && unlisted.reachedEngine === false
  const through = allowed.called && !allowed.denied && allowed.reachedEngine === true
  return stopped && through ? 'pass' : 'fail'
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
const runArm = ({ options, root }, allowed) => {
  const run = spawnSync(options.claude, claudeArgs({ pluginRoot: PLUGIN_ROOT, allowed, maxBudgetUsd: options.maxBudgetUsd }), { cwd: root, encoding: 'utf8', timeout: TIMEOUT, maxBuffer: 64 * 1024 * 1024 })
  return { exitCode: run.status, ...armReading(streamSummary(run.stdout ?? '')) }
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  const claudeCode = spawnSync(options.claude, ['--version'], { encoding: 'utf8' }).stdout?.trim() ?? null
  const root = await mkdtemp(join(tmpdir(), 'skraft-claude-repl-'))
  console.log(`skraft Claude Code skraft_repl permission probe — ${claudeCode ?? '?'}`)
  const unlisted = runArm({ options, root }, false)
  const allowed = runArm({ options, root }, true)
  const verdict = permissionVerdict({ unlisted, allowed })
  const report = {
    date: new Date().toISOString(), environment: { claudeCode, node: process.version, os: `${platform()} ${release()}` },
    check: { id: 'claude-repl-permission', expected: EXPECTED, verdict, observed: { tool: REPL_TOOL, unlisted, allowed } },
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
