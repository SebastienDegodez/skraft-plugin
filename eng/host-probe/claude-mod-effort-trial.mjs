#!/usr/bin/env node
// Claude Code trial for #258: whether a mod can pass a reasoning effort to the agents it spawns,
// and how it can see what effort an agent ran at, without a model call. A throwaway mod hooks
// `prompt.submit` and, from there:
//   - registers agent types with `$.agent.register` (a level, a number, an invalid level);
//   - spawns agent-file types (frontmatter `effort:` low / max / none), registered types, and
//     passes an `effort` field `$.agent.spawn` does not type;
//   - a second throwaway mod rewrites `effort` in a `turn.step` hook (`--plugin-dir` order: first or
//     second), to see whether the rewrite reaches the recording hook of the first;
// while a `turn.step` hook records the `effort` the engine is about to send for each subagent
// step and answers the step itself (no `next`), so no request reaches a model. A manual trial,
// not a check: it prints what it saw for docs/v2/host-verification.md.
// The session model is `sonnet` (a model that takes an effort; an unknown model reports none),
// the subagents inherit it, and no request is made.
//
//   With `--capture` the requests go to a local server that records `output_config.effort` of each and
//   answers 400: the effort the host sends, still with no model call; the rewriter then raises the
//   subagents left at the default (`medium`) to `max`, and the spawns are one by one so the requests
//   follow their order.
//
//   With `--concurrent` (it implies `--capture`) the mod instead spawns BATCHES batches of PER_BATCH subagents at
//   once (`Promise.all`, as the engine's `runMany` does) and notes, for each step, whether the spawn of its agent
//   had resolved when the step arrived (`spawnResolved`): a `false` is the first-step race of the effort table.
//
//   node eng/host-probe/claude-mod-effort-trial.mjs [--claude <claude binary>] [--rewriter-first] [--capture] [--concurrent] [--keep]
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { platform, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN = 'skraft-effort-trial'
const RESULT_FILE = 'effort-trial-result.json'

/** The hooks module: every call's value or error, and each subagent step's effort, to RESULT_FILE. */
const BATCHES = 5
const PER_BATCH = 3
const registerSource = (capture, concurrent) => `import type { Register } from 'claude-code'

const attempt = async (call: () => Promise<unknown>) => {
  try { return { value: await call() } } catch (error) { return { error: String((error as Error)?.message ?? error) } }
}

export const register: Register = (on) => {
  let tick = 0
  const steps: Array<{ agentId?: string, model: string, effort?: unknown, order: number, spawnResolved: boolean | null }> = []
  const resolved: Record<string, number> = {}
  const resolvedIds = new Set<string>()
  const spawnInputs: Array<{ subagentType: string, keys: string[], effort?: unknown }> = []
  on('agent.spawn', async ($, e, next) => {
    spawnInputs.push({ subagentType: e.subagentType, keys: Object.keys(e).sort(), effort: (e as any).effort })
    return next(e)
  })
  on('turn.step', async function* ($, e, next) {
    steps.push({ agentId: e.agentId, model: e.model, effort: e.effort, order: ++tick, spawnResolved: e.agentId === undefined ? null : resolvedIds.has(e.agentId) })
    ${capture ? 'return yield* next(e)' : "return { turnId: e.turnId, index: e.index, answer: 'skraft-probe-no-request', toolUses: [], stopReason: 'end_turn', usage: null } as any"}
  })
  on('prompt.submit', async ($) => {
    const registered = {
      low: await attempt(() => $.agent.register({ name: 'reg-low', description: 'probe', prompt: 'Say ok.', model: 'inherit', effort: 'low' })),
      max: await attempt(() => $.agent.register({ name: 'reg-max', description: 'probe', prompt: 'Say ok.', model: 'inherit', effort: 'max' })),
      budget: await attempt(() => $.agent.register({ name: 'reg-budget', description: 'probe', prompt: 'Say ok.', model: 'inherit', effort: 7 })),
      bogus: await attempt(() => $.agent.register({ name: 'reg-bogus', description: 'probe', prompt: 'Say ok.', model: 'inherit', effort: 'nonsense' })),
      again: await attempt(() => $.agent.register({ name: 'reg-low', description: 'probe again', prompt: 'Say ok.', model: 'inherit', effort: 'high' })),
    }
    const full: Array<[string, string, Record<string, unknown>]> = [
      ['fileNone', '${PLUGIN}:fm-none', {}],
      ['fileLow', '${PLUGIN}:fm-low', {}],
      ['fileMax', '${PLUGIN}:fm-max', {}],
      ['fileNoneSpawnMax', '${PLUGIN}:fm-none', { effort: 'max' }],
      ['fileLowSpawnMax', '${PLUGIN}:fm-low', { effort: 'max' }],
      ['fileNoneSpawnBogus', '${PLUGIN}:fm-none', { effort: 'nonsense' }],
      ['regLow', '${PLUGIN}:reg-low', {}],
      ['regMax', '${PLUGIN}:reg-max', {}],
      ['regBudget', '${PLUGIN}:reg-budget', {}],
      ['regBogus', '${PLUGIN}:reg-bogus', {}],
    ]
    const plan = ${concurrent} ? [] : ${capture} ? full.filter(([label]) => ['fileNone', 'fileLow', 'fileNoneSpawnMax', 'regMax', 'regBudget'].includes(label)) : full
    const spawned: Record<string, unknown> = {}
    for (const [label, subagentType, extra] of plan) {
      spawned[label] = await attempt(() => $.agent.spawn({ prompt: 'Say ok.', description: label, subagentType, ...extra } as any))
      resolved[label] = ++tick
      ${capture ? 'await $.clock.sleep(500)' : ''}
    }
    const wanted = ${concurrent} ? ${BATCHES} * ${PER_BATCH} : plan.length
    for (let batch = 0; ${concurrent} && batch < ${BATCHES}; batch += 1) {
      await Promise.all(Array.from({ length: ${PER_BATCH} }, async (_, i) => {
        const label = 'batch' + batch + '-' + i
        spawned[label] = await attempt(() => $.agent.spawn({ prompt: 'Say ok.', description: label, subagentType: '${PLUGIN}:fm-none' } as any))
        const id = (spawned[label] as any).value?.agentId
        if (typeof id === 'string') resolvedIds.add(id)
        resolved[label] = ++tick
      }))
      await $.clock.sleep(500)
    }
    for (let i = 0; i < 60 && steps.length < wanted; i += 1) await $.clock.sleep(250)
    const list = await attempt(() => $.agent.list())
    await $.fs.write('${RESULT_FILE}', JSON.stringify({ registered, spawned, spawnInputs, steps, resolved, list }, null, 2))
    return { drop: 'skraft probe: measured, no model call' }
  })
}
`

const REWRITER = 'skraft-effort-rewriter'
const rewriterSource = (capture) => `import type { Register } from 'claude-code'

export const register: Register = (on) => {
  on('turn.step', async function* ($, e, next) {
    return yield* next(e.agentId === undefined || ${capture} && e.effort !== 'medium' ? e : { ...e, effort: 'max' })
  })
}
`

const agentFile = (name, effort) => `---
name: ${name}
description: skraft host probe agent (throwaway)
model: inherit
${effort ? `effort: ${effort}\n` : ''}---
Say ok.
`

const json = (value) => `${JSON.stringify(value, null, 2)}\n`

/** The mod of one trial, under root. */
const writeTrial = async (root, capture, concurrent) => {
  const mod = join(root, PLUGIN)
  await mkdir(join(mod, '.claude-plugin'), { recursive: true })
  await mkdir(join(mod, 'hooks'), { recursive: true })
  await mkdir(join(mod, 'agents'), { recursive: true })
  await writeFile(join(mod, '.claude-plugin', 'plugin.json'), json({ name: PLUGIN, version: '0.0.0', description: 'skraft host probe: effort of spawned agents (throwaway)' }))
  await writeFile(join(mod, 'hooks', 'hooks.json'), json({ modules: ['./register.ts'] }))
  await writeFile(join(mod, 'hooks', 'register.ts'), registerSource(capture, concurrent))
  await writeFile(join(mod, 'agents', 'fm-none.md'), agentFile('fm-none'))
  await writeFile(join(mod, 'agents', 'fm-low.md'), agentFile('fm-low', 'low'))
  await writeFile(join(mod, 'agents', 'fm-max.md'), agentFile('fm-max', 'max'))
  const rewriter = join(root, REWRITER)
  await mkdir(join(rewriter, '.claude-plugin'), { recursive: true })
  await mkdir(join(rewriter, 'hooks'), { recursive: true })
  await writeFile(join(rewriter, '.claude-plugin', 'plugin.json'), json({ name: REWRITER, version: '0.0.0', description: 'skraft host probe: effort rewrite in turn.step (throwaway)' }))
  await writeFile(join(rewriter, 'hooks', 'hooks.json'), json({ modules: ['./register.ts'] }))
  await writeFile(join(rewriter, 'hooks', 'register.ts'), rewriterSource(capture))
  return { mod, rewriter }
}

const claudeVersion = (claude) => {
  const run = spawnSync(claude, ['--version'], { encoding: 'utf8' })
  return run.status === 0 ? run.stdout.trim() : null
}

/** `claude -p` against a local server that records each request's effort and refuses it: no model call. */
const runCaptured = (claude, args, cwd) => new Promise((done) => {
  const requests = []
  const server = createServer((req, res) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => {
      if (req.method === 'POST') requests.push(effortOf(data))
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'skraft-probe-capture' } }))
    })
  })
  server.listen(0, '127.0.0.1', () => {
    const env = { ...process.env, ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}`, ANTHROPIC_API_KEY: 'sk-ant-skraft-probe', ANTHROPIC_AUTH_TOKEN: '' }
    const child = spawn(claude, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (chunk) => { out += chunk })
    child.stderr.on('data', (chunk) => { out += chunk })
    const timer = setTimeout(() => child.kill('SIGKILL'), 120_000)
    child.on('exit', (status) => { clearTimeout(timer); server.close(); done({ status, stdout: out, stderr: '', requests }) })
  })
})

const effortOf = (data) => {
  try { const body = JSON.parse(data); return { model: body.model, effort: body.output_config?.effort ?? null } } catch { return { unreadable: true } }
}

const main = async () => {
  const argv = process.argv.slice(2)
  const at = argv.indexOf('--claude')
  const claude = at >= 0 ? resolve(argv[at + 1]) : platform() === 'win32' ? 'claude.cmd' : 'claude'
  const root = await mkdtemp(join(tmpdir(), 'skraft-claude-effort-trial-'))
  try {
    const concurrent = argv.includes('--concurrent')
    const capture = argv.includes('--capture') || concurrent
    const { mod, rewriter } = await writeTrial(root, capture, concurrent)
    const cwd = join(root, 'work')
    await mkdir(cwd, { recursive: true })
    const order = argv.includes('--rewriter-first') || capture ? [rewriter, mod] : [mod, rewriter]
    const args = ['-p', 'skraft probe', '--model', 'sonnet', ...order.flatMap((dir) => ['--plugin-dir', dir])]
    const run = capture ? await runCaptured(claude, args, cwd) : { ...spawnSync(claude, args, { cwd, encoding: 'utf8', timeout: 180_000 }), requests: undefined }
    const file = join(cwd, RESULT_FILE)
    // A result file missing means a hook failed to load and the prompt reached the model.
    const seen = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { status: run.status, stdout: (run.stdout ?? '').slice(-400), stderr: (run.stderr ?? '').slice(-400) }
    console.log(JSON.stringify({ claude: claudeVersion(claude), node: process.version, os: platform(), order: order.map((dir) => dir.split(/[\\/]/).pop()), seen, requests: run.requests }, null, 2))
  } finally {
    if (!argv.includes('--keep')) await rm(root, { recursive: true, force: true })
    else console.error(`trial kept in ${root}`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(String(error?.message ?? error))
    process.exitCode = 1
  })
}
