import { listAgents, resolveAgentId } from './ctx-agent-runner.mjs'

/**
 * The workflow's arguments are written by a model, which may have just read repository content,
 * and the host does not enforce `argsSchema` (SDK 1.0.101 `WorkflowJsonSchema`: best effort;
 * probe check `unknown-arg-ignored`). They are read here, and refused with a fixed reason that
 * never echoes them.
 *
 * @typedef {import('./ctx-agent-runner.mjs').AgentContext} AgentContext
 * @typedef {import('../../application/pipeline/active-run.mjs').RunOutcome} RunOutcome
 * @typedef {{ slug?: unknown, issue?: unknown, title?: unknown, base?: unknown, fromArtifacts?: unknown, configure?: unknown, agentIds: Record<string, string> }} WorkflowArgs
 */

const KEYS = Object.freeze(['slug', 'issue', 'title', 'base', 'fromArtifacts', 'configure', 'agentIds'])

/** @type {RunOutcome} */
const INVALID_ARGS = Object.freeze({
  status: 'refused', slug: null, phase: null, code: 'invalid-args',
  reason: 'the workflow takes only slug, issue, title, base, fromArtifacts, configure (true or false) and agentIds; nothing was started',
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
  if (!isRecord(args) || Object.keys(args).some((key) => !KEYS.includes(key)) || !isFlag(args.configure)) return { ok: false, outcome: INVALID_ARGS }
  const agentIds = args.agentIds ?? {}
  if (!(await listedAgentIds(ctx, agentIds))) return { ok: false, outcome: INVALID_AGENT_IDS }
  return { ok: true, args: { ...args, agentIds: /** @type {Record<string, string>} */ (agentIds) } }
}

const REVIEW_KEYS = Object.freeze(['pr', 'publish', 'agentIds'])

const INVALID_REVIEW_ARGS = Object.freeze({
  status: /** @type {const} */ ('refused'), code: 'invalid-args',
  reason: 'the review takes pr, a pull request number, and only publish (true or false) and agentIds besides; nothing was started',
})

/**
 * The review's arguments, when every key is declared, pr is a positive whole number, publish is
 * true or false when given, and every agentIds entry picks a session agent the session lists for
 * that same agent; the refusal otherwise, which echoes none of them.
 * @param {AgentContext & { args?: unknown }} ctx
 * @returns {Promise<{ ok: true, args: { pr: number, publish: boolean, agentIds: Record<string, string> } } | { ok: false, refusal: { status: 'refused', code: string, reason: string } }>}
 */
export const readReviewArgs = async (ctx) => {
  const args = ctx.args ?? {}
  if (!isRecord(args) || !isReviewArgs(args)) return { ok: false, refusal: INVALID_REVIEW_ARGS }
  const agentIds = args.agentIds ?? {}
  if (!(await listedAgentIds(ctx, agentIds))) return { ok: false, refusal: INVALID_AGENT_IDS }
  return { ok: true, args: { pr: /** @type {number} */ (args.pr), publish: args.publish === true, agentIds: /** @type {Record<string, string>} */ (agentIds) } }
}

/** @param {Record<string, unknown>} args */
const isReviewArgs = (args) => Object.keys(args).every((key) => REVIEW_KEYS.includes(key))
  && Number.isInteger(args.pr) && /** @type {number} */ (args.pr) > 0
  && (args.publish === undefined || typeof args.publish === 'boolean')

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

/** Absent, true or false. @param {unknown} value */
const isFlag = (value) => value === undefined || typeof value === 'boolean'

/** Never null: both callers read `?? {}`. @param {unknown} value @returns {value is Record<string, unknown>} */
const isRecord = (value) => typeof value === 'object' && !Array.isArray(value)
