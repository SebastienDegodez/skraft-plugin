/**
 * The pre-checks of a run: every call an agent made inside its attempt, as the step that recorded
 * it kept them (#581), in journal order. A step that ran none has no row.
 *
 * @typedef {import('../journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {{ step: string, at: string, status: string, failures: number, found?: Array<{ code: string, line: string }> }} PrecheckRow
 *   found: each anomaly the call answered, with the check that found it.
 */
import { cell } from './markdown-safety.mjs'

/** @param {RunEvent[]} events the run's journal @returns {PrecheckRow[]} */
export const precheckRows = (events) => events
  .filter((event) => event.type === 'step.recorded')
  .flatMap((event) => (event.prechecks ?? []).map((/** @type {any} */ call) => ({ step: event.step, ...call })))

/**
 * Each call with the step that ran it, when it answered, how many anomalies it answered and each
 * one under the check that found it; `-` for a call that answered none.
 * @param {PrecheckRow[]} rows
 */
export const prechecksTable = (rows) => [
  '| Step | Answered at | Status | Anomalies | Cause |',
  '| --- | --- | --- | ---: | --- |',
  ...rows.map((row) => `| ${row.step} | ${row.at} | ${row.status} | ${row.failures} | ${causeOf(row)} |`),
]

/** Every anomaly of a call on one line, each under its check, `-` when it answered none. @param {PrecheckRow} row */
const causeOf = ({ found }) => ((found ?? []).length === 0 ? '-' : cell((found ?? []).map(({ code, line }) => `${code}: ${line}`).join('; ')))
