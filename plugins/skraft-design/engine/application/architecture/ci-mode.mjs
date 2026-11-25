import { createDraftPublication } from '../publish/draft-publication-usecase.mjs'
import { architectureEvents } from './story-briefs.mjs'
import { askOnIssue } from './ask-on-issue.mjs'
import { deriveRun } from '../../domain/journal/run-state.mjs'

/** How a design run is driven: a developer's host asks people natively, CI asks them in the draft (#662). */
export const MODES = Object.freeze(['interactive', 'ci'])

/** The mode the run was started in; interactive for a run that named none. @param {any[]} events */
export const modeOf = (events) => events.find((event) => event.type === 'architecture.scope')?.mode ?? 'interactive'

/**
 * In CI nobody answers in a chat: a run that waits on a person publishes its draft pull request
 * itself, the pending decision in its body, or, while nothing is designed yet, asks on its issue;
 * it hands back what that answered (`draft.on`: the issue when it asked there). An interactive
 * run, or one that does not wait, is handed back as it is.
 * @param {any} deps @param {any} outcome
 */
export const draftInCi = async (deps, outcome) => {
  if (outcome.status !== 'waiting' || outcome.slug === null) return outcome
  const events = await architectureEvents(deps, outcome.slug)
  if (modeOf(events) !== 'ci') return outcome
  const draft = (await designed(deps, events)) ? await createDraftPublication(deps).publish() : await askOnIssue(deps, outcome)
  return { ...outcome, draft }
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
