import { waitingOn } from './run-status.mjs'

const DRAFTABLE_QUESTIONS = new Set(['architecture-blocked', 'architecture-pass'])

/**
 * Whether the engine permits a draft pull request while a person must decide the next step.
 * @param {import('../journal/run-state.mjs').RunState} run
 */
export const draftPublication = (run) => {
  const question = waitingOn(run)
  const allowed = question !== null && DRAFTABLE_QUESTIONS.has(question.kind)
  return { allowed, reason: allowed ? 'human-decision-pending' : 'no-draftable-human-decision' }
}
