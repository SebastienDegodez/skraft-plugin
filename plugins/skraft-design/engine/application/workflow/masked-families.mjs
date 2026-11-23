import { ownOf, PLUGIN_DEFAULTS } from '../../domain/config/model-assignment.mjs'
import { lensAgent, readLensSpec, REFUTER } from '../../domain/review/lenses.mjs'

/**
 * @typedef {import('../../domain/config/skraft-config.mjs').Settings} Settings
 * @typedef {import('../../domain/workflow/workflow.mjs').Workflow} Workflow
 * @typedef {import('../../domain/workflow/workflow.mjs').WorkflowNode} WorkflowNode
 * @typedef {{ node: string, agent: string, named: string }} Naming what a node names for one agent, as written
 */

/**
 * Each family a workflow in force names (`model=`, `refuter=`) for an agent that `assign.agents`
 * gives a family, which wins over it; the plugin's own workflows name none.
 * @param {Settings} settings @param {Workflow} workflow @returns {string[]}
 */
export const maskedFamilies = (settings, workflow) => {
  return workflow.order.flatMap((id) => namingsOf(workflow.nodes[id]).flatMap((naming) => maskedBy(settings, naming)))
}

/**
 * What the node names a family for: its agent (a review node has none: its `model=` counts for
 * its lenses that name none), each lens node, its refuter.
 * @param {WorkflowNode} node @returns {Naming[]}
 */
const namingsOf = (node) => [
  { node: node.id, agent: /** @type {string} */ (node.agent), family: node.model, named: `model="${node.model}"` },
  ...node.branches.map((branch) => lensNaming(node, branch)),
  { node: node.id, agent: REFUTER, family: node.refuter, named: `refuter="${node.refuter}"` },
].filter(({ family }) => family !== null)

/**
 * A lens node's own `model=`, else its fan-in's.
 * @param {WorkflowNode} node @param {import('../../domain/workflow/workflow.mjs').Branch} branch
 * @returns {Naming & { family: string | null }}
 */
const lensNaming = (node, branch) => {
  const { name, model } = /** @type {import('../../domain/review/lenses.mjs').LensSpec} */ (readLensSpec(branch.lens))
  const agent = lensAgent(name)
  return model === null ? { node: node.id, agent, family: node.model, named: `model="${node.model}" for ${agent}` } : { node: branch.id, agent, family: model, named: `model="${model}"` }
}

/** @param {Settings} settings @param {Naming} naming @returns {string[]} */
const maskedBy = ({ assign }, { node: id, agent, named }) => {
  const family = ownOf(assign.agents, agent)?.family ?? null
  if (family === null) return []
  const plugin = ownOf(PLUGIN_DEFAULTS.assign.agents, agent) === family ? ", the plugin's default" : ''
  const [what, forAgent] = named.split(' for ')
  return [`node ${id}: ${what} is masked${forAgent === undefined ? '' : ` for ${forAgent}`} by assign.agents.${agent} (${family}${plugin}); set "${agent}": null in assign.agents to let the workflow choose`]
}
