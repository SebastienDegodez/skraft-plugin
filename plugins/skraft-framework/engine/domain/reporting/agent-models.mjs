import { REFUTER } from '../review/lenses.mjs'

/**
 * What each agent the engine started runs on under the host that started it, read from the
 * journal alone: what the configuration assigned it when it started, then the model the host
 * says it ran on once it answered.
 *
 * @typedef {import('../journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {import('../config/model-assignment.mjs').Host} Host
 * @typedef {import('../config/model-assignment.mjs').ResolvedAssignment} ResolvedAssignment
 * @typedef {{ family: string | null, tier: string | null, host: Host | null, models: string[] | null, effort: string | null }} HostModel
 *   host: the host that started the agent, null when the journal does not name it; models: the
 *   models that host tries in order, then the one it ran on; null when the host chooses, or
 *   when the journal names no host.
 * @typedef {HostModel & { step: string, agent: string }} AgentModel
 * @typedef {{ rows: Map<string, AgentModel>, started: Map<string, RunEvent> }} Seen
 */

export const HOST_CHOOSES = 'model chosen by the host'

/** @type {Pick<import('../config/model-assignment.mjs').HostAssignment, 'model' | 'effort'>} */
const UNKNOWN_HOST = Object.freeze({ model: null, effort: null })

/**
 * Each agent once, in the order it first started: a node's agent, each lens of a review, the
 * refuter; its last start and its last answer win.
 * @param {RunEvent[]} events @returns {AgentModel[]}
 */
export const agentModels = (events) => {
  /** @type {Seen} */
  const seen = { rows: new Map(), started: new Map() }
  for (const event of events) ON_EVENT[event.type]?.(seen, event)
  return [...seen.rows.values()]
}

/**
 * What an assignment comes to on a host: its family, its tier, the host's models and effort.
 * @param {ResolvedAssignment} assignment @param {Host | null} host @returns {HostModel}
 */
export const onHost = ({ family, tier, hosts }, host) => {
  const { model, effort } = host === null ? UNKNOWN_HOST : hosts[host]
  return { family, tier, host, models: model, effort }
}

/**
 * `planner · frontier · opus → sonnet · effort high`; the tier only when the family is no tier;
 * HOST_CHOOSES when the host chooses the model.
 * @param {HostModel} model
 */
export const modelText = ({ family, tier, host, models, effort }) => [
  family,
  tier === family ? null : tier,
  modelName({ host, models }),
  effort === null ? null : `effort ${effort}`,
].filter((part) => part !== null).join(' · ')

/**
 * What several agents run on a host: `reviewer · economy · haiku` when every one runs on the
 * same, else each group of agents with its own: `consistency-lens, fitness-lens: reviewer · economy · haiku; cold-reader-lens: frontier · opus`.
 * @param {Record<string, ResolvedAssignment>} assignments by agent @param {Host} host
 */
export const assignmentsText = (assignments, host) => {
  /** @type {Map<string, string[]>} */
  const groups = new Map()
  for (const [agent, assignment] of Object.entries(assignments)) {
    const text = modelText(onHost(assignment, host))
    groups.set(text, [...(groups.get(text) ?? []), agent])
  }
  if (groups.size === 1) return [...groups.keys()][0]
  return [...groups].map(([text, agents]) => `${agents.join(', ')}: ${text}`).join('; ')
}

/** `solution-architect (design): planner · frontier · opus`. @param {AgentModel} row */
export const agentText = (row) => `${row.agent} (${row.step}): ${modelText(row)}`

/** The models in the order the host tries them; HOST_CHOOSES; null when no host is named. @param {Pick<HostModel, 'host' | 'models'>} model */
export const modelName = ({ host, models }) => {
  if (models !== null) return models.join(' → ')
  return host === null ? null : HOST_CHOOSES
}

/** @param {Seen} seen @param {RunEvent} event */
const started = (seen, event) => {
  seen.started.set(event.step, event)
  if (event.assignment !== undefined) put(seen, event.step, event.agent, onHost(event.assignment, event.host ?? null))
  for (const [agent, assignment] of Object.entries(event.assignments ?? {})) put(seen, event.step, agent, onHost(assignment, event.host ?? null))
}

/**
 * An agent node's answer: the model its host ran it on; none on a resume that did not start it.
 * @param {Seen} seen @param {RunEvent} event
 */
const recorded = (seen, event) => {
  const start = /** @type {RunEvent} */ (seen.started.get(event.step))
  if (start.assignment !== undefined && event.model !== undefined) ran(seen, start, start.agent, event.model)
}

/**
 * A lens's answer; none for a verdict kept from the last pass or read by the engine itself,
 * which started no agent.
 * @param {Seen} seen @param {RunEvent} event
 */
const lensAnswered = (seen, event) => {
  if (event.assignment !== undefined) ran(seen, event, event.agent, event.model)
}

/** @param {Seen} seen @param {RunEvent} event */
const refuterAnswered = (seen, event) => ran(seen, event, REFUTER, event.model)

/**
 * What an agent ran on: its assignment on the host of its step's start, the model the host
 * named in place of the ones it tries.
 * @param {Seen} seen @param {RunEvent} event @param {string} agent @param {string | null} model
 */
const ran = (seen, event, agent, model) => {
  const host = /** @type {RunEvent} */ (seen.started.get(event.step)).host ?? null
  put(seen, event.step, agent, { ...onHost(event.assignment, host), models: model === null ? null : [model] })
}

/** @param {Seen} seen @param {string} step @param {string} agent @param {HostModel} model */
const put = (seen, step, agent, model) => {
  seen.rows.set(`${step} ${agent}`, { step, agent, ...model })
}

/** @type {Readonly<Record<string, (seen: Seen, event: RunEvent) => void>>} */
const ON_EVENT = Object.freeze({ __proto__: null, 'step.started': started, 'step.recorded': recorded, 'review.lens': lensAnswered, 'review.refuted': refuterAnswered })
