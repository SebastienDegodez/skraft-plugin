// A story file written by the story writer, checked against the Definition of Ready before any
// lens reads it: the structure DoR items 1-8 need, the traceability from criterion to example,
// tasks covering every criterion, and the antipatterns a script can see.
import { EFFORTS, MAX_SMALL_POINTS } from './story-map.mjs'

export const MIN_EXAMPLES = 3
export const MIN_CRITERIA = 3
/** Small, by scope: one journey, at most one external integration, 3 to 5 criteria. */
export const MAX_CRITERIA = 5
export const MAX_INTEGRATIONS = 1

/**
 * The external systems a story can integrate with, as the PRD names them. Counting the distinct
 * ones a story names is a heuristic: a warning, never a refusal.
 */
export const INTEGRATIONS = Object.freeze([
  ['GitHub', /\bgit\s?hub\b/i], ['GitLab', /\bgit\s?lab\b/i], ['Slack', /\bslack\b/i], ['Teams', /\b(?:ms |microsoft )teams\b/i],
  ['Jira', /\bjira\b/i], ['e-mail', /\b(?:e-?mails?|courriels?)\b/i], ['SMS', /\bsms\b/i], ['webhook', /\bwebhooks?\b/i],
  ['web form', /\bformulaires? web\b|\bweb forms?\b|\bformulaire[^.]{0,40}\binterface web\b/i], ['Stripe', /\bstripe\b/i], ['SSO', /\b(?:sso|oidc|saml)\b/i],
])

/**
 * What each check of a story file stands for: the Definition of Ready item it proves (1-8, null
 * when it proves none), the INVEST letters a failure breaks, and the antipattern it names. The
 * canvas reads a refusal through this table, so a reviewer sees which item and which letter fail.
 * A rule marked `correction` is not sent back to the story writer: the map fixes the scope, so only
 * a correction a human accepts (split, merge) can lift it.
 * @type {Readonly<Record<string, { dor: number | null, invest: string[], antipattern?: string, target: string, correction?: boolean }>>}
 */
export const STORY_RULES = Object.freeze({
  'id-mismatch': { dor: null, invest: [], target: 'statement' },
  'epic-mismatch': { dor: null, invest: [], target: 'statement' },
  'field-missing': { dor: 1, invest: ['V'], target: 'statement' },
  'persona-missing': { dor: 2, invest: ['V'], target: 'statement' },
  'statement-missing': { dor: 1, invest: ['V'], target: 'statement' },
  'vague-persona': { dor: 2, invest: ['V'], antipattern: 'Vague Persona', target: 'statement' },
  'implement-x': { dor: 1, invest: ['N', 'V'], antipattern: 'Implement-X', target: 'statement' },
  'examples-too-few': { dor: 3, invest: ['T'], antipattern: 'No Examples', target: 'examples' },
  'example-incomplete': { dor: 3, invest: ['T'], target: 'examples' },
  'generic-data': { dor: 3, invest: ['T'], antipattern: 'Generic Data', target: 'examples' },
  'criteria-too-few': { dor: 4, invest: ['T'], target: 'criteria' },
  'criteria-too-many': { dor: 6, invest: ['S'], antipattern: 'Giant Story', target: 'criteria', correction: true },
  'effort-split': { dor: 6, invest: ['S'], target: 'effort' },
  'integrations-many': { dor: null, invest: ['S'], target: 'statement' },
  'too-small': { dor: 6, invest: ['V', 'S'], target: 'effort' },
  'criterion-incomplete': { dor: 4, invest: ['T'], target: 'criteria' },
  'criterion-no-outcome': { dor: 4, invest: ['T'], target: 'criteria' },
  'criterion-no-example': { dor: 5, invest: ['T'], target: 'criteria' },
  'criterion-unknown-requirement': { dor: null, invest: ['V'], target: 'criteria' },
  'requirement-uncarried': { dor: null, invest: ['V'], target: 'criteria' },
  'technical-ac': { dor: 4, invest: ['N'], antipattern: 'Technical AC', target: 'criteria' },
  'tasks-missing': { dor: null, invest: ['E'], target: 'tasks' },
  'task-incomplete': { dor: null, invest: ['E'], target: 'tasks' },
  'task-unknown-criterion': { dor: null, invest: ['E'], target: 'tasks' },
  'criterion-unserved': { dor: null, invest: ['E'], target: 'tasks' },
  'technical-notes-empty': { dor: 7, invest: ['E'], target: 'notes' },
  'references-missing': { dor: 7, invest: ['E'], target: 'notes' },
  'context-missing': { dor: 7, invest: ['E'], target: 'notes' },
  'testing-missing': { dor: 7, invest: ['T'], target: 'notes' },
  'dependencies-not-list': { dor: 8, invest: ['I'], antipattern: 'Missing Dependencies', target: 'dependencies' },
  'dependencies-mismatch': { dor: 8, invest: ['I'], antipattern: 'Missing Dependencies', target: 'dependencies' },
  'dependency-no-reason': { dor: 8, invest: ['I'], target: 'dependencies' },
  'dependency-no-story': { dor: 8, invest: ['I'], target: 'dependencies' },
  'effort-off-scale': { dor: 6, invest: ['E', 'S'], target: 'effort' },
  'effort-no-rationale': { dor: 6, invest: ['E'], target: 'effort' },
})

/**
 * @typedef {{ rule: string, kind: 'problem' | 'warning', message: string, params: Record<string, unknown> }} Detail
 * @typedef {{ problems: string[], warnings: string[], details: Detail[] }} StoryFindings
 */

/**
 * Records one check that does not hold: the message the story writer reads, and the rule with the
 * values it found for the reviewer.
 * @param {StoryFindings} findings @param {'problem' | 'warning'} kind @param {string} rule @param {string} message
 * @param {Record<string, unknown>} [params]
 */
const flag = (findings, kind, rule, message, params = {}) => {
  ;(kind === 'problem' ? findings.problems : findings.warnings).push(message)
  findings.details.push({ rule, kind, message, params })
}

const GENERIC_PERSONA = /^(?:an?\s+|le\s+|la\s+|l'|un\s+|une\s+)?(user|users|utilisateur|utilisatrice|utilisateurs|someone|somebody|quelqu'un|person|personne|customer|client|developer|d[ée]veloppeur|d[ée]veloppeuse|engineer|ing[ée]nieur|architect|architecte|the system|le syst[èe]me)$/i
const IMPLEMENT_X = /^(?:to\s+)?(implement|build|refactor|create (?:a|the) (?:service|repository|class|table)|impl[ée]menter|refactorer|cr[ée]er (?:un|le|la) (?:service|repository|d[ée]p[ôo]t|classe|table))\b/i
const TECHNICAL = /\b(?:HTTP\s*\d{3}|status(?: code)? \d{3}|(?:GET|POST|PUT|PATCH|DELETE) \/|\w+(?:Repository|Controller|Handler|UseCase|Service)\b|\.\w+\(\))/

const isText = (value) => typeof value === 'string' && value.trim() !== ''
const sameSet = (a, b) => a.length === b.length && a.every((value) => b.includes(value))

/**
 * An open question of a story: what the PRD leaves open, why it matters, the answers the writer
 * sees, and the answer the product owner gave (a draft until the writer uses it).
 * @typedef {{ id: string, question: string, why?: string, options?: string[], answer?: string, answeredAt?: string }} OpenQuestion
 * @typedef {Record<string, { text: string, at: string }>} Answers the answers of one story, by question id
 */

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
 *   effort: { points: number, rationale: string }, openQuestions?: OpenQuestion[],
 *   milestone?: string, moscow?: string, covers?: string[], after?: string[],
 * }} StoryFile
 */

/**
 * @param {unknown} file
 * @param {import('./story-map.mjs').MapStory & { epic: string }} planned the story as the approved map plans it
 * @param {Set<string>} known every requirement id the PRD defines
 * @returns {StoryFindings}
 */
export const checkStory = (file, planned, known) => {
  /** @type {StoryFindings} */
  const findings = { problems: [], warnings: [], details: [] }
  const story = /** @type {StoryFile} */ (file)
  if (!story || typeof story !== 'object') {
    flag(findings, 'problem', 'field-missing', 'the story file is not a JSON object', { field: 'file' })
    return findings
  }
  checkIdentity(story, planned, findings)
  checkStatement(story, findings)
  checkExamples(story, findings)
  checkCriteria(story, planned, known, findings)
  checkTasks(story, findings)
  checkNotes(story, findings)
  checkDependencies(story, planned, findings)
  checkEffort(story, findings)
  checkScope(story, findings)
  return findings
}

/** The rules only a human correction lifts. */
export const CORRECTION_RULES = Object.freeze(new Set(Object.entries(STORY_RULES).filter(([, rule]) => rule.correction).map(([name]) => name)))

/** The external systems a story names. @param {any} story @returns {string[]} */
export const integrationsOf = (story, { examples = false } = {}) => {
  const criteria = Array.isArray(story?.acceptanceCriteria) ? story.acceptanceCriteria : []
  const samples = examples && Array.isArray(story?.examples) ? story.examples.map((e) => e?.text) : []
  const text = [story?.title, story?.description, story?.story?.iWant, ...criteria.flatMap((c) => [c?.title, c?.given, c?.when]), ...samples].filter(isText).join(' ')
  return INTEGRATIONS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name)
}

/**
 * Small by scope and floor: more than one external integration is likely more than one story; a
 * 1-point story with the minimum of criteria is likely a case of another story, not a slice.
 * @param {StoryFile} story @param {StoryFindings} findings
 */
const checkScope = (story, findings) => {
  const integrations = integrationsOf(story)
  if (integrations.length > MAX_INTEGRATIONS) {
    flag(findings, 'warning', 'integrations-many', `${integrations.length} external integrations (${integrations.join(', ')}): one story integrates one, split by interface`, { count: integrations.length, integrations })
  }
  const criteria = Array.isArray(story.acceptanceCriteria) ? story.acceptanceCriteria.length : 0
  if (story.effort?.points === 1 && criteria <= MIN_CRITERIA) {
    flag(findings, 'warning', 'too-small', `1 point and ${criteria} criteria: too small to carry value on its own? merge it with a neighbour or give it a journey of its own`, { points: 1, criteria })
  }
}

/** @param {StoryFile} story @param {{ id: string, epic: string }} planned @param {StoryFindings} findings */
const checkIdentity = (story, planned, findings) => {
  if (story.id !== planned.id) flag(findings, 'problem', 'id-mismatch', `id is ${story.id}, the map plans ${planned.id}`, { found: story.id, planned: planned.id })
  if (story.epic !== planned.epic) flag(findings, 'problem', 'epic-mismatch', `epic is ${story.epic}, the map plans ${planned.epic}`, { found: story.epic, planned: planned.epic })
  for (const field of ['title', 'description', 'persona']) {
    if (!isText(story[field])) flag(findings, 'problem', field === 'persona' ? 'persona-missing' : 'field-missing', `${field} must be a non-empty string`, { field })
  }
}

/** @param {StoryFile} story @param {StoryFindings} findings */
const checkStatement = (story, findings) => {
  const statement = story.story ?? /** @type {any} */ ({})
  for (const part of ['asA', 'iWant', 'soThat']) if (!isText(statement[part])) flag(findings, 'problem', 'statement-missing', `DoR 1: story.${part} is missing`, { part })
  if (isText(story.persona) && GENERIC_PERSONA.test(story.persona.trim())) {
    flag(findings, 'problem', 'vague-persona', `DoR 2: persona "${story.persona}" names no role (Vague Persona)`, { persona: story.persona })
  }
  if (isText(statement.iWant) && IMPLEMENT_X.test(statement.iWant.trim())) {
    flag(findings, 'problem', 'implement-x', `DoR 1: "${statement.iWant}" describes an implementation (Implement-X)`, { iWant: statement.iWant })
  }
}

/** @param {StoryFile} story @param {StoryFindings} findings */
const checkExamples = (story, findings) => {
  const examples = Array.isArray(story.examples) ? story.examples : []
  if (examples.length < MIN_EXAMPLES) {
    flag(findings, 'problem', 'examples-too-few', `DoR 3: ${examples.length} domain example(s), at least ${MIN_EXAMPLES} needed`, { count: examples.length, min: MIN_EXAMPLES })
  }
  for (const example of examples) {
    if (!isText(example?.id) || !isText(example?.text)) flag(findings, 'problem', 'example-incomplete', 'DoR 3: every example needs an id and a text', { example: example?.id ?? null })
    else if (!/\d|«|"|“/.test(example.text)) flag(findings, 'warning', 'generic-data', `${example.id} carries no concrete value (Generic Data?)`, { example: example.id })
  }
}

/**
 * @param {StoryFile} story @param {{ covers: string[] }} planned @param {Set<string>} known
 * @param {StoryFindings} findings
 */
const checkCriteria = (story, planned, known, findings) => {
  const criteria = Array.isArray(story.acceptanceCriteria) ? story.acceptanceCriteria : []
  const examples = new Set((story.examples ?? []).map((e) => e?.id))
  if (criteria.length < MIN_CRITERIA) {
    flag(findings, 'problem', 'criteria-too-few', `DoR 4: ${criteria.length} acceptance criteria, at least ${MIN_CRITERIA} needed`, { count: criteria.length, min: MIN_CRITERIA })
  }
  if (criteria.length > MAX_CRITERIA) {
    flag(findings, 'problem', 'criteria-too-many', `DoR 6: ${criteria.length} acceptance criteria: split the story (Giant Story)`, { count: criteria.length, max: MAX_CRITERIA })
  }
  for (const criterion of criteria) criterionHolds(criterion, examples, known, findings)
  const carried = new Set(criteria.flatMap((c) => c?.covers ?? []))
  for (const id of planned.covers) {
    if (!carried.has(id)) flag(findings, 'problem', 'requirement-uncarried', `no acceptance criterion covers ${id}, which the map gives this story`, { requirement: id })
  }
}

/** @param {Criterion} criterion @param {Set<string>} examples @param {Set<string>} known @param {StoryFindings} findings */
const criterionHolds = (criterion, examples, known, findings) => {
  const at = criterion?.id ?? 'a criterion'
  for (const part of ['id', 'title', 'given', 'when']) {
    if (!isText(criterion?.[part])) flag(findings, 'problem', 'criterion-incomplete', `DoR 4: ${at}.${part} is missing`, { criterion: at, part })
  }
  if (!Array.isArray(criterion?.then) || criterion.then.length === 0 || !criterion.then.every(isText)) {
    flag(findings, 'problem', 'criterion-no-outcome', `DoR 4: ${at}.then must list at least one observable outcome`, { criterion: at })
  }
  if (!examples.has(criterion?.example)) flag(findings, 'problem', 'criterion-no-example', `DoR 5: ${at} derives from no domain example of the story`, { criterion: at, example: criterion?.example ?? null })
  for (const id of criterion?.covers ?? []) {
    if (!known.has(id)) flag(findings, 'problem', 'criterion-unknown-requirement', `${at} covers ${id}, which the PRD does not define`, { criterion: at, requirement: id })
  }
  const text = [criterion?.given, criterion?.when, ...(criterion?.then ?? [])].join(' ')
  const technical = TECHNICAL.exec(text)
  if (technical) flag(findings, 'problem', 'technical-ac', `${at} names system internals or HTTP details (Technical AC)`, { criterion: at, found: technical[0] })
}

/** @param {StoryFile} story @param {StoryFindings} findings */
const checkTasks = (story, findings) => {
  const tasks = Array.isArray(story.tasks) ? story.tasks : []
  const criteria = new Set((story.acceptanceCriteria ?? []).map((c) => c?.id))
  if (tasks.length === 0) flag(findings, 'problem', 'tasks-missing', 'tasks must list the work, each naming the criteria it serves')
  for (const task of tasks) {
    if (!isText(task?.text)) flag(findings, 'problem', 'task-incomplete', 'every task needs a text')
    for (const id of task?.acceptanceCriteria ?? []) {
      if (!criteria.has(id)) flag(findings, 'problem', 'task-unknown-criterion', `a task serves ${id}, which is no criterion of the story`, { criterion: id })
    }
  }
  const served = new Set(tasks.flatMap((t) => t?.acceptanceCriteria ?? []))
  for (const id of criteria) if (!served.has(id)) flag(findings, 'problem', 'criterion-unserved', `no task serves ${id}`, { criterion: id })
}

/** @param {StoryFile} story @param {StoryFindings} findings */
const checkNotes = (story, findings) => {
  if (!Array.isArray(story.technicalNotes) || !story.technicalNotes.some(isText)) {
    flag(findings, 'problem', 'technical-notes-empty', 'DoR 7: technicalNotes is empty (write "None identified" when there is none)')
  }
  const notes = story.devNotes ?? /** @type {any} */ ({})
  if (!Array.isArray(notes.references) || notes.references.length === 0) flag(findings, 'problem', 'references-missing', 'devNotes.references must cite the PRD passages the builder needs')
  if (!Array.isArray(notes.context) || !notes.context.some(isText)) flag(findings, 'problem', 'context-missing', 'devNotes.context must give the builder what it needs without reading the whole PRD')
  if (!Array.isArray(notes.testing) || !notes.testing.some(isText)) flag(findings, 'problem', 'testing-missing', 'devNotes.testing must say how the criteria are proven')
}

/**
 * The dependencies of the story file are the map's `after`, no more, no less: a story that grows a
 * dependency the map does not plan is how two stories end up waiting on each other. An entry
 * written `{ id }` instead of `{ story }` still names its story.
 * @param {StoryFile} story @param {{ after: string[] }} planned @param {StoryFindings} findings
 */
const checkDependencies = (story, planned, findings) => {
  if (!Array.isArray(story.dependencies)) return flag(findings, 'problem', 'dependencies-not-list', 'DoR 8: dependencies must be a list ([] when none)')
  const listed = story.dependencies.map(dependencyId)
  story.dependencies.forEach((dependency, index) => {
    if (!isText(listed[index])) {
      flag(findings, 'problem', 'dependency-no-story', `DoR 8: dependencies[${index}] names no story: write { "story": "<story id>", "reason": "…" }`, { index })
    }
  })
  if (!sameSet(listed, planned.after)) {
    flag(findings, 'problem', 'dependencies-mismatch', `DoR 8: dependencies are [${listed.join(', ')}], the map plans [${planned.after.join(', ')}]`, { found: listed, planned: planned.after })
  }
  for (const dependency of story.dependencies) {
    if (!isText(dependency?.reason)) flag(findings, 'problem', 'dependency-no-reason', `DoR 8: ${dependencyId(dependency)} is listed without a reason`, { story: dependencyId(dependency) ?? null })
  }
}

/** @param {any} dependency @returns {string | undefined} */
const dependencyId = (dependency) => dependency?.story ?? dependency?.id

/** The fields of a story file the approved map fixes: the code writes them, never the writer. */
export const MAP_FIELDS = Object.freeze(['id', 'epic', 'milestone', 'moscow', 'covers', 'after'])

/**
 * Writes into a story file what the approved map decides: its identity fields, and `dependencies`
 * rebuilt from `after` with the reason the writer gave (matched on `story` or `id`). A dependency
 * the writer added but the map does not plan moves to `openQuestions`, for the human who owns the
 * map. The writer only writes the content.
 * @param {unknown} file
 * @param {import('./story-map.mjs').MapStory & { epic: string }} planned
 * @param {Answers} [answers] the answers a human gave to its open questions
 * @param {Record<string, string>} [reasons] the reason of a dependency when the file gives none
 * @returns {{ file: unknown, changes: string[] }}
 */
export const normalizeStory = (file, planned, answers = {}, reasons = {}) => {
  if (!file || typeof file !== 'object' || Array.isArray(file)) return { file, changes: [] }
  const source = /** @type {Record<string, any>} */ (file)
  const story = { ...source }
  const changes = MAP_FIELDS.filter((field) => JSON.stringify(source[field]) !== JSON.stringify(mapValue(planned, field)))
  for (const field of MAP_FIELDS) story[field] = mapValue(planned, field)
  const listed = Array.isArray(source.dependencies) ? source.dependencies : []
  story.dependencies = planned.after.map((id) => dependencyOf(id, listed, reasons[id]))
  if (JSON.stringify(story.dependencies) !== JSON.stringify(source.dependencies)) changes.push('dependencies')
  const unplanned = listed.filter((d) => isText(dependencyId(d)) && !planned.after.includes(/** @type {string} */ (dependencyId(d))))
  if (unplanned.length) story.openQuestions = [...(Array.isArray(source.openQuestions) ? source.openQuestions : []), ...unplanned.map(unplannedQuestion)]
  changes.push(...normalizeNotes(story))
  const questions = openQuestionsOf(story.openQuestions, answers)
  if (JSON.stringify(questions) !== JSON.stringify(source.openQuestions ?? [])) changes.push('openQuestions')
  story.openQuestions = questions
  return { file: story, changes }
}

/**
 * The open questions in the schema shape: a text becomes `{ id, question }`, the ids run Q1, Q2…
 * where the writer gave none, and the answers a human gave are written in.
 * @param {unknown} value @param {Answers} answers @returns {OpenQuestion[]}
 */
export const openQuestionsOf = (value, answers = {}) => {
  const list = Array.isArray(value) ? value : []
  const questions = list.map(questionOf).filter((q) => q !== null)
  const used = new Set(questions.map((q) => q.id).filter(isText))
  let next = 1
  for (const question of questions) {
    if (isText(question.id)) continue
    while (used.has(`Q${next}`)) next += 1
    question.id = `Q${next}`
    used.add(question.id)
  }
  return questions.map((q) => (answers[q.id] && isText(answers[q.id].text) ? { ...q, answer: answers[q.id].text, answeredAt: answers[q.id].at } : q))
}

/** @param {unknown} entry @returns {OpenQuestion | null} */
const questionOf = (entry) => {
  if (isText(entry)) return { id: '', question: /** @type {string} */ (entry).trim() }
  if (!entry || typeof entry !== 'object') return null
  const record = /** @type {Record<string, any>} */ (entry)
  const question = [record.question, record.text, record.q, record.title].find(isText)
  if (!question) return null
  const why = [record.why, record.reason, record.context, record.impact].find(isText)
  const options = Array.isArray(record.options ?? record.choices) ? (record.options ?? record.choices).filter(isText) : []
  return {
    id: isText(record.id) ? record.id : '', question,
    ...(why ? { why } : {}), ...(options.length ? { options } : {}),
    ...(isText(record.answer) ? { answer: record.answer, ...(isText(record.answeredAt) ? { answeredAt: record.answeredAt } : {}) } : {}),
  }
}

/**
 * The notes in the shape the schema gives them, when the writer chose another one: a text where a
 * list is expected becomes a one-item list, a reference written as `"FR-234 : …"` becomes
 * `{ id, note }`.
 * @param {Record<string, any>} story @returns {string[]}
 */
const normalizeNotes = (story) => {
  const changes = []
  if (isText(story.technicalNotes)) {
    story.technicalNotes = [story.technicalNotes]
    changes.push('technicalNotes')
  }
  const notes = story.devNotes
  if (!notes || typeof notes !== 'object') return changes
  const fixed = { ...notes }
  for (const part of ['context', 'testing']) if (isText(notes[part])) fixed[part] = [notes[part]]
  if (isText(notes.references)) fixed.references = [notes.references]
  if (Array.isArray(fixed.references)) fixed.references = fixed.references.map(referenceOf)
  for (const part of ['context', 'testing', 'references']) if (JSON.stringify(fixed[part]) !== JSON.stringify(notes[part])) changes.push(`devNotes.${part}`)
  story.devNotes = fixed
  return changes
}

const REFERENCE = /^\s*([A-Z][A-Z0-9]*-\d+)\s*[:—–-]?\s*([\s\S]*)$/

/** @param {unknown} reference */
const referenceOf = (reference) => {
  if (!isText(reference)) return reference
  const text = /** @type {string} */ (reference)
  const named = REFERENCE.exec(text)
  if (named) return { id: named[1], note: named[2].trim() || named[1] }
  return { id: /\b[A-Z][A-Z0-9]*-\d+\b/.exec(text)?.[0] ?? 'PRD', note: text.trim() }
}

/** @param {Record<string, any>} planned @param {string} field */
const mapValue = (planned, field) => (Array.isArray(planned[field]) ? [...planned[field]] : planned[field])

/** @param {string} id @param {any[]} listed @param {string} [fallback] */
const dependencyOf = (id, listed, fallback) => {
  const written = listed.find((d) => dependencyId(d) === id)?.reason
  const reason = isText(written) ? written : fallback
  return isText(reason) ? { story: id, reason } : { story: id }
}

/** @param {any} dependency */
const unplannedQuestion = (dependency) => ({
  id: '', question: `Dependency on ${dependencyId(dependency)} not planned by the story map: add it to the map?`,
  ...(isText(dependency?.reason) ? { why: dependency.reason } : {}),
})

/** @param {StoryFile} story @param {StoryFindings} findings */
const checkEffort = (story, findings) => {
  if (!EFFORTS.includes(story.effort?.points)) {
    flag(findings, 'problem', 'effort-off-scale', `DoR 6: effort must be one of ${EFFORTS.join(', ')} (above 8: split the story)`, { found: story.effort?.points ?? null, scale: EFFORTS })
  } else if (story.effort.points > MAX_SMALL_POINTS) {
    flag(findings, 'warning', 'effort-split', `effort ${story.effort.points} is more than one day assisted by AI: a split is recommended`, { points: story.effort.points, max: MAX_SMALL_POINTS })
  }
  if (!isText(story.effort?.rationale)) flag(findings, 'problem', 'effort-no-rationale', 'DoR 6: effort.rationale is missing')
}
