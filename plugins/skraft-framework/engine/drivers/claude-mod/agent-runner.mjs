/**
 * AgentRunner on `$.agent.spawn`: the subagent's answer is its own `turn.complete`. A plugin
 * agent is spawned as `<pluginName>:<id>`, a repository agent under its own id.
 *
 * @typedef {{ agentId?: string, answer?: string, reason?: string }} TurnComplete
 *   the fields of a `turn.complete` input the runner reads.
 * @typedef {{ prompt: string, subagentType: string, description: string, model?: string }} SpawnArgs
 *   model: the first Claude Code model skraft-config.json names for the dispatch's family; without
 *   one, the agent file's own model decides.
 * @typedef {{ agentId?: string, deny?: string, model?: string }} SpawnResult
 *   model: the model Claude Code started the subagent on, when it says.
 * @typedef {{
 *   complete: (turn: TurnComplete) => void,
 *   wait: (agentId: string) => Promise<TurnComplete>,
 * }} AgentAnswers
 * @typedef {{
 *   waiting: Map<string, (turn: TurnComplete) => void>,
 *   early: Map<string, TurnComplete>,
 *   keep: number,
 * }} AnswerBook the answers awaited and the ones that came first
 * @typedef {{
 *   spawn: (args: SpawnArgs) => Promise<SpawnResult>,
 *   answers: AgentAnswers,
 *   pluginName: string,
 *   sessionCostUsd: () => Promise<number | null>,
 * }} SpawnHost
 * @typedef {import('../../application/ports/agent-runner.mjs').AgentRunner} AgentRunner
 * @typedef {import('../../application/ports/agent-runner.mjs').AgentAnswer} AgentAnswer
 */

/**
 * The answers of subagents, matched by agentId. An answer that completes before anyone
 * waits for it is kept, up to `keep` of them.
 * @param {{ keep?: number }} [options]
 * @returns {AgentAnswers}
 */
export const createAgentAnswers = ({ keep = 50 } = {}) => {
  /** @type {AnswerBook} */
  const book = { waiting: new Map(), early: new Map(), keep }
  return Object.freeze({
    complete: (turn) => completeTurn(book, turn),
    wait: (agentId) => waitForAnswer(book, agentId),
  })
}

/** Hands the answer to whoever waits for it, or keeps it for a later wait. @param {AnswerBook} book @param {TurnComplete} turn */
const completeTurn = (book, turn) => {
  const id = turn.agentId
  if (typeof id !== 'string') return
  const resolve = book.waiting.get(id)
  if (resolve) {
    book.waiting.delete(id)
    resolve(turn)
    return
  }
  keepEarly(book, id, turn)
}

/** Keeps the `keep` latest answers nobody waits for yet. @param {AnswerBook} book @param {string} id @param {TurnComplete} turn */
const keepEarly = (book, id, turn) => {
  book.early.set(id, turn)
  if (book.early.size > book.keep) book.early.delete(/** @type {string} */ (book.early.keys().next().value))
}

/** @param {AnswerBook} book @param {string} agentId @returns {Promise<TurnComplete>} */
const waitForAnswer = (book, agentId) => {
  const turn = book.early.get(agentId)
  if (turn) {
    book.early.delete(agentId)
    return Promise.resolve(turn)
  }
  return new Promise((resolve) => book.waiting.set(agentId, resolve))
}

/**
 * @param {SpawnHost} host
 * @returns {AgentRunner}
 */
export const createSpawnAgentRunner = ({ spawn, answers, pluginName, sessionCostUsd }) => Object.freeze({
  host: 'claude-code',
  run: (request) => runSpawned({ spawn, answers, pluginName, sessionCostUsd }, request),
  runMany: (requests) => runSpawnedTogether({ spawn, answers, pluginName, sessionCostUsd }, requests),
})

/**
 * Spawns every subagent before waiting for any. Their turns overlap, so the session cost they
 * add is the batch's, not any one agent's.
 * @param {SpawnHost} host @param {import('../../application/ports/agent-runner.mjs').AgentDispatch[]} requests
 * @returns {Promise<import('../../application/ports/agent-runner.mjs').AgentAnswers>}
 */
const runSpawnedTogether = async (host, requests) => {
  const before = await host.sessionCostUsd()
  const uncounted = { ...host, sessionCostUsd: async () => null }
  const answers = await Promise.all(requests.map((request) => runSpawned(uncounted, request)))
  const after = await host.sessionCostUsd()
  return { answers, ...costSpent(before, after) }
}

/** @param {SpawnHost} host @param {import('../../application/ports/agent-runner.mjs').AgentDispatch} request @returns {Promise<AgentAnswer>} */
const runSpawned = async (host, { agent, source, label, prompt, models }) => {
  const { spawn, answers, pluginName, sessionCostUsd } = host
  const subagentType = source === 'repository' ? agent : `${pluginName}:${agent}`
  const before = await sessionCostUsd()
  const model = models?.['claude-code']?.[0]
  const spawned = await spawnSubagent(spawn, { prompt, subagentType, description: label, ...(model === undefined ? {} : { model }) })
  if ('refused' in spawned) return spawned.refused
  const turn = await answers.wait(spawned.agentId)
  const after = await sessionCostUsd()
  return { ...turnResult(subagentType, turn), model: spawned.model, ...costSpent(before, after) }
}

/**
 * The started subagent's id, or the result of a spawn the host refused or could not make.
 * @param {SpawnHost['spawn']} spawn @param {SpawnArgs} args
 * @returns {Promise<{ agentId: string, model: string | null } | { refused: AgentAnswer }>}
 */
const spawnSubagent = async (spawn, args) => {
  /** @type {SpawnResult} */
  let spawned
  try {
    spawned = await spawn(args)
  } catch {
    return { refused: notStarted(`${args.subagentType} could not be started`) }
  }
  if (typeof spawned.deny === 'string' || typeof spawned.agentId !== 'string') {
    return { refused: notStarted(spawned.deny ?? `${args.subagentType} was not started`) }
  }
  return { agentId: spawned.agentId, model: typeof spawned.model === 'string' ? spawned.model : args.model ?? null }
}

/** @param {string} error @returns {AgentAnswer} */
const notStarted = (error) => ({ ok: false, text: '', unavailable: true, error })

/** @param {string} subagentType @param {TurnComplete} turn */
const turnResult = (subagentType, turn) => {
  const ok = turn.reason === 'answer'
  return {
    ok,
    text: turn.answer ?? '',
    ...(ok ? {} : { error: `${subagentType} ended: ${turn.reason}` }),
  }
}

/** The session cost the subagent added, when both readings are known and it did not fall. @param {number | null} before @param {number | null} after */
const costSpent = (before, after) => (before !== null && after !== null && after >= before ? { costUsd: after - before } : {})
