/**
 * Add only signatures reviewed by the author against an incident report. No reviewed report
 * has supplied an entry yet. Notes require a host judgment rather than an invented table note.
 * @type {Readonly<Record<string, 'RETRY' | 'STOP' | `SEND_TO:${string}`>>}
 */
const KNOWN_RECOVERIES = Object.freeze({})

/** @param {import('../pipeline/incidents.mjs').FailureIncident[]} incidents @param {string[]} options */
export const knownRecovery = (incidents, options) => {
  const action = incidents.map(({ signature }) => KNOWN_RECOVERIES[signature]).find((answer) => answer !== undefined)
  return action !== undefined && options.includes(action) ? action : null
}
