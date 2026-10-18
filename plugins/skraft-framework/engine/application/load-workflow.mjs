import { lensAgent, readLensSpec, REFUTER } from '../domain/review/lenses.mjs'
import { checkLocks, readWorkflow } from '../domain/workflow/workflow.mjs'

/**
 * @typedef {import('../domain/workflow/workflow.mjs').Workflow} Workflow
 * @typedef {import('./ports/agent-catalog.mjs').AgentSource} AgentSource
 * @typedef {{
 *   workspace: import('./ports/workspace.mjs').ConfigSource,
 *   workflowSource: import('./ports/workflow-source.mjs').WorkflowSource,
 * }} WorkflowFiles
 * @typedef {WorkflowFiles & { agentCatalog: import('./ports/agent-catalog.mjs').AgentCatalog }} WorkflowDeps
 * @typedef {{ ok: true, workflow: Workflow, name: string, unlocked: Array<{ node: string, reason: string }>, sources: Record<string, AgentSource> }
 *   | { ok: false, name: string, reason: string, errors: string[] }} WorkflowLoading
 */

/** The name of the plugin's own workflow. */
export const BUILT_IN = 'skraft'

/**
 * The plugin's workflow and the one the configuration designates (the plugin's when none),
 * each read and checked on its own.
 * @param {WorkflowFiles} deps
 * @param {{ workflow: string | null }} config
 * @returns {Promise<{ name: string, builtIn: Workflow, read: ReturnType<typeof readWorkflow> }>}
 */
export const readWorkflows = async ({ workspace, workflowSource }, config) => {
  const shipped = await workflowSource.builtIn()
  const builtIn = /** @type {{ workflow: Workflow }} */ (readWorkflow(shipped)).workflow
  const name = config.workflow ?? BUILT_IN
  const text = config.workflow === null ? shipped : await workspace.read(config.workflow)
  return { name, builtIn, read: text === null ? { ok: false, errors: [`${name} does not exist`] } : readWorkflow(text) }
}

/**
 * The workflow a run follows, refused with every error found: its own, the locked nodes of
 * the plugin's workflow it drops, and (with agents) the agents nobody provides.
 * @param {WorkflowDeps} deps
 * @param {{ config: { workflow: string | null }, agents?: boolean }} request
 * @returns {Promise<WorkflowLoading>}
 */
export const loadWorkflow = async (deps, { config, agents = true }) => {
  const { name, builtIn, read } = await readWorkflows(deps, config)
  if (!read.ok) return refused(name, read.errors)
  const { workflow } = read
  const locks = checkLocks(builtIn, workflow)
  const located = agents ? await locateAgents(deps.agentCatalog, workflow) : { sources: {}, errors: [] }
  const errors = [...locks.errors, ...located.errors]
  if (errors.length > 0) return refused(name, errors)
  return { ok: true, workflow, name, unlocked: locks.unlocked, sources: located.sources }
}

/**
 * @typedef {import('./ports/agent-catalog.mjs').AgentCatalog} AgentCatalog
 * @typedef {{ sources: Record<string, AgentSource>, errors: string[] }} Located
 * @typedef {{ node: string, agent: string, what: string, reviews: boolean }} WantedAgent
 *   what: how a refusal names it; reviews: a lens or the refuter, whose skills the engine hands on.
 */

/**
 * The source of each agent the nodes start, one lookup after the other, in node order: an
 * agent node's agent, a review node's lenses and the refuter.
 * @param {AgentCatalog} agentCatalog @param {Workflow} workflow
 * @returns {Promise<Located>} errors: the agents nobody provides, and the skills of a lens or
 *   of the refuter nobody provides
 */
const locateAgents = async (agentCatalog, workflow) => {
  /** @type {Located} */
  const located = { sources: {}, errors: [] }
  for (const wanted of uniqueAgents(workflow)) await locateAgent(agentCatalog, located, wanted)
  return located
}

/** Each agent once, at the first node that starts it. @param {Workflow} workflow */
const uniqueAgents = (workflow) => {
  const wanted = Object.values(workflow.nodes).flatMap(agentsOf)
  return wanted.filter((entry, index) => wanted.findIndex((other) => other.agent === entry.agent) === index)
}

/** @param {AgentCatalog} agentCatalog @param {Located} located @param {WantedAgent} wanted */
const locateAgent = async (agentCatalog, located, wanted) => {
  const source = await agentCatalog.locate(wanted.agent)
  if (source === null) {
    located.errors.push(`node ${wanted.node}: ${wanted.what} not found in the plugin, .claude/agents/ or .github/agents/`)
    return
  }
  located.sources[wanted.agent] = source
  if (wanted.reviews) located.errors.push(...await missingSkills(agentCatalog, wanted))
}

/** @param {AgentCatalog} agentCatalog @param {WantedAgent} wanted */
const missingSkills = async (agentCatalog, { node, agent, what }) => {
  const { missing } = await agentCatalog.skills(agent)
  return missing.map((skill) => `node ${node}: skill ${skill} of ${what} not found in the plugin's skills/, .claude/skills/ or .github/skills/`)
}

/**
 * The agents a node starts.
 * @param {import('../domain/workflow/workflow.mjs').WorkflowNode} node
 * @returns {WantedAgent[]}
 */
const agentsOf = ({ id, kind, agent, lenses }) => {
  if (kind === 'agent') return [{ node: id, agent: /** @type {string} */ (agent), what: `agent ${agent}`, reviews: false }]
  if (kind !== 'review') return []
  return [
    ...lenses.map(lensNameOf).map((lens) => ({ node: id, agent: lensAgent(lens), what: `lens ${lens} (agent ${lensAgent(lens)})`, reviews: true })),
    { node: id, agent: REFUTER, what: `agent ${REFUTER}`, reviews: true },
  ]
}

/** The lens a node's spec names. @param {string} spec a spec the workflow already checked */
const lensNameOf = (spec) => /** @type {import('../domain/review/lenses.mjs').LensSpec} */ (readLensSpec(spec)).name

/** @param {string} name @param {string[]} errors @returns {WorkflowLoading} */
const refused = (name, errors) => ({ ok: false, name, reason: `${name} is invalid: ${errors.join('; ')}`, errors })
