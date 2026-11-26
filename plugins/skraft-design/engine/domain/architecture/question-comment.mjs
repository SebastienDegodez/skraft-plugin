import { code, inert, oneLine } from '../reporting/markdown-safety.mjs'
import { QUESTION_WORDS, REFRESH_SENTENCE } from './question-words.mjs'

/**
 * The comment a CI design run posts for each question it waits on: on its draft pull request
 * once one is open, else on its issue or epic (GitHub opens no pull request without a commit). One
 * comment per question, its marker naming the question's key, so that a new question never
 * rewrites an earlier one; the engine rewrites one only to say it was answered (#662). Each is
 * laid out as a person reads it: a title, what blocks and what the step left, a table of the
 * answers and what each does, then the reply to copy.
 */
const MARKER = 'skraft-design:question:v1'

/** The marker of the comment of one question. @param {string} key */
export const questionMarker = (key) => `<!-- ${MARKER} key=${key} -->`

/** The longest answer an answered comment quotes. */
const ANSWER_LENGTH = 500

/** @param {import('../reporting/language.mjs').Language} language */
const wordsOf = (language) => QUESTION_WORDS[language] ?? QUESTION_WORDS.en

/** A table cell: one line, inert, its pipes escaped. @param {string} text */
const cell = (text) => inert(oneLine(text)).replaceAll('|', '\\|')

/** A fenced block of text, its lines as given. @param {string[]} lines */
const fenced = (lines) => ['```text', ...lines, '```']

/**
 * @param {any} question the waiting question, with its `block` or its `questions` when it has them
 * @param {import('../reporting/language.mjs').Language} language @param {'issue' | 'pull-request'} [on]
 */
export const questionComment = (question, language, on = 'issue') => {
  const words = wordsOf(language)
  const body = bodyOf(question, words)
  return [questionMarker(question.key), '', ...body.title, '', words.intro[on], '', ...body.lines, '', `<sub>${words.key(code(question.key))}</sub>`, ''].join('\n')
}

/** What a question's comment says, by what the question holds. @param {any} question @param {any} words */
const bodyOf = (question, words) => {
  if (question.questions) return questionsBody(question, words)
  if (question.block) return blockBody(question, words)
  return question.facts?.refreshConflict ? conflictBody(question, words) : decisionBody(question, words)
}

/** REFRESH stopped on a merge conflict: the person merges the branch, then answers again. @param {any} question @param {any} words */
const conflictBody = ({ options }, words) => ({
  title: [`### ${words.instructionTitle}`],
  lines: [words.refreshConflict, '', ...answerTable(['instruction', 'REFRESH', ...options], 'blocked', words), '',
    `**${words.reply}**`, ...fenced(['/skraft-answer REFRESH'])],
})

/** A step blocked: what blocks it, what it left, then the answers. @param {any} question @param {any} words */
const blockBody = ({ block, options }, words) => ({
  title: [`### ${words.instructionTitle}`],
  lines: [
    blockHeadline(block, words),
    ...leftLines(block, words), '',
    ...answerTable(['instruction', ...(block.refresh ? ['REFRESH'] : []), ...options], 'blocked', words), '',
    `**${words.reply}**`, ...fenced([`/skraft-answer ${words.instructionExample}`]),
  ],
})

/** What blocks the step, and why, in one line. @param {any} block @param {any} words */
const blockHeadline = (block, words) => `**${words.blocks(code(block.step))}** — ${cell((words.causes[block.code] ?? (() => ''))(block))}`

/** @param {{ from: string, failures: readonly string[] }} block @param {any} words */
const leftLines = ({ from, failures }, words) => (failures.length === 0 ? [] : ['', `**${words.left(code(from), failures.length)}**`, ...failures.map((line) => `- ${inert(oneLine(line))}`)])

/** A question with options: the question as asked, then the answers. @param {any} question @param {any} words */
const decisionBody = ({ kind, text, options, facts }, words) => ({
  title: [`### ${words.decisionTitle}`],
  lines: [
    `**${words.question}**`, '', ...(facts && words.texts[kind] ? words.texts[kind](facts) : quotedText(text)), '',
    ...answerTable(options, kind, words), '',
    `**${words.reply}**`, ...fenced([`/skraft-answer ${options[0]}`]),
  ],
})

/** The question's text as a quote, line by line, without the REFRESH sentence the table says already. @param {string} text */
const quotedText = (text) => String(text).replace(REFRESH_SENTENCE, '').split('\n').filter((line) => line.trim() !== '').map((line) => `> ${inert(line.trim())}`)

/**
 * The answers a question takes, each with what it does; an instruction reads as the person's words.
 * @param {string[]} answers @param {string} kind @param {any} words
 */
const answerTable = (answers, kind, words) => [
  `**${words.answers}**`, '', `| ${words.answer} | ${words.effect} |`, '| --- | --- |',
  ...[...new Set(answers)].map((answer) => `| ${answer === 'instruction' ? words.yourInstruction : code(answer)} | ${cell(effectOf(words, kind, answer))} |`),
]

/** @param {any} words @param {string} kind @param {string} answer */
const effectOf = (words, kind, answer) => words.effects[kind]?.[answer] ?? words.effects[answer] ?? ''

/** The architect's open questions: each with its options, the assumed one marked, then one reply for all. @param {any} question @param {any} words */
const questionsBody = ({ questions }, words) => ({
  title: [`### ${words.questionsTitle(questions.length)}`],
  lines: [
    ...questions.flatMap((asked) => openQuestion(asked, words)),
    `**${words.replyAll}**`, ...fenced(['/skraft-answer', ...questions.map(({ id }) => `${id}: ${words.optionOrWords}`)]),
    '', words.ownWords,
  ],
})

/** @param {any} asked @param {any} words */
const openQuestion = (asked, words) => [
  `#### ${cell(asked.id)} · #${asked.issue} · ${cell(asked.criterion)}`, '', inert(oneLine(asked.question)), '',
  `| ${words.option} | ${words.choice} | ${words.consequence} |`, '| --- | --- | --- |',
  ...asked.options.map((option) => `| ${code(option.id)}${option.id === asked.assumption ? ` *(${words.assumed})*` : ''} | ${cell(option.label)} | ${cell(option.consequence)} |`), '',
]

/**
 * The comment of a question once answered: the answer the run recorded, then the question as it
 * was asked, without the reply it asked for.
 * @param {{ key: string, text: string, block?: any, questions?: any[] }} question @param {string} answer
 * @param {import('../reporting/language.mjs').Language} language @param {string | null} [author] the forge login of who answered, when the journal holds it
 */
export const answeredComment = (question, answer, language, author = null) => {
  const words = wordsOf(language)
  const recorded = author === null ? words.recorded : words.recordedFrom(cell(author))
  return [questionMarker(question.key), '', `### ${words.answeredTitle}`, '', `**${recorded}** ${code(quoted(answer))}`, '',
    `> ${askedLine(question, words)}`, '', `<sub>${words.key(code(question.key))}</sub>`, ''].join('\n')
}

/** What the question asked, in one line: a block's headline, the architect's questions, else its text's first line. @param {any} question @param {any} words */
const askedLine = (question, words) => {
  if (question.block) return blockHeadline(question.block, words)
  if (question.questions) return words.questionsTitle(question.questions.length)
  if (question.facts?.refreshConflict) return words.refreshConflict
  if (question.facts && words.texts[question.kind]) return words.texts[question.kind](question.facts)[0]
  return inert(oneLine(String(question.text).replace(REFRESH_SENTENCE, '').split('\n')[0]))
}

/** @param {string} answer */
const quoted = (answer) => {
  const line = oneLine(answer)
  return line.length > ANSWER_LENGTH ? `${line.slice(0, ANSWER_LENGTH)}…` : line
}
