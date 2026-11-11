/**
 * @typedef {import('../gates/gate-runs.mjs').GateResult} GateResult
 * @typedef {import('../../domain/pipeline/incidents.mjs').Incident} Incident
 */

/**
 * What a gate step that waits on a human tells them: the first gate that waits, and its evidence
 * log; a component with no gate command is its configuration's to fix, and has no log.
 * @param {GateResult[]} gates @param {'environment'} failure the class of the gate step
 * @returns {Incident}
 */
export const gateIncident = (gates, failure) => {
  const gate = /** @type {GateResult} */ (gates.find((result) => result.failure === failure))
  return gate.gate === 'none' ? { owner: 'config', log: null } : { owner: failure, log: gate.evidence }
}
