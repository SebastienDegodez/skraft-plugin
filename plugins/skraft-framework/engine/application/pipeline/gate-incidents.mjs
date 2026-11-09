/**
 * @typedef {import('../gates/gate-runs.mjs').GateResult} GateResult
 * @typedef {import('../../domain/pipeline/incidents.mjs').Incident} Incident
 */

/**
 * What a gate step the machine cannot run tells a human: the first gate that failed for the
 * machine, or else for a signal or a crash, and its evidence log; a component with no gate
 * command is its configuration's to fix, and has no log.
 * @param {GateResult[]} gates @param {'environment' | 'unknown'} failure the class of the gate step
 * @returns {Incident}
 */
export const gateIncident = (gates, failure) => {
  const gate = /** @type {GateResult} */ (gates.find((result) => result.failure === failure))
  return gate.gate === 'none' ? { owner: 'config', log: null } : { owner: failure, log: gate.evidence }
}
