import { deriveRun } from '../journal/run-state.mjs'
import { costText, durationText, runReport } from './run-report.mjs'
import { finalGates } from './run-facts.mjs'
import { statusOf } from './run-status.mjs'
import { cell, code } from './markdown-safety.mjs'

/**
 * The progress of a run kept on the issue of its story: one comment, found again by its marker,
 * rewritten from the journal at each transition the run makes — a phase it closes, a review that
 * sends the work back, its end. Rewriting a comment notifies nobody; only its first post does.
 *
 * @typedef {import('../journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {import('../journal/run-state.mjs').RunState} RunState
 * @typedef {import('./run-report.mjs').StepReport} StepReport
 * @typedef {{ kind: 'phase' | 'rework' | 'summary', phase: string | null, step: string | null, event: number }} Transition
 *   phase: the phase closed, or of the review that sent the work back; null for the summary.
 *   step: the review that sent the work back, null otherwise. event: the index in the journal of
 *   the phase.closed, step.recorded or run.finished it tells.
 */

/** The file of the tracking folder that keeps the comment's last body. */
export const ISSUE_PROGRESS_FILE = 'issue-progress.md'

/** The journal events that tell a transition was kept on the issue, or could not be. */
export const COMMENTED = 'issue.commented'
export const SKIPPED = 'issue.comment-skipped'

/** @param {RunEvent} event */
const isProgress = (event) => event.type === COMMENTED || event.type === SKIPPED

/**
 * What a journal event tells the issue, if anything: a phase the run closed (not one it found
 * closed, started from artifacts), a review that sent the work back, the run's end. A review's
 * phase is its step's: the last step started before it records.
 * @type {Readonly<Record<string, (event: RunEvent, earlier: RunEvent[]) => Omit<Transition, 'event'> | null>>}
 */
const TRANSITIONS = Object.freeze({
  __proto__: null,
  'phase.closed': (event) => (event.skipped ? null : { kind: 'phase', phase: event.phase, step: null }),
  'step.recorded': (event, earlier) => (event.outcome === 'needs-rework'
    ? { kind: 'rework', phase: /** @type {RunEvent} */ (earlier.findLast((one) => one.type === 'step.started')).phase, step: event.step }
    : null),
  'run.finished': () => ({ kind: 'summary', phase: null, step: null }),
})

/**
 * The transitions of the journal not kept on the issue yet, in journal order.
 * @param {RunEvent[]} events @returns {Transition[]}
 */
export const pendingTransitions = (events) => {
  const told = new Set(events.filter(isProgress).map((event) => event.event))
  return events.flatMap((event, index) => {
    const transition = told.has(index) ? null : TRANSITIONS[event.type]?.(event, events.slice(0, index)) ?? null
    return transition === null ? [] : [{ ...transition, event: index }]
  })
}

/** The URL of the comment the run keeps on its issue, as last journaled; null before its first post. @param {RunEvent[]} events */
export const keptComment = (events) => events.findLast((event) => event.type === COMMENTED)?.url ?? null

/** The hidden line that lets the run find its comment again, on any machine. @param {string} slug */
export const markerOf = (slug) => `<!-- skraft:issue-progress slug=${slug} -->`

/** What a transition is called in a line the developer reads. @param {Transition} transition */
export const transitionName = ({ kind, phase, step }) => {
  if (kind === 'summary') return 'summary'
  return kind === 'phase' ? `${phase} closed` : `${step} asked for rework`
}

/**
 * The comment, from the journal, headed by the last transition it tells.
 * @param {{ slug: string, phases: string[], events: RunEvent[] }} run phases: the workflow's, in order
 * @param {Transition} transition @returns {string}
 */
export const renderProgress = ({ slug, phases, events }, transition) => {
  const run = deriveRun(events)
  const report = runReport(events)
  return [...headLines(slug, run, transition), ...phases.map((phase) => phaseItem(run, phase)), '', ...nextLine(run, phases), ...factLines(slug, events, report), ...stepsDetails(report.steps)].join('\n')
}

/** The marker, the heading named after the transition, and the status line once the run ended. @param {string} slug @param {RunState} run @param {Transition} transition */
const headLines = (slug, run, transition) => [
  markerOf(slug),
  `### skraft · ${slug} — ${transition.kind === 'summary' ? `run ${statusOf(run)}` : transitionName(transition)}`,
  '',
  ...(run.finished ? [endLine(run), ''] : []),
]

/**
 * How the run ended, by its status and the code that stopped it: the reason stays in the
 * tracking folder, since it may name paths of the machine or carry what an agent wrote.
 * @param {RunState} run
 */
const endLine = (run) => {
  const stoppedBy = /** @type {RunEvent} */ (run.finished).code
  return stoppedBy ? `${statusOf(run)} (${stoppedBy})` : statusOf(run)
}

/** The reviews, the gates, the pull request, the totals and where the evidence is, a blank line apart. @param {string} slug @param {RunEvent[]} events @param {import('./run-report.mjs').RunReport} report */
const factLines = (slug, events, report) => [
  reviewsLine(events, report.steps), '',
  ...gatesLines(events), '',
  pullRequestLine(events), '',
  totalLine(report.totals), '',
  `Run report and evidence: ${code(`.copilot-tracking/skraft-plans/${slug}/`)}`, '',
]

/**
 * A phase checked once closed; one started and not closed is in progress, or where the run
 * stopped once it ended. @param {RunState} run @param {string} phase
 */
const phaseItem = (run, phase) => {
  if (run.closed.includes(phase)) return `- [x] ${phase}`
  if (!(phase in run.phaseStarted)) return `- [ ] ${phase}`
  return `- [ ] ${phase} — ${run.finished ? 'stopped here' : 'in progress'}`
}

/** The phase that comes next while the run goes on. @param {RunState} run @param {string[]} phases */
const nextLine = (run, phases) => {
  if (run.finished) return []
  const next = phases.find((phase) => !run.closed.includes(phase))
  return [`Next: ${next ?? 'the end of the workflow'}.`, '']
}

/**
 * Where each review stands: its last verdict and how many passes it took. A review is a step a
 * lens reported on. @param {RunEvent[]} events @param {StepReport[]} steps
 */
const reviewsLine = (events, steps) => {
  const reviewed = new Set(events.filter((event) => event.type === 'review.lens').map((event) => event.step))
  const reviews = steps.filter((step) => reviewed.has(step.step))
  if (reviews.length === 0) return 'Reviews: none yet.'
  return `Reviews: ${reviews.map(({ step, visits, outcome }) => `${step} ${outcome} (${visits === 1 ? '1 pass' : `${visits} passes`})`).join(', ')}.`
}

/** The last result of each gate, its surviving mutants for a mutation gate that counted them, and the log that proves it. @param {RunEvent[]} events */
const gatesLines = (events) => {
  const gates = finalGates(events)
  if (gates.length === 0) return ['Quality gates: none ran.']
  return ['Quality gates:', ...gates.map(({ component, gate, status, evidence, survivors }) =>
    `- ${component}/${gate} ${status}${typeof survivors === 'number' ? `, ${survivors} surviving mutants` : ''} · ${code(evidence)}`)]
}

/**
 * The pull request of the run's branch, opened by the run or updated by it; the last one
 * journaled. @param {RunEvent[]} events
 */
const pullRequestLine = (events) => {
  const last = events.findLast((event) => event.type === 'pull-request.opened' || event.type === 'pull-request.updated')
  if (last === undefined) return 'Pull request: none opened or updated by this run.'
  return `Pull request: #${last.number} ${last.url}${last.type === 'pull-request.updated' ? ' (updated)' : ''}`
}

/** @param {import('./run-report.mjs').ReportTotals} totals */
const totalLine = ({ attempts, retries, durationMs, costUsd }) => `Total: ${attempts} attempts, ${retries} retries, ${durationText(durationMs)}, cost ${costText(costUsd)}.`

/** Every step of the run, folded. @param {StepReport[]} steps */
const stepsDetails = (steps) => [
  '<details><summary>Steps</summary>',
  '',
  '| Phase | Step | Visits | Attempts | Retries | Time | Cost | Outcome |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ...steps.map(({ phase, step, visits, attempts, retries, durationMs, costUsd, outcome }) =>
    `| ${cell(phase)} | ${cell(step)} | ${visits} | ${attempts} | ${retries} | ${durationText(durationMs)} | ${costText(costUsd)} | ${outcome} |`),
  '',
  '</details>',
  '',
]
