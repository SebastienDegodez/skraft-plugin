import { ownerOfCause } from '../../domain/pipeline/incidents.mjs'

/**
 * @typedef {import('../gates/gate-runs.mjs').GateResult} GateResult
 * @typedef {import('../../domain/pipeline/incidents.mjs').Incident} Incident
 */

/**
 * What a gate step that waits on a human tells them: the first gate that waits, and its evidence
 * log; a component with no gate command is its configuration's to fix, and has no log.
 * @param {GateResult[]} gates @param {'environment' | 'unknown'} failure the class of the gate step
 * @returns {Incident}
 */
export const gateIncident = (gates, failure) => {
  const gate = /** @type {GateResult} */ (gates.find((result) => result.failure === failure))
  return { owner: ownerOfCause(gateCause(gate)), log: gate.gate === 'none' ? null : gate.evidence }
}

/** @param {GateResult} gate @returns {string} */
export const gateCause = (gate) => {
  if (gate.gate === 'none' || CONFIG_FAILURE.test(gate.reason)) return 'config'
  if (PERMISSION_DENIED.test(gate.reason)) return 'environment'
  if (MISSING_PROGRAM.test(gate.reason) && !CONTAINER.test(gate.reason)) return 'config'
  return gate.failure ?? 'unknown'
}

const CONFIG_FAILURE = /shell syntax|quote|mutation report/i
const MISSING_PROGRAM = /command not found|could not start/i
const PERMISSION_DENIED = /\b(?:EACCES|EPERM|permission denied|access is denied|access denied)\b/i
const CONTAINER = /\b(?:docker|podman)\b/i
