import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { createOutput } from './output-cut.mjs'
import { groupDone, groupStarted, stopGroup } from './process-groups.mjs'
import { locate, startArgs, windowsTreeKill } from './node-processes.mjs'

/**
 * A program that runs while its caller goes on: it streams what it writes, ends at a time limit,
 * and is ended with every process it started (its process group under POSIX, its tree under
 * Windows). Stdout and stderr are one stream, in the order they arrive. Nothing here throws:
 * a program that cannot start is a result with `started: false`.
 *
 * @typedef {{ platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv }} LiveHost
 * @typedef {{ argv: string[], cwd: string, timeoutMs: number, maxOutputBytes: number, onData?: (text: string) => void }} LiveRequest
 *   cwd: the absolute folder it starts in; maxOutputBytes: the output kept, head and tail past it.
 * @typedef {{
 *   started: boolean, exitCode: number | null, signal: string | null, timedOut: boolean, killed: boolean,
 *   text: string, cut: boolean, bytes: number, error: string | null,
 * }} LiveResult
 *   text: the output kept; bytes: everything the program wrote; error: a fixed text, set only when it did not start.
 * @typedef {{ pid: number | null, done: Promise<LiveResult>, kill: (signal?: NodeJS.Signals, graceMs?: number) => void }} LiveProcess
 */

const TREE_KILL_MS = 10_000
const GRACE_MS = 5000

/**
 * @param {LiveHost} [host]
 * @returns {{ start: (request: LiveRequest) => Promise<LiveProcess> }}
 */
export const createLiveProcesses = ({ platform = process.platform, env = process.env } = {}) =>
  Object.freeze({ start: (request) => startLive(request, { platform, env }) })

/** @param {LiveRequest} request @param {Required<LiveHost>} host @returns {Promise<LiveProcess>} */
const startLive = async (request, host) => {
  const [program, ...args] = request.argv
  const dir = resolve(request.cwd)
  if (!(await isFolder(dir))) return failed('the folder to start in was not found')
  const located = await locate(program, dir, host)
  if (located === null) return failed(`${program} was not found`)
  return spawned(request, { dir, host, start: startArgs(located, args, host) })
}

/** @param {string} dir */
const isFolder = (dir) => stat(dir).then((entry) => entry.isDirectory(), () => false)

/** @param {string} error @returns {LiveProcess} */
const failed = (error) => Object.freeze({
  pid: null, kill: () => undefined,
  done: Promise.resolve({ started: false, exitCode: null, signal: null, timedOut: false, killed: false, text: '', cut: false, bytes: 0, error }),
})

/**
 * @typedef {{ child: import('node:child_process').ChildProcessWithoutNullStreams, grouped: boolean, ended: boolean, timedOut: boolean, killed: boolean }} Live
 */

/** @param {LiveRequest} request @param {{ dir: string, host: Required<LiveHost>, start: ReturnType<typeof startArgs> }} where @returns {LiveProcess} */
const spawned = (request, { dir, host, start }) => {
  const grouped = host.platform !== 'win32'
  try {
    const child = /** @type {Live['child']} */ (spawn(start.file, start.fileArgs, { cwd: dir, env: host.env, detached: grouped, windowsVerbatimArguments: start.throughCmd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }))
    return running(request, { child, grouped, ended: false, timedOut: false, killed: false })
  } catch {
    return failed('the system refused to start it')
  }
}

/** @param {LiveRequest} request @param {Live} live @returns {LiveProcess} */
const running = (request, live) => {
  if (live.grouped) groupStarted(/** @type {number} */ (live.child.pid))
  const output = createOutput(request.maxOutputBytes)
  const seen = { bytes: 0 }
  listen(live, request, { output, seen })
  const timer = setTimeout(() => end(live, { signal: 'SIGTERM', graceMs: 1000, timedOut: true }), request.timeoutMs)
  const done = new Promise((finish) => settle(live, { output, seen, timer }, finish))
  return Object.freeze({ pid: live.child.pid ?? null, done, kill: (signal = 'SIGTERM', graceMs = GRACE_MS) => end(live, { signal, graceMs, timedOut: false }) })
}

/** @param {Live} live @param {LiveRequest} request @param {{ output: ReturnType<typeof createOutput>, seen: { bytes: number } }} sinks */
const listen = (live, request, { output, seen }) => {
  for (const stream of [live.child.stdout, live.child.stderr]) {
    const decoder = new StringDecoder('utf8')
    stream.on('data', (/** @type {Buffer} */ chunk) => {
      seen.bytes += chunk.length
      output.push(chunk)
      request.onData?.(decoder.write(chunk))
    })
  }
}

/**
 * @param {Live} live @param {{ output: ReturnType<typeof createOutput>, seen: { bytes: number }, timer: NodeJS.Timeout }} state
 * @param {(result: LiveResult) => void} finish
 */
const settle = (live, { output, seen, timer }, finish) => {
  const result = (/** @type {Partial<LiveResult>} */ more) => ({ started: true, exitCode: null, signal: null, timedOut: live.timedOut, killed: live.killed, text: output.text(), cut: output.cut(), bytes: seen.bytes, error: null, ...more })
  live.child.once('error', () => {
    clearTimeout(timer)
    finish(result({ started: false, error: 'the system refused to start it' }))
  })
  live.child.once('close', (code, signal) => {
    clearTimeout(timer)
    if (live.grouped && !live.ended) groupDone(/** @type {number} */ (live.child.pid))
    finish(result({ exitCode: code, signal }))
  })
}

/**
 * Ends the program and everything it started, once; the signal first, SIGKILL after the grace under POSIX.
 * @param {Live} live @param {{ signal: NodeJS.Signals, graceMs: number, timedOut: boolean }} how
 */
const end = (live, { signal, graceMs, timedOut }) => {
  if (live.ended) return timedOut ? overdue(live) : undefined
  live.ended = true
  live.timedOut = timedOut
  live.killed = !timedOut
  if (live.grouped) stopGroup(/** @type {number} */ (live.child.pid), { signal, graceMs })
  else stopTree(live.child)
}

/**
 * The time limit passes while a kill's grace runs: the program is timed out and ends now, so
 * that no grace ever outlasts the limit.
 * @param {Live} live
 */
const overdue = (live) => {
  live.timedOut = true
  if (live.grouped) stopGroup(/** @type {number} */ (live.child.pid), { signal: 'SIGKILL', graceMs: 0 })
}

/** Windows: taskkill ends the tree, then the pipes are let go so the program closes. @param {Live['child']} child */
const stopTree = (child) => {
  const { file, args } = windowsTreeKill(/** @type {number} */ (child.pid))
  const killer = spawn(file, args, { stdio: 'ignore', windowsHide: true, timeout: TREE_KILL_MS })
  killer.once('error', () => child.kill())
  killer.once('close', () => {
    child.stdout.destroy()
    child.stderr.destroy()
  })
}
