import { lensesText } from '../../domain/reporting/review-passes.mjs'
import { costText } from '../../domain/reporting/run-report.mjs'

/**
 * The Observe view as the rows the `skraft-pipeline` pane draws and the text `/skraft`
 * prints, and the answers the pane offers as buttons. It shows; it decides nothing.
 *
 * @typedef {import('../../application/pipeline/observe-usecase.mjs').RunView} RunView
 * @typedef {import('../../domain/reporting/run-graph.mjs').GraphNode} GraphNode
 * @typedef {import('../../domain/reporting/review-passes.mjs').ReviewPass} ReviewPass
 * @typedef {import('../../domain/reporting/run-facts.mjs').GateFact} GateFact
 * @typedef {{ view: RunView, log: string[], live: boolean }} PipelineSnapshot what the pane draws
 *   live: a run of this session drives the pipeline, and its own dialog asks its questions.
 * @typedef {'title' | 'closed' | 'open' | 'pending' | 'reason' | 'detail' | 'log'} RowTone
 * @typedef {{ key: string, text: string, tone: RowTone }} Row
 * @typedef {{ key: string, label: string, question: string, answer: string }} AnswerChoice
 *   a button of the pane: the question's key and the option it answers.
 */

const MARKS = Object.freeze({ closed: '✓', open: '▶', pending: '·' })
/** A step's tone, by where the run stands on it. */
const STEP_TONES = Object.freeze({ done: /** @type {const} */ ('closed'), open: /** @type {const} */ ('open'), pending: /** @type {const} */ ('pending') })

/**
 * @param {RunView} view
 * @param {boolean} [withSteps] each phase followed by its steps of the workflow graph, as the pane draws it
 * @returns {Row[]}
 */
export const viewRows = (view, withSteps = false) => [
  { key: 'title', text: view.slug ? `skraft ${view.slug} — ${view.status}` : `skraft — ${view.status}`, tone: 'title' },
  ...view.phases.flatMap(({ phase, state }) => [{ key: `phase-${phase}`, text: `${MARKS[state]} ${phase}`, tone: state }, ...(withSteps ? stepRows(view, phase) : [])]),
  ...(view.reason ? [{ key: 'reason', text: view.reason, tone: /** @type {const} */ ('reason') }] : []),
  ...(view.current ? [{ key: 'current', text: currentText(view.current), tone: /** @type {const} */ ('detail') }] : []),
  ...(view.question ? [{ key: 'question', text: answerText(view.question), tone: /** @type {const} */ ('reason') }] : []),
  ...view.reviews.map((review) => ({ key: `review-${review.step}`, text: reviewText(review), tone: /** @type {const} */ ('detail') })),
  ...gateRows(view.gates),
  ...(view.costUsd === null ? [] : [{ key: 'cost', text: `cost: ${costText(view.costUsd)} (${COST_COUNTS})`, tone: /** @type {const} */ ('detail') }]),
]

/** What the Claude Code cost counts: the session's cost while each agent ran. */
const COST_COUNTS = 'approximate: it includes anything else exchanged in this session while an agent ran'

/** The workflow's steps of one phase, under it. @param {RunView} view @param {string} phase @returns {Row[]} */
const stepRows = (view, phase) => view.graph.nodes
  .filter((node) => node.phase === phase)
  .map((node) => ({ key: `step-${node.id}`, text: stepText(node), tone: STEP_TONES[node.state] }))

/**
 * `  ✓ design — solution-architect: done, pass 2, $1.00`: the step, what it runs, what it came to.
 * @param {GraphNode} node
 */
export const stepText = (node) => {
  const what = node.what === null ? '' : ` — ${node.what}`
  const details = [node.outcome, node.visits > 1 ? `pass ${node.visits}` : null, node.costUsd === null ? null : costText(node.costUsd)].filter((detail) => detail !== null)
  return `  ${MARKS[STEP_TONES[node.state]]} ${node.id}${what}${details.length > 0 ? `: ${details.join(', ')}` : ''}`
}

/**
 * `review design_review: needs-rework — consistency fail (1), fitness pass`.
 * @param {ReviewPass} review
 */
export const reviewText = ({ step, visit, verdict, lenses }) => {
  const pass = visit > 1 ? `, pass ${visit}` : ''
  return `review ${step}: ${verdict ?? 'in progress'}${pass} — ${lensesText(lenses)}`
}

/** One row per component: each gate's last result. @param {GateFact[]} gates @returns {Row[]} */
const gateRows = (gates) => [...new Set(gates.map((gate) => gate.component))].map((component) => ({
  key: `gates-${component}`,
  text: `gates ${component}: ${gates.filter((gate) => gate.component === component).map(gateText).join(', ')}`,
  tone: /** @type {const} */ ('detail'),
}))

/** `test fail`, `mutation fail (3 survivors)`. @param {GateFact} gate */
const gateText = ({ gate, status, survivors }) => `${gate} ${status}${typeof survivors === 'number' ? ` (${survivors} survivors)` : ''}`

/**
 * The node the run stands on: a gate node by its gates, a question node by its question, an
 * agent node by its agent and attempt.
 * @param {NonNullable<RunView['current']>} current
 */
export const currentText = ({ step, agent, gates, question, visit, attempt }) => {
  const pass = visit > 1 ? `, pass ${visit}` : ''
  if (agent !== null) return `agent: ${agent} (${step}${pass}, attempt ${attempt})`
  return question ? `question: ${question} (${step}${pass})` : `gates: ${/** @type {string[]} */ (gates).join(', ')} (${step}${pass})`
}

/** How to answer the question the run waits on. @param {NonNullable<RunView['question']>} question */
const answerText = ({ key, options, refusals }) =>
  `answer: /skraft decide ${key} ${options.join('|')}${refusals.length > 0 ? ` (with your reason after ${refusals.join(' or ')})` : ''}`

/**
 * The pane's answer buttons: one per option of the question the run waits on; none while
 * nothing waits or while a run drives, whose own dialog asks.
 * @param {PipelineSnapshot} snapshot @returns {AnswerChoice[]}
 */
export const answerChoices = ({ view: { question }, live }) => (question === null || live
  ? []
  : question.options.map((option) => ({ key: `answer-${question.key}-${option}`, label: option, question: question.key, answer: option })))

/**
 * @param {PipelineSnapshot} snapshot
 * @param {number} [logRows] how many of the newest log lines to show
 * @returns {Row[]}
 */
export const paneRows = ({ view, log }, logRows = 12) => [
  ...viewRows(view, true),
  ...(logRows > 0 ? log.slice(-logRows) : []).map((line, index, shown) => ({
    key: `log-${log.length - shown.length + index}`,
    text: line,
    tone: /** @type {const} */ ('log'),
  })),
]

/** @param {RunView} view */
export const viewText = (view) => viewRows(view).map((row) => row.text).join('\n')
