import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRepl } from '../../../../plugins/skraft-framework/engine/application/repl/repl-usecase.mjs'
import { InMemoryRunLock } from '../support/in-memory-host.mjs'
import { InMemoryOrphans, ScriptedKernelHost, ScriptedLauncher } from '../support/in-memory-repl.mjs'
import { agent, green, nominal, scripted, SLUG } from '../support/pipeline-host.mjs'

const TRACE = `${SLUG}/logs/runs/deliver-1-1/runs.jsonl`
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/** A delivery attempt whose software engineer works as `work` says, with the REPL scripted by the test. */
const delivery = ({ work, kernels = new ScriptedKernelHost(), launcher = new ScriptedLauncher(), commits = true }) => {
  const host = scripted({}, (it) => nominal(it).map((behaviour, index) => (index !== 3 ? behaviour : agent({ work: async (repos) => { await work(repl, host, repos); if (commits) green(SLUG, 'Checkout', '')(repos) } })(it))))
  host.deps.repl = { root: '/work', kernels, launcher, orphans: new InMemoryOrphans(), locks: new InMemoryRunLock(host.tracking, 'a'), server: { pid: 100, created: 'server-start' }, budgetMs: 40 }
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
