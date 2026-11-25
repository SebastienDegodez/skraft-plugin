import { pendingDecisionLines } from '../reporting/pull-request.mjs'
import { DESCRIPTION_WORDS } from '../reporting/pull-request-words.mjs'

/**
 * The comment a CI design run keeps on its issue or epic while nothing is designed yet, so no
 * draft pull request can hold the question (GitHub opens none without a commit): the pending
 * decision and the one reply that answers it, as the draft would show them (#662).
 */
export const QUESTION_MARKER = '<!-- skraft-design:question:v1 -->'

const HEADING = Object.freeze({
  en: 'skraft-design waits on a person before it designs anything. Answer in one comment on this issue:',
  fr: 'skraft-design attend une personne avant de concevoir quoi que ce soit. Répondez en un seul commentaire sur cette issue :',
})

/**
 * @param {import('../reporting/run-status.mjs').WaitingQuestion} question
 * @param {import('../reporting/language.mjs').Language} language
 */
export const questionComment = (question, language) => [
  QUESTION_MARKER, '', HEADING[language] ?? HEADING.en, '',
  ...pendingDecisionLines(question, DESCRIPTION_WORDS[language] ?? DESCRIPTION_WORDS.en), '',
].join('\n')
