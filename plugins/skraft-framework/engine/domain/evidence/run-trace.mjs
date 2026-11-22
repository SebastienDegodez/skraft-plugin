/**
 * The trace of an attempt's REPL runs, `logs/runs/<step>-<visit>-<attempt>/runs.jsonl`: one signed
 * line when a run starts, one when it ends, one for each gate an agent declares absent, one for a
 * run a gone server left open. The
 * engine writes it from what the program did, never from what an agent says of it; the agent's
 * cells can reach the file as they reach any file of the working copy, so each line is signed with
 * the run's journal key: tamper-evident, not tamper-proof.
 *
 * @typedef {{ type: 'start', run: number, cell: number | null, at: string, command: string, cwd: string, gate: string | null, label: string | null }} StartRecord
 * @typedef {{
 *   type: 'run', run: number, cell: number | null, at: string, command: string, argv: string[], shell: string | null, cwd: string,
 *   gate: string | null, label: string | null, durationMs: number, exitCode: number | null, signal: string | null, timedOut: boolean, killed: boolean,
 *   started: boolean, bytes: number, cut: boolean, sha256: string, log: string, headBefore: string | null, headAfter: string | null, clean: boolean,
 * }} RunRecord
 *   at: when it started; headBefore, headAfter: the repository's HEAD that holds `cwd`, before and after the program; clean: no
 *   uncommitted file but the tracking folder's when it started; sha256: of the log file's text; cut: the output passed the limit.
 * @typedef {{ type: 'absent', cell: number | null, at: string, gate: string, component: string, reason: string }} AbsentRecord
 * @typedef {{ type: 'lost', run: number, at: string }} LostRecord
 *   at: when the server that took the attempt over closed it.
 * @typedef {StartRecord | RunRecord | AbsentRecord | LostRecord} TraceRecord
 */

/** Where the runs of an attempt are traced, relative to the run's tracking folder. @param {string} step @param {number} visit @param {number} attempt */
export const runsFolder = (step, visit, attempt) => `logs/runs/${step}-${visit}-${attempt}`

/** The gates a component's commands may be recorded under. */
export const GATES = Object.freeze(['build', 'format', 'lint', 'test', 'architecture', 'coverage', 'e2e'])

const TEXT_LIMIT = 500

/** @param {string} text */
const bounded = (text) => text.slice(0, TEXT_LIMIT)

/**
 * @param {Omit<StartRecord, 'type'>} start @returns {StartRecord}
 */
export const startRecord = ({ run, cell, at, command, cwd, gate, label }) => ({ type: 'start', run, cell, at, command: bounded(command), cwd, gate, label })

/**
 * @param {Omit<RunRecord, 'type'>} run @returns {RunRecord}
 */
export const runRecord = (run) => ({ type: 'run', ...run, command: bounded(run.command) })

/**
 * A gate the agent declares the project does not have; null when it names none, a component or a reason.
 * @param {{ cell: number | null, at: string, gate: unknown, component: unknown, reason: unknown }} notice @returns {AbsentRecord | null}
 */
export const absentRecord = ({ cell, at, gate, component, reason }) => {
  const texts = [gate, component, reason]
  if (!texts.every((text) => typeof text === 'string' && text.trim() !== '')) return null
  return { type: 'absent', cell, at, gate: bounded(/** @type {string} */ (gate)), component: bounded(/** @type {string} */ (component)), reason: bounded(/** @type {string} */ (reason)) }
}

/**
 * A run a server that is gone left open, closed by the server that took the attempt over.
 * @param {{ run: number, at: string }} lost @returns {LostRecord}
 */
export const lostRecord = ({ run, at }) => ({ type: 'lost', run, at })

/**
 * The runs started and not ended, by run id, read in order: a run closed as lost is ended, and an
 * id started again after its end is open again.
 * @param {TraceRecord[]} records @returns {number[]}
 */
export const openRuns = (records) => {
  /** @type {Set<number>} */
  const open = new Set()
  for (const record of records) {
    if (record.type === 'start') open.add(record.run)
    else if (record.type === 'run' || record.type === 'lost') open.delete(record.run)
  }
  return [...open]
}
