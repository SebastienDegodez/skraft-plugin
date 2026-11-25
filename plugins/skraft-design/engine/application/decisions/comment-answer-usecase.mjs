import { readAnswerComment } from '../../domain/decisions/answer-comment.mjs'
import { createDecide } from './decide-usecase.mjs'
import { loadConfig } from '../config/bases.mjs'
import { forgeAdapters } from '../config/forge.mjs'

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
  return createDecide({ ...deps, confirmation: writerConfirmation(codeHost, author) }).decide({ key: reply.key, answer: reply.answer })
}

/**
 * The confirmation that the reply comes from someone with write access: the forge says so when the
 * reply is read, so a person whose access was withdrawn since cannot answer.
 * @param {{ permissionOf: (login: string) => Promise<string | null> }} codeHost @param {string} author
 */
const writerConfirmation = (codeHost, author) => ({
  by: 'pr-comment',
  confirm: async () => writerCheck(author, await codeHost.permissionOf(author)),
})

/** @param {string} author @param {string | null} permission */
const writerCheck = (author, permission) => {
  if (permission === null) return { ok: false, code: 'writer-unverifiable', reason: `the forge cannot tell whether ${author} has write access, so the reply is not recorded` }
  return WRITERS.includes(permission) ? { ok: true } : { ok: false, code: 'not-a-writer', reason: `${author} has no write access to the repository, so the reply is not recorded` }
}
