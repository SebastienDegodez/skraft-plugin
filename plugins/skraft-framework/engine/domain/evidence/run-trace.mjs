/**
 * The trace of an attempt's REPL runs, `logs/runs/<step>-<visit>-<attempt>/runs.jsonl`: one signed
 * line when a run starts, one when it ends, one for each gate an agent declares absent. The
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
 * @typedef {StartRecord | RunRecord | AbsentRecord} TraceRecord
 */

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
 * The runs started and not ended, by run id.
 * @param {TraceRecord[]} records @returns {number[]}
 */
export const openRuns = (records) => {
  const ended = new Set(records.filter((record) => record.type === 'run').map((record) => /** @type {RunRecord} */ (record).run))
  return records.filter((record) => record.type === 'start' && !ended.has(record.run)).map((record) => /** @type {StartRecord} */ (record).run)
}
