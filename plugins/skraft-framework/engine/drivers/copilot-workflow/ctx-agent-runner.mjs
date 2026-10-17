import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * @typedef {{ id?: string, name?: string, displayName?: string }} SessionAgent
 * @typedef {{
 *   agent: (prompt: string, options: { label: string, agent: string }) => Promise<string | undefined | null>,
 *   session?: { rpc?: { agent?: { list?: (request?: object) => Promise<{ agents?: SessionAgent[] }> } } },
 * }} AgentContext the part of the Copilot WorkflowContext that starts agents
 * @typedef {{
 *   ctx: AgentContext,
 *   pluginRoot: string,
 *   agentIds: Record<string, string>,
 *   listing: Promise<SessionAgent[] | null> | undefined,
 * }} CtxSession the runner's session: listing is the session's agent list, read on first need
 * @typedef {import('../../application/ports/agent-runner.mjs').AgentRunner} AgentRunner
 * @typedef {import('../../application/ports/agent-runner.mjs').AgentDispatch} AgentDispatch
 * @typedef {import('../../application/ports/agent-runner.mjs').AgentAnswer} AgentAnswer
 */

/**
 * The session's agent for an engine agent file id (`solution-researcher`), or null when the
 * list names none. listed null: the session cannot list, so the id takes the plugin prefix,
 * if any: a repository agent is given none.
 * @param {string} id
 * @param {{ listed: SessionAgent[] | null, pluginName: string | null }} known
 * @returns {string | null}
 */
export const resolveAgentId = (id, { listed, pluginName }) => {
  if (listed === null) return pluginName ? `${pluginName}:${id}` : id
  const match = listed.find((entry) => [entry.id, entry.name, entry.displayName].includes(id))
    ?? listed.find((entry) => (entry.id ?? '').endsWith(`:${id}`))
  return match ? (match.id ?? match.name ?? null) : null
}

/** @param {AgentContext} ctx @returns {Promise<SessionAgent[] | null>} */
const listAgents = async (ctx) => {
  const rpc = ctx.session?.rpc?.agent
  if (typeof rpc?.list !== 'function') return null
  try {
    const answer = await rpc.list({})
    return Array.isArray(answer?.agents) ? answer.agents : null
  } catch {
    return null
  }
}

/** @param {string} pluginRoot @returns {Promise<string | null>} */
const pluginNameOf = async (pluginRoot) => {
  try {
    return JSON.parse(await readFile(join(pluginRoot, 'plugin.json'), 'utf8')).name ?? null
  } catch {
    return null
  }
}

/**
 * AgentRunner on `ctx.agent`. Copilot reports usage in nano-AIU credits, never USD, so no
 * costUsd is reported.
 * @param {{ ctx: AgentContext, pluginRoot: string, agentIds?: Record<string, string> }} options
 * @returns {AgentRunner}
 */
export const createCtxAgentRunner = ({ ctx, pluginRoot, agentIds = {} }) => {
  /** @type {CtxSession} */
  const session = { ctx, pluginRoot, agentIds, listing: undefined }
  return Object.freeze({
    run: (dispatch) => runCtxAgent(session, dispatch),
  })
}

/** @param {CtxSession} session @param {AgentDispatch} dispatch @returns {Promise<AgentAnswer>} */
const runCtxAgent = async (session, { agent, source, label, prompt }) => {
  const { name, listed } = await sessionAgentOf(session, agent, source)
  if (name === null) return notInSession(agent, listed)
  return askAgent(session.ctx, name, { label, prompt })
}

/**
 * The session's name for an engine agent: agentIds first, else the session's list, read once.
 * @param {CtxSession} session @param {string} id @param {import('../../application/ports/agent-catalog.mjs').AgentSource} source
 */
const sessionAgentOf = async (session, id, source) => {
  if (typeof session.agentIds[id] === 'string') return { name: session.agentIds[id], listed: null }
  session.listing ??= listAgents(session.ctx)
  const listed = await session.listing
  const pluginName = listed === null && source === 'plugin' ? await pluginNameOf(session.pluginRoot) : null
  return { name: resolveAgentId(id, { listed, pluginName }), listed }
}

/** @param {string} agent @param {SessionAgent[] | null} listed @returns {AgentAnswer} */
const notInSession = (agent, listed) => {
  const known = (listed ?? []).map((entry) => entry.id ?? entry.name).join(', ') || 'none'
  return {
    ok: false,
    unavailable: true,
    text: '',
    error: `agent "${agent}" is not available in this Copilot session (agents: ${known}); install or enable the skraft plugin, or pass agentIds`,
  }
}

/** @param {AgentContext} ctx @param {string} name @param {{ label: string, prompt: string }} dispatch @returns {Promise<AgentAnswer>} */
const askAgent = async (ctx, name, { label, prompt }) => {
  let text
  try {
    text = await ctx.agent(prompt, { label, agent: name })
  } catch (error) {
    return { ok: false, text: '', error: `${name} failed: ${error instanceof Error ? error.message : String(error)}` }
  }
  return answerOf(name, text)
}

/** Only a non-blank answer is an answer. @param {string} name @param {string | undefined | null} text @returns {AgentAnswer} */
const answerOf = (name, text) => {
  if (typeof text === 'string' && text.trim() !== '') return { ok: true, text }
  return { ok: false, text: '', error: `${name} answered nothing` }
}
