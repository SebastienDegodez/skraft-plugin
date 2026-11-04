import { deriveRun } from '../journal/run-state.mjs'
import { costText, durationText, runReport } from './run-report.mjs'
import { finalGates } from './run-facts.mjs'
import { statusIn } from './run-status.mjs'
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

/**
 * The journal events that tell a transition was kept on the issue, or could not be: the only
 * events that carry `event`, the index of the transition they tell.
 */
export const COMMENTED = 'issue.commented'
export const SKIPPED = 'issue.comment-skipped'

/**
 * What a journal event tells the issue, if anything: a phase the run closed (not one it found
 * closed, started from artifacts), a review that sent the work back, the run's end. A review's
 * phase is its step's: the last step started before it records.
 * @typedef {(event: RunEvent, earlier: RunEvent[]) => Omit<Transition, 'event'> | null} Tell
 */
const TRANSITIONS = Object.freeze(/** @type {Record<string, Tell | null>} */ ({
  __proto__: null,
  'phase.closed': (event) => (event.skipped ? null : { kind: 'phase', phase: event.phase, step: null }),
  'step.recorded': (event, earlier) => (event.outcome === 'needs-rework'
    ? { kind: 'rework', phase: /** @type {RunEvent} */ (earlier.findLast((one) => one.type === 'step.started')).phase, step: event.step }
    : null),
  'run.finished': () => ({ kind: 'summary', phase: null, step: null }),
}))

/**
 * The transitions of the journal not kept on the issue yet, in journal order.
 * @param {RunEvent[]} events @returns {Transition[]}
 */
export const pendingTransitions = (events) => {
  const told = new Set(events.map((event) => event.event))
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

/** What the comment says, per language. */
const WORDS = Object.freeze({
  en: Object.freeze({
    /** @param {string} status */
    ended: (status) => `run ${status}`,
    /** @param {string} phase */
    closed: (phase) => `${phase} closed`,
    /** @param {string} step */
    rework: (step) => `${step} asked for rework`,
    stopped: 'stopped here',
    going: 'in progress',
    /** @param {string} phase */
    next: (phase) => `Next: ${phase}.`,
    end: 'the end of the workflow',
    noReview: 'Reviews: none yet.',
    reviews: 'Reviews: ',
    /** @param {number} visits */
    passes: (visits) => (visits === 1 ? '1 pass' : `${visits} passes`),
    noGate: 'Quality gates: none ran.',
    gates: 'Quality gates:',
    /** @param {number} survivors */
    survivors: (survivors) => `, ${survivors} surviving mutants`,
    noPullRequest: 'Pull request: none opened or updated by this run.',
    pullRequest: 'Pull request: ',
    updated: ' (updated)',
    /** @param {{ attempts: number, retries: number, duration: string, cost: string }} totals */
    total: ({ attempts, retries, duration, cost }) => `Total: ${attempts} attempts, ${retries} retries, ${duration}, cost ${cost}`,
    approximate: '(approximate: what the Claude Code session cost while each agent ran, anything else exchanged meanwhile included)',
    /** @param {string} slug */
    evidence: (slug) => `Run report and evidence: in the working copy, under the run's tracking folder (slug ${slug}).`,
    steps: 'Steps',
    header: '| Phase | Step | Visits | Attempts | Retries | Time | Cost | Outcome |',
  }),
  fr: Object.freeze({
    ended: (status) => `run ${status}`,
    closed: (phase) => `${phase} terminée`,
    rework: (step) => `${step} demande une reprise`,
    stopped: 'arrêté ici',
    going: 'en cours',
    next: (phase) => `Suite : ${phase}.`,
    end: 'la fin du workflow',
    noReview: 'Revues : aucune pour l\'instant.',
    reviews: 'Revues : ',
    passes: (visits) => (visits === 1 ? '1 passe' : `${visits} passes`),
    noGate: 'Portes de qualité : aucune n\'a tourné.',
    gates: 'Portes de qualité :',
    survivors: (survivors) => `, ${survivors} mutants survivants`,
    noPullRequest: 'Pull request : aucune ouverte ni mise à jour par ce run.',
    pullRequest: 'Pull request : ',
    updated: ' (mise à jour)',
    total: ({ attempts, retries, duration, cost }) => `Total : ${attempts} tentatives, ${retries} reprises, ${duration}, coût ${cost}`,
    approximate: '(approximatif : ce que la session Claude Code a coûté pendant que chaque agent tournait, tout autre échange de cette session inclus)',
    evidence: (slug) => `Rapport du run et preuves : dans la copie de travail, sous le dossier de suivi du run (slug ${slug}).`,
    steps: 'Étapes',
    header: '| Phase | Étape | Visites | Tentatives | Reprises | Durée | Coût | Résultat |',
  }),
})

/** @typedef {typeof WORDS.en} Words */
/** @typedef {{ slug: string, phases: string[], events: RunEvent[], language: import('./language.mjs').Language }} ProgressRun */

/**
 * The comment, from the journal, headed by the last transition it tells, in the story's language.
 * @param {ProgressRun} progress phases: the workflow's, in order
 * @param {Transition} transition @returns {string}
 */
export const renderProgress = ({ slug, phases, events, language }, transition) => {
  const told = { run: deriveRun(events), words: WORDS[language], language }
  const report = runReport(events)
  return [...headLines(slug, told, transition), ...phases.map((phase) => phaseItem(told, phase)), '', ...nextLine(told, phases), ...factLines(slug, { events, report, words: told.words }), ...stepsDetails(report.steps, told.words)].join('\n')
}

/** @typedef {{ run: RunState, words: Words, language: import('./language.mjs').Language }} Told */

/** The marker, the heading named after the transition, and the status line once the run ended. @param {string} slug @param {Told} told @param {Transition} transition */
const headLines = (slug, told, transition) => [
  markerOf(slug),
  `### skraft · ${slug} — ${headingOf(told, transition)}`,
  '',
  ...(told.run.finished ? [endLine(told), ''] : []),
]

/** What the heading names: the run's end, a phase closed or a review that asked for rework. @param {Told} told @param {Transition} transition */
const headingOf = ({ run, words, language }, { kind, phase, step }) => {
  if (kind === 'summary') return words.ended(statusIn(run, language))
  return kind === 'phase' ? words.closed(/** @type {string} */ (phase)) : words.rework(/** @type {string} */ (step))
}

/**
 * How the run ended, by its status and the code that stopped it: the reason stays in the
 * tracking folder, since it may name paths of the machine or carry what an agent wrote.
 * @param {Told} told
 */
const endLine = ({ run, language }) => {
  const stoppedBy = /** @type {RunEvent} */ (run.finished).code
  return stoppedBy ? `${statusIn(run, language)} (${stoppedBy})` : statusIn(run, language)
}

/**
 * The reviews, the gates, the pull request, the totals and where the evidence is, a blank line apart.
 * @param {string} slug @param {{ events: RunEvent[], report: import('./run-report.mjs').RunReport, words: Words }} facts
 */
const factLines = (slug, { events, report, words }) => [
  reviewsLine(events, report.steps, words), '',
  ...gatesLines(events, words), '',
  pullRequestLine(events, words), '',
  totalLine(report.totals, words), '',
  words.evidence(code(slug)), '',
]

/**
 * A phase checked once closed; one started and not closed is in progress, or where the run
 * stopped once it ended. @param {Told} told @param {string} phase
 */
const phaseItem = ({ run, words }, phase) => {
  if (run.closed.includes(phase)) return `- [x] ${phase}`
  if (!(phase in run.phaseStarted)) return `- [ ] ${phase}`
  return `- [ ] ${phase} — ${run.finished ? words.stopped : words.going}`
}

/** The phase that comes next while the run goes on. @param {Told} told @param {string[]} phases */
const nextLine = ({ run, words }, phases) => {
  if (run.finished) return []
  const next = phases.find((phase) => !run.closed.includes(phase))
  return [words.next(next ?? words.end), '']
}

/**
 * Where each review stands: its last verdict and how many passes it took. A review is a step a
 * lens reported on. @param {RunEvent[]} events @param {StepReport[]} steps @param {Words} words
 */
const reviewsLine = (events, steps, words) => {
  const reviewed = new Set(events.filter((event) => event.type === 'review.lens').map((event) => event.step))
  const reviews = steps.filter((step) => reviewed.has(step.step))
  if (reviews.length === 0) return words.noReview
  return `${words.reviews}${reviews.map(({ step, visits, outcome }) => `${step} ${outcome} (${words.passes(visits)})`).join(', ')}.`
}

/** The last result of each gate, its surviving mutants for a mutation gate that counted them, and the log that proves it. @param {RunEvent[]} events @param {Words} words */
const gatesLines = (events, words) => {
  const gates = finalGates(events)
  if (gates.length === 0) return [words.noGate]
  return [words.gates, ...gates.map(({ component, gate, status, evidence, survivors }) =>
    `- ${component}/${gate} ${status}${typeof survivors === 'number' ? words.survivors(survivors) : ''} · ${code(evidence)}`)]
}

/**
 * The pull request of the run's branch, opened by the run or updated by it; the last one
 * journaled, by its URL alone, which a forge shows as its number.
 * @param {RunEvent[]} events @param {Words} words
 */
const pullRequestLine = (events, words) => {
  const last = events.findLast((event) => event.type === 'pull-request.opened' || event.type === 'pull-request.updated')
  if (last === undefined) return words.noPullRequest
  return `${words.pullRequest}${last.url}${last.type === 'pull-request.updated' ? words.updated : ''}`
}

/** @param {import('./run-report.mjs').ReportTotals} totals @param {Words} words */
const totalLine = ({ attempts, retries, durationMs, costUsd }, words) => `${words.total({ attempts, retries, duration: durationText(durationMs), cost: costText(costUsd) })}${costUsd === null ? '' : ` ${words.approximate}`}.`

/** Every step of the run, folded. @param {StepReport[]} steps @param {Words} words */
const stepsDetails = (steps, words) => [
  `<details><summary>${words.steps}</summary>`,
  '',
  words.header,
  '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ...steps.map(({ phase, step, visits, attempts, retries, durationMs, costUsd, outcome }) =>
    `| ${cell(phase)} | ${cell(step)} | ${visits} | ${attempts} | ${retries} | ${durationText(durationMs)} | ${costText(costUsd)} | ${outcome} |`),
  '',
  '</details>',
  '',
]
