import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { RUN_USAGE, runSkraftRun } from '../../../../plugins/skraft-framework/engine/drivers/copilot-sdk/skraft-run-command.mjs'
import { main, terminalAsk } from '../../../../plugins/skraft-framework/engine/drivers/copilot-sdk/skraft-run.mjs'
import { SLUG, pipelineRepository, scriptedLlm } from '../support/pipeline-repository.mjs'
import { PLUGIN_ROOT, journal, skraft, tempFolder } from '../support/workspace.mjs'
import { SENTINEL, simulatedSdk } from './simulated-sdk.mjs'

const SDK_DIR = '/home/dev/.copilot/pkg/darwin-arm64/1.0.102-1/copilot-sdk'
const FOUND = Object.freeze({ found: true, version: '1.0.102-1', sdk: SDK_DIR, cli: '/home/dev/.copilot/pkg/darwin-arm64/1.0.102-1/index.js' })
const FAST = Object.freeze({ ready: 40, poll: 1 })

/**
 * skraft-run in this process on a simulated SDK; `answers` are what the person types, in order.
 * @param {string} cwd @param {string[]} argv @param {ReturnType<typeof simulatedSdk>} simulated
 */
const run = async (cwd, argv, simulated, { location = FOUND, answers = [], load, signal } = {}) => {
  const lines = { out: [], err: [], asked: [] }
  const queue = [...answers]
  const code = await runSkraftRun(argv, {
    cwd, pluginRoot: PLUGIN_ROOT, timings: FAST, signal,
    locate: async () => location,
    load: load ?? (async () => simulated.sdk),
    confirm: async (question) => {
      lines.asked.push(question)
      const answer = queue.shift()
      if (answer instanceof Error) throw answer
      return answer === 'y'
    },
    out: (line) => lines.out.push(line), err: (line) => lines.err.push(line),
  })
  return { code, ...lines }
}

const STATUS_LINES = ['skraft-run: skraft-pipeline running', 'skraft-run: skraft-pipeline completed']

test('skraft-run runs the pipeline through the Copilot SDK: a session in the working copy with the skraft plugin runs skraft-pipeline, which pauses on the question; answered, a second skraft-run ends it', async (t) => {
  const { cwd } = pipelineRepository(t)
  const simulated = simulatedSdk({ llm: scriptedLlm({ cwd }) })

  const paused = await run(cwd, [SLUG, '--issue', '42', '--title', 'Pay by card'], simulated)

  assert.deepEqual(paused, {
    code: 0, asked: [],
    out: ['skraft: waiting (paused) — the run waits on a question: see it with skraft status, answer it with skraft decide, then start skraft-run again'],
    err: ['skraft-run: skraft-pipeline running', 'skraft-run: skraft-pipeline paused'],
  })
  assert.deepEqual(simulated.record.clients, [{ logLevel: 'error' }])
  const [session] = simulated.record.sessions
  assert.deepEqual({ ...session, onPermissionRequest: typeof session.onPermissionRequest }, {
    extensionSdkPath: SDK_DIR, workingDirectory: cwd, pluginDirectories: [PLUGIN_ROOT], requestExtensions: true, onPermissionRequest: 'function',
  })
  assert.deepEqual(simulated.record.runs, [{ name: 'skraft-pipeline', args: { slug: SLUG, issue: 42, title: 'Pay by card' } }])
  assert.deepEqual([simulated.record.stopped, simulated.record.disconnected], [1, 1])
  assert.deepEqual(journal(cwd, SLUG)[0].story, { issue: 42, title: 'Pay by card' })

  assert.equal((await skraft(cwd, ['decide', 'adr-1', 'RATIFIED'])).status, 0)
  const done = await run(cwd, [], simulated)

  assert.deepEqual(done, { code: 0, asked: [], out: [`skraft ${SLUG}: done in DELIVER — DELIVER closed`], err: STATUS_LINES })
  assert.deepEqual(simulated.record.runs.at(-1), { name: 'skraft-pipeline', args: {} })
  assert.equal(journal(cwd, SLUG).at(-1).type, 'run.finished')
})

test('the workflow is asked for until the extension has registered it; never registered, the run ends on a fixed reason that echoes no host text', async (t) => {
  const cwd = tempFolder(t)
  const late = simulatedSdk({ rejections: 2, envelope: { status: 'completed', result: { status: 'refused', slug: null, phase: null, code: 'no-active-pipeline', reason: 'no active pipeline' } } })

  const refused = await run(cwd, [], late)

  assert.deepEqual({ code: refused.code, out: refused.out, runs: late.record.runs.length }, { code: 1, out: ['skraft: refused (no-active-pipeline) — no active pipeline'], runs: 3 })
  const never = simulatedSdk({ rejections: 1_000_000 })
  const unavailable = await run(cwd, ['checkout', '--base', 'develop', '--from-artifacts'], never)
  assert.deepEqual(unavailable, {
    code: 1, asked: [], err: [],
    out: ['skraft: error (workflow-unavailable) — the skraft-pipeline workflow was not registered in time: the skraft extension did not load in the Copilot session'],
  })
  assert.ok(never.record.runs.length > 1)
  assert.deepEqual(never.record.runs[0].args, { slug: 'checkout', base: 'develop', fromArtifacts: true })
  assert.deepEqual([never.record.stopped, never.record.disconnected], [1, 1])
})

test('a CLI the SDK cannot start, a session refused, a run unreadable or ended by the host each end on their own fixed reason, the CLI stopped', async (t) => {
  const cwd = tempFolder(t)
  const cases = [
    [{ start: 'fails' }, 'sdk-start-failed', 'the Copilot SDK could not start the Copilot CLI; check that copilot runs and is signed in, then run skraft doctor'],
    [{ session: 'fails' }, 'session-failed', 'the Copilot CLI refused a session in this working copy with the skraft plugin'],
    [{ envelope: { status: 'running' }, getRun: 'fails' }, 'run-unreadable', 'the Copilot session stopped answering about the skraft-pipeline run; start skraft-run again to resume it from its journal'],
    [{ envelope: { status: 'error', error: SENTINEL } }, 'workflow-error', 'the skraft-pipeline run failed in the Copilot session; start skraft-run again to resume it from its journal'],
    [{ envelope: { status: 'halted', error: SENTINEL } }, 'workflow-halted', 'the Copilot session halted the skraft-pipeline run; start skraft-run again to resume it from its journal'],
    [{ envelope: { status: 'cancelled' } }, 'workflow-cancelled', 'the skraft-pipeline run was cancelled; start skraft-run again to resume it from its journal'],
    [{ envelope: { status: 'completed', result: `${SENTINEL}` } }, 'unexpected-result', 'the skraft-pipeline run completed without a skraft outcome'],
    [{ envelope: { status: 'completed', result: { status: 'exploded', reason: SENTINEL } } }, 'unexpected-result', 'the skraft-pipeline run completed without a skraft outcome'],
    [{ envelope: { status: 'completed', result: null } }, 'unexpected-result', 'the skraft-pipeline run completed without a skraft outcome'],
    [{ envelope: { status: 'completed', result: { status: 'done' } } }, 'unexpected-result', 'the skraft-pipeline run completed without a skraft outcome'],
  ]
  for (const [script, code, reason] of cases) {
    const simulated = simulatedSdk(script)
    const ended = await run(cwd, [], simulated)

    assert.deepEqual({ code: ended.code, out: ended.out }, { code: 1, out: [`skraft: error (${code}) — ${reason}`] }, code)
    assert.equal(simulated.record.stopped, 1, code)
    assert.ok(![...ended.out, ...ended.err].join('\n').includes(SENTINEL), code)
  }
})

test('a completed run hands over only the fields of the skraft outcome', async (t) => {
  const simulated = simulatedSdk({ envelope: { status: 'completed', result: { status: 'blocked', slug: SLUG, phase: 'DESIGN', code: 'agent-failed', reason: 'solution-architect stopped', extra: SENTINEL } } })

  const blocked = await run(tempFolder(t), [], simulated)

  assert.deepEqual({ code: blocked.code, out: blocked.out }, { code: 1, out: [`skraft ${SLUG}: blocked (agent-failed) in DESIGN — solution-architect stopped`] })
})

test('a run the developer stops before its end is left to its journal', async (t) => {
  const stop = new AbortController()
  const simulated = simulatedSdk({ envelope: { status: 'running' } })
  const following = run(tempFolder(t), [], simulated, { signal: stop.signal })
  setTimeout(() => stop.abort(), 20)

  const stopped = await following

  assert.deepEqual({ code: stopped.code, out: stopped.out }, { code: 1, out: ['skraft: error (cancelled) — stopped before the run ended; start skraft-run again to resume it from its journal'] })
  assert.equal(simulated.record.stopped, 1)
})

test('each permission an agent asks for is put to the person, its subject named; only a yes approves it, and --allow-all-tools approves every one unasked', async (t) => {
  const cwd = tempFolder(t)
  const permissionRequests = [
    { kind: 'shell', fullCommandText: 'git commit -m "feat: pay"' }, { kind: 'write', fileName: 'src/pay.mjs' }, { kind: 'read', path: 'docs/a.md' },
    { kind: 'url', url: 'https://example.invalid' }, { kind: 'mcp', toolName: 'github' }, { kind: 'memory' }, {},
  ]
  const envelope = { status: 'completed', result: { status: 'done', slug: SLUG, phase: 'DELIVER', code: null, reason: 'DELIVER closed' } }
  const asking = simulatedSdk({ envelope, permissionRequests })

  const asked = await run(cwd, [], asking, { answers: ['y', 'n', 'no', '', new Error(SENTINEL), 'y', 'y'] })

  assert.deepEqual(asked.asked, [
    'skraft-run: allow shell: git commit -m "feat: pay"? [y/N] ', 'skraft-run: allow write: src/pay.mjs? [y/N] ', 'skraft-run: allow read: docs/a.md? [y/N] ',
    'skraft-run: allow url: https://example.invalid? [y/N] ', 'skraft-run: allow mcp: github? [y/N] ', 'skraft-run: allow memory? [y/N] ', 'skraft-run: allow a tool? [y/N] ',
  ])
  assert.deepEqual(asking.record.permissions.map(({ kind }) => kind), ['approve-once', 'reject', 'reject', 'reject', 'reject', 'approve-once', 'approve-once'])
  const allowing = simulatedSdk({ envelope, permissionRequests })
  const allowed = await run(cwd, ['--allow-all-tools'], allowing)
  assert.deepEqual(allowed.asked, [])
  assert.deepEqual(allowing.record.permissions.map(({ kind }) => kind), permissionRequests.map(() => 'approve-once'))
  assert.deepEqual(allowing.record.runs[0].args, {})
})

test('without a Copilot SDK, or with one that does not load, skraft-run says so and starts nothing; a malformed command line prints the usage', async (t) => {
  const cwd = tempFolder(t)
  const simulated = simulatedSdk()

  assert.deepEqual(await run(cwd, [], simulated, { location: { found: false, looked: '/home/dev/.copilot/pkg' } }), {
    code: 1, out: [], asked: [], err: ['no Copilot SDK under /home/dev/.copilot/pkg: install the Copilot CLI, or let the Skraft - Orchestrator agent conduct skraft next and skraft record'],
  })
  for (const load of [async () => ({}), async () => { throw new Error(SENTINEL) }]) {
    assert.deepEqual(await run(cwd, [], simulated, { load }), { code: 1, out: [], asked: [], err: [`the Copilot SDK in ${SDK_DIR} could not be loaded; run skraft doctor`] })
  }
  for (const argv of [['--issue', '0'], ['--issue', 'x'], ['--issue'], ['a', 'b'], ['--title', '--base', 'main'], ['--yes'], ['--from-artifacts', '--from-artifacts'], ['--base', 'a', '--base', 'b']]) {
    assert.deepEqual(await run(cwd, argv, simulated), { code: 2, out: [], asked: [], err: [RUN_USAGE] }, argv.join(' '))
  }
  assert.deepEqual(simulated.record.clients, [])
})

/** A Copilot CLI package in `home` whose SDK writes what it was asked to `asked.json` and completes the run as `result`. */
const fakeCopilotPackage = (home, result) => {
  const dir = join(home, '.copilot', 'pkg', 'linux-x64', '1.0.200')
  mkdirSync(join(dir, 'copilot-sdk'), { recursive: true })
  writeFileSync(join(dir, 'index.js'), '\n')
  writeFileSync(join(dir, 'copilot-sdk', 'index.js'), [
    "import { writeFileSync } from 'node:fs'",
    'export class CopilotClient {',
    '  async start() {}',
    '  async stop() {}',
    '  async createSession(options) {',
    "    const decision = await options.onPermissionRequest({ kind: 'shell', fullCommandText: 'npm test' })",
    `    writeFileSync(${JSON.stringify(join(home, 'asked.json'))}, JSON.stringify({ ...options, onPermissionRequest: decision.kind }))`,
    `    return { rpc: { workflow: { run: async () => ({ runId: 'r', status: 'completed', result: ${JSON.stringify(result)} }), getRun: async () => ({}) } } }`,
    '  }',
    '}',
    '',
  ].join('\n'))
  return dir
}

test('the entry loads the newest SDK of the Copilot CLI packages, points the SDK at the CLI beside it, and runs in the working copy with the plugin', async (t) => {
  const home = tempFolder(t)
  const cwd = tempFolder(t)
  const dir = fakeCopilotPackage(home, { status: 'done', slug: SLUG, phase: 'DELIVER', code: null, reason: 'DELIVER closed' })
  const env = {}
  const lines = { out: [], err: [] }

  const code = await main([], { cwd, home, env, ask: async () => 'n', out: (line) => lines.out.push(line), err: (line) => lines.err.push(line) })

  assert.deepEqual({ code, out: lines.out }, { code: 0, out: [`skraft ${SLUG}: done in DELIVER — DELIVER closed`] })
  assert.deepEqual(env, { COPILOT_CLI_PATH: join(dir, 'index.js') })
  assert.deepEqual(JSON.parse(readFileSync(join(home, 'asked.json'), 'utf8')), {
    extensionSdkPath: join(dir, 'copilot-sdk'), workingDirectory: cwd, pluginDirectories: [PLUGIN_ROOT], requestExtensions: true, onPermissionRequest: 'reject',
  })
  const given = { COPILOT_CLI_PATH: '/opt/copilot/index.js' }
  const decided = async (answer, env = {}) => {
    await main([], { cwd, home, env, ask: async () => answer, out: () => undefined, err: () => undefined })
    return JSON.parse(readFileSync(join(home, 'asked.json'), 'utf8')).onPermissionRequest
  }
  assert.deepEqual([await decided(' Yes ', given), await decided('y'), await decided('Y'), await decided('yess'), await decided('ay')], ['approve-once', 'approve-once', 'approve-once', 'reject', 'reject'])
  assert.deepEqual(given, { COPILOT_CLI_PATH: '/opt/copilot/index.js' })
})

test('the terminal asks the question on its output and answers what the person types; with no one at a terminal, nothing', async () => {
  const typed = Object.assign(new PassThrough(), { isTTY: true })
  const shown = new PassThrough()
  const asked = terminalAsk({ input: typed, output: shown })('allow? ')
  typed.write('yes\n')

  assert.equal(await asked, 'yes')
  assert.equal(shown.read().toString(), 'allow? ')
  assert.equal(await terminalAsk({ input: new PassThrough(), output: new PassThrough() })('allow? '), '')
})

test('started as a program without the Copilot CLI, skraft-run names the folder it searched and exits 1', async (t) => {
  const home = tempFolder(t)
  const entry = join(PLUGIN_ROOT, 'engine', 'drivers', 'copilot-sdk', 'skraft-run.mjs')

  const started = spawnSync(process.execPath, [entry, SLUG], { cwd: tempFolder(t), encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home } })

  assert.deepEqual({ status: started.status, stdout: started.stdout }, { status: 1, stdout: '' })
  assert.equal(started.stderr, `no Copilot SDK under ${join(home, '.copilot', 'pkg')}: install the Copilot CLI, or let the Skraft - Orchestrator agent conduct skraft next and skraft record\n`)
})
