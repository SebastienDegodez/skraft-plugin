import { inert } from '../reporting/markdown-safety.mjs'

/**
 * The questions a run asks a human, and how an answer to one is read. A question node of the
 * workflow (`shape=hexagon, question="<kind>"`) asks one of the node questions; the engine asks
 * the environment question itself when the machine cannot run a step, and the blocked question
 * when a block a human can lift stops the run: an instruction runs the blocked node again with
 * it, STOP ends the run. The mutation-plan question takes APPLY, an instruction of the
 * developer's own, which goes on as APPLY does, or STOP.
 *
 * @typedef {'adr-ratification' | 'mutation-plan'} NodeQuestion
 * @typedef {NodeQuestion | 'environment' | 'review-consent' | 'blocked' | 'review-ceiling' | 'configuration'} QuestionKind
 * @typedef {{ options: readonly string[], refusals: readonly string[], header: string, instruction: boolean }} QuestionSpec
 *   options: the answers, the one that lets the run go on first; refusals: the answers that send
 *   the work back and need a reason; header: a short label a dialog shows beside the question, at
 *   most 12 characters (Claude Code 2.1.316 cuts a longer `$.ui.ask` header);
 *   instruction: a human may answer with words of their own, STOP among the options ending the run.
 * @typedef {{ key: string, kind: QuestionKind, text: string, options: string[], refusals: string[], header: string }} Question
 *   key: stable across a resume, the name `skraft decide` and a host pause use.
 * @typedef {{ ok: true, answer: string, reason: string | null } | { ok: false, reason: string }} AnswerReading
 */

/** The question a run a driver asks to confirm the configuration puts before anything starts, and its answer that goes on. */
export const CONFIGURATION = 'configuration'
export const START = 'START'

/** The question a block asks, and the one answer to it that is no instruction. */
export const BLOCKED = 'blocked'
export const STOP = 'STOP'
/**
 * The question a review asks once its loop to the producer reached its max_visits with only
 * medium and low findings left (#499): ACCEPT takes them as they stand and goes on, an
 * instruction runs the producer again, STOP ends the run. With a blocker or high finding left,
 * the blocked question is asked instead, with the same text: those are never accepted.
 */
export const REVIEW_CEILING = 'review-ceiling'
export const ACCEPT = 'ACCEPT'
/** The answer to the mutation plan that applies the proposal as it stands. */
export const APPLY = 'APPLY'

/** @type {Readonly<Record<QuestionKind, QuestionSpec>>} */
const QUESTIONS = Object.freeze({
  'adr-ratification': Object.freeze({ options: Object.freeze(['RATIFIED', 'REJECTED']), refusals: Object.freeze(['REJECTED']), header: 'ADR', instruction: false }),
  'mutation-plan': Object.freeze({ options: Object.freeze([APPLY, STOP]), refusals: Object.freeze([]), header: 'Mutation', instruction: true }),
  environment: Object.freeze({ options: Object.freeze(['RETRY', 'ABORT']), refusals: Object.freeze([]), header: 'Environment', instruction: false }),
  'review-consent': Object.freeze({ options: Object.freeze(['ACCEPTED', 'DECLINED']), refusals: Object.freeze([]), header: 'PR comment', instruction: false }),
  [BLOCKED]: Object.freeze({ options: Object.freeze([STOP]), refusals: Object.freeze([]), header: 'Blocked', instruction: true }),
  [REVIEW_CEILING]: Object.freeze({ options: Object.freeze([ACCEPT, STOP]), refusals: Object.freeze([]), header: 'Review', instruction: true }),
  [CONFIGURATION]: Object.freeze({ options: Object.freeze([START, STOP]), refusals: Object.freeze([]), header: 'Config', instruction: false }),
})

/** The questions a workflow node may ask. */
export const NODE_QUESTIONS = Object.freeze(/** @type {NodeQuestion[]} */ (['adr-ratification', 'mutation-plan']))

/** A reason is kept on one line, at most this long. */
const REASON_LENGTH = 500

/** @param {QuestionKind} kind @returns {QuestionSpec} */
export const questionSpec = (kind) => QUESTIONS[kind]

/** Whether a human may answer that question with words of their own. @param {QuestionKind} kind */
export const takesInstruction = (kind) => QUESTIONS[kind].instruction

/**
 * The answers an ask node leads somewhere by an edge: STOP to a question that takes an
 * instruction ends the run instead. @param {NodeQuestion} kind
 */
export const edgeAnswers = (kind) => QUESTIONS[kind].options.filter((option) => !(QUESTIONS[kind].instruction && option === STOP))

/**
 * The edge an answer leaves an ask node by: an instruction goes on as the option that lets the
 * run go on. @param {NodeQuestion} kind @param {string} answer
 */
export const edgeAnswerOf = (kind, answer) => (QUESTIONS[kind].options.includes(answer) ? answer : QUESTIONS[kind].options[0])

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

export const CONFIGURATION_TEXT =
  'Start this run with the configuration of this working copy? The Configuration tab of the skraft canvas and skraft doctor show it. ' +
  'START goes on, and is kept in skraft-config.local.json (configurationConfirmed) so that later runs start without asking; STOP starts nothing.'

// Each consent text changes only with its version in consents.mjs: an acceptance of an earlier
// text is not settled, so /skraft-init asks it again
// (tests/skraft-framework/unit/decisions/consent-versions.test.mjs pins them). The engine asks
// none of them itself; it owns their wording so that a change to it carries a version with it.
export const CONSENT_TEXT =
  'May skraft publish the screenshots and videos of its runs in the pull request of the branch? They can show private data. ' +
  'ACCEPTED or DECLINED; the answer is kept in skraft-config.json for every later run.'

export const PUBLISH_CONSENT_TEXT =
  'May skraft push this branch and open or update its pull request when a run ends, and keep one comment on its story\'s issue up to date with the run\'s progress, time and cost? ' +
  'ACCEPTED or DECLINED; the answer is kept in skraft-config.json (publish.pullRequest) for every later run.'

export const REVIEW_CONSENT_TEXT =
  'May skraft keep one comment on the pull request it reviews with skraft review --pr --publish, rewritten at each review, with the verdict and the findings? It is posted as you. ' +
  'ACCEPTED or DECLINED; the answer is kept in ~/.skraft/config.json for this repository, for every later review.'

/**
 * The text of the mutation plan question.
 * @param {string[]} proposals the proposals for the surviving mutants, relative to the working copy
 */
export const mutationPlanText = (proposals) =>
  `The mutation gate failed; a proposal for its surviving mutants is in ${proposals.join(', ')}. ${APPLY} applies it; or write how to treat them instead; ${STOP} ends the run.`

/**
 * The text of an environment question.
 * @param {string} step the node that could not run @param {string} reason why
 */
export const environmentText = (step, reason) => `${step} cannot run on this machine: ${reason}. Fix it, then RETRY; or ABORT the run.`

/**
 * The text of a blocked question: the node an instruction runs again, why it is blocked, from
 * what the engine checked, and what the step that blocked left, one per line (a review's
 * findings, the gates' failures, the reason a blocked agent gave in its result), which the
 * reopened pass is sent with the instruction.
 * @param {Block} block
 */
export const blockText = (block) => `${block.step} is blocked: ${BLOCKS[block.code](block)}.${leftBy(block)} An instruction runs ${block.step} again on a new pass with ${block.failures.length > 0 ? 'what is left above and the instruction' : 'it'}; ${STOP} ends the run.`

/**
 * What the step that blocked left (a review's findings, the gates' failures, an agent's reason),
 * one per line, so that a human sees what the agent will be sent before writing an instruction;
 * nothing when it left nothing.
 * @param {Block} block
 */
const leftBy = ({ from, failures }) => (failures.length === 0 ? '' : `\nLeft by ${from} (${failures.length}):\n${failures.map((failure) => `- ${failure}`).join('\n')}\n`)

/**
 * @typedef {{ step: string, code: string, from: string, agent: string | null, details: string | null, failures: readonly string[] }} Block
 *   step: the node an instruction runs again; code: what its step recorded; from: the node that
 *   recorded it; details: the file holding the agent's reason or the review's verdict;
 *   failures: what the step that blocked left, the findings of a review at its loop ceiling.
 */

/** Why a block stops the run, by the code its step recorded. @type {Readonly<Record<string, (block: Block) => string>>} */
const BLOCKS = Object.freeze({
  'agent-blocked': ({ agent, details }) => `${agent} says it cannot go on; its reason is in ${details}`,
  'loop-ceiling': ({ from, step }) => `${from} -> ${step} was taken as often as its max_visits allows`,
  'lens-inconclusive': ({ details }) => `a lens answered inconclusive; the verdict is in ${details}`,
})

/**
 * @typedef {import('../review/verdict.mjs').LeftFinding} LeftFinding
 * @typedef {{ review: string, step: string, passes: number, findings: readonly LeftFinding[], verdict: string }} Ceiling
 *   review: the review node; step: the node it loops back to; passes: how many times the review
 *   ran; findings: those its last pass left, blocking first; verdict: where its verdict file is.
 */

/** The severities a human can never accept: the review question asks for an instruction or STOP. */
const UNACCEPTABLE = Object.freeze(['blocker', 'high'])

/** Whether the findings a review left at its ceiling can be accepted. @param {readonly LeftFinding[]} findings */
export const acceptable = (findings) => !findings.some((finding) => UNACCEPTABLE.includes(finding.severity))

/**
 * The text of the question a review asks at its ceiling: that the producer did not get it right,
 * each blocker and high finding in full with its context, the medium and low ones in a table, and
 * where every finding is in full.
 * @param {Ceiling} ceiling
 */
export const reviewCeilingText = ({ review, step, passes, findings, verdict }) => {
  const severe = findings.filter((finding) => UNACCEPTABLE.includes(finding.severity))
  const minor = findings.filter((finding) => !UNACCEPTABLE.includes(finding.severity))
  return [
    `${review}: ${step} did not fix every finding after ${passes} passes, so the run does not send it back again.`,
    ...(severe.length === 0 ? [] : ['', `Blocker and high (${severe.length}):`, ...severe.flatMap(severeLines)]),
    ...(minor.length === 0 ? [] : ['', `Medium and low (${minor.length}):`, ...TABLE_HEAD, ...minor.map(minorRow)]),
    '',
    `Every finding with its context: ${verdict}`,
    choicesOf(step, severe.length === 0),
  ].join('\n')
}

const TABLE_HEAD = Object.freeze(['| Severity | Finding | Where | What |', '|---|---|---|---|'])

/** What each answer does. @param {string} step @param {boolean} acceptable_ no blocker or high finding is left */
const choicesOf = (step, acceptable_) => (acceptable_
  ? `${ACCEPT} takes these findings as they stand and goes on (they are listed in the run report and the pull request); an instruction runs ${step} again with every finding and the instruction; ${STOP} ends the run.`
  : `A blocker or high finding cannot be accepted: an instruction runs ${step} again with every finding and the instruction; ${STOP} ends the run.`)

/**
 * A blocker or high finding in full: what, why this severity, the kind of drift, every place, the
 * fix; what its lens wrote made inert, as the run report and the pull request show it.
 * @param {LeftFinding} finding
 */
const severeLines = (finding) => {
  const { lens, id, gate, severity, location, description, suggestion, severityReason, drift } = finding
  return [
    `- ${severity} · ${lens} ${id} ${gate}${location === '' ? '' : ` at ${inert(location)}`}: ${inert(description)}`,
    ...labelled(`why ${severity}`, severityReason),
    ...labelled('drift', drift),
    ...elsewhere(finding),
    ...labelled('fix', suggestion),
  ]
}

/** An indented `label: value` line, the value inert; none when there is no value. @param {string} label @param {string | null | undefined} value */
const labelled = (label, value) => (value ? [`  ${label}: ${inert(value)}`] : [])

/** The other places a finding holds at, when it names any. @param {LeftFinding} finding */
const elsewhere = ({ location, occurrences = [] }) => {
  const others = occurrences.filter((place) => place !== location)
  return others.length === 0 ? [] : [`  also at: ${inert(others.join(', '))}`]
}

/** The longest cell of the table of medium and low findings. */
const CELL = 120

/** A medium or low finding as one row of the table. @param {LeftFinding} finding */
const minorRow = ({ lens, id, severity, location, description }) => `| ${severity} | ${lens} ${id} | ${cell(inert(location || '-'))} | ${cell(inert(description))} |`

/** A table cell on one line, its pipes escaped, cut to CELL characters. @param {string} text */
const cell = (text) => {
  const escaped = text.replaceAll('|', '\\|')
  return escaped.length > CELL ? `${escaped.slice(0, CELL - 1)}…` : escaped
}

/**
 * The instruction a human answered a blocked or review-ceiling question with; null for any other
 * question, one not answered yet, STOP and ACCEPT.
 * @param {{ kind: QuestionKind, answer: string | null } | null} question
 * @returns {string | null}
 */
export const instructionOf = (question) => {
  if (question?.kind !== BLOCKED && question?.kind !== REVIEW_CEILING) return null
  return QUESTIONS[question.kind].options.includes(/** @type {string} */ (question.answer)) ? null : question.answer
}

/**
 * Whether a human accepted the findings a review left at its ceiling, so the run goes on as if it
 * approved.
 * @param {{ kind: QuestionKind, answer: string | null } | null} question
 */
export const acceptedOf = (question) => question?.kind === REVIEW_CEILING && question.answer === ACCEPT

/**
 * What `skraft decide <key>` takes after the key: one of the options, or an instruction before STOP.
 * @param {{ kind: QuestionKind, options: readonly string[] }} question
 */
export const decideUsage = ({ kind, options }) => (takesInstruction(kind) ? [...options.filter((option) => option !== STOP), '"<instruction>"', STOP] : options).join('|')

/**
 * An answer as a human gave it: to a question that takes an instruction one of its options or the
 * instruction, to any other one of its options.
 * @param {Pick<Question, 'kind' | 'options' | 'refusals'>} question
 * @param {{ answer: unknown, reason?: unknown }} given
 * @returns {AnswerReading}
 */
export const readAnswer = (question, given) => (takesInstruction(question.kind) ? readInstruction(question, given) : readOption(question, given))

/**
 * One of the question's options, in any case, and for a refusal a reason, kept on one line.
 * @param {Pick<Question, 'options' | 'refusals'>} question
 * @param {{ answer: unknown, reason?: unknown }} given
 * @returns {AnswerReading}
 */
const readOption = ({ options, refusals }, { answer, reason }) => {
  const chosen = typeof answer === 'string' ? answer.trim().toUpperCase() : ''
  if (!options.includes(chosen)) return { ok: false, reason: `the answer must be one of ${options.join(', ')}` }
  const why = oneLine(reason)
  if (refusals.includes(chosen) && why === null) return { ok: false, reason: `${chosen} needs the reason, which goes back to the agent` }
  return { ok: true, answer: chosen, reason: why }
}

/** An instruction is kept on one line, at most this long. */
const INSTRUCTION_LENGTH = 1000
/**
 * A word of an instruction, once in NFC: a letter and two more letters or combining marks in a
 * row, in any script (Devanagari « करो », an NFD « été »), or two letters of a script written
 * without spaces (Han « 修复 », kana, Hangul). A digit or a mark alone tells an agent nothing (#500).
 */
const WORD = /\p{L}[\p{L}\p{M}]{2}|[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]{2}/u

/**
 * The answer a human gave to a question that takes an instruction: one of its options, in any
 * case, with the reason kept on one line; any other answer is the instruction, the reason's words
 * after the answer's, on one line, in NFC. Never cut: an instruction too long is refused, and so is one
 * that holds no word.
 * @param {Pick<Question, 'options'>} question
 * @param {{ answer: unknown, reason?: unknown }} given
 * @returns {AnswerReading}
 */
const readInstruction = ({ options }, { answer, reason }) => {
  const chosen = typeof answer === 'string' ? answer.trim().toUpperCase() : ''
  if (options.includes(chosen)) return { ok: true, answer: chosen, reason: oneLine(reason) }
  const text = [answer, reason].filter((part) => typeof part === 'string').join(' ').normalize('NFC').replace(/\s+/g, ' ').trim()
  if (text === '') return { ok: false, reason: `the answer must be an instruction, or ${options.join(' or ')}` }
  if (text.length > INSTRUCTION_LENGTH) return { ok: false, reason: `an instruction is at most ${INSTRUCTION_LENGTH} characters` }
  if (!WORD.test(text)) return { ok: false, reason: `an instruction tells the agent in words what to do; write a sentence, or ${options.join(' or ')}` }
  return { ok: true, answer: text, reason: null }
}

/** @param {unknown} text @returns {string | null} */
const oneLine = (text) => {
  if (typeof text !== 'string') return null
  const line = text.replace(/\s+/g, ' ').trim().slice(0, REASON_LENGTH)
  return line === '' ? null : line
}
