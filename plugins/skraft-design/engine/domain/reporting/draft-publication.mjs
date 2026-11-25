import { waitingOn } from './run-status.mjs'

const DRAFTABLE_QUESTIONS = new Set(['architecture-blocked', 'architecture-pass'])
/** Decisions a developer answers in the chat; only a CI run, which has none, asks them in the draft (#662). */
const CI_DRAFTABLE_QUESTIONS = new Set(['architecture-exclusions', 'architecture-questions'])

/** @param {any} run @param {string} kind */
const draftable = (run, kind) => DRAFTABLE_QUESTIONS.has(kind) || (run.mode === 'ci' && CI_DRAFTABLE_QUESTIONS.has(kind))

/**
 * Whether the engine permits a draft pull request while a person must decide the next step.
 * @param {import('../journal/run-state.mjs').RunState} run
 */
export const draftPublication = (run) => {
  const question = waitingOn(run)
  const allowed = question !== null && draftable(run, question.kind)
  return { allowed, reason: allowed ? 'human-decision-pending' : 'no-draftable-human-decision' }
}
