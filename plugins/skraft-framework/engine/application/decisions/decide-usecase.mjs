import { readAnswer } from '../../domain/decisions/questions.mjs'
import { deriveRun } from '../../domain/journal/run-state.mjs'
import { openActiveRun } from '../pipeline/active-run.mjs'
import { JournalConflict } from '../journal/run-journal.mjs'

/**
 * @typedef {import('../../domain/journal/run-state.mjs').RunState} RunState
 * @typedef {import('../../domain/journal/run-state.mjs').AskedQuestion} AskedQuestion
 * @typedef {{ slug?: string | null, key?: string | null, answer: unknown, reason?: unknown, by?: 'decide' | 'cli-tty' }} Decision
 *   key: the question's; the run's open question when absent. by: how the person gave it,
 *   journaled as is: `cli-tty` when they confirmed it at an interactive terminal prompt,
 *   `decide` (the default) for a command whose caller the driver cannot tell.
 * @typedef {{ ok: boolean, slug: string | null, key: string | null, code: string | null, reason: string }} DecideOutcome
 * @typedef {Parameters<typeof openActiveRun>[0]} DecideDeps
 */

/**
 * Decide — records a human's answer to the question the active pipeline waits on. It runs
 * nothing: the next run acts on the answer.
 * @param {DecideDeps} deps
 */
export const createDecide = (deps) => Object.freeze({
  /** @param {Decision} decision @returns {Promise<DecideOutcome>} */
  decide: (decision) => decide(deps, decision),
})

/** @param {DecideDeps} deps @param {Decision} decision @returns {Promise<DecideOutcome>} */
const decide = async (deps, decision) => {
  const opened = await openActiveRun(deps, decision.slug)
  if (!opened.ok) return refused(opened.outcome.slug, null, opened.outcome.code ?? 'refused', opened.outcome.reason)
  const { slug, journal } = opened
  const found = questionFor(deriveRun(journal.events), decision.key ?? null)
  if (!found.ok) return refused(slug, decision.key ?? null, found.code, found.reason)
  const reading = readAnswer(found.question, decision)
  if (!reading.ok) return refused(slug, found.question.key, 'invalid-answer', reading.reason)
  return record(journal, slug, found.question, { ...reading, by: decision.by ?? 'decide' })
}

/**
 * @param {import('../journal/run-journal.mjs').OpenJournal} journal @param {string} slug @param {AskedQuestion} question
 * @param {{ answer: string, reason: string | null, by: string }} reading
 * @returns {Promise<DecideOutcome>}
 */
const record = async (journal, slug, { key }, { answer, reason, by }) => {
  try {
    await journal.append('question.answered', { key, answer, reason, by })
  } catch (error) {
    if (!(error instanceof JournalConflict)) throw error
    return refused(slug, key, 'journal-changed', error.message)
  }
  return { ok: true, slug, key, code: null, reason: `${slug}: ${key} answered ${answer}; run the pipeline again to go on` }
}

/**
 * The question the decision answers: the one its key names, or the run's open one.
 * @param {RunState} run @param {string | null} key
 * @returns {{ ok: true, question: AskedQuestion } | { ok: false, code: string, reason: string }}
 */
const questionFor = (run, key) => {
  const open = Object.values(run.questions).filter((question) => question.answer === null)
  const question = key === null ? run.question : run.questions[key]
  if (question === undefined || question === null) return { ok: false, code: 'no-question', reason: noQuestion(key, open) }
  if (question.answer !== null) return { ok: false, code: 'already-answered', reason: `${question.key} was already answered ${question.answer}` }
  return { ok: true, question }
}

/** @param {string | null} key @param {AskedQuestion[]} open */
const noQuestion = (key, open) => {
  const waiting = open.length > 0 ? `; waiting: ${open.map((question) => question.key).join(', ')}` : '; no question is waiting'
  return `${key === null ? 'no question to answer' : `no question ${key}`}${waiting}`
}

/** @param {string | null} slug @param {string | null} key @param {string} code @param {string} reason @returns {DecideOutcome} */
const refused = (slug, key, code, reason) => ({ ok: false, slug, key, code, reason })
