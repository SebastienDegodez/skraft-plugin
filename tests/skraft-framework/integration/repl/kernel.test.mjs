import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createNodeKernelHost } from '../../../../plugins/skraft-framework/engine/infrastructure/repl/node-kernel.mjs'
import { createLiveProcesses } from '../../../../plugins/skraft-framework/engine/infrastructure/process/live-processes.mjs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tempFolder } from '../support/workspace.mjs'

// A kernel the test fails to end would hold the test run: each test has a time limit.
const BOUNDED = { timeout: 30_000 }
const BUDGET = 20_000

/**
 * A kernel on a real child process, whose `run()` requests this test serves with real programs,
 * as the MCP server does: it starts them and streams their output and exit back.
 */
const openKernel = async (t) => {
  const root = tempFolder(t)
  const seen = { runs: [], absent: [], gone: [], killed: [] }
  const live = new Map()
  let kernel = null
  const processes = createLiveProcesses()
  const events = {
    onRun: async (request) => {
      seen.runs.push(request)
      const argv = Array.isArray(request.command) ? request.command : [process.execPath, '-e', request.command]
      const program = await processes.start({ argv, cwd: root, timeoutMs: request.timeout * 1000, maxOutputBytes: 100_000, onData: (text) => kernel.chunk(request.rid, text) })
      live.set(request.rid, program)
      const result = await program.done
      kernel.exited(request.rid, { exitCode: result.exitCode, signal: result.signal, timedOut: result.timedOut, killed: result.killed, durationMs: 1, log: `${request.rid}.log`, error: result.error })
    },
    onKill: (rid, signal, grace) => { seen.killed.push(rid); live.get(rid)?.kill(signal, grace * 1000) },
    onAbsent: (notice) => seen.absent.push(notice),
    onGone: (why) => seen.gone.push(why),
  }
  kernel = await createNodeKernelHost().start(events, root)
  t.after(() => {
    kernel.stop()
    for (const program of live.values()) program.kill('SIGKILL', 0)
  })
  return { kernel, seen, root }
}

const cell = (kernel, code, budget = BUDGET) => kernel.evaluate(code, budget)

test('variables persist from one cell to the next, a cell may await at its top level, and its trailing value comes back inspected', BOUNDED, async (t) => {
  const { kernel } = await openKernel(t)

  await cell(kernel, 'const base = await Promise.resolve(41)')
  const second = await cell(kernel, 'base + 1')
  const third = await cell(kernel, '({ nested: { deeper: { deepest: { gone: 1 } } }, list: [1, 2] })')

  assert.deepEqual([second.status, second.value, second.error], ['done', '42', null])
  assert.equal(third.value, '{ nested: { deeper: { deepest: [Object] } }, list: [ 1, 2 ] }')
})

test('a cell that throws, awaits a rejection, names nothing it declared or is cut short ends as an error and leaves the kernel usable', BOUNDED, async (t) => {
  const { kernel } = await openKernel(t)

  const thrown = await cell(kernel, 'throw new Error("boom")')
  const rejected = await cell(kernel, 'await Promise.reject(new TypeError("later"))')
  const missing = await cell(kernel, 'nothingDeclared()')
  const incomplete = await cell(kernel, 'function open() {')
  const after = await cell(kernel, '1 + 1')

  assert.deepEqual([thrown.status, rejected.status, missing.status, incomplete.status, after.status], ['error', 'error', 'error', 'error', 'done'])
  assert.match(thrown.error, /^Error: boom/)
  assert.match(rejected.error, /^TypeError: later/)
  assert.match(missing.error, /nothingDeclared is not defined/)
  assert.equal(incomplete.error, 'SyntaxError: the cell is incomplete')
})

test('a top-level const declared a second time fails with the error the result explains', BOUNDED, async (t) => {
  const { kernel } = await openKernel(t)

  await cell(kernel, 'const unit = 1')
  const again = await cell(kernel, 'const unit = 2')

  assert.equal(again.status, 'error')
  assert.match(again.error, /^SyntaxError: Identifier 'unit' has already been declared/)
})

test('what a cell prints comes back with it, and what a later run prints arrives with the next cell', BOUNDED, async (t) => {
  const { kernel } = await openKernel(t)

  const first = await cell(kernel, 'console.log("one", { a: 1 }); setTimeout(() => console.log("late"), 50); 1')
  await new Promise((done) => setTimeout(done, 300))
  const second = await cell(kernel, 'console.error("two")')

  assert.equal(first.printed, 'one { a: 1 }\n')
  assert.equal(second.printed, 'late\ntwo\n')
})

test('run() hands back a handle that is awaited, polled, tailed and read, with the exit code and the output', BOUNDED, async (t) => {
  const { kernel, seen } = await openKernel(t)

  await cell(kernel, "const h = run(['" + process.execPath.replaceAll('\\', '\\\\') + "', '-e', 'for (let i = 1; i <= 5; i++) console.log(\"line \" + i); process.exit(4)'], { label: 'five', gate: 'test' })")
  const early = await cell(kernel, 'h.id')
  const done = await cell(kernel, 'const result = await h; [result.exitCode, h.running, h.poll() === result, h.tail(2), h.output().split("\\n").length]')

  assert.equal(early.value, '1')
  assert.equal(done.value, "[ 4, false, true, 'line 4\\nline 5', 6 ]")
  assert.deepEqual([seen.runs[0].gate, seen.runs[0].label, seen.runs[0].cwd, seen.runs[0].timeout, seen.runs[0].cell], ['test', 'five', '.', 600, 1])
})

test('gate() is run() with its gate named, and absent() reports a gate the project does not have', BOUNDED, async (t) => {
  const { kernel, seen } = await openKernel(t)

  await cell(kernel, `await gate('lint', ['${process.execPath.replaceAll('\\', '\\\\')}', '-e', '0'], { cwd: 'api' }); absent('coverage', 'api', 'the AGENTS.md names none')`)

  assert.deepEqual([seen.runs[0].gate, seen.runs[0].cwd], ['lint', 'api'])
  assert.deepEqual(seen.absent, [{ t: 'absent', gate: 'coverage', component: 'api', reason: 'the AGENTS.md names none', cell: 1 }])
})

test('a run that is killed through its handle ends with the signal it was killed by', { ...BOUNDED, skip: process.platform === 'win32' && 'POSIX signals' }, async (t) => {
  const { kernel, seen } = await openKernel(t)

  await cell(kernel, "const long = run(['" + process.execPath.replaceAll('\\', '\\\\') + "', '-e', 'setInterval(() => {}, 1000)'])")
  const ended = await cell(kernel, 'await new Promise((r) => setTimeout(r, 300)); const refused = long.kill("SIGHUP"); long.kill("SIGTERM", 1); const r = await long; [r.killed, r.timedOut, long.running, refused]')

  assert.equal(ended.value, "[\n  true,\n  false,\n  false,\n  'kill() takes SIGTERM, SIGINT or SIGKILL and a grace of 0 to 30 whole seconds'\n]")
  assert.deepEqual(seen.killed, [1])
})

test('a cell past its budget answers with what it printed, runs on, and its end is awaited apart; a second cell meanwhile is busy', BOUNDED, async (t) => {
  const { kernel } = await openKernel(t)

  const running = await cell(kernel, 'console.log("started"); await new Promise((r) => setTimeout(r, 800)); "finished"', 150)
  const busy = await cell(kernel, '1', 150)
  const whileRunning = kernel.busy()
  const ended = await kernel.wait(5000)
  const afterEnd = kernel.busy()

  assert.deepEqual([running.status, running.printed], ['running', 'started\n'])
  assert.deepEqual([busy.status, whileRunning, afterEnd], ['busy', true, false])
  assert.deepEqual([ended.status, ended.value], ['done', "'finished'"])
})

test('a cell that ends after its budget, before anyone waits, still hands its value and what it printed last to the next wait', BOUNDED, async (t) => {
  const { kernel } = await openKernel(t)

  const running = await cell(kernel, 'console.log("a"); await new Promise((r) => setTimeout(r, 300)); console.log("b"); "late value"', 50)
  await new Promise((done) => setTimeout(done, 600))
  const ended = await kernel.wait(1000)
  const nothing = await kernel.wait(1000)

  assert.deepEqual([running.status, running.printed], ['running', 'a\n'])
  assert.deepEqual([ended.status, ended.printed, ended.value], ['done', 'b\n', "'late value'"])
  assert.deepEqual([nothing.status, nothing.printed, nothing.value], ['done', '', null])
})

test('an interrupt ends the awaits of the cell in flight, which reports it was interrupted, and the kernel keeps its variables', BOUNDED, async (t) => {
  const { kernel } = await openKernel(t)
  await cell(kernel, 'const kept = 7')

  const flying = cell(kernel, "await run(['" + process.execPath.replaceAll('\\', '\\\\') + "', '-e', 'setInterval(() => {}, 1000)'])", 10_000)
  await new Promise((done) => setTimeout(done, 300))
  kernel.interrupt()
  const interrupted = await flying
  const after = await cell(kernel, 'kept')

  assert.deepEqual([interrupted.status, after.value], ['interrupted', '7'])
  assert.match(interrupted.error, /interrupted/)
})

test('an interrupt of a cell that never yields restarts the kernel, which reports it, and its variables are gone', BOUNDED, async (t) => {
  const { kernel, seen } = await openKernel(t)

  const flying = cell(kernel, 'while (true) {}', 10_000)
  await new Promise((done) => setTimeout(done, 200))
  kernel.interrupt()
  const outcome = await flying

  assert.equal(outcome.status, 'restarted')
  assert.deepEqual(seen.gone, ['restarted'])
})

test('a kernel that never says it is ready is refused within ten seconds, and a kernel runs with a command line of its own, not the server\'s', BOUNDED, async (t) => {
  const { kernel } = await openKernel(t)
  const events = { onRun: () => undefined, onKill: () => undefined, onAbsent: () => undefined, onGone: () => undefined }
  const asked = Date.now()

  const started = await Promise.race([
    createNodeKernelHost({ entry: fileURLToPath(new URL('./fixtures/never-ready.mjs', import.meta.url)) }).start(events, tempFolder(t)).then(() => 'ready', () => 'refused'),
    new Promise((done) => setTimeout(() => done('still waiting'), 12_000)),
  ])
  const flags = await cell(kernel, 'process.execArgv')

  assert.equal(started, 'refused')
  assert.ok(Date.now() - asked >= 9_000)
  assert.equal(flags.value, "[ '--max-old-space-size=2048' ]")
})

test('a kernel that is stopped ends with every process its cells started by themselves', BOUNDED, async (t) => {
  const { kernel } = await openKernel(t)
  const started = await cell(kernel, "require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }).pid")
  const pid = Number(started.value)
  t.after(() => { try { process.kill(pid, 'SIGKILL') } catch { /* gone */ } })

  kernel.stop()
  let alive = true
  for (let tries = 0; tries < 50 && alive; tries += 1) {
    await new Promise((done) => setTimeout(done, 100))
    try { process.kill(pid, 0) } catch { alive = false }
  }

  assert.ok(Number.isInteger(pid) && pid > 0, started.error ?? started.value)
  assert.equal(alive, false)
})

test('the kernel keeps the output of its last 50 runs; an older handle names the log that holds its output', BOUNDED, async (t) => {
  const { kernel } = await openKernel(t)

  const kept = await cell(kernel, "const hs = []; for (let i = 0; i < 51; i += 1) { const h = run(['" + process.execPath.replaceAll('\\', '\\\\') + "', '-e', 'console.log(1)']); hs.push(h); await h }; [hs[0].output(), (await hs[0]).output, hs[50].output()]")

  assert.equal(kept.value, "[\n  '[the output of r1 is no longer kept in the kernel: it is in 1.log]',\n  '[the output of r1 is no longer kept in the kernel: it is in 1.log]',\n  '1\\n'\n]")
})

test('what a cell writes to process.stdout and process.stderr comes back with it', BOUNDED, async (t) => {
  const { kernel } = await openKernel(t)

  const written = await cell(kernel, "process.stdout.write('out\\n'); process.stderr.write('err\\n'); 1")

  assert.equal(written.printed, 'out\nerr\n')
})

test('what a cell prints past 1 MiB comes back as its first and last half megabytes around a marker', BOUNDED, async (t) => {
  const { kernel } = await openKernel(t)

  const noisy = await cell(kernel, "const line = 'x'.repeat(1023); console.log('first'); for (let i = 0; i < 8192; i += 1) console.log(line); console.log('last')")

  assert.ok(Buffer.byteLength(noisy.printed) <= 1_048_576 + 200, `${Buffer.byteLength(noisy.printed)} bytes`)
  assert.ok(noisy.printed.startsWith('first\n'))
  assert.ok(noisy.printed.endsWith('\nlast\n'))
  assert.match(noisy.printed, /\n… the cell printed more than 1 MiB: its first and last 512 KiB are kept …\n/)
})

test('a kernel that exits before it says it is alive is refused, and leaves no deadline holding the server', BOUNDED, async (t) => {
  const host = fileURLToPath(new URL('../../../../plugins/skraft-framework/engine/infrastructure/repl/node-kernel.mjs', import.meta.url))
  const child = fileURLToPath(new URL('./fixtures/exits-at-once.mjs', import.meta.url))
  const script = `import(${JSON.stringify(pathToFileURL(host).href)}).then(({ createNodeKernelHost }) => createNodeKernelHost({ entry: ${JSON.stringify(child)} }).start({ onRun() {}, onKill() {}, onAbsent() {}, onGone() {} }, ${JSON.stringify(tempFolder(t))})).then(() => console.log('ready'), () => console.log('refused'))`
  const asked = Date.now()

  const ran = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 25_000 })

  assert.equal(ran.stdout.trim(), 'refused')
  assert.ok(Date.now() - asked < 8000, `the server process lived ${Date.now() - asked} ms after the refusal`)
})

test('a kernel that exits by itself reports it crashed with the cell it was running', BOUNDED, async (t) => {
  const { kernel, seen } = await openKernel(t)

  const outcome = await cell(kernel, 'process.exit(3)')

  assert.equal(outcome.status, 'crashed')
  assert.deepEqual(seen.gone, ['crashed'])
})
