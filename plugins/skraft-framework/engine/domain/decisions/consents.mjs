/**
 * The consents a repository gives once, kept in skraft-config.json under publish, and the version
 * of the question each answer was given to. A consent question's text changes only with its
 * version (a test pins each text to its version); an acceptance kept for an earlier text covers
 * less than the question asks now, so the question is asked again. A refusal of an earlier text
 * still stands: refusing less refuses more.
 *
 * @typedef {'visuals' | 'pullRequest' | 'reviewComment'} ConsentKey
 * @typedef {'unanswered' | 'declined' | 'accepted' | 'outdated'} ConsentState
 *   outdated: accepted, for an earlier text of the question.
 * @typedef {Record<ConsentKey, boolean | null> & { questionVersions: Record<ConsentKey, number> }} Consents
 */

/** The version of each consent question's text; an answer kept before versions existed answered version 1. */
export const CONSENT_VERSIONS = Object.freeze(/** @type {Record<ConsentKey, number>} */ ({ visuals: 1, pullRequest: 2, reviewComment: 1 }))

/** The keys a consent is kept under, in the order messages list them. */
export const CONSENT_KEYS = Object.freeze(/** @type {ConsentKey[]} */ (['visuals', 'pullRequest', 'reviewComment']))

/**
 * Where a consent stands.
 * @param {Consents} publish @param {ConsentKey} key @returns {ConsentState}
 */
export const consentOf = (publish, key) => {
  const given = publish[key]
  if (given === null) return 'unanswered'
  if (given === false) return 'declined'
  return publish.questionVersions[key] >= CONSENT_VERSIONS[key] ? 'accepted' : 'outdated'
}
