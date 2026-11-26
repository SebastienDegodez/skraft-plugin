import { pendingDecisionLines } from '../reporting/pull-request.mjs'
import { DESCRIPTION_WORDS } from '../reporting/pull-request-words.mjs'
import { code, inert, oneLine } from '../reporting/markdown-safety.mjs'

/**
 * The comment a CI design run posts for each question it waits on: on its draft pull request
 * once one is open, else on its issue or epic (GitHub opens no pull request without a commit). One
 * comment per question, its marker naming the question's key, so that a new question never
 * rewrites an earlier one and the conversation keeps every question; the engine rewrites one only
 * to say it was answered (#662).
 */
const MARKER = 'skraft-design:question:v1'

/** The marker of the comment of one question. @param {string} key */
export const questionMarker = (key) => `<!-- ${MARKER} key=${key} -->`

/** Where a question's comment is: the pull request, else the issue. */
const HEADING = Object.freeze({
  issue: Object.freeze({
    en: 'skraft-design waits on a person before it designs anything. Answer in one comment on this issue:',
    fr: 'skraft-design attend une personne avant de concevoir quoi que ce soit. Répondez en un seul commentaire sur cette issue :',
  }),
  'pull-request': Object.freeze({
    en: 'skraft-design waits on a person. Answer in one comment on this pull request:',
    fr: 'skraft-design attend une personne. Répondez en un seul commentaire sur cette pull request :',
  }),
})

const ANSWERED = Object.freeze({
  en: (answer) => `skraft-design recorded the answer to this question: ${answer}`,
  fr: (answer) => `skraft-design a enregistré la réponse à cette question : ${answer}`,
})

/** The longest answer an answered comment quotes. */
const ANSWER_LENGTH = 500

/**
 * @param {import('../reporting/run-status.mjs').WaitingQuestion} question
 * @param {import('../reporting/language.mjs').Language} language @param {'issue' | 'pull-request'} [on]
 */
export const questionComment = (question, language, on = 'issue') => [
  questionMarker(question.key), '', HEADING[on][language] ?? HEADING[on].en, '',
  ...pendingDecisionLines(question, DESCRIPTION_WORDS[language] ?? DESCRIPTION_WORDS.en), '',
].join('\n')

/**
 * The comment of a question once answered: the answer the run recorded, then the question as it
 * was asked, without the reply it asked for.
 * @param {{ key: string, text: string }} question @param {string} answer
 * @param {import('../reporting/language.mjs').Language} language
 */
export const answeredComment = (question, answer, language) => [
  questionMarker(question.key), '', (ANSWERED[language] ?? ANSWERED.en)(code(quoted(answer))), '',
  `> ${inert(oneLine(question.text))} (${code(question.key)})`, '',
].join('\n')

/** @param {string} answer */
const quoted = (answer) => {
  const line = oneLine(answer)
  return line.length > ANSWER_LENGTH ? `${line.slice(0, ANSWER_LENGTH)}…` : line
}
