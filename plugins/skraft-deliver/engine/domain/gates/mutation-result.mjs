import { joinRelative } from '../config/relative-path.mjs'
import { MUTATION_BAR } from './mutation-bar.mjs'

/**
 * The result a mutation command writes to the file SKRAFT_MUTATION_RESULT names, its score
 * already computed: `{ "scopes": [{ "name", "score", "survivors"? }] }`. Core and boundary are
 * the scopes of a component in Clean Architecture, global the one scope of a single project;
 * each survivor is told `<file>:<line> <detail>`, the file relative to the component's root.
 *
 * @typedef {import('./mutation-report.mjs').Survivor} Survivor
 * @typedef {import('./mutation-bar.mjs').ScopeScore} ScopeScore
 * @typedef {{ ok: true, scores: ScopeScore[] } | { ok: false, reason: string }} ResultReading
 */

/** The environment variable that names the file the command writes its result to. */
export const RESULT_VARIABLE = 'SKRAFT_MUTATION_RESULT'

/** The scopes a result may name. */
const SCOPES = Object.freeze(['core', 'boundary', 'global'])

/** A survivor line: `<file>:<line>`, then what changed. */
const SURVIVOR = /^(.+?):(\d+)(?:\s+(.*?))?\s*$/

/**
 * The scores of a result, each scope against the bar, or why it cannot be read.
 * @param {string} text @param {string} root the component's root, which survivor files are relative to
 * @returns {ResultReading}
 */
export const readMutationResult = (text, root) => {
  const parsed = parsedJson(text)
  if (parsed === undefined) return refused('is not JSON')
  const scopes = parsed?.scopes
  if (!Array.isArray(scopes) || scopes.length === 0) return refused('names no scope')
  const problem = scopes.map(scopeProblem).find((found) => found !== null) ?? mixProblem(scopes)
  return problem === null ? { ok: true, scores: scopes.map((scope) => scoreOf(scope, root)) } : refused(problem)
}

/** @param {string} text @returns {unknown} undefined when it is not JSON */
const parsedJson = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** @param {string} reason @returns {ResultReading} */
const refused = (reason) => ({ ok: false, reason })

/** What makes a scope unreadable, null when nothing does. @param {any} scope */
const scopeProblem = (scope) => {
  if (!SCOPES.includes(scope?.name)) return `names a scope ${scope?.name}: core, boundary or global`
  if (typeof scope.score !== 'number' || scope.score < 0 || scope.score > 100) return `gives ${scope.name} a score that is not a percent`
  return survivorsProblem(scope.name, scope.survivors ?? [])
}

/** @param {string} name @param {unknown} survivors */
const survivorsProblem = (name, survivors) => {
  if (!Array.isArray(survivors)) return `gives ${name} survivors that are not a list`
  const wrong = survivors.find((line) => typeof line !== 'string' || !SURVIVOR.test(line))
  return wrong === undefined ? null : `tells a survivor of ${name} as ${String(wrong)}, not <file>:<line> <detail>`
}

/** Each scope once, and global alone. @param {Array<{ name: string }>} scopes */
const mixProblem = (scopes) => {
  const names = scopes.map(({ name }) => name)
  if (new Set(names).size < names.length) return 'names a scope twice'
  return names.includes('global') && names.length > 1 ? 'names global with another scope' : null
}

/** @param {{ name: string, score: number, survivors?: string[] }} scope @param {string} root @returns {ScopeScore} */
const scoreOf = ({ name, score, survivors = [] }, root) => ({
  scope: /** @type {ScopeScore['scope']} */ (name), bar: MUTATION_BAR, score, counted: null, survivors: survivors.map((line) => survivorOf(line, root)),
})

/** @param {string} line @param {string} root @returns {Survivor} */
const survivorOf = (line, root) => {
  const [, file, at, detail] = /** @type {RegExpExecArray} */ (SURVIVOR.exec(line))
  return { file: joinRelative(root, file), line: Number(at), mutator: detail || 'mutant', replacement: null, covered: true }
}
