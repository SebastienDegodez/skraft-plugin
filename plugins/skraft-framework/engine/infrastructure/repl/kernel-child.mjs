import repl from 'node:repl'
import { Console } from 'node:console'
import { PassThrough, Writable } from 'node:stream'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspect } from 'node:util'
import { createOutput } from '../process/output-cut.mjs'
import { refusalOfKill } from '../../domain/repl/refusals.mjs'
import { createPrintWindow } from './print-window.mjs'
import { loadLibrary } from './repl-library.mjs'
import { notInstalled, projectRequire } from './repl-require.mjs'

/**
 * The process behind one `skraft_repl` attempt: a `node:repl` server on streams of its own, whose
 * cells the MCP server sends over IPC. It never starts a program: `run()` asks the MCP server to
 * (message `run`), which starts it, records it and streams its output back (`chunk`, `exit`).
 * Variables persist from one cell to the next; top-level await works (through the REPL's own
 * eval, which is behaviour rather than documented API: the pin test in kernel.test.mjs watches it).
 *
 * To the server: alive, ready (with what it loaded of the project's REPL library), run, kill, absent,
 * print, cell-done. From it: cell, chunk, exit, interrupt.
 * Standard output and error of this process go nowhere: only IPC carries data.
 *
 * @typedef {{ send: (message: object) => void, on: (event: string, listener: (...args: any[]) => void) => unknown }} Ipc
 * @typedef {{
 *   ipc: Ipc, handles: Map<number, Handle>, nextRun: number,
 *   cell: { id: number, done: (outcome: { value: string | null, error: string | null }) => void } | null,
 *   prompted: (() => void) | null, server: any, printing?: ReturnType<typeof createPrintWindow>,
 * }} Kernel
 */

/** What a run handle keeps of its output, in memory. */
const BUFFER_BYTES = 1_048_576
const DEFAULT_TIMEOUT_S = 600
const VALUE_DEPTH = 2

/** A run, as the cell sees it: awaitable, with its output so far. */
class Handle {
  /** @param {Kernel} kernel @param {number} id @param {string | string[]} command */
  constructor(kernel, id, command) {
    this.kernel = kernel
    this.id = id
    this.command = command
    this.buffer = createOutput(BUFFER_BYTES)
    /** @type {Record<string, unknown> | null} */
    this.result = null
    /** @type {string | undefined} what output() gives once the output is let go */
    this.forgotten = undefined
    this.cell = kernel.cell?.id ?? null
    this.done = new Promise((resolve, reject) => Object.assign(this, { settle: resolve, fail: reject }))
    this.done.catch(() => undefined)
  }

  get running() { return this.result === null }

  /** @param {number} [lines] */
  tail(lines = 50) { return this.output().replace(/\n$/, '').split('\n').slice(-lines).join('\n') }

  output() { return this.forgotten ?? this.buffer.text() }

  /** Its output is let go; the handle names the log that holds it. */
  forget() {
    if (this.forgotten !== undefined || this.result === null) return
    this.forgotten = `[the output of r${this.id} is no longer kept in the kernel: it is in ${this.result.log}]`
    this.result.output = this.forgotten
    this.buffer = createOutput(0)
  }

  poll() { return this.result }

  /** @param {string} [signal] @param {number} [grace] seconds before SIGKILL @returns {string | undefined} why it is refused; the server refuses it too */
  kill(signal = 'SIGTERM', grace = 5) {
    const refusal = refusalOfKill(signal, grace)
    if (refusal !== null) return refusal
    if (this.running) this.kernel.ipc.send({ t: 'kill', rid: this.id, signal, grace })
    return undefined
  }

  /** @param {(value: unknown) => unknown} resolve @param {(error: unknown) => unknown} reject */
  then(resolve, reject) { return this.done.then(resolve, reject) }
}

/**
 * Starts the kernel on an IPC channel (the child's `process`, or a test's double).
 * @param {Ipc} ipc @param {{ libFolder?: string | null, firstRid?: number }} [options] libFolder: the working copy's absolute .repl/lib folder; firstRid: the id of its first run @returns {Kernel}
 */
export const startKernel = (ipc, { libFolder = null, firstRid = 1 } = {}) => {
  /** @type {Kernel} */
  const kernel = /** @type {Kernel} */ ({ ipc, handles: new Map(), nextRun: firstRid, cell: null, prompted: null, server: null })
  routeConsole(kernel)
  kernel.server = replServer(kernel)
  defineApi(kernel)
  ipc.on('message', (/** @type {any} */ message) => onMessage(kernel, message))
  ipc.send({ t: 'alive' })
  void announce(kernel, libFolder)
  return kernel
}

/**
 * The project's REPL library is loaded, then given to the cells as `lib`; the server hears what
 * was loaded with `ready`.
 * @param {Kernel} kernel @param {string | null} folder
 */
const announce = async (kernel, folder) => {
  const root = folder === null ? null : dirname(dirname(folder))
  if (root !== null) kernel.server.context.require = projectRequire(root)
  const library = folder === null ? { lib: {}, loaded: [], failed: [], refused: [] } : await loadLibrary(folder)
  Object.assign(globalThis, { lib: Object.freeze(library.lib) })
  kernel.ipc.send({ t: 'ready', lib: { loaded: library.loaded, failed: library.failed, refused: library.refused, notInstalled: root !== null && notInstalled(root) } })
}

/** What a cell prints, and what runs later print, goes to the server as `print`. @param {Kernel} kernel */
const routeConsole = (kernel) => {
  kernel.printing = createPrintWindow((cell, text) => kernel.ipc.send({ t: 'print', cell, text }))
  const sink = new Writable({ write: (chunk, _encoding, next) => { kernel.printing?.write(kernel.cell?.id ?? null, Buffer.from(chunk)); next() } })
  globalThis.console = new Console({ stdout: sink, stderr: sink })
}

/**
 * What a cell writes to the process's own stdout and stderr, which go nowhere, is printed as
 * console.log is. Only the kernel's own process does this, never a test that imports it.
 * @param {Kernel} kernel
 */
const routeStdio = (kernel) => {
  for (const stream of [process.stdout, process.stderr]) {
    stream.write = (/** @type {any} */ chunk, /** @type {any} */ encoding, /** @type {any} */ done) => written(kernel, { chunk, encoding, done })
  }
}

/** @param {Kernel} kernel @param {{ chunk: any, encoding: any, done: any }} write */
const written = (kernel, { chunk, encoding, done }) => {
  kernel.printing?.write(kernel.cell?.id ?? null, Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), typeof encoding === 'string' ? encoding : 'utf8'))
  const callback = typeof encoding === 'function' ? encoding : done
  if (typeof callback === 'function') queueMicrotask(callback)
  return true
}

/**
 * The REPL server on streams nothing reads; its `displayPrompt`, which it calls after an error a
 * cell raised, ends the cell with that error, `lastError`.
 * @param {Kernel} kernel
 */
const replServer = (kernel) => {
  const server = repl.start({ input: new PassThrough(), output: new PassThrough(), terminal: false, useGlobal: true, prompt: '' })
  server.displayPrompt = () => kernel.prompted?.()
  return server
}

/** @param {Kernel} kernel */
const defineApi = (kernel) => {
  const start = (/** @type {string | string[]} */ command, /** @type {Record<string, unknown>} */ options = {}) => startRun(kernel, command, options)
  Object.assign(globalThis, {
    run: start,
    gate: (/** @type {string} */ name, /** @type {string | string[]} */ command, /** @type {Record<string, unknown>} */ options = {}) => start(command, { ...options, gate: name }),
    absent: (/** @type {string} */ gate, /** @type {string} */ component, /** @type {string} */ reason) => kernel.ipc.send({ t: 'absent', gate, component, reason, cell: kernel.cell?.id ?? null }),
  })
}

/** @param {Kernel} kernel @param {string | string[]} command @param {Record<string, unknown>} options */
const startRun = (kernel, command, options) => {
  const handle = new Handle(kernel, kernel.nextRun, command)
  kernel.nextRun += 1
  kernel.handles.set(handle.id, handle)
  const given = isOptions(options) ? options : {}
  kernel.ipc.send({ t: 'run', rid: handle.id, cell: handle.cell, command, cwd: given.cwd ?? '.', timeout: given.timeout ?? DEFAULT_TIMEOUT_S, gate: given.gate ?? null, label: given.label ?? null, options: optionNames(options) })
  return handle
}

/** @param {unknown} options @returns {options is Record<string, unknown>} */
const isOptions = (options) => typeof options === 'object' && options !== null && !Array.isArray(options)

/** The names of the options a cell gave, for the server to refuse one it does not know; options that are no object name none run() takes. @param {unknown} options */
const optionNames = (options) => {
  if (options === undefined) return []
  return isOptions(options) ? Object.keys(options) : ['(not an object)']
}

/** @param {Kernel} kernel @param {any} message */
const onMessage = (kernel, message) => {
  const handler = HANDLERS[message?.t]
  if (handler !== undefined) handler(kernel, message)
}

/** @type {Record<string, (kernel: Kernel, message: any) => void>} */
const HANDLERS = {
  cell: (kernel, { id, code }) => { void evaluate(kernel, id, code) },
  chunk: (kernel, { rid, text }) => kernel.handles.get(rid)?.buffer.push(Buffer.from(text, 'utf8')),
  exit: (kernel, { rid, result }) => finish(kernel, kernel.handles.get(rid), result),
  interrupt: (kernel) => interrupt(kernel),
}

/** @param {Kernel} kernel @param {Handle | undefined} handle @param {Record<string, unknown>} result */
const finish = (kernel, handle, result) => {
  if (handle === undefined || handle.result !== null) return
  handle.result = { ...result, output: handle.output() }
  handle.settle(handle.result)
  forgetOld(kernel)
}

/** The kernel keeps the output of its last runs only; an older handle names its log. */
const KEPT_HANDLES = 50

/** @param {Kernel} kernel */
const forgetOld = (kernel) => {
  for (const handle of kernel.handles.values()) if (handle.id <= kernel.nextRun - 1 - KEPT_HANDLES && handle.result !== null) handle.forget()
}

/** The awaits of the cell on a run stop waiting. @param {Kernel} kernel */
const interrupt = (kernel) => {
  for (const handle of kernel.handles.values()) if (handle.running && handle.cell === kernel.cell?.id) handle.fail(new Error('interrupted'))
}

/** Runs one cell; the server hears its end as `cell-done`. @param {Kernel} kernel @param {number} id @param {string} code */
const evaluate = async (kernel, id, code) => {
  const outcome = await new Promise((done) => {
    kernel.cell = { id, done }
    kernel.prompted = () => done({ value: null, error: errorText(kernel.server.lastError) })
    kernel.server.eval(`${code}\n`, kernel.server.context, 'cell', (/** @type {any} */ error, /** @type {unknown} */ value) => done(settled(error, value)))
  })
  kernel.printing?.close()
  kernel.cell = null
  kernel.prompted = null
  kernel.ipc.send({ t: 'cell-done', id, ...outcome })
}

/** @param {any} error @param {unknown} value */
const settled = (error, value) => {
  if (error !== null && error !== undefined) return { value: null, error: error.constructor?.name === 'Recoverable' ? 'SyntaxError: the cell is incomplete' : errorText(error) }
  return { value: value === undefined ? null : inspect(value, { depth: VALUE_DEPTH, breakLength: 100 }), error: null }
}

/** @param {any} error */
const errorText = (error) => String(error?.stack ?? error ?? 'the cell failed').split('\n').filter((line) => !FRAMEWORK_FRAME.test(line)).join('\n').slice(0, 4000)

/** The frames of the kernel and of Node itself say nothing of the agent's cell. */
const FRAMEWORK_FRAME = /kernel-child\.mjs|\(node:|node:internal|node:vm|node:repl|node:domain|at new Promise/

/** The id of the first run, as the server passes it; 1 when it passes none. @param {string | undefined} text */
const firstRidOf = (text) => {
  const rid = Number(text)
  return Number.isInteger(rid) && rid > 0 ? rid : 1
}

// Started by the MCP server with `fork`; imported by the tests, which hand it a channel of their own.
if (process.send !== undefined && process.argv[1] === fileURLToPath(import.meta.url)) {
  const kernel = startKernel(process, { libFolder: process.argv[2] ?? null, firstRid: firstRidOf(process.argv[3]) })
  routeStdio(kernel)
  process.on('disconnect', () => process.exit(0))
  for (const event of ['uncaughtException', 'unhandledRejection']) process.on(event, (error) => kernel.ipc.send({ t: 'print', cell: null, text: `${errorText(error)}\n` }))
}
