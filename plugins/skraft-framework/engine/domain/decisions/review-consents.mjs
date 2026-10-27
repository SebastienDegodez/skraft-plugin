import { CONSENT_VERSIONS } from './consents.mjs'

/**
 * The developer's consent to keep a review comment on a pull request, given once per repository
 * and kept in their own `~/.skraft/config.json` under `reviewComments`, by `<host>/<owner>/<repo>`:
 * `{ "accepted": true, "questionVersion": 1 }`. An answer to an earlier text of the question is
 * no answer.
 */

const KEY = 'reviewComments'

/** @param {unknown} value @returns {value is Record<string, any>} */
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

/** @param {string | null} text the file's, a JSON object when present */
const objectOf = (text) => (text === null ? {} : JSON.parse(text))

/**
 * @param {string | null} text ~/.skraft/config.json @param {string} repository `<host>/<owner>/<repo>`
 * @returns {boolean | null} whether the developer accepted; null while they gave no answer to this question
 */
export const reviewConsentOf = (text, repository) => {
  const kept = objectOf(text)[KEY]?.[repository]
  if (!isRecord(kept) || kept.questionVersion !== CONSENT_VERSIONS.reviewComment) return null
  return kept.accepted === true
}

/**
 * The file's text with the repository's answer kept, every other key kept.
 * @param {string | null} text @param {string} repository @param {boolean} accepted
 */
export const withReviewConsent = (text, repository, accepted) => {
  const raw = objectOf(text)
  const kept = { ...(isRecord(raw[KEY]) ? raw[KEY] : {}), [repository]: { accepted, questionVersion: CONSENT_VERSIONS.reviewComment } }
  return `${JSON.stringify({ ...raw, [KEY]: kept }, null, 2)}\n`
}
