import { fork, spawn } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { groupStarted, stopGroup } from '../process/process-groups.mjs'
import { windowsTreeKill } from '../process/node-processes.mjs'

/**
 * @typedef {import('../../application/ports/kernel-host.mjs').KernelHost} KernelHost
 * @typedef {import('../../application/ports/kernel-host.mjs').Kernel} Kernel
 * @typedef {import('../../application/ports/kernel-host.mjs').KernelEvents} KernelEvents
 * @typedef {import('../../application/ports/kernel-host.mjs').CellOutcome} CellOutcome
 * @typedef {import('node:child_process').ChildProcess} Child
 * @typedef {{ id: number, printed: string[], taken: number, interrupted: boolean, abandoned: boolean, settle: (outcome: CellOutcome) => void, done: Promise<CellOutcome> }} Cell
 * @typedef {{ child: Child, events: KernelEvents, cell: Cell | null, late: string[], stopped: boolean, cells: number, left: CellOutcome | null }} State
 *   left: the end of a cell that ended after its budget, while nobody waited for it; the next `wait` hands it over.
 */

const KERNEL_CHILD = fileURLToPath(new URL('./kernel-child.mjs', import.meta.url))

/** How long a cell may keep running after an interrupt before the kernel is ended. */
const INTERRUPT_GRACE_MS = 3000
/** How long the kernel may take to say it is ready. */
const READY_MS = 10_000
/** POSIX: the kernel leads a process group of its own, which ends with it. */
const GROUPED = process.platform !== 'win32'
const TREE_KILL_MS = 10_000
/**
 * The kernel's Node flags, fixed: never the server's own (a test runner's, an inspector's), and a
 * heap of 2 GiB at most, past which the kernel exits and the call answers repl-crashed.
 */
const KERNEL_FLAGS = Object.freeze(['--max-old-space-size=2048'])

/**
 * The kernel as a child process started with `fork`, its standard streams closed and IPC on a
 * channel of its own: nothing of it can reach this server's stdout, which is the MCP channel.
 * @param {{ entry?: string }} [options] entry: the child's module
 * @returns {KernelHost}
 */
export const createNodeKernelHost = ({ entry = KERNEL_CHILD } = {}) => Object.freeze({
  start: (events, cwd) => start(entry, events, cwd),
})

/** @param {string} entry @param {KernelEvents} events @param {string} cwd @returns {Promise<Kernel>} */
const start = (entry, events, cwd) => new Promise((resolve, reject) => {
  const child = fork(entry, [join(cwd, '.repl', 'lib')], { cwd, execArgv: [...KERNEL_FLAGS], detached: GROUPED, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true })
  if (GROUPED && child.pid !== undefined) groupStarted(child.pid)
  /** @type {State} */
  const state = { child, events, cell: null, late: [], stopped: false, cells: 0, left: null }
  const late = setTimeout(() => notReady(state, reject), READY_MS)
  child.once('error', reject)
  child.once('exit', () => reject(new Error('the kernel exited before it was ready')))
  child.on('message', (/** @type {any} */ message) => route(state, message, { alive: () => clearTimeout(late), ready: (lib) => resolve(kernelOf(state, lib)) }))
  child.on('exit', () => crashed(state))
})

/** A kernel that did not say it is ready in time is ended. @param {State} state @param {(error: Error) => void} reject */
const notReady = (state, reject) => {
  state.stopped = true
  endKernel(state)
  reject(new Error('the kernel was not ready within ten seconds'))
}

/**
 * The kernel says it is alive at once, then ready once it has loaded the project's REPL library,
 * each module of which it bounds itself.
 * @param {State} state @param {any} message @param {{ alive: () => void, ready: (lib: { loaded: string[], failed: string[] }) => void }} starting
 */
const route = (state, message, starting) => {
  const handler = FROM_KERNEL[message?.t]
  if (message?.t === 'alive') starting.alive()
  else if (message?.t === 'ready') starting.ready(libraryOf(message.lib))
  else if (handler !== undefined) handler(state, message)
}

/** @param {any} lib @returns {{ loaded: string[], failed: string[] }} */
const libraryOf = (lib) => ({ loaded: namesOf(lib?.loaded), failed: namesOf(lib?.failed) })

/** @param {unknown} names */
const namesOf = (names) => (Array.isArray(names) ? names.filter((name) => typeof name === 'string') : [])

/** @type {Record<string, (state: State, message: any) => void>} */
const FROM_KERNEL = {
  run: ({ events }, message) => events.onRun(message),
  kill: ({ events }, { rid, signal, grace }) => events.onKill(rid, signal, grace),
  absent: ({ events }, message) => events.onAbsent(message),
  print: (state, { cell, text }) => printed(state, cell, text),
  'cell-done': (state, message) => ended(state, message),
}

/** @param {State} state @param {number | null} cell @param {string} text */
const printed = (state, cell, text) => {
  if (state.cell !== null && state.cell.id === cell) keep(state.cell, 'printed', text)
  else keep(state, 'late', text)
}

/**
 * The kernel bounds what it prints; this server bounds it again, past a little more than that,
 * as a cell can also write to the channel itself.
 */
const PRINTED_LIMIT = 1_048_576 + 4096
const DROPPED = '\n… what was printed past 1 MiB was dropped …\n'

/** What was printed outside a cell, taken: the room for the next starts again. @param {State & { sizes?: Record<string, number> }} state */
const takeLate = (state) => {
  if (state.sizes !== undefined) state.sizes.late = 0
  return state.late.splice(0)
}

/**
 * @param {{ sizes?: Record<string, number> } & Record<string, any>} holder @param {'printed' | 'late'} list @param {string} text
 */
const keep = (holder, list, text) => {
  holder.sizes ??= {}
  const size = holder.sizes[list] ?? 0
  holder.sizes[list] = size + text.length
  if (size + text.length <= PRINTED_LIMIT) holder[list].push(text)
  else if (size <= PRINTED_LIMIT) holder[list].push(DROPPED)
}

/** @param {State} state @param {{ id: number, value: string | null, error: string | null }} message */
const ended = (state, { id, value, error }) => {
  if (state.cell?.id !== id) return
  const cell = state.cell
  const status = error === null ? 'done' : cell.interrupted ? 'interrupted' : 'error'
  cell.settle(outcome(state, cell, status, { value, error }))
}

/**
 * The outcome so far, with what was printed since the last one.
 * @param {State} state @param {Cell} cell @param {CellOutcome['status']} status @param {{ value?: string | null, error?: string | null }} [more]
 * @returns {CellOutcome}
 */
const outcome = (state, cell, status, { value = null, error = null } = {}) => {
  const text = [...takeLate(state), ...cell.printed.slice(cell.taken)].join('')
  cell.taken = cell.printed.length
  return { status, printed: text, value, error }
}

/** @param {State} state @param {{ loaded: string[], failed: string[] }} lib what the kernel loaded of the project's REPL library */
const kernelOf = (state, lib) => Object.freeze({
  lib,
  pid: state.child.pid ?? null,
  evaluate: (/** @type {string} */ code, /** @type {number} */ budgetMs) => evaluate(state, code, budgetMs),
  wait: (/** @type {number} */ budgetMs) => wait(state, budgetMs),
  interrupt: () => interrupt(state),
  chunk: (/** @type {number} */ rid, /** @type {string} */ text) => send(state, { t: 'chunk', rid, text }),
  exited: (/** @type {number} */ rid, /** @type {Record<string, unknown>} */ result) => send(state, { t: 'exit', rid, result }),
  stop: () => stop(state),
})

/** @param {State} state @param {object} message */
const send = (state, message) => {
  if (!state.stopped && state.child.connected) state.child.send(message)
}

/** @param {State} state @param {string} code @param {number} budgetMs @returns {Promise<CellOutcome>} */
const evaluate = (state, code, budgetMs) => {
  if (state.cell !== null) return Promise.resolve({ status: 'busy', printed: '', value: null, error: null })
  const cell = openCell(state)
  send(state, { t: 'cell', id: cell.id, code })
  return within(state, cell, budgetMs)
}

/** The cell now in flight. What an earlier cell left unclaimed is kept as printed text. @param {State} state @returns {Cell} */
const openCell = (state) => {
  if (state.left !== null) state.late.push(state.left.printed)
  state.left = null
  state.cells += 1
  /** @type {Cell} */
  const cell = { id: state.cells, printed: [], taken: 0, interrupted: false, abandoned: false, settle: () => undefined, done: Promise.resolve(/** @type {any} */ (null)) }
  cell.done = new Promise((settle) => { cell.settle = (outcome) => leave(state, cell, outcome, settle) })
  state.cell = cell
  return cell
}

/** @param {State} state @param {Cell} cell @param {CellOutcome} outcome @param {(outcome: CellOutcome) => void} settle */
const leave = (state, cell, outcome, settle) => {
  state.cell = null
  if (cell.abandoned) state.left = outcome
  settle(outcome)
}

/** @param {State} state @param {number} budgetMs @returns {Promise<CellOutcome>} */
const wait = (state, budgetMs) => {
  if (state.cell === null) return Promise.resolve(claimLeft(state))
  return within(state, state.cell, budgetMs)
}

/** The end of a cell nobody waited for, or nothing; what was printed since comes with it. @param {State} state @returns {CellOutcome} */
const claimLeft = (state) => {
  const left = state.left ?? { status: /** @type {const} */ ('done'), printed: '', value: null, error: null }
  state.left = null
  return { ...left, printed: [...takeLate(state), left.printed].join('') }
}

/** The cell's end, or what it printed so far once the budget is spent. @param {State} state @param {Cell} cell @param {number} budgetMs @returns {Promise<CellOutcome>} */
const within = (state, cell, budgetMs) => new Promise((resolve) => {
  cell.abandoned = false
  const timer = setTimeout(() => { cell.abandoned = true; resolve(outcome(state, cell, 'running')) }, budgetMs)
  cell.done.then((result) => {
    clearTimeout(timer)
    resolve(result)
  })
})

/** @param {State} state */
const interrupt = (state) => {
  const cell = state.cell
  if (cell === null) return
  cell.interrupted = true
  send(state, { t: 'interrupt' })
  setTimeout(() => {
    if (state.cell === cell) restart(state, cell)
  }, INTERRUPT_GRACE_MS).unref()
}

/** A cell that will not stop: the kernel ends, and its variables with it. @param {State} state @param {Cell} cell */
const restart = (state, cell) => {
  state.stopped = true
  endKernel(state)
  cell.settle(outcome(state, cell, 'restarted'))
  state.events.onGone('restarted')
}

/**
 * Ends the kernel with every process its cells started: its process group under POSIX (the
 * kernel leads one of its own), its tree under Windows.
 * @param {State} state
 */
const endKernel = (state) => {
  const pid = state.child.pid
  if (pid === undefined) return
  if (GROUPED) return stopGroup(pid, { signal: 'SIGKILL', graceMs: 0 })
  const { file, args } = windowsTreeKill(pid)
  const killer = spawn(file, args, { stdio: 'ignore', windowsHide: true, timeout: TREE_KILL_MS })
  killer.once('error', () => state.child.kill('SIGKILL'))
}

/** @param {State} state */
const crashed = (state) => {
  if (state.stopped) return
  state.stopped = true
  endKernel(state)
  if (state.cell !== null) state.cell.settle(outcome(state, state.cell, 'crashed'))
  state.events.onGone('crashed')
}

/** @param {State} state */
const stop = (state) => {
  if (state.stopped) return
  state.stopped = true
  endKernel(state)
  if (state.cell !== null) state.cell.settle(outcome(state, state.cell, 'stopped'))
}
