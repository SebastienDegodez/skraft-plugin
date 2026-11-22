import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRepl } from '../../../../plugins/skraft-framework/engine/application/repl/repl-usecase.mjs'
import { InMemoryRunLock } from '../support/in-memory-host.mjs'
import { InMemoryOrphans, ScriptedKernelHost, ScriptedLauncher } from '../support/in-memory-repl.mjs'
import { agent, green, nominal, scripted, SLUG } from '../support/pipeline-host.mjs'

/** What each nominal agent commits, which the agent that calls the REPL still does after it. */
const NOMINAL_WORK = {
  1: ({ git }) => git.change('docs/adr/adr-001-card-payment.md'),
  2: ({ git }) => git.commit('test(checkout): acceptance of the card payment', ['tests/Acceptance/CheckoutAcceptanceTests.cs'], ''),
  3: green(SLUG, 'Checkout', ''),
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/**
 * A run whose agents call skraft_repl during their attempts, as the tool lets them. `calls` maps
 * the agent of a pass (by its index in the nominal script: 0 research, 1 design, 2 distill, 3
 * deliver) to what it does with the REPL.
 */
const replRun = ({ calls, kernels = new ScriptedKernelHost(), launcher = new ScriptedLauncher(), orphans = new InMemoryOrphans(), state = { entry: null, reaped: false }, budgetMs = 40 } = {}) => {
  const host = scripted({}, (it) => nominal(it).map((behaviour, index) => (calls[index] === undefined ? behaviour : agent({ work: async (repos) => { await calls[index](repl, host, repos); NOMINAL_WORK[index]?.(repos) } })(it))))
  host.deps.repl = { root: '/work', kernels, launcher, orphans, locks: new InMemoryRunLock(host.tracking, 'a'), server: { pid: 100, created: 'server-start' }, budgetMs }
  const repl = createRepl(host.deps, state)
  return { host, repl, kernels, launcher, orphans, state }
}

test('an agent that commits code runs a cell in its attempt, and gets the cell\'s printed text, its trailing value and the runs it started', async () => {
  const answers = []
  const kernels = new ScriptedKernelHost()
  kernels.script.set('tests', async ({ run, print }) => {
    print('running the tests\n')
    const result = await run('dotnet test', { cwd: 'api', gate: 'test', timeout: 120 })
    return `exit ${result.exitCode}`
  })
  const launcher = new ScriptedLauncher({ outputs: { 'dotnet test': { exitCode: 0, text: 'Passed: 3\n' } } })
  const { host } = replRun({ kernels, launcher, calls: { 2: async (repl) => { answers.push(await repl.call({ code: 'tests' })) } } })

  assert.equal((await host.start()).status, 'done')

  assert.equal(answers.length, 1)
  assert.equal(answers[0].ok, true)
  assert.match(answers[0].text, /^running the tests\nr1 exit 0 \(\d+\.\d s\) dotnet test - logs\/runs\/distill-1-1\/1\.log\n=> exit 0$/)
  assert.deepEqual([launcher.started[0].command, launcher.started[0].cwd, launcher.started[0].timeoutMs], ['dotnet test', 'api', 120_000])
  assert.equal(kernels.kernels.length, 1)
})

test('an agent that commits no code, or a call with no attempt open, is refused with a fixed text and no kernel starts', async () => {
  const answers = []
  const kernels = new ScriptedKernelHost()
  const { host, repl } = replRun({ kernels, calls: { 1: async (one) => { answers.push(await one.call({ code: '1 + 1' })) } } })

  await host.start()
  answers.push(await repl.call({ code: '1 + 1' }))

  assert.deepEqual(answers.map(({ ok, code }) => [ok, code]), [[false, 'repl-unavailable'], [false, 'repl-unavailable']])
  assert.equal(answers[0].text, 'repl-unavailable: skraft_repl works only inside the open attempt of an agent that commits code, and none is open now')
  assert.equal(kernels.kernels.length, 0)
})

test('the kernel of an attempt is reused by its next calls, and the attempt of the next agent gets another while the first one and its runs end', async () => {
  const kernels = new ScriptedKernelHost()
  const seen = []
  const { host, launcher, orphans } = replRun({
    kernels,
    calls: {
      2: async (repl) => {
        await repl.call({ code: 'first' })
        seen.push(kernels.kernels.length)
        await repl.call({ code: 'second' })
        seen.push(kernels.kernels.length)
        void kernels.kernels[0].events.onRun({ rid: 90, cell: 2, command: 'sleep 600', cwd: '.', timeout: 600, gate: null, label: null })
        await sleep(10)
      },
      3: async (repl) => {
        await repl.call({ code: 'third' })
        seen.push(kernels.kernels[0].stopped, kernels.kernels.length)
      },
    },
  })

  await host.start()

  assert.deepEqual(seen, [1, 1, true, 2])
  assert.deepEqual(kernels.kernels[0].cells, 2)
  assert.deepEqual(launcher.started[0].program.killed, [['SIGKILL', 0]], 'the run the first attempt left is ended with it')
  assert.equal(orphans.reaps, 1, 'what a killed server left running is ended once, when the first kernel starts')
})

test('a second call while a cell runs is refused as busy, and an empty call waits for the cell and gets its end', async () => {
  const kernels = new ScriptedKernelHost()
  let release = () => undefined
  kernels.script.set('slow', async ({ print }) => {
    print('started\n')
    await new Promise((resolve) => { release = resolve })
    return 'finished'
  })
  const answers = []
  const { host } = replRun({
    kernels,
    calls: {
      2: async (repl) => {
        answers.push(await repl.call({ code: 'slow' }))
        answers.push(await repl.call({ code: '1' }))
        release()
        answers.push(await repl.call({ code: '' }))
      },
    },
  })

  await host.start()

  assert.deepEqual(answers.map(({ ok, code }) => [ok, code]), [[true, null], [false, 'repl-busy'], [true, null]])
  assert.equal(answers[0].text, 'started\n\n[the cell still runs: call skraft_repl with empty code to wait for it]')
  assert.equal(answers[2].text, '=> finished')
})

test('two calls at once share one kernel: the second is told the first cell runs, and closing leaves no kernel alive', async () => {
  const kernels = new ScriptedKernelHost()
  let release = () => undefined
  kernels.script.set('slow', async () => { await new Promise((resolve) => { release = resolve }); return 'finished' })
  const answers = []
  const { host, repl } = replRun({ kernels, calls: { 2: async (one) => {
    answers.push(...(await Promise.all([one.call({ code: 'slow', id: 1 }), one.call({ code: 'slow', id: 2 })])))
    release()
  } } })

  await host.start()
  await repl.close()

  assert.equal(kernels.kernels.length, 1)
  assert.deepEqual(answers.map(({ code }) => code), [null, 'repl-busy'])
  assert.equal(kernels.kernels[0].stopped, true)
})

test('a run that finished while another cell went on is told at the start of the next result', async () => {
  const kernels = new ScriptedKernelHost()
  const launcher = new ScriptedLauncher()
  kernels.script.set('start', async ({ run }) => { void run('npm test'); return null })
  const answers = []
  const { host } = replRun({
    kernels, launcher,
    calls: { 2: async (repl) => {
      answers.push(await repl.call({ code: 'start' }))
      launcher.started[0].program.finish({ exitCode: 1, text: 'failed' })
      await sleep(10)
      answers.push(await repl.call({ code: 'nothing' }))
    } },
  })

  await host.start()

  assert.match(answers[0].text, /^r1 running \(0\.0 s\) npm test - logs\/runs\/distill-1-1\/1\.log$/)
  assert.match(answers[1].text, /^\[run-done r1 exit 1 in \d+\.\d s: npm test\]$/)
})

test('a run the cell asks for with a timeout outside 1 to 7200 seconds, or an empty command, never starts a program', async () => {
  const kernels = new ScriptedKernelHost()
  const launcher = new ScriptedLauncher()
  kernels.script.set('bad', async ({ run }) => {
    const results = []
    results.push(await run('npm test', { timeout: 7201 }))
    results.push(await run(['npm', ''], {}))
    return results.map(({ error }) => error).join(' | ')
  })
  const answers = []
  const { host } = replRun({ kernels, launcher, calls: { 2: async (repl) => { answers.push(await repl.call({ code: 'bad' })) } } })

  await host.start()

  assert.equal(launcher.started.length, 0)
  assert.match(answers[0].text, /=> run\(\) takes a timeout of 1 to 7200 seconds \| run\(\) takes a non-empty command line, or an argv array of non-empty strings$/)
})

test('a lease on the attempt held by a running server refuses the call, and one whose server is gone is taken over', async () => {
  const answers = []
  const running = new InMemoryOrphans({ holderGone: false })
  const first = replRun({ orphans: running, calls: { 2: async (repl, host) => {
    await host.deps.repl.locks.create(`${SLUG}/logs/runs/distill-1-1`, JSON.stringify({ pid: 777, created: 'elsewhere' }))
    answers.push(await repl.call({ code: '1' }))
  } } })
  await first.host.start()
  const taken = replRun({ calls: { 2: async (repl, host) => {
    await host.deps.repl.locks.create(`${SLUG}/logs/runs/distill-1-1`, JSON.stringify({ pid: 777, created: 'elsewhere' }))
    answers.push(await repl.call({ code: '1' }))
    answers.push(host.deps.repl.locks.held(`${SLUG}/logs/runs/distill-1-1`))
  } } })

  await taken.host.start()

  assert.deepEqual([answers[0].ok, answers[0].code], [false, 'repl-held-elsewhere'])
  assert.equal(first.kernels.kernels.length, 0)
  assert.equal(answers[1].ok, true)
  assert.deepEqual(JSON.parse(answers[2]), { pid: 100, created: 'server-start', renewedAt: taken.host.deps.clock.now().toISOString() })
})

test('a lease whose running holder has not renewed it for five minutes is taken over, one renewed within them is respected, and the sweep renews the lease it holds', async () => {
  const answers = []
  const lockOf = `${SLUG}/logs/runs/distill-1-1`
  const { host, kernels } = replRun({ orphans: new InMemoryOrphans({ holderGone: false }), calls: { 2: async (repl, one) => {
    const ago = (minutes) => new Date(one.deps.clock.now().getTime() - minutes * 60_000).toISOString()
    await one.deps.repl.locks.create(lockOf, JSON.stringify({ pid: 777, created: 'elsewhere', renewedAt: ago(4) }))
    answers.push(await repl.call({ code: '1' }))
    await one.deps.repl.locks.replace(lockOf, one.deps.repl.locks.held(lockOf), JSON.stringify({ pid: 777, created: 'elsewhere', renewedAt: ago(6) }))
    answers.push(await repl.call({ code: '1' }))
    one.clock.sleep(60_000)
    await repl.sweep()
    answers.push(JSON.parse(one.deps.repl.locks.held(lockOf)).renewedAt, one.deps.clock.now().toISOString())
  } } })

  await host.start()

  assert.deepEqual(answers.slice(0, 2).map(({ code }) => code), ['repl-held-elsewhere', null])
  assert.equal(kernels.kernels.length, 1)
  assert.equal(answers[2], answers[3])
})

test('a kernel that cannot start is a refusal with a fixed text naming the run\'s unexpected.log, which holds the error, and the lease is given back', async () => {
  const answers = []
  const { host } = replRun({ kernels: new ScriptedKernelHost({ fails: true }), calls: { 2: async (repl, one) => {
    answers.push(await repl.call({ code: '1' }), one.deps.repl.locks.held(`${SLUG}/logs/runs/distill-1-1`))
  } } })

  await host.start()

  const log = `/work/.copilot-tracking/skraft-plans/${SLUG}/logs/unexpected.log`
  assert.deepEqual([answers[0].code, answers[0].text, answers[1]], ['repl-failed', `repl-failed: skraft could not start the kernel of this attempt; the error is in ${log}`, null])
  assert.match(host.tracking.files.get(`${SLUG}/logs/unexpected.log`), /^Error: no kernel\n/)
})

test('an exception of skraft inside the attempt is a refusal naming the run\'s unexpected.log, never the exception', async () => {
  const answers = []
  const { host } = replRun({ calls: { 2: async (repl, one) => {
    one.deps.repl.locks = { create: async () => { throw new Error('disk full at /secret/place') } }
    answers.push(await repl.call({ code: '1' }))
  } } })

  await host.start()

  assert.deepEqual([answers[0].ok, answers[0].code], [false, 'repl-unexpected'])
  assert.equal(answers[0].text, `repl-unexpected: the call stopped on an unexpected error of skraft; what was left of it did not run; the error is in /work/.copilot-tracking/skraft-plans/${SLUG}/logs/unexpected.log`)
  assert.match(host.tracking.files.get(`${SLUG}/logs/unexpected.log`), /^Error: disk full at \/secret\/place\n/)
})

test('a kernel that dies is told with the cell it was running, and the next call starts a fresh one that says its variables are gone', async () => {
  const kernels = new ScriptedKernelHost()
  kernels.script.set('crash', async () => { kernels.kernels.at(-1).die('crashed'); return null })
  const answers = []
  const { host } = replRun({ kernels, calls: { 2: async (repl) => {
    answers.push(await repl.call({ code: 'crash' }), await repl.call({ code: '1' }))
  } } })

  await host.start()

  assert.equal(kernels.kernels.length, 2)
  assert.match(answers[1].text, /^repl-crashed: the kernel ended by itself: its variables are gone, and the runs it had started were ended\n/)
})

test('a kernel whose attempt is over, or that no one has used for 15 minutes with no run alive, is ended by the sweep; one with a run alive is kept', async () => {
  const kernels = new ScriptedKernelHost()
  const outcomes = []
  const { host, repl } = replRun({ kernels, calls: { 2: async (one, run) => {
    await one.call({ code: '1' })
    run.clock.sleep(14 * 60_000)
    await one.sweep()
    outcomes.push(kernels.kernels[0].stopped)
    kernels.kernels[0].events.onRun({ rid: 1, cell: 1, command: 'sleep 600', cwd: '.', timeout: 600, gate: null, label: null })
    await sleep(10)
    run.clock.sleep(2 * 60_000)
    await one.sweep()
    outcomes.push(kernels.kernels[0].stopped)
  } } })

  await host.start()
  await repl.sweep()

  assert.deepEqual(outcomes, [false, false])
  assert.equal(kernels.kernels[0].stopped, true, 'once the attempt is closed, the sweep ends the kernel')
})

test('a reset during a cell that never ends ends its kernel and its runs, starts a fresh kernel and says the variables are gone', async () => {
  const kernels = new ScriptedKernelHost()
  const launcher = new ScriptedLauncher()
  kernels.script.set('forever', async ({ run }) => { void run('npm run e2e'); await new Promise(() => undefined) })
  kernels.script.set('fresh', async () => 'fresh')
  const answers = []
  const { host } = replRun({ kernels, launcher, calls: { 2: async (one) => {
    const stuck = one.call({ code: 'forever', id: 1 })
    await sleep(10)
    answers.push(await one.call({ code: 'fresh', id: 2, reset: true }), await stuck)
  } } })

  await host.start()

  const trace = host.tracking.files.get(`${SLUG}/logs/runs/distill-1-1/runs.jsonl`).trim().split('\n').map((line) => JSON.parse(line))
  assert.equal(kernels.kernels.length, 2)
  assert.equal(kernels.kernels[0].stopped, true)
  assert.equal(answers[0].text, 'repl-reset: the kernel was ended on request and a fresh one started: its variables are gone, and the runs it had started were ended\n=> fresh')
  assert.deepEqual(trace.filter(({ type }) => type === 'run').map(({ killed }) => killed), [true])
})

test('a run asked for while its kernel ends never starts, and is traced as not started', async () => {
  const kernels = new ScriptedKernelHost()
  const launcher = new ScriptedLauncher({ outputs: { 'npm test': { exitCode: 0, text: 'passed' } } })
  kernels.script.set('go', async ({ run }) => { void run('npm test'); return null })
  let release = () => undefined
  const { host, repl } = replRun({ kernels, launcher, calls: { 2: async (one, run) => {
    const real = run.deps.sourceControl
    run.deps.sourceControl = { ...real, repository: (cwd) => new Promise((resolve) => { release = () => resolve(real.repository(cwd)) }) }
    await one.call({ code: 'go' })
    const closing = one.close()
    release()
    await closing
    run.deps.sourceControl = real
  } } })

  await host.start()
  await repl.close()

  const trace = host.tracking.files.get(`${SLUG}/logs/runs/distill-1-1/runs.jsonl`).trim().split('\n').map((line) => JSON.parse(line))
  assert.equal(launcher.started.length, 0)
  assert.deepEqual(trace.map(({ type, started }) => [type, started]), [['run', false]])
})

test('a cancellation interrupts the cell in flight and ends the runs it started; the session closing ends the kernel', async () => {
  const kernels = new ScriptedKernelHost()
  const launcher = new ScriptedLauncher()
  kernels.script.set('hang', async ({ run }) => { await run('npm run e2e'); return null })
  const { host, repl } = replRun({ kernels, launcher, calls: { 2: async (one) => {
    await one.call({ code: 'hang' })
    one.interrupt()
  } } })

  await host.start()
  await repl.close()

  assert.equal(kernels.kernels[0].interrupts, 1)
  assert.deepEqual(launcher.started[0].program.killed.map(([signal]) => signal), ['SIGTERM'])
  assert.equal(kernels.kernels[0].stopped, true)
})

test('a cancellation that arrives before the call has launched its cell is not lost: the cell never runs', async () => {
  const kernels = new ScriptedKernelHost()
  const launcher = new ScriptedLauncher()
  kernels.script.set('tests', async ({ run }) => { await run('dotnet test'); return null })
  const answers = []
  const { host, repl } = replRun({ kernels, launcher, calls: { 2: async (one) => {
    const pending = one.call({ code: 'tests' })
    one.interrupt()
    answers.push(await pending)
    answers.push(await one.call({ code: '1 + 1' }))
  } } })

  await host.start()

  assert.deepEqual(answers.map(({ ok, code }) => [ok, code]), [[false, 'repl-interrupted'], [true, null]])
  assert.equal(answers[0].text, 'repl-interrupted: the call was cancelled before its cell started; nothing ran')
  assert.equal(launcher.started.length, 0)
  assert.ok(repl)
})

test('what a cell prints past 24 KiB is cut in the result, which names the file that holds all of it', async () => {
  const kernels = new ScriptedKernelHost()
  kernels.script.set('noisy', async ({ print }) => { print(`${'a'.repeat(20_000)}${'z'.repeat(20_000)}`); return null })
  const answers = []
  const { host } = replRun({ kernels, calls: { 2: async (repl) => { answers.push(await repl.call({ code: 'noisy' })) } } })

  await host.start()

  assert.ok(answers[0].text.length <= 24 * 1024)
  assert.match(answers[0].text, /^a+\n… cut; the whole output is in logs\/runs\/distill-1-1\/cell-1\.log …\nz+$/)
  assert.equal(host.tracking.files.get(`${SLUG}/logs/runs/distill-1-1/cell-1.log`).length, 40_000)
})

test('the software engineer of the delivery attempt gets its own kernel under its own folder of runs', async () => {
  const answers = []
  const launcher = new ScriptedLauncher({ outputs: { 'npm test': { exitCode: 0 } } })
  const kernels = new ScriptedKernelHost()
  kernels.script.set('go', async ({ run }) => { await run('npm test'); return null })
  const { host } = replRun({ kernels, launcher, calls: { 3: async (repl) => { answers.push(await repl.call({ code: 'go' })) } } })

  await host.start()

  assert.match(answers[0].text, /^r1 exit 0 \(\d+\.\d s\) npm test - logs\/runs\/deliver-1-1\/1\.log$/)
})
