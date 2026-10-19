// A story file written by the story writer, checked against the Definition of Ready before any
// lens reads it: the structure DoR items 1-8 need, the traceability from criterion to example,
// tasks covering every criterion, and the antipatterns a script can see.
import { EFFORTS } from './story-map.mjs'

export const MIN_EXAMPLES = 3
export const MIN_CRITERIA = 3
export const MAX_CRITERIA = 7

const GENERIC_PERSONA = /^(?:an?\s+|le\s+|la\s+|l'|un\s+|une\s+)?(user|users|utilisateur|utilisatrice|utilisateurs|someone|somebody|quelqu'un|person|personne|customer|client|developer|d[ée]veloppeur|d[ée]veloppeuse|engineer|ing[ée]nieur|architect|architecte|the system|le syst[èe]me)$/i
const IMPLEMENT_X = /^(?:to\s+)?(implement|build|refactor|create (?:a|the) (?:service|repository|class|table)|impl[ée]menter|refactorer|cr[ée]er (?:un|le|la) (?:service|repository|d[ée]p[ôo]t|classe|table))\b/i
const TECHNICAL = /\b(?:HTTP\s*\d{3}|status(?: code)? \d{3}|(?:GET|POST|PUT|PATCH|DELETE) \/|\w+(?:Repository|Controller|Handler|UseCase|Service)\b|\.\w+\(\))/

const isText = (value) => typeof value === 'string' && value.trim() !== ''
const sameSet = (a, b) => a.length === b.length && a.every((value) => b.includes(value))

/**
 * @typedef {{ id: string, text: string }} Example
 * @typedef {{ id: string, title: string, given: string, when: string, then: string[], example: string, covers: string[] }} Criterion
 * @typedef {{ text: string, acceptanceCriteria: string[] }} Task
 * @typedef {{
 *   id: string, epic: string, title: string, persona: string, description: string,
 *   story: { asA: string, iWant: string, soThat: string },
 *   examples: Example[], acceptanceCriteria: Criterion[], tasks: Task[],
 *   devNotes: { context: string[], references: { id: string, note: string }[], testing: string[] },
 *   technicalNotes: string[], dependencies: { story: string, reason: string }[],
 *   effort: { points: number, rationale: string }, openQuestions?: string[],
 * }} StoryFile
 */

/**
 * @param {unknown} file
 * @param {import('./story-map.mjs').MapStory & { epic: string }} planned the story as the approved map plans it
 * @param {Set<string>} known every requirement id the PRD defines
 * @returns {import('./story-map.mjs').Findings}
 */
export const checkStory = (file, planned, known) => {
  const findings = { problems: [], warnings: [] }
  const story = /** @type {StoryFile} */ (file)
  if (!story || typeof story !== 'object') return { ...findings, problems: ['the story file is not a JSON object'] }
  checkIdentity(story, planned, findings)
  checkStatement(story, findings)
  checkExamples(story, findings)
  checkCriteria(story, planned, known, findings)
  checkTasks(story, findings)
  checkNotes(story, findings)
  checkDependencies(story, planned, findings)
  checkEffort(story, findings)
  return findings
}

/** @param {StoryFile} story @param {{ id: string, epic: string }} planned @param {import('./story-map.mjs').Findings} findings */
const checkIdentity = (story, planned, { problems }) => {
  if (story.id !== planned.id) problems.push(`id is ${story.id}, the map plans ${planned.id}`)
  if (story.epic !== planned.epic) problems.push(`epic is ${story.epic}, the map plans ${planned.epic}`)
  for (const field of ['title', 'description', 'persona']) if (!isText(story[field])) problems.push(`${field} must be a non-empty string`)
}

/** @param {StoryFile} story @param {import('./story-map.mjs').Findings} findings */
const checkStatement = (story, { problems }) => {
  const statement = story.story ?? /** @type {any} */ ({})
  for (const part of ['asA', 'iWant', 'soThat']) if (!isText(statement[part])) problems.push(`DoR 1: story.${part} is missing`)
  if (isText(story.persona) && GENERIC_PERSONA.test(story.persona.trim())) problems.push(`DoR 2: persona "${story.persona}" names no role (Vague Persona)`)
  if (isText(statement.iWant) && IMPLEMENT_X.test(statement.iWant.trim())) problems.push(`DoR 1: "${statement.iWant}" describes an implementation (Implement-X)`)
}

/** @param {StoryFile} story @param {import('./story-map.mjs').Findings} findings */
const checkExamples = (story, { problems, warnings }) => {
  const examples = Array.isArray(story.examples) ? story.examples : []
  if (examples.length < MIN_EXAMPLES) problems.push(`DoR 3: ${examples.length} domain example(s), at least ${MIN_EXAMPLES} needed`)
  for (const example of examples) {
    if (!isText(example?.id) || !isText(example?.text)) problems.push('DoR 3: every example needs an id and a text')
    else if (!/\d|«|"|“/.test(example.text)) warnings.push(`${example.id} carries no concrete value (Generic Data?)`)
  }
}

/**
 * @param {StoryFile} story @param {{ covers: string[] }} planned @param {Set<string>} known
 * @param {import('./story-map.mjs').Findings} findings
 */
const checkCriteria = (story, planned, known, { problems }) => {
  const criteria = Array.isArray(story.acceptanceCriteria) ? story.acceptanceCriteria : []
  const examples = new Set((story.examples ?? []).map((e) => e?.id))
  if (criteria.length < MIN_CRITERIA) problems.push(`DoR 4: ${criteria.length} acceptance criteria, at least ${MIN_CRITERIA} needed`)
  if (criteria.length > MAX_CRITERIA) problems.push(`DoR 6: ${criteria.length} acceptance criteria: split the story (Giant Story)`)
  for (const criterion of criteria) criterionHolds(criterion, examples, known, problems)
  const carried = new Set(criteria.flatMap((c) => c?.covers ?? []))
  for (const id of planned.covers) if (!carried.has(id)) problems.push(`no acceptance criterion covers ${id}, which the map gives this story`)
}

/** @param {Criterion} criterion @param {Set<string>} examples @param {Set<string>} known @param {string[]} problems */
const criterionHolds = (criterion, examples, known, problems) => {
  const at = criterion?.id ?? 'a criterion'
  for (const part of ['id', 'title', 'given', 'when']) if (!isText(criterion?.[part])) problems.push(`DoR 4: ${at}.${part} is missing`)
  if (!Array.isArray(criterion?.then) || criterion.then.length === 0 || !criterion.then.every(isText)) problems.push(`DoR 4: ${at}.then must list at least one observable outcome`)
  if (!examples.has(criterion?.example)) problems.push(`DoR 5: ${at} derives from no domain example of the story`)
  for (const id of criterion?.covers ?? []) if (!known.has(id)) problems.push(`${at} covers ${id}, which the PRD does not define`)
  const text = [criterion?.given, criterion?.when, ...(criterion?.then ?? [])].join(' ')
  if (TECHNICAL.test(text)) problems.push(`${at} names system internals or HTTP details (Technical AC)`)
}

/** @param {StoryFile} story @param {import('./story-map.mjs').Findings} findings */
const checkTasks = (story, { problems }) => {
  const tasks = Array.isArray(story.tasks) ? story.tasks : []
  const criteria = new Set((story.acceptanceCriteria ?? []).map((c) => c?.id))
  if (tasks.length === 0) problems.push('tasks must list the work, each naming the criteria it serves')
  for (const task of tasks) {
    if (!isText(task?.text)) problems.push('every task needs a text')
    for (const id of task?.acceptanceCriteria ?? []) if (!criteria.has(id)) problems.push(`a task serves ${id}, which is no criterion of the story`)
  }
  const served = new Set(tasks.flatMap((t) => t?.acceptanceCriteria ?? []))
  for (const id of criteria) if (!served.has(id)) problems.push(`no task serves ${id}`)
}

/** @param {StoryFile} story @param {import('./story-map.mjs').Findings} findings */
const checkNotes = (story, { problems }) => {
  if (!Array.isArray(story.technicalNotes) || !story.technicalNotes.some(isText)) problems.push('DoR 7: technicalNotes is empty (write "None identified" when there is none)')
  const notes = story.devNotes ?? /** @type {any} */ ({})
  if (!Array.isArray(notes.references) || notes.references.length === 0) problems.push('devNotes.references must cite the PRD passages the builder needs')
  if (!Array.isArray(notes.context) || !notes.context.some(isText)) problems.push('devNotes.context must give the builder what it needs without reading the whole PRD')
  if (!Array.isArray(notes.testing) || !notes.testing.some(isText)) problems.push('devNotes.testing must say how the criteria are proven')
}

/**
 * The dependencies of the story file are the map's `after`, no more, no less: a story that grows a
 * dependency the map does not plan is how two stories end up waiting on each other.
 * @param {StoryFile} story @param {{ after: string[] }} planned @param {import('./story-map.mjs').Findings} findings
 */
const checkDependencies = (story, planned, { problems }) => {
  const listed = (story.dependencies ?? []).map((d) => d?.story)
  if (!Array.isArray(story.dependencies)) return problems.push('DoR 8: dependencies must be a list ([] when none)')
  if (!sameSet(listed, planned.after)) problems.push(`DoR 8: dependencies are [${listed.join(', ')}], the map plans [${planned.after.join(', ')}]`)
  for (const dependency of story.dependencies) if (!isText(dependency?.reason)) problems.push(`DoR 8: ${dependency?.story} is listed without a reason`)
}

/** @param {StoryFile} story @param {import('./story-map.mjs').Findings} findings */
const checkEffort = (story, { problems }) => {
  if (!EFFORTS.includes(story.effort?.points)) problems.push(`DoR 6: effort must be one of ${EFFORTS.join(', ')} (above 8: split the story)`)
  if (!isText(story.effort?.rationale)) problems.push('DoR 6: effort.rationale is missing')
}
