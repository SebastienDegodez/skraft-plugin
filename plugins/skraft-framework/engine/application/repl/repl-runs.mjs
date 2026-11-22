import { RUN_REFUSALS, refusalOfKill } from '../../domain/repl/refusals.mjs'
import { gitFacts, traceEnd, traceStart } from './repl-trace.mjs'
import { keepUnexpected } from './repl-unexpected.mjs'

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
 *   retired?: boolean, cellSince?: number | null, topRid?: number, recording?: Promise<void>, tracked?: Map<number, Promise<{ pid: number, created: string | null }>>,
 * }} Entry
 *   retired: the kernel is being ended, and no run starts any more; cellSince: when the cell in flight started, null when none runs; recording: the last write of the orphan journal; tracked: each process recorded, with its start time, by pid.
 */

/** The longest a program may run, and the output kept of it. */
export const MAX_TIMEOUT_S = 7200
const MAX_OUTPUT_BYTES = 67_108_864
/** The options run() takes. */
const RUN_OPTIONS = Object.freeze(['cwd', 'timeout', 'gate', 'label'])

/** @param {unknown} value */
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** @param {RunRequest} request @returns {string | null} what is wrong with the request, null when nothing */
export const refusalOfRun = (request) => {
  if (!(request.options ?? []).every((name) => RUN_OPTIONS.includes(name))) return RUN_REFUSALS.unknown
  return refusalOfValues(request)
}

/** @param {RunRequest} request @returns {string | null} */
const refusalOfValues = ({ command, cwd, timeout, gate, label }) => {
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
  if (!expected(entry, request.rid)) return unexpectedRid(deps, entry)
  try {
    await carry(deps, entry, request)
  } catch {
    entry.kernel.exited(request.rid, { exitCode: null, signal: null, timedOut: false, killed: false, durationMs: 0, log: null, error: 'skraft could not run it' })
  }
}

/** How many runs of an attempt may live at once. */
const MAX_LIVE_RUNS = 8

/** @param {Entry} entry @returns {string | null} why one more run does not start */
const tooMany = (entry) => (liveRuns(entry).length >= MAX_LIVE_RUNS ? RUN_REFUSALS.many : null)

/** How far ahead of the highest id seen a request id may be. */
const RID_WINDOW = 1000

/**
 * Whether the id is one the kernel would give next: a positive integer never seen, not far
 * ahead of the highest one seen. The kernel counts from 1; any other id is no request of it.
 * @param {Entry} entry @param {unknown} rid
 */
const expected = (entry, rid) => {
  if (!Number.isInteger(rid) || /** @type {number} */ (rid) < 1 || entry.runs.has(/** @type {number} */ (rid))) return false
  if (/** @type {number} */ (rid) >= (entry.topRid ?? 0) + RID_WINDOW) return false
  entry.topRid = Math.max(entry.topRid ?? 0, /** @type {number} */ (rid))
  return true
}

/** A request the kernel did not send is ignored; the run's unexpected.log keeps the fact. @param {any} deps @param {Entry} entry */
const unexpectedRid = async (deps, entry) => {
  await keepUnexpected(deps, entry.slug, new Error('a run request carried an id the server did not expect; it was ignored')).catch(() => undefined)
}

/** @param {any} deps @param {Entry} entry @param {RunRequest} request */
const carry = async (deps, entry, request) => {
  const refusal = refusalOfRun(request) ?? tooMany(entry)
  const run = openRun(deps, entry, request)
  if (refusal !== null) return end(deps, entry, run, { ...NOT_STARTED, error: refusal })
  run.before = await gitFacts(deps, request.cwd)
  if (entry.retired === true) return end(deps, entry, run, { ...NOT_STARTED, error: ENDED })
  return launch(deps, entry, run, request)
}

/** Why a run asked for while its kernel ends does not start. */
const ENDED = "the attempt's REPL was ended"

/** @param {any} deps @param {Entry} entry @param {Run} run @param {RunRequest} request */
const launch = async (deps, entry, run, request) => {
  if (entry.retired === true) return end(deps, entry, run, { ...NOT_STARTED, error: ENDED })
  const launched = await deps.repl.launcher.start({ command: request.command, cwd: request.cwd, timeoutMs: request.timeout * 1000, maxOutputBytes: MAX_OUTPUT_BYTES, onData: (text) => entry.kernel.chunk(request.rid, text) })
  if (!launched.ok) return end(deps, entry, run, { ...NOT_STARTED, error: launched.reason })
  if (entry.retired === true) launched.program.kill('SIGKILL', 0)
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

/**
 * The processes this server started are recorded for a server that finds them left behind: one
 * write after the other, each with the processes alive when it is written. The start time of each
 * process is asked of the system once, while the server goes on.
 * @param {any} deps @param {Entry} entry @returns {Promise<void>}
 */
export const recordProcesses = (deps, entry) => {
  const written = (entry.recording ?? Promise.resolve()).then(() => writeProcesses(deps, entry))
  entry.recording = written.catch(() => undefined)
  return written
}

/** @param {any} deps @param {Entry} entry */
const writeProcesses = async (deps, entry) => {
  const pids = liveRuns(entry).map((run) => run.program?.pid).filter((pid) => pid != null)
  const runs = await Promise.all(pids.map((pid) => trackedOf(deps, entry, /** @type {number} */ (pid))))
  const kernel = entry.kernel.pid == null ? null : await trackedOf(deps, entry, entry.kernel.pid)
  await deps.repl.orphans.keep({ server: deps.repl.server, kernel, runs })
}

/** A process with its start time, read once per pid. @param {any} deps @param {Entry} entry @param {number} pid */
const trackedOf = (deps, entry, pid) => {
  entry.tracked ??= new Map()
  if (!entry.tracked.has(pid)) entry.tracked.set(pid, Promise.resolve(deps.repl.orphans.track(pid)))
  return /** @type {Promise<{ pid: number, created: string | null }>} */ (entry.tracked.get(pid))
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

/**
 * A kill a cell asked for, bounded: any other signal or grace is refused and the program goes on.
 * @param {Entry} entry @param {{ rid: number, signal: unknown, graceSeconds: unknown }} kill
 */
export const killRun = (entry, { rid, signal, graceSeconds }) => {
  if (refusalOfKill(signal, graceSeconds) !== null) return
  entry.runs.get(rid)?.program?.kill(/** @type {string} */ (signal), /** @type {number} */ (graceSeconds) * 1000)
}

/** Ends every program of the entry, with what each started. @param {Entry} entry @param {string} signal @param {number} graceMs */
export const endRuns = (entry, signal, graceMs) => {
  for (const run of liveRuns(entry)) run.program?.kill(signal, graceMs)
}
