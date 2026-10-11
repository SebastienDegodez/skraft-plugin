/**
 * The Observe view as the rows the `skraft-pipeline` pane draws and the text `/skraft`
 * prints. It shows; it decides nothing.
 *
 * @typedef {import('../../application/observe.mjs').RunView} RunView
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
  ...(view.current
    ? [{ key: 'agent', text: `agent: ${view.current.agent} (${view.current.step}, attempt ${view.current.attempt})`, tone: /** @type {const} */ ('detail') }]
    : []),
  ...(view.costUsd === null ? [] : [{ key: 'cost', text: `cost: $${view.costUsd.toFixed(2)}`, tone: /** @type {const} */ ('detail') }]),
]

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
