import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/**
 * @typedef {import('../../application/ports/kernel-host.mjs').KernelHost} KernelHost
 * @typedef {import('../../application/ports/kernel-host.mjs').Kernel} Kernel
 * @typedef {import('../../application/ports/kernel-host.mjs').KernelEvents} KernelEvents
 * @typedef {import('../../application/ports/kernel-host.mjs').CellOutcome} CellOutcome
 * @typedef {import('node:child_process').ChildProcess} Child
 * @typedef {{ id: number, printed: string[], taken: number, interrupted: boolean, settle: (outcome: CellOutcome) => void, done: Promise<CellOutcome> }} Cell
 * @typedef {{ child: Child, events: KernelEvents, cell: Cell | null, late: string[], stopped: boolean, cells: number }} State
 */

const KERNEL_CHILD = fileURLToPath(new URL('./kernel-child.mjs', import.meta.url))

/** How long a cell may keep running after an interrupt before the kernel is ended. */
const INTERRUPT_GRACE_MS = 3000

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
  const child = fork(entry, [], { cwd, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true })
  /** @type {State} */
  const state = { child, events, cell: null, late: [], stopped: false, cells: 0 }
  child.once('error', reject)
  child.once('exit', () => reject(new Error('the kernel exited before it was ready')))
  child.on('message', (/** @type {any} */ message) => route(state, message, () => resolve(kernelOf(state))))
  child.on('exit', () => crashed(state))
})

/** @param {State} state @param {any} message @param {() => void} ready */
const route = (state, message, ready) => {
  const handler = FROM_KERNEL[message?.t]
  if (message?.t === 'ready') ready()
  else if (handler !== undefined) handler(state, message)
}

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
  if (state.cell !== null && state.cell.id === cell) state.cell.printed.push(text)
  else state.late.push(text)
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
  const text = [...state.late.splice(0), ...cell.printed.slice(cell.taken)].join('')
  cell.taken = cell.printed.length
  return { status, printed: text, value, error }
}

/** @param {State} state */
const kernelOf = (state) => Object.freeze({
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
  state.cells += 1
  /** @type {Cell} */
  const cell = { id: state.cells, printed: [], taken: 0, interrupted: false, settle: () => undefined, done: Promise.resolve(/** @type {any} */ (null)) }
  cell.done = new Promise((settle) => { cell.settle = (outcome) => { state.cell = null; settle(outcome) } })
  state.cell = cell
  send(state, { t: 'cell', id: cell.id, code })
  return within(state, cell, budgetMs)
}

/** @param {State} state @param {number} budgetMs @returns {Promise<CellOutcome>} */
const wait = (state, budgetMs) => {
  if (state.cell === null) return Promise.resolve({ status: 'done', printed: state.late.splice(0).join(''), value: null, error: null })
  return within(state, state.cell, budgetMs)
}

/** The cell's end, or what it printed so far once the budget is spent. @param {State} state @param {Cell} cell @param {number} budgetMs @returns {Promise<CellOutcome>} */
const within = (state, cell, budgetMs) => new Promise((resolve) => {
  const timer = setTimeout(() => resolve(outcome(state, cell, 'running')), budgetMs)
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
  state.child.kill('SIGKILL')
  cell.settle(outcome(state, cell, 'restarted'))
  state.events.onGone('restarted')
}

/** @param {State} state */
const crashed = (state) => {
  if (state.stopped) return
  state.stopped = true
  if (state.cell !== null) state.cell.settle(outcome(state, state.cell, 'crashed'))
  state.events.onGone('crashed')
}

/** @param {State} state */
const stop = (state) => {
  if (state.stopped) return
  state.stopped = true
  state.child.kill('SIGKILL')
  if (state.cell !== null) state.cell.settle(outcome(state, state.cell, 'stopped'))
}
