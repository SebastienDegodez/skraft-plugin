import { deriveRun } from '../journal/run-state.mjs'
import { costText, durationText, runReport } from './run-report.mjs'
import { finalGates } from './run-facts.mjs'
import { statusLine, statusOf } from './run-status.mjs'
import { inert, oneLine } from './markdown-safety.mjs'

/**
 * The progress of a run told on the issue of its story: one comment per phase it closes, one
 * summary each time it ends, each rendered from the journal as it stood at that transition.
 *
 * @typedef {import('../journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {import('../journal/run-state.mjs').RunState} RunState
 * @typedef {{ kind: 'phase' | 'summary', phase: string | null, event: number }} Transition
 *   event: the index in the journal of the phase.closed or run.finished it tells.
 */

/** The folder of the tracking folder that keeps each comment's body. */
export const ISSUE_PROGRESS_FOLDER = 'issue-progress'

/** The journal events that tell a transition was commented, or could not be. */
export const COMMENTED = 'issue.commented'
export const SKIPPED = 'issue.comment-skipped'

/** @type {Readonly<Record<string, Transition['kind']>>} */
const TRANSITIONS = Object.freeze({ __proto__: null, 'phase.closed': 'phase', 'run.finished': 'summary' })

/** @param {RunEvent} event */
const isProgress = (event) => event.type === COMMENTED || event.type === SKIPPED

/**
 * The transitions of the journal no comment told yet, in journal order.
 * @param {RunEvent[]} events @returns {Transition[]}
 */
export const pendingTransitions = (events) => {
  const told = new Set(events.filter(isProgress).map((event) => event.event))
  return events.flatMap((event, index) => {
    const kind = TRANSITIONS[event.type]
    return kind === undefined || told.has(index) ? [] : [{ kind, phase: event.phase ?? null, event: index }]
  })
}

/**
 * Where the body of the next comment is kept: its rank among the run's comments, then what it tells.
 * @param {RunEvent[]} events @param {Transition} transition
 */
export const bodyPath = (events, { phase }) => `${ISSUE_PROGRESS_FOLDER}/${events.filter(isProgress).length + 1}-${phase ?? 'summary'}.md`

/** What a transition is called in a line the developer reads. @param {Transition} transition */
export const transitionName = ({ phase }) => (phase === null ? 'summary' : `${phase} closed`)

/**
 * The comment of a transition, from the journal up to it.
 * @param {{ slug: string, phases: string[], events: RunEvent[] }} run phases: the workflow's, in order
 * @param {Transition} transition @returns {string}
 */
export const renderTransition = ({ slug, phases, events }, transition) => {
  const upTo = events.slice(0, transition.event + 1)
  const lines = transition.phase === null ? summaryLines(slug, phases, upTo) : phaseLines(slug, phases, upTo, transition.phase)
  return `${lines.join('\n')}\n`
}

/** @param {string} slug @param {string[]} phases @param {RunEvent[]} events @param {string} phase */
const phaseLines = (slug, phases, events, phase) => [
  `### skraft · ${slug} — ${phase} closed`,
  '',
  '| Step | Visits | Attempts | Retries | Time | Cost | Outcome |',
  '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ...runReport(events).steps.filter((step) => step.phase === phase).map(stepRow),
  '',
  `Next: ${phases[phases.indexOf(phase) + 1] ?? 'the end of the workflow'}.`,
]

/** @param {import('./run-report.mjs').StepReport} step */
const stepRow = ({ step, visits, attempts, retries, durationMs, costUsd, outcome }) =>
  `| ${step} | ${visits} | ${attempts} | ${retries} | ${durationText(durationMs)} | ${costText(costUsd)} | ${outcome ?? 'in progress'} |`

/** @param {string} slug @param {string[]} phases @param {RunEvent[]} events */
const summaryLines = (slug, phases, events) => {
  const run = deriveRun(events)
  return [
    `### skraft · ${slug} — run ${statusOf(run)}`,
    '',
    inert(oneLine(statusLine(run))),
    '',
    ...phases.map((phase) => phaseItem(run, phase)),
    '',
    ...factLines(events),
  ]
}

/** The pull request, the gates and the totals, a blank line apart. @param {RunEvent[]} events */
const factLines = (events) => [pullRequestLine(events), '', gatesLine(events), '', totalLine(events)]

/** A phase checked once closed; one started and not closed is where the run stopped. @param {RunState} run @param {string} phase */
const phaseItem = (run, phase) => {
  if (run.closed.includes(phase)) return `- [x] ${phase}`
  return phase in run.phaseStarted ? `- [ ] ${phase} — stopped here` : `- [ ] ${phase}`
}

/** @param {RunEvent[]} events */
const pullRequestLine = (events) => {
  const last = events.findLast((event) => event.type === 'pull-request.opened' || event.type === 'pull-request.updated')
  return last === undefined ? 'Pull request: none opened by this run.' : `Pull request: #${last.number} ${last.url}`
}

/** @param {RunEvent[]} events */
const gatesLine = (events) => {
  const gates = finalGates(events)
  return gates.length === 0 ? 'Quality gates: none ran.' : `Quality gates: ${gates.map(({ component, gate, status }) => `${component}/${gate} ${status}`).join(', ')}.`
}

/** @param {RunEvent[]} events */
const totalLine = (events) => {
  const { attempts, retries, durationMs, costUsd } = runReport(events).totals
  return `Total: ${attempts} attempts, ${retries} retries, ${durationText(durationMs)}, cost ${costText(costUsd)}.`
}
