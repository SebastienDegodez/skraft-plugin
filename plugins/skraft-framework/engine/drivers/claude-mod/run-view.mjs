/**
 * The Observe view as the rows the `skraft-pipeline` pane draws and the text `/skraft`
 * prints. It shows; it decides nothing.
 *
 * @typedef {import('../../application/pipeline/observe-usecase.mjs').RunView} RunView
 * @typedef {{ view: RunView, log: string[] }} PipelineSnapshot what the pane draws
 * @typedef {'title' | 'closed' | 'open' | 'pending' | 'reason' | 'detail' | 'log'} RowTone
 * @typedef {{ key: string, text: string, tone: RowTone }} Row
 */

const MARKS = Object.freeze({ closed: '✓', open: '▶', pending: '·' })

/**
 * @param {RunView} view
 * @returns {Row[]}
 */
export const viewRows = (view) => [
  { key: 'title', text: view.slug ? `skraft ${view.slug} — ${view.status}` : `skraft — ${view.status}`, tone: 'title' },
  ...view.phases.map(({ phase, state }) => ({ key: `phase-${phase}`, text: `${MARKS[state]} ${phase}`, tone: state })),
  ...(view.reason ? [{ key: 'reason', text: view.reason, tone: /** @type {const} */ ('reason') }] : []),
  ...(view.current ? [{ key: 'current', text: currentText(view.current), tone: /** @type {const} */ ('detail') }] : []),
  ...(view.question ? [{ key: 'question', text: answerText(view.question), tone: /** @type {const} */ ('reason') }] : []),
  ...(view.costUsd === null ? [] : [{ key: 'cost', text: `cost: $${view.costUsd.toFixed(2)}`, tone: /** @type {const} */ ('detail') }]),
]

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
 * @param {PipelineSnapshot} snapshot
 * @param {number} [logRows] how many of the newest log lines to show
 * @returns {Row[]}
 */
export const paneRows = ({ view, log }, logRows = 12) => [
  ...viewRows(view),
  ...(logRows > 0 ? log.slice(-logRows) : []).map((line, index, shown) => ({
    key: `log-${log.length - shown.length + index}`,
    text: line,
    tone: /** @type {const} */ ('log'),
  })),
]

/** @param {RunView} view */
export const viewText = (view) => viewRows(view).map((row) => row.text).join('\n')
