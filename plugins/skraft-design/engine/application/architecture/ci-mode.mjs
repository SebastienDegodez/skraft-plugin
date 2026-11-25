import { createDraftPublication } from '../publish/draft-publication-usecase.mjs'
import { architectureEvents } from './story-briefs.mjs'

/** How a design run is driven: a developer's host asks people natively, CI asks them in the draft (#662). */
export const MODES = Object.freeze(['interactive', 'ci'])

/** The mode the run was started in; interactive for a run that named none. @param {any[]} events */
export const modeOf = (events) => events.find((event) => event.type === 'architecture.scope')?.mode ?? 'interactive'

/**
 * In CI nobody answers in a chat: a run that waits on a person publishes its draft pull request
 * itself, the pending decision in its body, and hands back what the draft answered. An interactive
 * run, or one that does not wait, is handed back as it is.
 * @param {any} deps @param {any} outcome
 */
export const draftInCi = async (deps, outcome) => {
  if (outcome.status !== 'waiting' || outcome.slug === null) return outcome
  if (modeOf(await architectureEvents(deps, outcome.slug)) !== 'ci') return outcome
  return { ...outcome, draft: await createDraftPublication(deps).publish() }
}
