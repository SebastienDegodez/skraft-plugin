import { CONFIG_FILE, withPublishSetting } from '../../domain/config/skraft-config.mjs'
import { consentOf } from '../../domain/decisions/consents.mjs'
import { questionKey, questionOf, readAnswer, REVIEW_CONSENT_TEXT } from '../../domain/decisions/questions.mjs'
import { COMMENT_FILE, markerOf, renderComment } from '../../domain/review/pull-request.mjs'
import { loadConfig } from '../config/bases.mjs'

/**
 * The review's comment: rendered beside the review on every pass, then, with `--publish`, kept as
 * one comment of the pull request, rewritten at each pass, once the repository consented. The
 * consent is asked once per repository and kept in skraft-config.json; never a review, never a
 * request for changes.
 *
 * @typedef {import('../../domain/review/verdict.mjs').ReviewVerdict} ReviewVerdict
 * @typedef {{
 *   deps: import('./review-pull-request-usecase.mjs').ReviewDeps, slug: string, number: number, publish: boolean,
 *   journal: import('../journal/run-journal.mjs').OpenJournal,
 *   config: import('../../domain/config/skraft-config.mjs').SkraftConfig,
 * }} CommentContext
 * @typedef {{ comment: string | null, unpublished: string | null }} Published
 *   comment: the URL of the comment kept; unpublished: why `--publish` posted nothing.
 */

/** The step a consent question is asked at, which keys it. */
const CONSENT_STEP = 'review_consent'

/** @param {CommentContext} context @param {{ pass: number, verdict: ReviewVerdict }} review @returns {Promise<Published>} */
export const keepComment = async (context, review) => {
  await context.deps.reviewFiles.write(context.slug, COMMENT_FILE, renderComment({ number: context.number, ...review }))
  if (!context.publish) return { comment: null, unpublished: null }
  const refusal = await consentRefusal(context)
  const kept = refusal === null ? await posted(context) : { ok: /** @type {const} */ (false), reason: refusal }
  await context.journal.append(kept.ok ? 'review.commented' : 'review.comment-skipped', kept.ok ? { pass: review.pass, url: kept.url } : { pass: review.pass, reason: unpublishedOf(kept.reason) })
  return kept.ok ? { comment: kept.url, unpublished: null } : { comment: null, unpublished: unpublishedOf(kept.reason) }
}

/** @param {string} reason */
const unpublishedOf = (reason) => `not published: ${reason}`

/** The comment rewritten, or posted. @param {CommentContext} context */
const posted = ({ deps, slug, number, journal }) => deps.pullRequests.keepComment({
  number, marker: markerOf(number), url: journal.events.findLast((event) => event.type === 'review.commented')?.url ?? null,
  bodyFile: deps.reviewFiles.location(slug, COMMENT_FILE),
})

/**
 * Why the comment may not be kept, null once the repository consented: asked when nobody
 * answered yet, the answer kept in skraft-config.json.
 * @param {CommentContext} context @returns {Promise<string | null>}
 */
const consentRefusal = async (context) => {
  const state = consentOf(context.config.publish, 'reviewComment')
  if (state === 'accepted') return null
  if (state === 'declined') return DECLINED
  const { key, answer } = await askConsent(context)
  if (answer === null) return `nobody answered ${key}; run skraft review --pr ${context.number} --publish where you can answer it`
  await keepConsent(context, answer === 'ACCEPTED')
  return answer === 'ACCEPTED' ? null : DECLINED
}

const DECLINED = `${CONFIG_FILE} sets publish.reviewComment to false`

/** The key of the consent question this run asks. @param {CommentContext} context */
const keyOf = ({ journal }) => questionKey(CONSENT_STEP, journal.events.filter((event) => event.type === 'question.asked' && event.step === CONSENT_STEP).length)

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

/** The answer written into skraft-config.json, every other key kept. @param {CommentContext} context @param {boolean} value */
const keepConsent = async ({ deps }, value) => {
  const config = /** @type {{ raw: Record<string, unknown> }} */ (await loadConfig(deps))
  await deps.workspace.write(CONFIG_FILE, withPublishSetting(config.raw, 'reviewComment', value))
}
