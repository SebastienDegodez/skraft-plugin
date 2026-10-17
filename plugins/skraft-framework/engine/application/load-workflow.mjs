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
 * The source of each agent node's agent, one lookup after the other, in node order.
 * @param {import('./ports/agent-catalog.mjs').AgentCatalog} agentCatalog @param {Workflow} workflow
 * @returns {Promise<{ sources: Record<string, AgentSource>, errors: string[] }>} errors: the agents nobody provides
 */
const locateAgents = async (agentCatalog, workflow) => {
  /** @type {{ sources: Record<string, AgentSource>, errors: string[] }} */
  const located = { sources: {}, errors: [] }
  for (const { id, agent } of Object.values(workflow.nodes).filter((node) => node.kind === 'agent')) {
    const source = await agentCatalog.locate(/** @type {string} */ (agent))
    if (source === null) located.errors.push(`node ${id}: agent ${agent} not found in the plugin, .claude/agents/ or .github/agents/`)
    else located.sources[/** @type {string} */ (agent)] = source
  }
  return located
}

/** @param {string} name @param {string[]} errors @returns {WorkflowLoading} */
const refused = (name, errors) => ({ ok: false, name, reason: `${name} is invalid: ${errors.join('; ')}`, errors })
