import { createDraftPublication } from '../publish/draft-publication-usecase.mjs'
import { askOnIssue, markAnswered } from './ask-on-issue.mjs'
import { openActiveRun } from '../pipeline/active-run.mjs'
import { deriveRun } from '../../domain/journal/run-state.mjs'
import { waitingOn } from '../../domain/reporting/run-status.mjs'

/** How a run is driven: a developer's host asks people natively, CI asks them in comments (#662). */
export const MODES = Object.freeze(['interactive', 'ci'])

/**
 * The mode the run was started in, as a design run's scope or a delivery's run.mode says it;
 * interactive for a run that named none. @param {any[]} events
 */
export const modeOf = (events) => events.find((event) => event.type === 'architecture.scope' || event.type === 'run.mode')?.mode ?? 'interactive'

/** The run's events, as its journal holds them. @param {any} deps @param {string} slug */
const eventsOf = async (deps, slug) => (await deps.journal.lines(slug)).map((line) => JSON.parse(line))

/**
 * In CI nobody answers in a chat. Each question a person answered since gets its comment marked
 * answered, whatever the run does next. A run that waits on a person publishes its draft pull
 * request itself, the pending decision in its body, and asks it in a comment of its own there;
 * while nothing is designed yet, it asks in a comment on its issue. It hands back what that
 * answered (`draft.on`: where the question's comment is). An interactive run is handed back as it is.
 * @param {any} deps @param {any} outcome
 */
export const draftInCi = async (deps, outcome) => {
  if (outcome.slug === null || outcome.slug === undefined) return outcome
  const events = await eventsOf(deps, outcome.slug)
  if (modeOf(events) !== 'ci') return outcome
  await markAnswered(deps, outcome.slug)
  if (outcome.status !== 'waiting') return outcome
  // The question as the run holds it: an agent's block hands back no question in its outcome.
  const asked = { slug: outcome.slug, question: waitingOn(deriveRun(events)) }
  return { ...outcome, draft: (await designed(deps, events)) ? await createDraftPublication(deps).publish() : await askOnIssue(deps, asked) }
}

/**
 * Whether the run's branch holds a commit past its base: GitHub opens no pull request without one,
 * so a question asked before anything is designed goes to the issue instead.
 * @param {any} deps @param {any[]} events
 */
const designed = async (deps, events) => {
  const base = deriveRun(events).base.find(({ component }) => component === null)
  return base === undefined || (await deps.sourceControl.head('.')) !== base.sha
}

/** The events that put a question in front of people: a draft opened or updated after it was asked, or its issue comment. */
const PUBLISHING = Object.freeze(['pull-request.opened', 'pull-request.updated'])

/** @param {any[]} events @param {string} key */
const published = (events, key) => {
  const asked = events.findLast((event) => event.type === 'question.asked' && event.key === key)?.at ?? ''
  return events.some((event) => (event.type === 'architecture.question-posted' && event.key === key) || (PUBLISHING.includes(event.type) && event.at >= asked))
}

/**
 * What a CI job ends on: a run that waits on a question nobody can read fails the job, so the
 * question is not lost while the job reads as passed; a finished run or one waiting on a
 * published question passes it (#662).
 * @param {any} deps
 */
export const checkInCi = async (deps) => {
  const opened = await openActiveRun(deps, null)
  if (!opened.ok) return { ok: false, code: opened.outcome.code, reason: opened.outcome.reason }
  const run = deriveRun(opened.journal.events)
  const question = waitingOn(run)
  if (question === null && run.finished) return { ok: true, code: null, reason: 'the run is finished' }
  if (question === null) return { ok: false, code: 'run-incomplete', reason: 'the run is unfinished and has no published question' }
  if (published(opened.journal.events, question.key)) return { ok: true, code: null, reason: 'the question the run waits on is published' }
  return { ok: false, code: 'question-unpublished', reason: `the run waits on ${question.key}, which neither a draft nor an issue comment holds: publish it again (skraft_design_draft)` }
}
