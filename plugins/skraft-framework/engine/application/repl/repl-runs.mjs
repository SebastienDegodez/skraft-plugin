import { RUN_REFUSALS } from '../../domain/repl/refusals.mjs'
import { gitFacts, traceEnd, traceStart } from './repl-trace.mjs'

/**
 * The programs a cell asked to start. The kernel only asks: this server validates the request,
 * starts the program through the launcher, streams its output back to the cell and says how it
 * ended. Nothing here throws: every failure is a run that did not start.
 *
 * @typedef {import('../ports/kernel-host.mjs').RunRequest} RunRequest
 * @typedef {import('../ports/program-launcher.mjs').Program} Program
 * @typedef {import('../../domain/repl/cell-result.mjs').RunLine & {
 *   cell: number | null, reported: boolean, program: Program | null, startedAt: number, argv: string[], shell: string | null, cwd: string,
 *   before: import('./repl-trace.mjs').GitFacts,
 * }} Run
 * @typedef {{
 *   key: string, slug: string, folder: string, kernel: import('../ports/kernel-host.mjs').Kernel, lease: string,
 *   runs: Map<number, Run>, cells: number, lastUsed: number, gone: string | null, pending: Set<Promise<void>>, signingKey: string | null, chain: Promise<void>,
 * }} Entry
 */

/** The longest a program may run, and the output kept of it. */
export const MAX_TIMEOUT_S = 7200
const MAX_OUTPUT_BYTES = 67_108_864

/** @param {unknown} value */
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** @param {RunRequest} request @returns {string | null} what is wrong with the request, null when nothing */
export const refusalOfRun = ({ command, cwd, timeout, gate, label }) => {
  const words = Array.isArray(command) ? command : [command]
  if (words.length === 0 || !words.every(isText)) return RUN_REFUSALS.command
  if (!isText(cwd)) return RUN_REFUSALS.cwd
  if (!inRange(timeout)) return RUN_REFUSALS.timeout
  return [gate, label].every((one) => one === null || isText(one)) ? null : RUN_REFUSALS.option
}

/** @param {unknown} timeout seconds */
const inRange = (timeout) => typeof timeout === 'number' && timeout >= 1 && timeout <= MAX_TIMEOUT_S

/** @param {string | string[]} command */
const shownCommand = (command) => (Array.isArray(command) ? command.join(' ') : command)

/**
 * A request of the kernel: starts the program and carries it to its end, never throwing.
 * @param {any} deps @param {Entry} entry @param {RunRequest} request
 */
export const serveRun = async (deps, entry, request) => {
  try {
    await carry(deps, entry, request)
  } catch {
    entry.kernel.exited(request.rid, { exitCode: null, signal: null, timedOut: false, killed: false, durationMs: 0, log: null, error: 'skraft could not run it' })
  }
}

/** @param {any} deps @param {Entry} entry @param {RunRequest} request */
const carry = async (deps, entry, request) => {
  const refusal = refusalOfRun(request)
  const run = openRun(deps, entry, request)
  if (refusal !== null) return end(deps, entry, run, { ...NOT_STARTED, error: refusal })
  run.before = await gitFacts(deps, request.cwd)
  return launch(deps, entry, run, request)
}

/** @param {any} deps @param {Entry} entry @param {Run} run @param {RunRequest} request */
const launch = async (deps, entry, run, request) => {
  const launched = await deps.repl.launcher.start({ command: request.command, cwd: request.cwd, timeoutMs: request.timeout * 1000, maxOutputBytes: MAX_OUTPUT_BYTES, onData: (text) => entry.kernel.chunk(request.rid, text) })
  if (!launched.ok) return end(deps, entry, run, { ...NOT_STARTED, error: launched.reason })
  Object.assign(run, { program: launched.program, argv: launched.argv, shell: launched.shell })
  await recordProcesses(deps, entry)
  await traceStart(deps, entry, run)
  return end(deps, entry, run, await launched.program.done)
}

/** @type {import('../ports/program-launcher.mjs').ProgramResult} */
const NOT_STARTED = { started: false, exitCode: null, signal: null, timedOut: false, killed: false, text: '', cut: false, bytes: 0, error: null }

/** @param {any} deps @param {Entry} entry @param {RunRequest} request @returns {Run} */
const openRun = (deps, entry, request) => {
  const run = { id: request.rid, command: shownCommand(request.command), status: /** @type {const} */ ('running'), exitCode: null, outcome: null, durationMs: 0, log: `${entry.folder}/${request.rid}.log`, gate: request.gate ?? null, label: request.label ?? null, cell: request.cell, reported: false, program: null, startedAt: deps.clock.now().getTime(), argv: [], shell: null, cwd: String(request.cwd), before: { top: null, head: null, clean: false } }
  entry.runs.set(run.id, run)
  return run
}

/** The processes this server started are recorded for a server that finds them left behind. @param {any} deps @param {Entry} entry */
export const recordProcesses = async (deps, entry) => {
  const { orphans, server } = deps.repl
  const runs = liveRuns(entry).filter((run) => run.program?.pid != null).map((run) => orphans.track(/** @type {number} */ (run.program?.pid)))
  await orphans.keep({ server, kernel: entry.kernel.pid == null ? null : orphans.track(entry.kernel.pid), runs })
}

/** How a run ended when it did not simply exit. @param {import('../ports/program-launcher.mjs').ProgramResult} result @returns {string | null} */
const outcomeOf = ({ started, timedOut, killed, signal }) => {
  if (!started) return 'not started'
  if (timedOut) return 'timed out'
  if (killed) return 'killed'
  return signal === null ? null : `signal ${signal}`
}

/**
 * The run is over: the cell hears how it ended.
 * @param {any} deps @param {Entry} entry @param {Run} run @param {import('../ports/program-launcher.mjs').ProgramResult} result
 */
const end = async (deps, entry, run, result) => {
  Object.assign(run, { status: 'finished', exitCode: result.exitCode, outcome: outcomeOf(result), durationMs: deps.clock.now().getTime() - run.startedAt })
  const head = await traceEnd(deps, entry, /** @type {any} */ (run), result)
  await recordProcesses(deps, entry)
  entry.kernel.exited(run.id, { exitCode: run.exitCode, signal: result.signal, timedOut: result.timedOut, killed: result.killed, durationMs: run.durationMs, head, log: run.log, error: result.started ? null : result.error })
}

/** The programs of the entry that still run. @param {Entry} entry @returns {Run[]} */
export const liveRuns = (entry) => [...entry.runs.values()].filter((run) => run.status === 'running')

/** Ends every program of the entry, with what each started. @param {Entry} entry @param {string} signal @param {number} graceMs */
export const endRuns = (entry, signal, graceMs) => {
  for (const run of liveRuns(entry)) run.program?.kill(signal, graceMs)
}
