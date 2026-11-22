import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLiveProcesses } from '../../../../plugins/skraft-framework/engine/infrastructure/process/live-processes.mjs'
import { createOrphanJournal, processCreation } from '../../../../plugins/skraft-framework/engine/infrastructure/repl/orphans.mjs'
import { tempFolder } from '../support/workspace.mjs'

// A program the launcher fails to end would hold its test forever: each test has a time limit.
const BOUNDED = { timeout: 30_000 }

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

const readWhenWritten = async (path, ms = 10_000) => {
  for (const deadline = Date.now() + ms; Date.now() < deadline; await sleep(20)) if (existsSync(path) && readFileSync(path, 'utf8') !== '') return readFileSync(path, 'utf8')
  throw new Error(`${path} was never written`)
}

const stillAlive = async (pid) => {
  for (const deadline = Date.now() + 3000; Date.now() < deadline; await sleep(20)) {
    try {
      process.kill(pid, 0)
    } catch {
      return false
    }
  }
  return true
}

const NODE = process.execPath
const request = (root, script, more = {}) => ({ argv: [NODE, '-e', script], cwd: root, timeoutMs: 20_000, maxOutputBytes: 1_000_000, ...more })

/** A script that starts a long-lived grandchild, writes its pid, then waits. */
const startsASleeper = (pidFile) => [
  "const { spawn } = require('node:child_process')",
  "const sleeper = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })",
  `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(sleeper.pid))`,
  'setInterval(() => {}, 1000)',
].join('\n')

test('a program streams what it writes while it runs and ends with its exit code and the whole output', BOUNDED, async (t) => {
  const root = tempFolder(t)
  const chunks = []

  const live = await createLiveProcesses().start(request(root, "console.log('one'); console.error('two'); process.exit(3)", { onData: (text) => chunks.push(text) }))
  const result = await live.done

  assert.deepEqual([result.started, result.exitCode, result.timedOut, result.killed, result.cut], [true, 3, false, false, false])
  assert.deepEqual([...result.text.split('\n')].filter(Boolean).sort(), ['one', 'two'])
  assert.equal(chunks.join(''), result.text)
  assert.equal(result.bytes, Buffer.byteLength(result.text))
})

test('a program that is not on the machine is a result that did not start, never an exception', BOUNDED, async (t) => {
  const root = tempFolder(t)

  const live = await createLiveProcesses().start({ argv: ['skraft-no-such-program'], cwd: root, timeoutMs: 1000, maxOutputBytes: 1000 })
  const result = await live.done

  assert.deepEqual([result.started, result.exitCode, result.error], [false, null, 'skraft-no-such-program was not found'])
})

test('a folder that does not exist is a result that did not start', BOUNDED, async (t) => {
  const live = await createLiveProcesses().start(request(join(tempFolder(t), 'absent'), 'process.exit(0)'))

  assert.equal((await live.done).error, 'the folder to start in was not found')
})

test('a program past its time limit is ended with the processes it started, and says it timed out', { ...BOUNDED, skip: process.platform === 'win32' && 'POSIX process groups; Windows has its own tree test' }, async (t) => {
  const root = tempFolder(t)
  const pidFile = join(root, 'sleeper.pid')

  const live = await createLiveProcesses().start(request(root, startsASleeper(pidFile), { timeoutMs: 1500 }))
  const sleeper = Number(await readWhenWritten(pidFile))
  const result = await live.done

  assert.deepEqual([result.timedOut, result.killed, result.exitCode], [true, false, null])
  assert.equal(await stillAlive(sleeper), false)
})

test('a program killed by its caller is ended with the processes it started, and says it was killed', { ...BOUNDED, skip: process.platform === 'win32' && 'POSIX process groups; Windows has its own tree test' }, async (t) => {
  const root = tempFolder(t)
  const pidFile = join(root, 'sleeper.pid')

  const live = await createLiveProcesses().start(request(root, startsASleeper(pidFile)))
  const sleeper = Number(await readWhenWritten(pidFile))
  live.kill('SIGTERM', 500)
  const result = await live.done

  assert.deepEqual([result.killed, result.timedOut], [true, false])
  assert.equal(await stillAlive(sleeper), false)
})

test('a program that ignores SIGTERM is ended by SIGKILL after the grace', { ...BOUNDED, skip: process.platform === 'win32' && 'POSIX signals' }, async (t) => {
  const root = tempFolder(t)
  const marker = join(root, 'ready')

  const live = await createLiveProcesses().start(request(root, `process.on('SIGTERM', () => {}); require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'x'); setInterval(() => {}, 1000)`))
  await readWhenWritten(marker)
  live.kill('SIGTERM', 300)
  const result = await live.done

  assert.deepEqual([result.killed, result.signal], [true, 'SIGKILL'])
})

test('an output past the limit keeps its head and its tail and says it was cut, with every byte counted', BOUNDED, async (t) => {
  const root = tempFolder(t)

  const live = await createLiveProcesses().start(request(root, "process.stdout.write('a'.repeat(5000)); process.stdout.write('z'.repeat(5000))", { maxOutputBytes: 1000 }))
  const result = await live.done

  assert.deepEqual([result.cut, result.bytes], [true, 10_000])
  assert.ok(result.text.startsWith('aaa') && result.text.endsWith('zzz') && result.text.includes('output cut'))
  assert.ok(result.text.length < 1200)
})

test('a program that ends by itself leaves no group for the host to end at its exit', BOUNDED, async (t) => {
  const root = tempFolder(t)

  const live = await createLiveProcesses().start(request(root, 'process.exit(0)'))
  await live.done

  assert.equal(process.listenerCount('exit') < 20, true)
})

/** Starts a node process that waits, as the leader of a group of its own. */
const startsDetached = () => spawn(NODE, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' })

const deadServer = async () => {
  const server = spawn(NODE, ['-e', 'process.exit(0)'], { stdio: 'ignore' })
  await new Promise((done) => server.once('close', done))
  return server.pid
}

const POSIX = { ...BOUNDED, skip: process.platform === 'win32' && 'the group kill is POSIX; Windows ends the tree with taskkill' }

test('a server starting later ends what a server killed without cleaning up left running, and forgets it', POSIX, async (t) => {
  const folder = tempFolder(t)
  const run = startsDetached()
  t.after(() => { try { process.kill(-run.pid, 'SIGKILL') } catch { /* gone */ } })
  const journal = createOrphanJournal({ folder })
  const server = await deadServer()
  await journal.keep({ server: { pid: server, created: 'a time long ago' }, kernel: null, runs: [{ pid: run.pid, created: processCreation(run.pid) }] })

  const reaped = await journal.reap()

  assert.equal(reaped, 1)
  assert.equal(await stillAlive(run.pid), false)
  assert.equal(existsSync(join(folder, `${server}.json`)), false)
})

test('a server that still runs keeps what it started', POSIX, async (t) => {
  const folder = tempFolder(t)
  const run = startsDetached()
  t.after(() => { try { process.kill(-run.pid, 'SIGKILL') } catch { /* gone */ } })
  const journal = createOrphanJournal({ folder })
  await journal.keep({ server: { pid: process.pid, created: processCreation(process.pid) }, kernel: null, runs: [{ pid: run.pid, created: processCreation(run.pid) }] })

  assert.equal(await journal.reap(), 0)
  assert.equal(await stillAlive(run.pid), true)
})

test('a pid the system reused is never ended: only the process whose start time was recorded is', POSIX, async (t) => {
  const folder = tempFolder(t)
  const run = startsDetached()
  t.after(() => { try { process.kill(-run.pid, 'SIGKILL') } catch { /* gone */ } })
  const journal = createOrphanJournal({ folder })
  await journal.keep({ server: { pid: await deadServer(), created: 'a time long ago' }, kernel: null, runs: [{ pid: run.pid, created: 'another start time' }] })

  assert.equal(await journal.reap(), 0)
  assert.equal(await stillAlive(run.pid), true)
})
