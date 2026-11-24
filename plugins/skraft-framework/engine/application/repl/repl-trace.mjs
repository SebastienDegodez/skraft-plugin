import { absentRecord, lostRecord, openRuns, runRecord, startRecord } from '../../domain/evidence/run-trace.mjs'
import { appendRecord, tracePath } from '../evidence/run-trace-store.mjs'
import { closeLog } from './run-log.mjs'

/**
 * What the server writes of a run, from what the program did: Git's HEAD before and after it,
 * whether the tree was clean when it started, how it ended, and the hash of its log.
 *
 * @typedef {import('./repl-runs.mjs').Entry} Entry
 * @typedef {import('./repl-runs.mjs').Run} Run
 * @typedef {{ top: string | null, head: string | null, clean: boolean }} GitFacts
 *   top: the repository holding the folder, relative to the working copy; null outside Git.
 */

/** The tracking folder holds the run's own files: it never makes the tree unclean. */
const TRACKING = '.copilot-tracking/'

/**
 * @param {any} deps @param {string} cwd @returns {Promise<GitFacts>} never throws
 */
export const gitFacts = async (deps, cwd) => {
  try {
    const top = await deps.sourceControl.repository(cwd)
    if (top === null) return { top: null, head: null, clean: true }
    const head = await deps.sourceControl.head(top)
    const changed = head === null ? [] : await deps.sourceControl.changedFiles(top, head)
    return { top, head, clean: changed !== null && changed.every((file) => file.startsWith(TRACKING)) }
  } catch {
    return { top: null, head: null, clean: false }
  }
}

/** @param {any} deps @param {string | null} top @returns {Promise<string | null>} */
const headNow = async (deps, top) => {
  try {
    return top === null ? null : await deps.sourceControl.head(top)
  } catch {
    return null
  }
}

/** @param {number} at */
const iso = (at) => new Date(at).toISOString()

/** The run has started: its line says so, so that a run left open is seen. @param {any} deps @param {Entry} entry @param {Run} run */
export const traceStart = (deps, entry, run) => appendRecord(deps, entry, startRecord({ run: run.id, cell: run.cell, at: iso(run.startedAt), command: run.command, cwd: run.cwd, gate: run.gate, label: run.label }))

/**
 * The run is over: every write of its log is done, then its line is.
 * @param {any} deps @param {Entry} entry @param {Run & { before: GitFacts }} run @param {import('../ports/program-launcher.mjs').ProgramResult} result
 * @returns {Promise<string | null>} the HEAD the line holds as `headAfter`
 */
export const traceEnd = async (deps, entry, run, result) => {
  const { sha256, cut } = await closeLog(deps, entry, run)
  const after = { headAfter: await headNow(deps, run.before.top), sha256, cut }
  await appendRecord(deps, entry, endedRecord(run, result, after))
  return after.headAfter
}

/** @param {Run & { before: GitFacts }} run @param {import('../ports/program-launcher.mjs').ProgramResult} result @param {{ headAfter: string | null, sha256: string, cut: boolean }} after */
const endedRecord = (run, result, { headAfter, sha256, cut }) => runRecord({
  run: run.id, cell: run.cell, at: iso(run.startedAt), command: run.command, argv: run.argv, shell: run.shell, cwd: run.cwd, gate: run.gate, label: run.label,
  durationMs: run.durationMs, exitCode: result.exitCode, signal: result.signal, timedOut: result.timedOut, killed: result.killed, started: result.started,
  bytes: result.bytes, cut, sha256, log: run.log, headBefore: run.before.head, headAfter, clean: run.before.clean,
})

/**
 * The runs a server that is gone left open in the attempt's trace are closed as lost, each by a
 * line of this server. The trace is read as it stands, signed or not: closing a run proves nothing.
 * Runs this server still ends are its own, never lost.
 * @param {any} deps @param {Entry} entry @param {Set<number>} [still] @returns {Promise<number[]>} the runs closed
 */
export const closeLostRuns = async (deps, entry, still = new Set()) => {
  const lost = openRuns(await recordsAsWritten(deps, entry)).filter((run) => !still.has(run))
  const at = iso(deps.clock.now().getTime())
  for (const run of lost) await appendRecord(deps, entry, lostRecord({ run, at }))
  return lost
}

/**
 * The id the next kernel of the attempt gives its first run: one more than any id the trace holds,
 * so that no id, and no log, is ever reused within the attempt.
 * @param {any} deps @param {{ slug: string, folder: string }} where @returns {Promise<number>}
 */
export const nextRunId = async (deps, where) => {
  const ids = (await recordsAsWritten(deps, where)).map((record) => record.run).filter((run) => Number.isInteger(run) && run > 0)
  return Math.max(0, ...ids) + 1
}

/**
 * How many cells earlier kernels of the attempt ran: the highest number of a `cell-<n>` file in
 * its folder, so that a cell's code and its cut output are never written over.
 * @param {any} deps @param {{ slug: string, folder: string }} where @returns {Promise<number>}
 */
export const cellsBefore = async (deps, { slug, folder }) => {
  const numbers = (await deps.files.list(slug, folder)).map((path) => /\/cell-(\d+)\.(?:mjs|log)$/.exec(path)?.[1]).filter((n) => n !== undefined)
  return Math.max(0, ...numbers.map(Number))
}

/** The trace's records as they stand, signed or not. @param {any} deps @param {{ slug: string, folder: string }} where @returns {Promise<any[]>} */
const recordsAsWritten = async (deps, { slug, folder }) => {
  const text = (await deps.files.read(slug, tracePath(folder))) ?? ''
  return text.split('\n').map(recordOf).filter((record) => record !== null)
}

/** @param {string} line @returns {any} null when the line is no record */
const recordOf = (line) => {
  try {
    const record = JSON.parse(line)
    return typeof record === 'object' && record !== null ? record : null
  } catch {
    return null
  }
}

/** A gate the cell declares the project has none of. @param {any} deps @param {Entry} entry @param {{ gate: unknown, component: unknown, reason: unknown, cell: number | null }} notice */
export const traceAbsent = async (deps, entry, notice) => {
  const record = absentRecord({ ...notice, at: iso(deps.clock.now().getTime()) })
  if (record !== null) await appendRecord(deps, entry, record)
}
