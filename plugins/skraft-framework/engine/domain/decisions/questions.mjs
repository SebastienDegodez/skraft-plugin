/**
 * The questions a run asks a human, and how an answer to one is read. A question node of the
 * workflow (`shape=hexagon, question="<kind>"`) asks one of the node questions; the engine asks
 * the environment question itself when the machine cannot run a step.
 *
 * @typedef {'adr-ratification' | 'reporting-consent' | 'publish-consent'} NodeQuestion
 * @typedef {NodeQuestion | 'environment'} QuestionKind
 * @typedef {{ options: readonly string[], refusals: readonly string[], header: string }} QuestionSpec
 *   options: the answers, the one that lets the run go on first; refusals: the answers that send
 *   the work back and need a reason; header: a short label a dialog shows beside the question.
 * @typedef {{ key: string, kind: QuestionKind, text: string, options: string[], refusals: string[], header: string }} Question
 *   key: stable across a resume, the name `skraft decide` and a host pause use.
 * @typedef {{ ok: true, answer: string, reason: string | null } | { ok: false, reason: string }} AnswerReading
 */

/** @type {Readonly<Record<QuestionKind, QuestionSpec>>} */
const QUESTIONS = Object.freeze({
  'adr-ratification': Object.freeze({ options: Object.freeze(['RATIFIED', 'REJECTED']), refusals: Object.freeze(['REJECTED']), header: 'ADR' }),
  'reporting-consent': Object.freeze({ options: Object.freeze(['ACCEPTED', 'DECLINED']), refusals: Object.freeze([]), header: 'Reporting' }),
  'publish-consent': Object.freeze({ options: Object.freeze(['ACCEPTED', 'DECLINED']), refusals: Object.freeze([]), header: 'Pull request' }),
  environment: Object.freeze({ options: Object.freeze(['RETRY', 'ABORT']), refusals: Object.freeze([]), header: 'Environment' }),
})

/** The questions a workflow node may ask. */
export const NODE_QUESTIONS = Object.freeze(/** @type {NodeQuestion[]} */ (['adr-ratification', 'reporting-consent', 'publish-consent']))

/** A reason is kept on one line, at most this long. */
const REASON_LENGTH = 500

/** @param {QuestionKind} kind @returns {QuestionSpec} */
export const questionSpec = (kind) => QUESTIONS[kind]

/**
 * A question with its key and its text.
 * @param {QuestionKind} kind @param {string} key @param {string} text
 * @returns {Question}
 */
export const questionOf = (kind, key, text) => ({ key, kind, text, options: [...QUESTIONS[kind].options], refusals: [...QUESTIONS[kind].refusals], header: QUESTIONS[kind].header })

/**
 * The key of a question: the node that asks it, then its rank among the questions that node
 * asked in the run, whatever their kind. A node id holds no rank, so no two questions share a key.
 * @param {string} step the node that asks @param {number} asked how many questions it asked before
 */
export const questionKey = (step, asked) => `${step}-${asked + 1}`

/**
 * The text of a ratification question.
 * @param {string[]} adrs the Proposed ADRs, relative to the working copy
 */
export const ratificationText = (adrs) =>
  `Ratify the Proposed ADRs ${adrs.join(', ')}? RATIFIED marks them Accepted; REJECTED sends DESIGN back with your reason.`

export const CONSENT_TEXT =
  'May skraft publish the screenshots and videos of its runs in the pull request of the branch? They can show private data. ' +
  'ACCEPTED or DECLINED; the answer is kept in skraft-config.json for every later run.'

export const PUBLISH_CONSENT_TEXT =
  'May skraft push this branch and open or update its pull request when a run ends? ' +
  'ACCEPTED or DECLINED; the answer is kept in skraft-config.json (publish.pullRequest) for every later run.'

/**
 * The text of an environment question.
 * @param {string} step the node that could not run @param {string} reason why
 */
export const environmentText = (step, reason) => `${step} cannot run on this machine: ${reason}. Fix it, then RETRY; or ABORT the run.`

/**
 * An answer as a human gave it: one of the question's options, in any case, and for a refusal
 * a reason, kept on one line.
 * @param {Pick<Question, 'options' | 'refusals'>} question
 * @param {{ answer: unknown, reason?: unknown }} given
 * @returns {AnswerReading}
 */
export const readAnswer = ({ options, refusals }, { answer, reason }) => {
  const chosen = typeof answer === 'string' ? answer.trim().toUpperCase() : ''
  if (!options.includes(chosen)) return { ok: false, reason: `the answer must be one of ${options.join(', ')}, got ${JSON.stringify(answer)}` }
  const why = oneLine(reason)
  if (refusals.includes(chosen) && why === null) return { ok: false, reason: `${chosen} needs the reason, which goes back to the agent` }
  return { ok: true, answer: chosen, reason: why }
}

/** @param {unknown} text @returns {string | null} */
const oneLine = (text) => {
  if (typeof text !== 'string') return null
  const line = text.replace(/\s+/g, ' ').trim().slice(0, REASON_LENGTH)
  return line === '' ? null : line
}
