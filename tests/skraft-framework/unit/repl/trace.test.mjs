import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRepl } from '../../../../plugins/skraft-framework/engine/application/repl/repl-usecase.mjs'
import { InMemoryRunLock } from '../support/in-memory-host.mjs'
import { HasherDigests, InMemoryOrphans, ScriptedKernelHost, ScriptedLauncher } from '../support/in-memory-repl.mjs'
import { agent, green, nominal, scripted, SLUG } from '../support/pipeline-host.mjs'

const TRACE = `${SLUG}/logs/runs/deliver-1-1/runs.jsonl`
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/** A delivery attempt whose software engineer works as `work` says, with the REPL scripted by the test. */
const delivery = ({ work, kernels = new ScriptedKernelHost(), launcher = new ScriptedLauncher(), commits = true }) => {
  const host = scripted({}, (it) => [...nominal(it).map((behaviour, index) => (index !== 3 ? behaviour : agent({ trace: false, work: async (repos) => { await work(repl, host, repos); if (commits) green(SLUG, 'Checkout', '')(repos) } })(it))), () => ({ ok: false, unavailable: true, text: '' })])
  host.deps.repl = { root: '/work', kernels, launcher, orphans: new InMemoryOrphans(), locks: new InMemoryRunLock(host.tracking, 'a'), server: { pid: 100, created: 'server-start' }, budgetMs: 40, digests: new HasherDigests(host.deps.hasher) }
  const repl = createRepl(host.deps, { entry: null, reaped: false })
  return { host, kernels, launcher }
}

/** The lines of the trace, parsed, with the signature each carries. @param {any} host */
const traced = (host) => host.tracking.files.get(TRACE).split('\n').filter(Boolean).map((line) => JSON.parse(line))

/** A signature as the engine checks it: the HMAC of the line without its sig under the run's key. @param {any} host @param {string} line */
const signatureHolds = async (host, line) => {
  const { sig, ...rest } = JSON.parse(line)
  const keyId = host.events()[0].keyId
  return (await host.deps.hasher.hmacSha256(await host.deps.journalKeys.read(keyId), JSON.stringify(rest))) === sig
}

test('every run writes a line when it starts and a line when it ends, with what the program did, and its log beside them', async () => {
  const kernels = new ScriptedKernelHost()
  kernels.script.set('gate', async ({ run }) => { await run('dotnet test', { cwd: 'api', gate: 'test', label: 'unit', timeout: 120 }) })
  const launcher = new ScriptedLauncher({ outputs: { 'dotnet test': { exitCode: 3, text: 'Failed: 1\n' } } })
  const { host } = delivery({ kernels, launcher, work: async (repl) => { await repl.call({ code: 'gate' }) } })

  await host.start()

  const [started, ended] = traced(host)
  assert.deepEqual([started.type, started.run, started.cell, started.command, started.cwd, started.gate, started.label], ['start', 1, 1, 'dotnet test', 'api', 'test', 'unit'])
  assert.deepEqual(
    [ended.type, ended.run, ended.argv, ended.shell, ended.cwd, ended.gate, ended.label, ended.exitCode, ended.signal, ended.timedOut, ended.killed, ended.started, ended.bytes, ended.cut, ended.log],
    ['run', 1, ['sh', '-c', 'dotnet test'], 'sh', 'api', 'test', 'unit', 3, null, false, false, true, 10, false, `logs/runs/deliver-1-1/1.log`],
  )
  assert.equal(host.tracking.files.get(`${SLUG}/logs/runs/deliver-1-1/1.log`), 'Failed: 1\n')
  assert.equal(ended.sha256, await host.deps.hasher.sha256('Failed: 1\n'))
  assert.equal(traced(host).length, 2)
  assert.equal(host.tracking.rewrites.get(TRACE) ?? 0, 0, 'each line is appended: the trace is never written again whole')
})

test('a trace line that cannot be written is told at the head of each next result, naming the run\'s unexpected.log and never the exception', async () => {
  const kernels = new ScriptedKernelHost()
  kernels.script.set('gate', async ({ run }) => { await run('npm test', { gate: 'test' }) })
  const answers = []
  const { host } = delivery({ kernels, launcher: new ScriptedLauncher({ outputs: { 'npm test': { exitCode: 0 } } }), work: async (repl, one) => {
    const tracking = one.tracking
    one.deps.files = {
      read: (slug, path) => tracking.read(slug, path), write: (slug, path, text) => tracking.write(slug, path, text), location: (slug, path) => tracking.location(slug, path),
      appendText: async (slug, path, text) => {
        if (path.endsWith('runs.jsonl')) throw new Error('EACCES: permission denied, open /secret/runs.jsonl')
        return tracking.appendText(slug, path, text)
      },
    }
    answers.push(await repl.call({ code: 'gate' }), await repl.call({ code: '1' }))
    one.deps.files = tracking
  } })

  await host.start()

  const notice = `repl-trace-failed: a line of the trace of this attempt could not be written, so the trace is incomplete; the error is in /work/.copilot-tracking/skraft-plans/${SLUG}/logs/unexpected.log`
  assert.deepEqual(answers.map(({ text }) => text.split('\n')[0]), [notice, notice])
  assert.equal(answers.some(({ text }) => text.includes('EACCES')), false)
  assert.match(host.tracking.files.get(`${SLUG}/logs/unexpected.log`), /EACCES/)
})

test('each line carries the signature of the run\'s journal key, and a line edited afterwards no longer does', async () => {
  const kernels = new ScriptedKernelHost()
  kernels.script.set('gate', async ({ run }) => { await run('npm test', { gate: 'test' }) })
  const { host } = delivery({ kernels, launcher: new ScriptedLauncher({ outputs: { 'npm test': { exitCode: 0 } } }), work: async (repl) => { await repl.call({ code: 'gate' }) } })

  await host.start()

  const lines = host.tracking.files.get(TRACE).split('\n').filter(Boolean)
  assert.deepEqual(await Promise.all(lines.map((line) => signatureHolds(host, line))), [true, true])
  assert.equal(await signatureHolds(host, lines[1].replace('"exitCode":0', '"exitCode":1')), false)
})

test('the line of a run holds Git\'s HEAD before and after it, so that a commit made while it ran shows, and whether the tree was clean when it started', async () => {
  const kernels = new ScriptedKernelHost()
  let during = null
  const { host, launcher } = delivery({
    kernels,
    commits: false,
    work: async (repl, one, { git }) => {
      kernels.script.set('clean', async ({ run }) => { const pending = run('mvn verify', { gate: 'test' }); await sleep(5); green(SLUG, 'Checkout', '')({ git }); during = await git.head('.'); launcher.started[0].program.finish(); await pending })
      kernels.script.set('dirty', async ({ run }) => { git.change('src/Dirty.cs'); const pending = run('mvn verify', { gate: 'test' }); await sleep(5); launcher.started[1].program.finish(); await pending })
      kernels.script.set('tracking-only', async ({ run }) => { git.revert('src/Dirty.cs'); git.change('.copilot-tracking/skraft-plans/checkout/logs/x.log'); const pending = run('mvn verify', { gate: 'test' }); await sleep(5); launcher.started[2].program.finish(); await pending })
      await repl.call({ code: 'clean' })
      await repl.call({ code: 'dirty' })
      await repl.call({ code: 'tracking-only' })
      git.revert('src/Dirty.cs', '.copilot-tracking/skraft-plans/checkout/logs/x.log')
    },
  })

  await host.start()

  const ended = traced(host).filter(({ type }) => type === 'run')
  assert.deepEqual(ended.map(({ clean }) => clean), [true, false, true])
  assert.equal(ended[0].headAfter, during)
  assert.notEqual(ended[0].headBefore, during)
  assert.equal(ended[1].headBefore, during, 'the next run starts on the commit the first one made')
  assert.equal(ended[1].headAfter, during)
})

test('the awaited handle gives the HEAD the run ended on, the very value its line holds', async () => {
  const kernels = new ScriptedKernelHost()
  let awaited = null
  const { host, launcher } = delivery({
    kernels,
    commits: false,
    work: async (repl, one, { git }) => {
      kernels.script.set('commit', async ({ run }) => { const pending = run('mvn verify', { gate: 'test' }); await sleep(5); green(SLUG, 'Checkout', '')({ git }); launcher.started[0].program.finish(); awaited = await pending })
      await repl.call({ code: 'commit' })
    },
  })

  await host.start()

  const ended = traced(host).find(({ type }) => type === 'run')
  assert.notEqual(ended.headAfter, ended.headBefore)
  assert.equal(awaited.head, ended.headAfter)
})

test('a run\'s output past the limit of its log keeps its first and last halves around a marker, cut on whole characters, and the trace says it was cut', async () => {
  const kernels = new ScriptedKernelHost()
  kernels.script.set('noisy', async ({ run }) => { await run('npm test') })
  const text = `a${'é'.repeat(6)}zzzz${'é'.repeat(4)}b`
  const launcher = new ScriptedLauncher({ outputs: { 'npm test': { exitCode: 0, text } } })
  const { host } = delivery({ kernels, launcher, work: async (repl, one) => {
    one.deps.repl.logLimitBytes = 16
    await repl.call({ code: 'noisy' })
  } })

  await host.start()

  const log = host.tracking.files.get(`${SLUG}/logs/runs/deliver-1-1/1.log`)
  const [, ended] = traced(host)
  assert.equal(log, 'aééé\n… the output was cut here: the log keeps its first and last halves …\néééb')
  assert.deepEqual([ended.cut, ended.bytes, ended.sha256], [true, Buffer.byteLength(text), await host.deps.hasher.sha256(log)])
})

test('run ids go on across the kernels of an attempt: a run after a reset or a crash takes the next id, and the logs of earlier runs stay as they were', async () => {
  const kernels = new ScriptedKernelHost()
  kernels.script.set('test', async ({ run }) => { await run('npm test') })
  kernels.script.set('lint', async ({ run }) => { await run('npm run lint') })
  const launcher = new ScriptedLauncher({ outputs: { 'npm test': { exitCode: 0, text: 'first\n' }, 'npm run lint': { exitCode: 0, text: 'second\n' } } })
  const { host } = delivery({ kernels, launcher, work: async (repl) => {
    await repl.call({ code: 'test' })
    await repl.call({ code: 'lint', reset: true })
    kernels.kernels.at(-1).die('crashed')
    await repl.call({ code: 'test' })
  } })

  await host.start()

  const ended = traced(host).filter(({ type }) => type === 'run')
  assert.deepEqual(ended.map(({ run }) => run), [1, 2, 3])
  assert.equal(host.tracking.files.get(`${SLUG}/logs/runs/deliver-1-1/1.log`), 'first\n')
  assert.equal(host.tracking.files.get(`${SLUG}/logs/runs/deliver-1-1/2.log`), 'second\n')
  assert.equal(ended[0].sha256, await host.deps.hasher.sha256('first\n'))
})

test('a run refused before it started, and a program that could not start, are lines too, with started false', async () => {
  const kernels = new ScriptedKernelHost()
  kernels.script.set('bad', async ({ run }) => { await run('npm test', { timeout: 0, gate: 'test' }) })
  const { host } = delivery({ kernels, work: async (repl) => { await repl.call({ code: 'bad' }) } })

  await host.start()

  const ended = traced(host).filter(({ type }) => type === 'run')
  assert.deepEqual(ended.map(({ run, started, exitCode, gate }) => [run, started, exitCode, gate]), [[1, false, null, 'test']])
  assert.equal(host.tracking.files.get(`${SLUG}/logs/runs/deliver-1-1/1.log`), '')
})

test('a gate the cell declares absent is a line with its component and its reason, and one with no reason is none', async () => {
  const kernels = new ScriptedKernelHost()
  kernels.script.set('absent', async () => {
    const { events } = kernels.kernels.at(-1)
    events.onAbsent({ gate: 'coverage', component: 'api', reason: 'AGENTS.md names no coverage command', cell: 1 })
    events.onAbsent({ gate: 'architecture', component: 'api', reason: '   ', cell: 1 })
    await sleep(5)
  })
  const { host } = delivery({ kernels, work: async (repl) => { await repl.call({ code: 'absent' }) } })

  await host.start()

  assert.deepEqual(traced(host).map(({ type, gate, component, reason }) => [type, gate, component, reason]), [['absent', 'coverage', 'api', 'AGENTS.md names no coverage command']])
})
