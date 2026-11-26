import { readAnswerComment } from '../../domain/decisions/answer-comment.mjs'
import { createDecide } from './decide-usecase.mjs'
import { loadConfig } from '../config/bases.mjs'
import { forgeAdapters } from '../config/forge.mjs'
import { openActiveRun } from '../pipeline/active-run.mjs'
import { deriveRun } from '../../domain/journal/run-state.mjs'

/** The access a person needs to answer for the repository. */
const WRITERS = Object.freeze(['admin', 'maintain', 'write'])

/**
 * Comment answer — records a `/skraft-answer` reply a CI workflow read in the draft pull request,
 * without a model: the comment is a reply, its author has write access to the repository as the
 * forge answers it, and the reply answers the pending question as `decide` reads it. Anything else
 * records nothing (#662).
 * @param {any} deps
 */
export const createCommentAnswer = (deps) => Object.freeze({
  /** @param {{ body: unknown, author: string }} request */
  answer: (request) => answerComment(deps, request),
})

/** @param {any} deps @param {{ body: unknown, author: string }} request */
const answerComment = async (deps, { body, author }) => {
  const reply = readAnswerComment(body)
  if (!reply.ok) return { ok: false, slug: null, key: null, code: 'not-an-answer', reason: reply.reason }
  const loaded = await loadConfig(deps)
  if (!loaded.ok) return { ok: false, slug: null, key: reply.key, code: 'config-invalid', reason: loaded.reason }
  const { codeHost } = await forgeAdapters(deps, loaded.config.forge)
  const confirmation = writerConfirmation(codeHost, author)
  const decided = await createDecide({ ...deps, confirmation }).decide(await withReason(deps, reply))
  // Only prose goes to the interpreter: a reply whose lines each name a question is read as written.
  return decided.code === 'invalid-answer' && typeof reply.answer === 'string' ? keptForInterpretation(deps, confirmation, { decided, author, body }) : decided
}

/**
 * A refusal and its reason in one reply: `REVISE`, then the person's corrections on its line or the
 * next ones, when the question it answers takes REVISE with a reason; any other reply as it reads.
 * @param {any} deps @param {{ key: string | null, answer: unknown, reason?: string }} reply
 */
const withReason = async (deps, { key, answer, reason }) => {
  const decision = { key, answer, ...(reason === undefined ? {} : { reason }) }
  if (typeof answer !== 'string' || reason !== undefined) return decision
  const question = await answeredQuestion(deps, key)
  const [first, ...rest] = answer.trim().split(/\s+/)
  const option = first.replace(/[:.,;-]+$/, '').toUpperCase()
  return question?.refusals?.includes(option) && rest.length > 0 ? { key, answer: option, reason: rest.join(' ') } : decision
}

/** The question a reply answers: the one its key names, else the one the run waits on. @param {any} deps @param {string | null} key */
const answeredQuestion = async (deps, key) => {
  const opened = await openActiveRun(deps, null)
  if (!opened.ok) return null
  const run = deriveRun(opened.journal.events)
  return key === null ? run.question : run.questions[key] ?? null
}

/** The most of a reply kept for its interpreter. */
const REPLY_LIMIT = 4000

/**
 * A reply to the architect's open questions that no line names an answer in: kept, once its author
 * has write access, for the interpreter the run dispatches when it resumes (#662 stage 2); a reply
 * to any other question is refused as decide read it.
 * @param {any} deps @param {{ confirm: () => Promise<any> }} confirmation
 * @param {{ decided: { key: string | null }, author: string, body: unknown }} received
 */
const keptForInterpretation = async (deps, confirmation, { decided, author, body }) => {
  const opened = await openActiveRun(deps, null)
  const question = opened.ok ? openQuestionsOf(opened.journal, decided.key) : null
  if (question === null) return decided
  const confirmed = await confirmation.confirm()
  if (!confirmed.ok) return { ok: false, slug: opened.slug, key: question.key, code: confirmed.code, reason: confirmed.reason }
  await opened.journal.append('reply.received', { key: question.key, author, text: String(body).slice(0, REPLY_LIMIT) })
  return { ok: true, slug: opened.slug, key: question.key, code: 'reply-to-interpret', reason: `${question.key}: the interpreter reads the reply when the run resumes` }
}

/** The architect's open questions the reply is for, null when the run waits on another kind. @param {any} journal @param {string | null} key */
const openQuestionsOf = (journal, key) => {
  const run = deriveRun(journal.events)
  const question = key === null ? run.question : run.questions[key]
  return question?.kind === 'architecture-questions' && question.answer === null ? question : null
}

/**
 * The confirmation that the reply comes from someone with write access: the forge says so when the
 * reply is read, so a person whose access was withdrawn since cannot answer.
 * @param {{ permissionOf: (login: string) => Promise<string | null> }} codeHost @param {string} author
 */
const writerConfirmation = (codeHost, author) => ({
  by: 'pr-comment',
  author,
  confirm: async () => writerCheck(author, await codeHost.permissionOf(author)),
})

/** @param {string} author @param {string | null} permission */
const writerCheck = (author, permission) => {
  if (permission === null) return { ok: false, code: 'writer-unverifiable', reason: `the forge cannot tell whether ${author} has write access, so the reply is not recorded` }
  return WRITERS.includes(permission) ? { ok: true } : { ok: false, code: 'not-a-writer', reason: `${author} has no write access to the repository, so the reply is not recorded` }
}
