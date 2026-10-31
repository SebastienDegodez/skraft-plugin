import { CONFIG_FILE, USER_CONFIG_FILE } from '../../domain/config/skraft-config.mjs'
import { reviewConsentOf, withReviewConsent } from '../../domain/decisions/review-consents.mjs'
import { questionKey, questionOf, readAnswer, REVIEW_CONSENT_TEXT } from '../../domain/decisions/questions.mjs'
import { COMMENT_FILE, COMMENT_THREAD_FILE, COMMENT_CONTENT_FILE, markerOf, renderComment } from '../../domain/review/pull-request.mjs'
import { contentRequestOf, threadRequestOf } from '../../domain/review/azure-pull-request.mjs'
import { routeOf } from '../config/mcp-route.mjs'

/**
 * The review's comment: rendered beside the review on every pass, then, with `--publish`, kept as
 * one comment of the pull request, rewritten at each pass, once consented: the repository's
 * skraft-config.json answer (`publish.reviewComment`) when it holds one, else the developer's,
 * asked once per repository and kept in their ~/.skraft/config.json. Nothing is ever written in
 * the working copy; never a review, never a request for changes.
 *
 * @typedef {import('../../domain/review/verdict.mjs').ReviewVerdict} ReviewVerdict
 * @typedef {Pick<import('./review-pull-request-usecase.mjs').OnForge, 'pullRequests' | 'reviewFiles'>} OnForgeFiles
 * @typedef {{
 *   deps: import('./review-pull-request-usecase.mjs').OnForge, slug: string, number: number, publish: boolean,
 *   journal: import('../journal/run-journal.mjs').OpenJournal,
 *   team: unknown,
 * }} CommentContext
 *   team: what the repository's skraft-config.json sets publish.reviewComment to, if anything.
 * @typedef {{ comment: string | null, unpublished: string | null }} Published
 *   comment: the URL of the comment kept; unpublished: why `--publish` posted nothing.
 */

/** The step a consent question is asked at, which keys it. */
const CONSENT_STEP = 'review_consent'

/** @param {CommentContext} context @param {{ pass: number, verdict: ReviewVerdict }} review @returns {Promise<Published>} */
export const keepComment = async (context, review) => {
  const body = renderComment({ number: context.number, ...review })
  await context.deps.reviewFiles.write(context.slug, COMMENT_FILE, body)
  if (!context.publish) return { comment: null, unpublished: null }
  const refusal = await consentRefusal(context)
  const kept = refusal === null ? await posted(context, body) : { ok: /** @type {const} */ (false), reason: refusal }
  await context.journal.append(kept.ok ? 'review.commented' : 'review.comment-skipped', kept.ok ? { pass: review.pass, url: kept.url, ...routeOf(kept) } : { pass: review.pass, reason: unpublishedOf(kept.reason), ...routeOf(kept) })
  return kept.ok ? { comment: kept.url, unpublished: null } : { comment: null, unpublished: unpublishedOf(kept.reason) }
}

/** @param {string} reason */
const unpublishedOf = (reason) => `not published: ${reason}`

/** The comment rewritten, or posted. @param {CommentContext} context @param {string} body */
const posted = async ({ deps, slug, number, journal }, body) => deps.pullRequests.keepComment({
  number, marker: markerOf(number), url: journal.events.findLast((event) => event.type === 'review.commented')?.url ?? null,
  bodyFile: deps.reviewFiles.location(slug, COMMENT_FILE), body, ...(await requestFilesOf(deps, slug, body)),
})

/**
 * The comment as the JSON of a new thread and of the rewrite of a comment, kept beside it, written
 * only for a forge whose client sends one; their paths, else empty ones.
 * @param {OnForgeFiles} deps @param {string} slug @param {string} body
 */
const requestFilesOf = async ({ pullRequests, reviewFiles }, slug, body) => {
  if (!pullRequests.takesRequestFile) return { threadFile: '', contentFile: '' }
  await reviewFiles.write(slug, COMMENT_THREAD_FILE, threadRequestOf(body))
  await reviewFiles.write(slug, COMMENT_CONTENT_FILE, contentRequestOf(body))
  return { threadFile: reviewFiles.location(slug, COMMENT_THREAD_FILE), contentFile: reviewFiles.location(slug, COMMENT_CONTENT_FILE) }
}

/**
 * Why the comment may not be kept, null once consented: the repository's answer, else the
 * developer's for this repository, asked when they gave none yet.
 * @param {CommentContext} context @returns {Promise<string | null>}
 */
const consentRefusal = async (context) => {
  if (typeof context.team === 'boolean') return context.team ? null : DECLINED
  const named = await context.deps.pullRequests.repository()
  if (named === null) return NO_REPOSITORY
  const repository = `${named.host}/${named.repository}`
  const accepted = reviewConsentOf(await context.deps.userSettings.read(), repository)
  if (accepted !== null) return accepted ? null : declinedBy(repository)
  return askedConsent(context, repository)
}

/** @param {CommentContext} context @param {string} repository @returns {Promise<string | null>} */
const askedConsent = async (context, repository) => {
  const { key, answer } = await askConsent(context)
  if (answer === null) return `nobody answered ${key}; run skraft review --pr ${context.number} --publish where you can answer it`
  const { userSettings } = context.deps
  await userSettings.write(withReviewConsent(await userSettings.read(), repository, answer === 'ACCEPTED'))
  return answer === 'ACCEPTED' ? null : declinedBy(repository)
}

const DECLINED = `${CONFIG_FILE} sets publish.reviewComment to false`
const NO_REPOSITORY = 'the forge does not name the repository of the working copy\'s remote, so no consent can be kept for it'

/** @param {string} repository */
const declinedBy = (repository) => `you declined to keep a review comment on ${repository} (${USER_CONFIG_FILE})`

/** The key of the consent question this run asks: the only question a review's journal holds. @param {CommentContext} context */
const keyOf = ({ journal }) => questionKey(CONSENT_STEP, journal.events.filter((event) => event.type === 'question.asked').length)

/**
 * The consent question, journaled, put to the person; their answer journaled; no answer without
 * one the question takes.
 * @param {CommentContext} context @returns {Promise<{ key: string, answer: string | null }>}
 */
const askConsent = async (context) => {
  const { deps, journal } = context
  const question = questionOf('review-consent', keyOf(context), REVIEW_CONSENT_TEXT)
  await journal.append('question.asked', { ...question, step: CONSENT_STEP })
  const given = await deps.human.ask(question)
  const reading = given === null ? null : readAnswer(question, given)
  if (reading === null || !reading.ok) return { key: question.key, answer: null }
  await journal.append('question.answered', { key: question.key, answer: reading.answer, reason: reading.reason, by: deps.human.by ?? 'host' })
  return { key: question.key, answer: reading.answer }
}
