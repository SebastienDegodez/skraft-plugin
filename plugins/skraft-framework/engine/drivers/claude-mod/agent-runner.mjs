/**
 * AgentRunner on `$.agent.spawn`: the subagent's answer is its own `turn.complete`.
 *
 * @typedef {{ agentId?: string, answer?: string, reason?: string }} TurnComplete
 *   the fields of a `turn.complete` input the runner reads.
 * @typedef {{ prompt: string, subagentType: string, description: string }} SpawnArgs
 * @typedef {{ agentId?: string, deny?: string }} SpawnResult
 * @typedef {{
 *   complete: (turn: TurnComplete) => void,
 *   wait: (agentId: string) => Promise<TurnComplete>,
 * }} AgentAnswers
 */

/**
 * The answers of subagents, matched by agentId. An answer that completes before anyone
 * waits for it is kept, up to `keep` of them.
 * @param {{ keep?: number }} [options]
 * @returns {AgentAnswers}
 */
export const createAgentAnswers = ({ keep = 50 } = {}) => {
  /** @type {Map<string, (turn: TurnComplete) => void>} */
  const waiting = new Map()
  /** @type {Map<string, TurnComplete>} */
  const early = new Map()
  return Object.freeze({
    complete: (turn) => {
      const id = turn.agentId
      if (typeof id !== 'string') return
      const resolve = waiting.get(id)
      if (resolve) {
        waiting.delete(id)
        resolve(turn)
        return
      }
      early.set(id, turn)
      if (early.size > keep) early.delete(/** @type {string} */ (early.keys().next().value))
    },
    wait: (agentId) => {
      const turn = early.get(agentId)
      if (turn) {
        early.delete(agentId)
        return Promise.resolve(turn)
      }
      return new Promise((resolve) => waiting.set(agentId, resolve))
    },
  })
}

/**
 * @param {{
 *   spawn: (args: SpawnArgs) => Promise<SpawnResult>,
 *   answers: AgentAnswers,
 *   pluginName: string,
 *   sessionCostUsd: () => Promise<number | null>,
 * }} host
 * @returns {import('../../application/ports/agent-runner.mjs').AgentRunner}
 */
export const createSpawnAgentRunner = ({ spawn, answers, pluginName, sessionCostUsd }) => Object.freeze({
  run: async ({ agent, label, prompt }) => {
    const before = await sessionCostUsd()
    /** @type {SpawnResult} */
    let spawned
    try {
      spawned = await spawn({ prompt, subagentType: `${pluginName}:${agent}`, description: label })
    } catch (error) {
      return { ok: false, text: '', unavailable: true, error: `${pluginName}:${agent} could not be started: ${messageOf(error)}` }
    }
    if (typeof spawned.deny === 'string' || typeof spawned.agentId !== 'string') {
      return { ok: false, text: '', unavailable: true, error: spawned.deny ?? `${pluginName}:${agent} was not started` }
    }
    const turn = await answers.wait(spawned.agentId)
    const after = await sessionCostUsd()
    const ok = turn.reason === 'answer'
    return {
      ok,
      text: turn.answer ?? '',
      ...(ok ? {} : { error: `${pluginName}:${agent} ended: ${turn.reason}` }),
      ...(before !== null && after !== null && after >= before ? { costUsd: after - before } : {}),
    }
  },
})

/** @param {unknown} error */
const messageOf = (error) => (error instanceof Error ? error.message : String(error))
