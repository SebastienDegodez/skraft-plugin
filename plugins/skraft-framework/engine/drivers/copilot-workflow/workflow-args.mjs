import { listAgents, resolveAgentId } from './ctx-agent-runner.mjs'

/**
 * The workflow's arguments are written by a model, which may have just read repository content,
 * and the host does not enforce `argsSchema` (SDK 1.0.101 `WorkflowJsonSchema`: best effort;
 * probe check `unknown-arg-ignored`). They are read here, and refused with a fixed reason that
 * never echoes them.
 *
 * @typedef {import('./ctx-agent-runner.mjs').AgentContext} AgentContext
 * @typedef {import('../../application/pipeline/active-run.mjs').RunOutcome} RunOutcome
 * @typedef {{ slug?: unknown, issue?: unknown, title?: unknown, base?: unknown, fromArtifacts?: unknown, agentIds: Record<string, string> }} WorkflowArgs
 */

const KEYS = Object.freeze(['slug', 'issue', 'title', 'base', 'fromArtifacts', 'agentIds'])

/** @type {RunOutcome} */
const INVALID_ARGS = Object.freeze({
  status: 'refused', slug: null, phase: null, code: 'invalid-args',
  reason: 'the workflow takes only slug, issue, title, base, fromArtifacts and agentIds; nothing was started',
})

/** @type {RunOutcome} */
const INVALID_AGENT_IDS = Object.freeze({
  status: 'refused', slug: null, phase: null, code: 'invalid-agent-ids',
  reason: 'agentIds may only choose, for an agent file id, one of the session agents listed for that same agent; nothing was started',
})

/**
 * The arguments, when every key is declared and every agentIds entry picks a session agent the
 * session lists for that same agent; the refusal otherwise.
 * @param {AgentContext & { args?: unknown }} ctx
 * @returns {Promise<{ ok: true, args: WorkflowArgs } | { ok: false, outcome: RunOutcome }>}
 */
export const readArgs = async (ctx) => {
  const args = ctx.args ?? {}
  if (!isRecord(args) || Object.keys(args).some((key) => !KEYS.includes(key))) return { ok: false, outcome: INVALID_ARGS }
  const agentIds = args.agentIds ?? {}
  if (!(await listedAgentIds(ctx, agentIds))) return { ok: false, outcome: INVALID_AGENT_IDS }
  return { ok: true, args: { ...args, agentIds: /** @type {Record<string, string>} */ (agentIds) } }
}

/**
 * Whether each entry names, by its id or name, a session agent the list holds for that agent file
 * id; none needs no list.
 * @param {AgentContext} ctx @param {unknown} agentIds @returns {Promise<boolean>}
 */
const listedAgentIds = async (ctx, agentIds) => {
  if (!isRecord(agentIds)) return false
  const entries = Object.entries(agentIds)
  if (entries.length === 0) return true
  const listed = await listAgents(ctx)
  return listed !== null && entries.every(([id, name]) => picksAgent(listed, id, name))
}

/**
 * @param {import('./ctx-agent-runner.mjs').SessionAgent[]} listed @param {string} id @param {unknown} name
 * @returns {boolean}
 */
const picksAgent = (listed, id, name) => {
  const named = listed.filter((entry) => (entry.id ?? entry.name) === name)
  return resolveAgentId(id, { listed: named, pluginName: null }) !== null
}

/** Never null: both callers read `?? {}`. @param {unknown} value @returns {value is Record<string, unknown>} */
const isRecord = (value) => typeof value === 'object' && !Array.isArray(value)
