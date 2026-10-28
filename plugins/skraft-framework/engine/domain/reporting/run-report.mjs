import { cell } from './markdown-safety.mjs'

/**
 * The run report: time, cost and retries of each step, and every answer a human gave, read from
 * the journal alone. A step started again (a retry, or a new visit the gates, a review or a human
 * sent back) counts one retry.
 *
 * @typedef {import('../journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {{
 *   step: string, phase: string, visits: number, attempts: number, retries: number,
 *   durationMs: number, costUsd: number | null, outcome: string | null,
 * }} StepReport
 *   outcome: what its last attempt recorded, null while an attempt is open.
 * @typedef {{ attempts: number, retries: number, durationMs: number, costUsd: number | null }} ReportTotals
 * @typedef {{ key: string, kind: string, step: string, answer: string, reason: string | null, by: string }} HumanAnswer
 *   step: the node the question was about; by: how the journal knows a person gave it.
 * @typedef {{ steps: StepReport[], totals: ReportTotals, answers: HumanAnswer[], startedAt: string | null, elapsedMs: number }} RunReport
 *   steps: in the order they first started; answers: in the order they were given; startedAt:
 *   the first event's; elapsedMs: from the first event to the last.
 * @typedef {{ step: string, phase: string, visits: number, attempts: number, durationMs: number, costUsd: number | null, outcome: string | null, open: boolean }} Row
 */

export const RUN_REPORT_FILE = 'run-report.md'

/** @param {RunEvent[]} events the run's journal @returns {RunReport} */
export const runReport = (events) => {
  /** @type {Map<string, Row>} */
  const rows = new Map()
  for (const event of events) ON_EVENT[event.type]?.(rows, event)
  const steps = [...rows.values()].map(stepOf)
  return { steps, totals: totalsOf(steps), answers: answersOf(events), startedAt: events[0]?.at ?? null, elapsedMs: elapsedOf(events) }
}

/** Each answer a human gave, with the question it answers. @param {RunEvent[]} events @returns {HumanAnswer[]} */
const answersOf = (events) => {
  const asked = new Map(events.filter((event) => event.type === 'question.asked').map((event) => [event.key, event]))
  return events.filter((event) => event.type === 'question.answered').map(({ key, answer, reason, by }) => ({ key, kind: asked.get(key).kind, step: asked.get(key).step, answer, reason, by }))
}

/** @param {Map<string, Row>} rows @param {RunEvent} event */
const started = (rows, event) => {
  const row = rows.get(event.step) ?? /** @type {Row} */ ({ step: event.step, phase: event.phase, visits: 0, attempts: 0, durationMs: 0, costUsd: null, outcome: null })
  row.visits = event.visit
  row.attempts += 1
  row.open = true
  rows.set(event.step, row)
}

/** @param {Map<string, Row>} rows @param {RunEvent} event */
const recorded = (rows, event) => {
  const row = /** @type {Row} */ (rows.get(event.step))
  row.durationMs += event.durationMs ?? 0
  row.costUsd = addCost(row.costUsd, event.cost)
  row.outcome = event.outcome
  row.open = false
}

/** @type {Readonly<Record<string, (rows: Map<string, Row>, event: RunEvent) => void>>} */
const ON_EVENT = Object.freeze({ __proto__: null, 'step.started': started, 'step.recorded': recorded })

/** @param {number | null} total @param {unknown} cost @returns {number | null} */
const addCost = (total, cost) => (typeof cost === 'number' ? (total ?? 0) + cost : total)

/** @param {Row} row @returns {StepReport} */
const stepOf = ({ step, phase, visits, attempts, durationMs, costUsd, outcome, open }) => ({
  step, phase, visits, attempts, retries: attempts - 1, durationMs, costUsd, outcome: open ? null : outcome,
})

/** @param {StepReport[]} steps @returns {ReportTotals} */
const totalsOf = (steps) => ({
  attempts: sum(steps.map((step) => step.attempts)),
  retries: sum(steps.map((step) => step.retries)),
  durationMs: sum(steps.map((step) => step.durationMs)),
  costUsd: steps.reduce((/** @type {number | null} */ total, step) => addCost(total, step.costUsd), null),
})

/** @param {number[]} values */
const sum = (values) => values.reduce((total, value) => total + value, 0)

/** @param {RunEvent[]} events */
const elapsedOf = (events) => (events.length === 0 ? 0 : Date.parse(events[events.length - 1].at) - Date.parse(events[0].at))

/**
 * run-report.md: the status line, one row per step, the totals, the answers humans gave, when
 * the run started.
 * @param {{ slug: string, status: string, report: RunReport }} report
 */
export const renderRunReport = ({ slug, status, report }) => [
  '<!-- markdownlint-disable-file -->',
  `# Run report — ${slug}`,
  '',
  status,
  '',
  ...reportTable(report),
  '',
  ...(report.answers.length === 0 ? [] : ['## Human answers', '', ...answersTable(report.answers), '']),
  `Started at ${report.startedAt}; ${durationText(report.elapsedMs)} from the first event to the last.`,
  '',
].join('\n')

/**
 * The table of a report: one row per step, then the totals, then what a cost means when one
 * was told.
 * @param {RunReport} report
 */
export const reportTable = ({ steps, totals }) => [
  '| Step | Phase | Visits | Attempts | Retries | Time | Cost | Outcome |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ...steps.map((step) => `| ${step.step} | ${step.phase} | ${step.visits} | ${step.attempts} | ${step.retries} | ${durationText(step.durationMs)} | ${costText(step.costUsd)} | ${step.outcome ?? 'in progress'} |`),
  `| Total | | | ${totals.attempts} | ${totals.retries} | ${durationText(totals.durationMs)} | ${costText(totals.costUsd)} | |`,
  ...(totals.costUsd === null ? [] : ['', COST_NOTE]),
]

/**
 * The answers humans gave, one row each; the reason a refusal carries after its answer.
 * @param {HumanAnswer[]} answers
 */
export const answersTable = (answers) => [
  '| Question | Step | Answer | By |',
  '| --- | --- | --- | --- |',
  ...answers.map(({ key, step, answer, reason, by }) => `| ${key} | ${step} | ${cell(reason === null ? answer : `${answer}: ${reason}`)} | ${by} |`),
]

/**
 * Only the Claude Code mod tells a cost in USD: the session's cost after an agent minus before
 * it, which counts whatever else that session did meanwhile.
 */
export const COST_NOTE = 'Costs are approximate (~): each is what the Claude Code session cost while the agent ran, so it includes anything else exchanged in that session meanwhile.'

/** `~$0.42`, approximate (COST_NOTE); `-` when no cost was told. @param {number | null} costUsd */
export const costText = (costUsd) => (costUsd === null ? '-' : `~$${costUsd.toFixed(2)}`)

/** `12 s`, `3 min 05 s`, `1 h 02 min`. @param {number} ms */
export const durationText = (ms) => {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ${twoDigits(seconds % 60)} s`
  return `${Math.floor(minutes / 60)} h ${twoDigits(minutes % 60)} min`
}

/** @param {number} value */
const twoDigits = (value) => String(value).padStart(2, '0')
