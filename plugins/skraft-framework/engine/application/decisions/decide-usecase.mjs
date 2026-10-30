import { readAnswer, takesInstruction } from '../../domain/decisions/questions.mjs'
import { HUMAN_PROVENANCES, deriveRun } from '../../domain/journal/run-state.mjs'
import { openActiveRun } from '../pipeline/active-run.mjs'
import { JournalConflict } from '../journal/run-journal.mjs'

/**
 * @typedef {import('../../domain/journal/run-state.mjs').RunState} RunState
 * @typedef {import('../../domain/journal/run-state.mjs').AskedQuestion} AskedQuestion
 * @typedef {{ slug?: string | null, key?: string | null, answer: unknown, reason?: unknown }} Decision
 *   key: the question's; the run's open question when absent.
 * @typedef {{ ok: boolean, slug: string | null, key: string | null, code: string | null, reason: string }} DecideOutcome
 * @typedef {import('../ports/decision-confirmation.mjs').DecisionConfirmation} DecisionConfirmation
 * @typedef {Parameters<typeof openActiveRun>[0] & { confirmation?: DecisionConfirmation }} DecideDeps
 *   confirmation: how the host knows a person gave the answer; a typed `skraft decide` without one.
 */

const UNKNOWN_PROVENANCE = 'this host records decisions under a provenance the engine does not take from a person; nothing was recorded'

/** A decision typed in a terminal: the person typed it, nothing more to ask. @type {DecisionConfirmation} */
const TYPED = Object.freeze({ by: 'decide', confirm: async () => /** @type {const} */ ({ ok: true }) })

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
  return confirmThenRecord(deps.confirmation ?? TYPED, journal, slug, found.question, reading)
}

/**
 * An answer the question takes is recorded once the host confirms it came from a person.
 * @param {DecisionConfirmation} confirmation @param {import('../journal/run-journal.mjs').OpenJournal} journal
 * @param {string} slug @param {AskedQuestion} question @param {{ answer: string, reason: string | null }} reading
 * @returns {Promise<DecideOutcome>}
 */
const confirmThenRecord = async (confirmation, journal, slug, question, reading) => {
  if (!HUMAN_PROVENANCES.includes(confirmation.by)) return refused(slug, question.key, 'unknown-provenance', UNKNOWN_PROVENANCE)
  const confirmed = await confirmation.confirm({ slug, key: question.key, answer: reading.answer })
  if (!confirmed.ok) return refused(slug, question.key, confirmed.code, confirmed.reason)
  return record(journal, slug, question, { ...reading, by: confirmation.by })
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
  if (question.answer !== null) return { ok: false, code: 'already-answered', reason: alreadyAnswered(question) }
  return { ok: true, question }
}

/**
 * Why an answered question takes no other answer: the answer it got, an option, unless the
 * question takes an instruction a person may have written: it is never repeated.
 * @param {AskedQuestion} question
 */
const alreadyAnswered = ({ key, kind, answer }) => (takesInstruction(kind) ? `${key} was already answered` : `${key} was already answered ${answer}`)

/** @param {string | null} key @param {AskedQuestion[]} open */
const noQuestion = (key, open) => {
  const waiting = open.length > 0 ? `; waiting: ${open.map((question) => question.key).join(', ')}` : '; no question is waiting'
  return `${key === null ? 'no question to answer' : 'no question has that key'}${waiting}`
}

/** @param {string | null} slug @param {string | null} key @param {string} code @param {string} reason @returns {DecideOutcome} */
const refused = (slug, key, code, reason) => ({ ok: false, slug, key, code, reason })
