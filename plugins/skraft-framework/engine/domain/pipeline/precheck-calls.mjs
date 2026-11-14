/**
 * What each pre-check leaves of its own execution: one line per call, in the step's trail beside
 * the logs of its attempt. The run's journal keeps a single writer — the process that holds the
 * run — and a pre-check runs inside an agent's attempt, so it cannot append to it (#581); the
 * engine reads the trail when it records the attempt and journals the calls of that attempt.
 *
 * @typedef {{ at: string, step: string, visit: number, attempt: number, status: 'passed' | 'failed', failures: number, found: Anomaly[] }} PrecheckCall
 *   at: when the call answered; failures: how many anomalies it answered; found: each of them with
 *   the check that found it, as the agent was told it, so the journal keeps the cause of a
 *   correction and not only its count.
 * @typedef {{ code: string, line: string }} Anomaly
 * @typedef {{ at: string, status: string, failures: number, found: Anomaly[] }} JournaledCall
 */

/** Where a step's trail of pre-checks lives, relative to the tracking folder. @param {string} step */
export const callsPath = (step) => `logs/precheck-${step}.jsonl`

/** The trail with one call appended. @param {string | null} trail @param {PrecheckCall} call */
export const withCall = (trail, call) => `${trail ?? ''}${JSON.stringify(call)}\n`

/**
 * The calls of one attempt, in the order they ran, each without what the step already names; a
 * line no JSON reads is no call.
 * @param {string | null} trail @param {{ visit: number, attempt: number }} of
 * @returns {JournaledCall[]}
 */
export const callsOf = (trail, { visit, attempt }) => parsedCalls(trail)
  .filter((call) => call.visit === visit && call.attempt === attempt)
  .map(({ at, status, failures, found }) => ({ at, status, failures, found }))

/** Every call a trail holds. @param {string | null} trail @returns {PrecheckCall[]} */
const parsedCalls = (trail) => (trail ?? '').split('\n')
  .filter((line) => line !== '')
  .map(asCall)
  .filter((call) => call !== null)

/** One line of the trail, null when it is no call. @param {string} line @returns {PrecheckCall | null} */
const asCall = (line) => {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}
