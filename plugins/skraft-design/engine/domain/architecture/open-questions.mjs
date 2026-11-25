/**
 * The content questions an architecture pass leaves for a person: each names its story and
 * criterion, offers options with their consequence, and states the option the pass assumed
 * meanwhile. A question of scope is no such question: a story the architect cannot design goes to
 * `details/blocked-stories.json` (#662).
 *
 * @typedef {{ id: string, label: string, consequence: string }} QuestionOption
 * @typedef {{ id: string, issue: number, criterion: string, question: string, options: QuestionOption[], assumption: string }} OpenQuestion
 */

export const OPEN_QUESTIONS_FILE = 'details/open-questions.json'

const filled = (value) => typeof value === 'string' && value.trim() !== ''

/** @param {string} text @returns {unknown} */
const parsed = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** What one option breaks; null when it reads. @param {any} option */
const optionProblem = (option) => (filled(option?.id) && filled(option?.label) && filled(option?.consequence)
  ? null
  : 'each option needs an id, a label and a consequence')

/** What one question's options break; null when they read. @param {any} question */
const optionsProblem = (question) => {
  const options = Array.isArray(question.options) ? question.options : []
  if (options.length < 2) return 'it offers at least two options'
  const broken = options.map(optionProblem).find((problem) => problem !== null)
  if (broken) return broken
  if (new Set(options.map(({ id }) => id)).size !== options.length) return 'its option ids are unique'
  return options.some(({ id }) => id === question.assumption) ? null : 'its assumption is the id of one of its options'
}

/**
 * What one question breaks; null when it reads.
 * @param {any} question @param {number[]} issues the stories of this pass
 */
const questionProblem = (question, issues) => {
  if (!filled(question?.id)) return 'it has an id'
  if (!issues.includes(question.issue)) return `${question.id}: its issue is one of this pass's stories`
  if (!filled(question.criterion) || !filled(question.question)) return `${question.id}: it names its criterion and asks its question`
  const options = optionsProblem(question)
  return options === null ? null : `${question.id}: ${options}`
}

/**
 * Why the open questions of a pass are refused, one line each; none when the file is absent.
 * @param {string | null} text the file as the pass left it @param {number[]} issues
 * @returns {string[]}
 */
export const questionsProblems = (text, issues) => {
  if (text === null) return []
  const questions = parsed(text)
  if (!Array.isArray(questions)) return [`${OPEN_QUESTIONS_FILE} must be a JSON array of questions (write [] when none is left).`]
  const problems = questions.map((question) => questionProblem(question, issues)).filter((problem) => problem !== null)
  if (new Set(questions.map((question) => question?.id)).size !== questions.length) problems.push('question ids are unique')
  return problems.map((problem) => `${OPEN_QUESTIONS_FILE}: ${problem}.`)
}

/**
 * The open questions of a pass that bear on its stories, as written; none when the file is absent
 * or names none of them.
 * @param {string | null} text @param {number[]} issues @returns {OpenQuestion[]}
 */
export const openQuestions = (text, issues) => {
  const questions = text === null ? [] : parsed(text)
  return Array.isArray(questions) ? questions.filter((question) => issues.includes(question?.issue)) : []
}

/** One question as a person reads it: the question, then each option and its consequence. @param {OpenQuestion} question */
const questionLines = ({ id, issue, criterion, question, options, assumption }) => [
  `${id} (#${issue} ${criterion}): ${question}`,
  ...options.map((option) => `  ${option.id}: ${option.label} — ${option.consequence}`),
  `  Assumed meanwhile: ${assumption}`,
]

/** @param {OpenQuestion[]} questions */
export const questionsText = (questions) => [
  `The solution architect left ${questions.length} question(s) for a person; answer each by its id with one of its options, or write STOP.`,
  ...questions.flatMap(questionLines),
].join('\n')
