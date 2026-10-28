import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createNodeCommandRunner, windowsTreeKill } from '../../../../plugins/skraft-framework/engine/infrastructure/process/node-processes.mjs'
import { tempFolder } from '../support/workspace.mjs'

// A command the runner fails to end would hold its test forever: each test has a time limit.
const BOUNDED = { timeout: 20_000 }
const POSIX = { ...BOUNDED, skip: process.platform === 'win32' && 'POSIX process groups and sleep; Windows has its own tree test' }
const RUNNER = fileURLToPath(new URL('../../../../plugins/skraft-framework/engine/infrastructure/process/node-processes.mjs', import.meta.url))

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/** Waits until the file exists, then reads it. */
const readWhenWritten = async (path, ms = 10_000) => {
  for (const deadline = Date.now() + ms; Date.now() < deadline; await sleep(20)) if (existsSync(path)) return readFileSync(path, 'utf8')
  throw new Error(`${path} was never written`)
}

/** Whether the process is still running, given the system up to two seconds to end and reap it. */
const stillAlive = async (pid) => {
  for (const deadline = Date.now() + 2000; Date.now() < deadline; await sleep(20)) {
    try {
      process.kill(pid, 0)
    } catch {
      return false
    }
  }
  return true
}

/** A command that starts `sleep 300` in the background, writes its pid, then waits. */
const startsASleeper = (pidFile) => [
  "const { spawn } = require('node:child_process')",
  "const sleeper = spawn('sleep', ['300'], { stdio: 'ignore' })",
  `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(sleeper.pid))`,
  'setInterval(() => {}, 1000)',
].join('\n')

test('a command whose signal aborts is ended with every process it started, and says it was cancelled', POSIX, async (t) => {
  const root = tempFolder(t)
  const pidFile = join(root, 'sleeper.pid')
  const controller = new AbortController()

  const running = createNodeCommandRunner({ root }).run({ argv: ['node', '-e', startsASleeper(pidFile)], cwd: '.', signal: controller.signal })
  const sleeper = Number(await readWhenWritten(pidFile))
  controller.abort()

  assert.deepEqual(await running, { started: true, exitCode: null, stdout: '', stderr: '', error: 'node was cancelled' })
  assert.equal(await stillAlive(sleeper), false)
})

test('a command still running at its time limit is ended with every process it started', POSIX, async (t) => {
  const root = tempFolder(t)
  const pidFile = join(root, 'sleeper.pid')

  const result = await createNodeCommandRunner({ root }).run({ argv: ['node', '-e', startsASleeper(pidFile)], cwd: '.', timeoutMs: 1500 })

  assert.deepEqual(result, { started: true, exitCode: null, stdout: '', stderr: '', error: 'node did not finish within 1.5 s' })
  assert.equal(await stillAlive(Number(readFileSync(pidFile, 'utf8'))), false)
})

test('the runner\'s own signal and time limit hold for every command; a command\'s own win', BOUNDED, async (t) => {
  const root = tempFolder(t)
  const controller = new AbortController()
  controller.abort()
  const bounded = createNodeCommandRunner({ root, signal: controller.signal, timeoutMs: 300 })
  const waits = ['node', '-e', 'setInterval(() => {}, 1000)']

  assert.deepEqual(await bounded.run({ argv: waits, cwd: '.' }), { started: false, exitCode: null, stdout: '', stderr: '', error: 'node was cancelled before it started' })
  assert.equal((await bounded.run({ argv: waits, cwd: '.', signal: new AbortController().signal })).error, 'node did not finish within 0.3 s')
  assert.equal((await createNodeCommandRunner({ root, timeoutMs: 60_000 }).run({ argv: waits, cwd: '.', timeoutMs: 200 })).error, 'node did not finish within 0.2 s')
})

test('a command that ignores SIGTERM is killed a second later', POSIX, async (t) => {
  const root = tempFolder(t)
  const ready = join(root, 'ready')
  const controller = new AbortController()
  const stubborn = `process.on('SIGTERM', () => {}); require('node:fs').writeFileSync(${JSON.stringify(ready)}, 'ready'); setInterval(() => {}, 1000)`

  const running = createNodeCommandRunner({ root }).run({ argv: ['node', '-e', stubborn], cwd: '.', signal: controller.signal })
  await readWhenWritten(ready)
  const aborted = Date.now()
  controller.abort()
  const result = await running

  assert.equal(result.error, 'node was cancelled')
  assert.ok(Date.now() - aborted >= 900, `ended after ${Date.now() - aborted} ms`)
})

test('output past the limit keeps its head and its tail around a fixed marker, says it was cut, and the command runs to its end', BOUNDED, async (t) => {
  const root = tempFolder(t)
  const floods = [
    "const later = (text) => new Promise((done) => setTimeout(() => process.stdout.write(text, done), 20))",
    "process.stdout.write('a'.repeat(600) + 'b'.repeat(5000))",
    "later('c'.repeat(600)).then(() => later('z'.repeat(10))).then(() => process.stderr.write('short'))",
  ].join('\n')
  const runner = createNodeCommandRunner({ root, maxOutputBytes: 1024 })

  const result = await runner.run({ argv: ['node', '-e', floods], cwd: '.' })

  assert.deepEqual(result, { started: true, exitCode: 0, stdout: `${'a'.repeat(512)}\n… output cut …\n${'c'.repeat(502)}${'z'.repeat(10)}`, stderr: 'short', truncated: true })
  assert.deepEqual(await runner.run({ argv: ['node', '-e', "process.stderr.write('e'.repeat(2048))"], cwd: '.' }), { started: true, exitCode: 0, stdout: '', stderr: `${'e'.repeat(512)}\n… output cut …\n${'e'.repeat(512)}`, truncated: true })
})

test('a cut never splits a UTF-8 character, at the head nor at the tail', BOUNDED, async (t) => {
  const root = tempFolder(t)
  const runner = createNodeCommandRunner({ root, maxOutputBytes: 1022 })
  const runs = (char) => runner.run({ argv: ['node', '-e', `process.stdout.write('${char}'.repeat(3000))`], cwd: '.' })

  assert.equal((await runs('é')).stdout, `${'é'.repeat(255)}\n… output cut …\n${'é'.repeat(255)}`)
  assert.equal((await createNodeCommandRunner({ root, maxOutputBytes: 1024 }).run({ argv: ['node', '-e', "process.stdout.write('€'.repeat(3000))"], cwd: '.' })).stdout, `${'€'.repeat(170)}\n… output cut …\n${'€'.repeat(170)}`)
  assert.equal((await createNodeCommandRunner({ root, maxOutputBytes: 1030 }).run({ argv: ['node', '-e', "process.stdout.write('😀'.repeat(3000))"], cwd: '.' })).stdout, `${'😀'.repeat(128)}\n… output cut …\n${'😀'.repeat(128)}`)
})

test('output within the limit is kept whole and not said to be cut', BOUNDED, async (t) => {
  const root = tempFolder(t)

  const result = await createNodeCommandRunner({ root, maxOutputBytes: 1024 }).run({ argv: ['node', '-e', "process.stdout.write('x'.repeat(1024))"], cwd: '.' })

  assert.deepEqual(result, { started: true, exitCode: 0, stdout: 'x'.repeat(1024), stderr: '' })
})

test('under Windows a stopped command\'s whole tree is ended by taskkill, by its pid', () => {
  assert.deepEqual(windowsTreeKill(4242), { file: 'taskkill', args: ['/PID', '4242', '/T', '/F'] })
})

test('under Windows a cancelled .cmd whose child keeps the pipes open still ends, its tree killed', { ...BOUNDED, skip: process.platform !== 'win32' && 'taskkill exists only under Windows' }, async (t) => {
  const root = tempFolder(t)
  const pidFile = join(root, 'child.pid')
  writeFileSync(join(root, 'child.cjs'), `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000)\n`)
  writeFileSync(join(root, 'holds.cmd'), `@"${process.execPath}" child.cjs\r\n`)
  const controller = new AbortController()

  // A bare name is looked up on the PATH only: the script is named by its path from the folder.
  const running = createNodeCommandRunner({ root }).run({ argv: ['./holds.cmd'], cwd: '.', signal: controller.signal })
  const ended = running.then((result) => { throw new Error(`the command ended before its child started: ${JSON.stringify(result)}`) })
  const child = Number(await Promise.race([readWhenWritten(pidFile), ended]))
  controller.abort()

  assert.equal((await running).error, './holds.cmd was cancelled')
  assert.equal(await stillAlive(child), false)
})

/** A host process that runs one command through the runner, then does what the test says. */
const hostScript = (pidFile, idleFile) => [
  `import { createNodeCommandRunner } from ${JSON.stringify(new URL(`file://${RUNNER}`).href)}`,
  'const runner = createNodeCommandRunner({ root: process.cwd() })',
  `if (${JSON.stringify(idleFile)}) {`,
  "  await runner.run({ argv: ['node', '-e', '0'], cwd: '.' })",
  "  const { writeFileSync } = await import('node:fs')",
  `  writeFileSync(${JSON.stringify(idleFile)}, 'idle')`,
  '  setInterval(() => {}, 1000)',
  '} else {',
  `  runner.run({ argv: ['node', '-e', ${JSON.stringify(startsASleeper(pidFile))}], cwd: '.' })`,
  "  process.on('message', () => process.exit(0))",
  '}',
].join('\n')

/** Starts a host, waits for the file it writes once its command runs (or once it is idle). */
const startHost = async (root, { idle = false } = {}) => {
  const pidFile = join(root, 'sleeper.pid')
  const idleFile = idle ? join(root, 'idle') : ''
  writeFileSync(join(root, 'host.mjs'), hostScript(pidFile, idleFile))
  const host = spawn(process.execPath, ['host.mjs'], { cwd: root, stdio: ['ignore', 'ignore', 'inherit', 'ipc'] })
  const closed = new Promise((done) => host.once('close', (code, signal) => done({ code, signal })))
  const written = await readWhenWritten(idle ? idleFile : pidFile)
  return { host, closed, sleeper: idle ? null : Number(written) }
}

test('a host that exits ends the commands still running', POSIX, async (t) => {
  const { host, closed, sleeper } = await startHost(tempFolder(t))

  host.send('exit')

  assert.deepEqual(await closed, { code: 0, signal: null })
  assert.equal(await stillAlive(sleeper), false)
})

test('a host stopped by SIGTERM ends the commands still running, then stops as it would have', POSIX, async (t) => {
  const { host, closed, sleeper } = await startHost(tempFolder(t))

  host.kill('SIGTERM')

  assert.deepEqual(await closed, { code: null, signal: 'SIGTERM' })
  assert.equal(await stillAlive(sleeper), false)
})

test('a host with no command running stops on SIGTERM as if the runner were not there', POSIX, async (t) => {
  const { host, closed } = await startHost(tempFolder(t), { idle: true })

  host.kill('SIGTERM')

  assert.deepEqual(await closed, { code: null, signal: 'SIGTERM' })
})
