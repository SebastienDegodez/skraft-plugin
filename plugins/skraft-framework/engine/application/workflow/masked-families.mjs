import { ownOf, PLUGIN_DEFAULTS } from '../../domain/config/model-assignment.mjs'
import { lensAgent, readLensSpec, REFUTER } from '../../domain/review/lenses.mjs'

/**
 * @typedef {import('../../domain/config/skraft-config.mjs').Settings} Settings
 * @typedef {import('../../domain/workflow/workflow.mjs').Workflow} Workflow
 * @typedef {import('../../domain/workflow/workflow.mjs').WorkflowNode} WorkflowNode
 * @typedef {{ agent: string, named: string }} Naming what a node names for one agent, as written
 */

/**
 * Each family an ejected workflow names (`model=`, `<lens>@<family>`, `refuter=`) for an agent
 * that `assign.agents` gives a family, which wins over it; none for the plugin's own workflow,
 * whose families nothing reads.
 * @param {Settings} settings @param {Workflow} workflow @returns {string[]}
 */
export const maskedFamilies = (settings, workflow) => {
  if (settings.workflow === null) return []
  return workflow.order.flatMap((id) => namingsOf(workflow.nodes[id]).flatMap((naming) => maskedBy(settings, id, naming)))
}

/**
 * What the node names a family for: its agent (a review node has none: its `model=` counts for
 * its lenses), each lens, its refuter.
 * @param {WorkflowNode} node @returns {Naming[]}
 */
const namingsOf = (node) => [
  { agent: /** @type {string} */ (node.agent), family: node.model, named: `model="${node.model}"` },
  ...node.lenses.map((spec) => lensNaming(node, spec)),
  { agent: REFUTER, family: node.refuter, named: `refuter="${node.refuter}"` },
].filter(({ family }) => family !== null)

/** A lens's own `@<family>`, else the review node's `model=`. @param {WorkflowNode} node @param {string} spec @returns {Naming & { family: string | null }} */
const lensNaming = (node, spec) => {
  const { name, model } = /** @type {import('../../domain/review/lenses.mjs').LensSpec} */ (readLensSpec(spec))
  const agent = lensAgent(name)
  return model === null ? { agent, family: node.model, named: `model="${node.model}" for ${agent}` } : { agent, family: model, named: spec }
}

/** @param {Settings} settings @param {string} id @param {Naming} naming @returns {string[]} */
const maskedBy = ({ assign }, id, { agent, named }) => {
  const family = ownOf(assign.agents, agent)?.family ?? null
  if (family === null) return []
  const plugin = ownOf(PLUGIN_DEFAULTS.assign.agents, agent) === family ? ", the plugin's default" : ''
  const [what, forAgent] = named.split(' for ')
  return [`node ${id}: ${what} is masked${forAgent === undefined ? '' : ` for ${forAgent}`} by assign.agents.${agent} (${family}${plugin}); set "${agent}": null in assign.agents to let the workflow choose`]
}
