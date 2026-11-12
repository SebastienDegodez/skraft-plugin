import { inert, oneLine } from '../reporting/markdown-safety.mjs'

export const UNFORESEEN_GUIDANCE =
  'This is a host-llm judgment, not a human question. Read the incident output, choose exactly one offered action, ' +
  'then submit {key, answer, by:"host-llm", model, cost, costUnit, reason?}. ' +
  'model is observed usage metadata, never a model selector; costUnit is USD or nano-AIU. ' +
  'Use only usage actually observed for this judgment; do not use a whole-session total or invent missing usage. ' +
  'If usage is unavailable, submit the chosen action with by:"host-llm" and omit missing fields: the engine stops diagnostically. ' +
  'RETRY_WITH_NOTE needs a reason of 1 to 500 inert characters. Resume the SAME run after recording.'

/**
 * Recovery may return only through the graph's FAIL edge to a producer, never jump over
 * a locked gate or a human decision.
 * @param {import('../workflow/workflow.mjs').Workflow} workflow @param {string} step
 */
export const recoveryOptions = (workflow, step) => [
  'RETRY', 'RETRY_WITH_NOTE',
  ...workflow.edges.filter((edge) => edge.from === step && edge.label === 'FAIL' && workflow.nodes[edge.to].kind === 'agent').map((edge) => `SEND_TO:${edge.to}`),
  'STOP',
]

/** @param {import('../pipeline/incidents.mjs').FailureIncident[]} incidents @param {import('../journal/run-state.mjs').RunEvent[]} events */
export const mayJudgeIncident = (incidents, events) => incidents.some(({ owner }) => owner === 'unknown') &&
  !events.some((event) => event.type === 'question.asked' && event.kind === 'unforeseen' && event.incidents?.some((prior) => incidents.some(({ signature }) => prior.signature === signature)))

/** @param {string} step @param {string | null} log */
export const unforeseenText = (step, log) =>
  `${step} stopped on an unforeseen incident. Read ${log ?? 'the run report'} before choosing an action from this menu only. ` +
  'RETRY runs the same step; RETRY_WITH_NOTE retries with a bounded inert note; SEND_TO returns to a producer allowed by the workflow; STOP ends the run. ' +
  'Report the observed model and cost with its unit; never invent missing usage. This is not a human question.'

/**
 * @param {{ options: string[] }} question
 * @param {{ answer: unknown, reason?: unknown, by?: unknown, model?: unknown, cost?: unknown, costUnit?: unknown }} given
 */
export const readJudgment = (question, given) => {
  if (!question.options.includes(/** @type {string} */ (given.answer))) return { ok: false, reason: 'unforeseen answer is outside the recovery menu; the run stopped' }
  const usage = judgmentUsage(given)
  if (given.by !== 'host-llm' || Object.values(usage).includes(null)) {
    return { ok: false, reason: 'unforeseen judgment needs the observed model, a non-negative finite cost and its unit (USD or nano-AIU); the run stopped' }
  }

  const note = judgmentNote(given)
  if (!note.ok) return note
  return { ok: true, answer: /** @type {string} */ (given.answer), reason: note.reason, ...usage }
}

/** @param {{ model?: unknown, cost?: unknown, costUnit?: unknown }} given */
export const judgmentUsage = ({ model, cost, costUnit }) => ({
  model: typeof model === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(model) ? model : null,
  cost: typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? cost : null,
  costUnit: costUnit === 'USD' || costUnit === 'nano-AIU' ? costUnit : null,
})

/** @param {{ answer: unknown, reason?: unknown }} given */
const judgmentNote = ({ answer, reason }) => {
  if (answer !== 'RETRY_WITH_NOTE') return { ok: true, reason: null }
  const note = typeof reason === 'string' ? inert(oneLine(reason)).trim() : ''
  return note === '' || note.length > 500 ? { ok: false, reason: 'unforeseen RETRY_WITH_NOTE needs an inert note of 1 to 500 characters; the run stopped' } : { ok: true, reason: note }
}

/** @param {import('../journal/run-state.mjs').AskedQuestion} asked */
export const unforeseenStop = (asked) => ({
  code: asked.reason === null ? 'unforeseen-stopped' : 'invalid-judgment',
  reason: asked.reason ?? `${asked.step} stopped on unforeseen STOP; evidence: ${asked.incident?.log ?? 'unavailable'}`,
})
