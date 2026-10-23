import { assignFamily, assignRefuter, resolveAssignment } from '../../domain/config/model-assignment.mjs'
import { lensAgent, readLensSpec, REFUTER } from '../../domain/review/lenses.mjs'

export { dispatchOf as modelOf } from '../../domain/config/model-assignment.mjs'

/**
 * @typedef {import('../../domain/config/skraft-config.mjs').Settings} Settings
 * @typedef {import('../../domain/config/model-assignment.mjs').AgentType} AgentType
 * @typedef {import('../../domain/config/model-assignment.mjs').ResolvedAssignment} ResolvedAssignment
 * @typedef {import('../../domain/workflow/workflow.mjs').WorkflowNode} WorkflowNode
 * @typedef {{ agent: string, type: AgentType, named: string | null }} Wanted
 *   named: the family the workflow names for it (`model=`, `@<family>`, `refuter=`).
 * @typedef {{ standard: ResolvedAssignment, frontier: ResolvedAssignment }} RefuterAssignments
 *   the refuter's, by the tier it escalates to; the same twice when a rule names its family.
 * @typedef {{ lenses: Record<string, ResolvedAssignment>, refuter: RefuterAssignments }} ReviewAssignments
 *   lenses: by lens agent.
 */

/**
 * What an agent runs on. What the workflow names counts only in a workflow the repository
 * ejected; the plugin's own leaves the choice to the configuration.
 * @param {Settings} settings @param {Wanted} wanted @returns {ResolvedAssignment}
 */
export const assignmentOf = (settings, { agent, type, named }) => {
  const ref = { agent, type, workflowFamily: ejected(settings, named) }
  return resolveAssignment(ref, assignFamily(ref, settings), settings)
}

/**
 * What each lens of a review node runs on, and the refuter for each tier it may escalate to.
 * @param {Settings} settings @param {WorkflowNode} node @returns {ReviewAssignments}
 */
export const reviewAssignmentsOf = (settings, node) => ({
  lenses: Object.fromEntries(node.lenses.map((spec) => lensAssignmentOf(settings, node, spec))),
  refuter: refuterAssignmentsOf(settings, node),
})

/** @param {Settings} settings @param {WorkflowNode} node @param {string} spec a valid lens spec @returns {[string, ResolvedAssignment]} */
const lensAssignmentOf = (settings, node, spec) => {
  const { name, model } = /** @type {import('../../domain/review/lenses.mjs').LensSpec} */ (readLensSpec(spec))
  const agent = lensAgent(name)
  return [agent, assignmentOf(settings, { agent, type: 'lens', named: model ?? node.model })]
}

/**
 * The refuter's: a rule's or the node's `refuter=` family, else the tier above the strongest of
 * the lenses it checks, standard when they are economy, frontier otherwise.
 * @param {Settings} settings @param {WorkflowNode} node @returns {RefuterAssignments}
 */
const refuterAssignmentsOf = (settings, node) => {
  const ref = { agent: REFUTER, type: /** @type {const} */ ('refuter'), workflowFamily: ejected(settings, node.refuter) }
  const above = (/** @type {'standard' | 'frontier'} */ tier) => resolveAssignment(ref, assignRefuter(ref, tier, settings), settings)
  return { standard: above('standard'), frontier: above('frontier') }
}

/** @param {Settings} settings @param {string | null} named */
const ejected = ({ workflow }, named) => (workflow === null ? null : named)
