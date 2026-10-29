import { createObserve } from '../../application/pipeline/observe-usecase.mjs'
import { lensesText } from '../../domain/reporting/review-passes.mjs'
import { decideUsage } from '../../domain/decisions/questions.mjs'
import { createNodeAdapters } from '../../infrastructure/node-adapters.mjs'

/**
 * What the `skraft-pipeline` canvas page draws: the Observe view of the active pipeline of the
 * session's directory, read again on each call, as text the page sets with `textContent`: the
 * workflow's phases and steps (the step under way is the open one), the reviews, the gates, the
 * labelled edges the run took and the question it waits on, with where to answer it: in the chat,
 * where Copilot puts it to the person, or in a terminal. It shows; it takes no answer and decides
 * nothing. Every text is the engine's or fixed here; no exception text.
 *
 * @typedef {import('../../application/pipeline/observe-usecase.mjs').RunView} RunView
 * @typedef {import('../../domain/reporting/run-graph.mjs').GraphNode} GraphNode
 * @typedef {{ key: string, text: string, state: string }} Line
 * @typedef {{ key: string, text: string, state: string, steps: Line[] }} PhaseLines
 * @typedef {{ key: string, header: string, text: string, how: string }} Question
 * @typedef {{ title: string, status: string, reason: string, phases: PhaseLines[], details: Line[], question: Question | null }} PanelContent
 * @typedef {{ directory: () => string | null, pluginRoot: string, home: string }} ContentHost
 */

const TITLE = 'skraft pipeline'
const MARKS = Object.freeze({ closed: '✓', open: '▶', pending: '·', done: '✓' })

/** @param {string} status @param {string} reason @returns {PanelContent} */
const without = (status, reason) => Object.freeze({ title: TITLE, status, reason, phases: [], details: [], question: null })

export const NO_DIRECTORY = without('no-directory', 'The Copilot session has no working directory yet.')
export const UNREADABLE = without('unreadable', 'skraft could not read the pipeline of this working copy; run skraft status in a terminal.')

/**
 * The content of the active pipeline in the session's directory now; fixed content while the
 * session has none, or when it cannot be read.
 * @param {ContentHost} host @returns {Promise<PanelContent>}
 */
export const pipelineContent = async ({ directory, pluginRoot, home }) => {
  const cwd = directory()
  if (cwd === null) return NO_DIRECTORY
  try {
    return contentOf(await createObserve(createNodeAdapters({ cwd, pluginRoot, home })).view())
  } catch {
    return UNREADABLE
  }
}

/** @param {RunView} view @returns {PanelContent} */
const contentOf = (view) => ({
  title: view.slug === null ? TITLE : `skraft ${view.slug}`,
  status: view.status,
  reason: view.reason,
  phases: view.phases.map(({ phase, state }) => ({ key: `phase-${phase}`, text: `${MARKS[state]} ${phase}`, state, steps: stepsOf(view, phase) })),
  details: [...reviewLines(view), ...gateLines(view), ...loopLines(view)],
  question: questionOf(view.question),
})

/** The workflow's steps of one phase. @param {RunView} view @param {string} phase @returns {Line[]} */
const stepsOf = (view, phase) => view.graph.nodes
  .filter((node) => node.phase === phase)
  .map((node) => ({ key: `step-${node.id}`, text: stepText(node), state: node.state }))

/**
 * `✓ design — solution-architect: done, pass 2`: the step, what it runs, what it came to. No
 * cost: Copilot reports credits, never USD (ctx-agent-runner.mjs).
 * @param {GraphNode} node
 */
const stepText = (node) => {
  const what = node.what === null ? '' : ` — ${node.what}`
  const details = [node.outcome, node.visits > 1 ? `pass ${node.visits}` : null].filter((detail) => detail !== null)
  return `${MARKS[node.state]} ${node.id}${what}${details.length > 0 ? `: ${details.join(', ')}` : ''}`
}

/** The last pass of each review step. @param {RunView} view @returns {Line[]} */
const reviewLines = ({ reviews }) => reviews.map(({ step, visit, verdict, lenses }) => ({
  key: `review-${step}`,
  text: `review ${step}: ${verdict ?? 'in progress'}${visit > 1 ? `, pass ${visit}` : ''} — ${lensesText(lenses)}`,
  state: verdict === null ? 'open' : 'done',
}))

/** One line per component, each gate's last result; never its command nor its evidence. @param {RunView} view @returns {Line[]} */
const gateLines = ({ gates }) => [...new Set(gates.map((gate) => gate.component))].map((component) => ({
  key: `gates-${component}`,
  text: `gates ${component}: ${gates.filter((gate) => gate.component === component).map(gateText).join(', ')}`,
  state: 'done',
}))

/** @param {import('../../domain/reporting/run-facts.mjs').GateFact} gate */
const gateText = ({ gate, status, survivors }) => `${gate} ${status}${typeof survivors === 'number' ? ` (${survivors} survivors)` : ''}`

/** The labelled edges the run took: where it went back or branched. @param {RunView} view @returns {Line[]} */
const loopLines = ({ graph }) => graph.edges
  .filter((edge) => edge.label !== null && edge.taken > 0)
  .map(({ from, to, label, taken }) => ({ key: `edge-${from}-${to}`, text: `${from} → ${to} (${label}) ×${taken}`, state: 'done' }))

/**
 * The question the run waits on, and where the person answers it: the page has no answer of its own.
 * @param {RunView['question']} question @returns {Question | null}
 */
const questionOf = (question) => (question === null ? null : {
  key: question.key,
  header: question.header,
  text: question.text,
  how: `Answer it in the Copilot chat, where Copilot puts it to you; or type skraft decide ${question.key} ${decideUsage(question)} in a terminal.`,
})
