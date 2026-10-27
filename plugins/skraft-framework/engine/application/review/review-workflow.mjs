import { checkMandatory } from '../../domain/workflow/mandatory.mjs'
import { locateAgents, readShippedCalls } from '../workflow/load-workflow.mjs'

/**
 * @typedef {import('../../domain/workflow/workflow.mjs').Workflow} Workflow
 * @typedef {import('../../domain/workflow/workflow.mjs').WorkflowNode} WorkflowNode
 * @typedef {import('../workflow/load-workflow.mjs').WorkflowDeps} WorkflowDeps
 * @typedef {{
 *   ok: true, node: WorkflowNode, phase: string, inputs: Workflow['inputs'],
 *   sources: Record<string, import('../ports/agent-catalog.mjs').AgentSource>,
 * }} LoadedReview
 *   node: the fan-in of the called review, with its fan-out, lenses and families; phase: the
 *   phase of the call that runs it in the plugin's pipeline; inputs: what it declares it reads.
 */

/** The workflow a pull request review runs, by its base name. */
export const REVIEW = 'review'

/**
 * The review a pull request gets: `.skraft/review.skraft.dot` when the working copy ejected it,
 * else the plugin's, checked as the plugin's pipeline calls it: what keeps the call from running,
 * the mandatory nodes it drops or breaks whatever the copy says, the agents nobody provides.
 * @param {WorkflowDeps} deps
 * @returns {Promise<LoadedReview | { ok: false, reason: string }>}
 */
export const loadReview = async (deps) => {
  const { builtIn, read } = await readShippedCalls(deps)
  if (!read.ok) return refused(read.errors)
  const { node, phase, inputs } = calledReview(read.workflow)
  const located = await locateAgents(deps.agentCatalog, { nodes: { [node.id]: node } })
  const errors = [...checkMandatory(builtIn, read.workflow), ...located.errors]
  return errors.length > 0 ? refused(errors) : { ok: true, node, phase, inputs, sources: located.sources }
}

/**
 * The review node of the called workflow, the phase of the plugin's call to it, its inputs.
 * @param {Workflow} pipeline the plugin's pipeline, its calls resolved
 */
const calledReview = (pipeline) => {
  const call = /** @type {WorkflowNode} */ (Object.values(pipeline.nodes).find((node) => node.call?.workflow === REVIEW))
  const called = pipeline.called[REVIEW].workflow
  const node = /** @type {WorkflowNode} */ (Object.values(called.nodes).find(({ kind }) => kind === 'review'))
  return { node, phase: /** @type {string} */ (call.phase), inputs: called.inputs }
}

/** @param {string[]} errors */
const refused = (errors) => ({ ok: /** @type {const} */ (false), reason: `the review workflow is invalid: ${errors.join('; ')}` })
