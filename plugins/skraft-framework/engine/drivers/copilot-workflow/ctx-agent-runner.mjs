import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * @typedef {{ id?: string, name?: string, displayName?: string }} SessionAgent
 * @typedef {{
 *   agent: (prompt: string, options: { label: string, agent: string }) => Promise<string | undefined | null>,
 *   session?: { rpc?: { agent?: { list?: (request?: object) => Promise<{ agents?: SessionAgent[] }> } } },
 * }} AgentContext the part of the Copilot WorkflowContext that starts agents
 */

/**
 * The session's agent for an engine agent file id (`solution-researcher`), or null when the
 * list names none. listed null: the session cannot list, so the plugin prefix is assumed.
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
 * @returns {import('../../application/ports/agent-runner.mjs').AgentRunner}
 */
export const createCtxAgentRunner = ({ ctx, pluginRoot, agentIds = {} }) => {
  /** @type {Promise<SessionAgent[] | null> | undefined} */
  let listing
  const idOf = async (/** @type {string} */ id) => {
    if (typeof agentIds[id] === 'string') return { name: agentIds[id], listed: null }
    listing ??= listAgents(ctx)
    const listed = await listing
    return { name: resolveAgentId(id, { listed, pluginName: listed === null ? await pluginNameOf(pluginRoot) : null }), listed }
  }
  return Object.freeze({
    run: async ({ agent, label, prompt }) => {
      const { name, listed } = await idOf(agent)
      if (name === null) {
        const known = (listed ?? []).map((entry) => entry.id ?? entry.name).join(', ') || 'none'
        return {
          ok: false,
          unavailable: true,
          text: '',
          error: `agent "${agent}" is not available in this Copilot session (agents: ${known}); install or enable the skraft plugin, or pass agentIds`,
        }
      }
      const text = await ctx.agent(prompt, { label, agent: name })
      if (typeof text === 'string' && text.trim() !== '') return { ok: true, text }
      return { ok: false, text: '', error: `${name} answered nothing` }
    },
  })
}
