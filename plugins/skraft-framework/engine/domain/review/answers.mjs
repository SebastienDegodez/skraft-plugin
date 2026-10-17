import { parseAnswerYaml } from './answer-yaml.mjs'

/**
 * What a lens and the refuter answer: one YAML document, in the last fenced block of their final
 * message (the whole message when it has none). Only the keys of the contract are accepted, case
 * is normalized, and every text is cut to one bounded line, since it goes into the next brief.
 *
 * @typedef {'blocker' | 'high' | 'medium' | 'low'} Severity
 * @typedef {{ id: string, gate: string, severity: Severity, location: string, description: string, suggestion: string | null }} Finding
 * @typedef {{ lens: string, verdict: 'pass' | 'fail' | 'inconclusive', findings: Finding[] }} LensResult
 * @typedef {{ verdict: 'confirmed' | 'refuted' | 'unverifiable', reason: string }} Refutation
 * @typedef {{ ok: true, value: Record<string, any> } | { ok: false, error: string }} Reading
 */

const SEVERITIES = Object.freeze(/** @type {Severity[]} */ (['blocker', 'high', 'medium', 'low']))
const BLOCKING = Object.freeze(['blocker', 'high', 'medium'])
const VERDICTS = Object.freeze(['pass', 'fail', 'inconclusive'])
const REFUTATIONS = Object.freeze(['confirmed', 'refuted', 'unverifiable'])
const LENS_KEYS = Object.freeze(['lens', 'verdict', 'findings'])
const FINDING_KEYS = Object.freeze(['id', 'gate', 'severity', 'location', 'description', 'suggestion'])
const REFUTATION_KEYS = Object.freeze(['verdict', 'reason'])
const GATE = /^[A-Za-z][\w.-]{0,23}$/
/** The most findings a lens may give; each blocker or high one costs a refuter. */
export const MAX_FINDINGS = 20
/** How long each text may be once on one line. */
const LIMITS = Object.freeze({ id: 24, location: 200, description: 500, suggestion: 300, reason: 600 })

/** The document a lens brief asks for. @param {string} lens */
export const lensShape = (lens) => [
  `lens: ${lens}`,
  'verdict: fail            # pass | fail | inconclusive',
  'findings:                # [] when you find none',
  '  - id: F1',
  '    gate: G1             # the gate of your table',
  '    severity: blocker    # blocker | high | medium | low',
  '    location: "<path>:<line>"',
  '    description: "<what is wrong>"',
  '    suggestion: "<how to fix, one line; leave the key out when the fix is not evident>"',
].join('\n')

/** The document a refuter brief asks for. */
export const REFUTATION_SHAPE = [
  'verdict: refuted         # confirmed | refuted | unverifiable',
  'reason: "<the path:line you read and what it shows>"',
].join('\n')

const FENCE = /^[ \t]*```[\w-]*[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```[ \t]*$/gm

/** The text of the document an answer carries: its last fenced block, else the whole answer. @param {string} text */
const documentOf = (text) => ([...text.matchAll(FENCE)].at(-1)?.[1] ?? text).trim()

/** @param {string} text @returns {Reading} */
const mappingOf = (text) => {
  const source = documentOf(text)
  if (source === '') return { ok: false, error: 'the answer holds no YAML document' }
  const parsed = parseAnswerYaml(source)
  return parsed.ok ? parsed : { ok: false, error: `the answer is not the YAML document the brief shows (${parsed.error})` }
}

/** A text on one line, cut to its limit. @param {unknown} value @param {number} limit */
const oneLine = (value, limit) => {
  const line = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return line.length > limit ? `${line.slice(0, limit - 1)}…` : line
}

/** @param {unknown} value */
const word = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '')

/** The first key of a mapping the contract does not know. @param {Record<string, any>} value @param {readonly string[]} known */
const unknownKey = (value, known) => Object.keys(value).find((key) => !known.includes(key))

/**
 * @param {string} answer the lens's final message
 * @param {string} lens the lens it was asked as
 * @returns {{ ok: true, result: LensResult } | { ok: false, error: string }}
 */
export const readLensAnswer = (answer, lens) => {
  const read = mappingOf(answer)
  if (!read.ok) return read
  const error = lensError(read.value, lens)
  if (error !== null) return { ok: false, error }
  const findings = withIds(read.value.findings.map(findingOf))
  if (!Array.isArray(findings)) return findings
  const verdict = /** @type {LensResult['verdict']} */ (word(read.value.verdict))
  const contradicted = verdict === 'pass' ? findings.find((finding) => BLOCKING.includes(finding.severity)) : undefined
  if (contradicted !== undefined) return { ok: false, error: `verdict is pass but finding ${contradicted.id} is ${contradicted.severity}` }
  return { ok: true, result: { lens, verdict, findings } }
}

/** What keeps a document from being the lens's answer; null when nothing does. @param {Record<string, any>} value @param {string} lens */
const lensError = (value, lens) => {
  const unknown = unknownKey(value, LENS_KEYS)
  if (unknown !== undefined) return `the key ${unknown} is not in the contract; the keys are ${LENS_KEYS.join(', ')}`
  if (word(value.lens).replace(/-lens$/, '') !== lens) return `lens is ${JSON.stringify(value.lens ?? null)}, expected "${lens}"`
  if (!VERDICTS.includes(word(value.verdict))) return `verdict ${JSON.stringify(value.verdict ?? null)} is not one of ${VERDICTS.join(', ')}`
  if (!Object.hasOwn(value, 'findings')) return 'findings is missing; write `findings: []` when you find none'
  return findingsError(value.findings)
}

/** @param {unknown} findings */
const findingsError = (findings) => {
  if (!Array.isArray(findings)) return 'findings is not a list'
  if (findings.length > MAX_FINDINGS) return `${findings.length} findings; give at most ${MAX_FINDINGS}, the most severe first`
  const errors = findings.map(findingError)
  const index = errors.findIndex((error) => error !== null)
  return index < 0 ? null : `finding ${index + 1}: ${errors[index]}`
}

/** @param {any} finding */
const findingError = (finding) => {
  const unknown = unknownKey(finding, FINDING_KEYS)
  if (unknown !== undefined) return `the key ${unknown} is not in the contract; the keys are ${FINDING_KEYS.join(', ')}`
  if (!SEVERITIES.includes(/** @type {Severity} */ (word(finding.severity)))) return `severity must be one of ${SEVERITIES.join(', ')}`
  if (typeof finding.gate !== 'string' || !GATE.test(finding.gate.trim())) return 'gate must name the gate of your table, such as G1'
  return oneLine(finding.description, LIMITS.description) === '' ? 'description is empty' : null
}

/** @param {any} raw @returns {Finding} */
const findingOf = (raw) => ({
  id: oneLine(raw.id, LIMITS.id),
  gate: raw.gate.trim(),
  severity: /** @type {Severity} */ (word(raw.severity)),
  location: oneLine(raw.location, LIMITS.location),
  description: oneLine(raw.description, LIMITS.description),
  suggestion: oneLine(raw.suggestion, LIMITS.suggestion) || null,
})

/**
 * The findings with an id each: the one they gave, else the first `F<n>` none of them uses.
 * @param {Finding[]} findings
 * @returns {Finding[] | { ok: false, error: string }}
 */
const withIds = (findings) => {
  const given = findings.map(({ id }) => id).filter((id) => id !== '')
  const twice = given.find((id, index) => given.indexOf(id) !== index)
  if (twice !== undefined) return { ok: false, error: `finding id ${twice} is used twice` }
  const free = Array.from({ length: findings.length * 2 }, (_, index) => `F${index + 1}`).filter((id) => !given.includes(id))
  return findings.map((finding) => (finding.id === '' ? { ...finding, id: /** @type {string} */ (free.shift()) } : finding))
}

/**
 * @param {string} answer the refuter's final message
 * @returns {{ ok: true, refutation: Refutation } | { ok: false, error: string }}
 */
export const readRefutation = (answer) => {
  const read = mappingOf(answer)
  if (!read.ok) return read
  const error = refutationError(read.value)
  if (error !== null) return { ok: false, error }
  return { ok: true, refutation: { verdict: /** @type {Refutation['verdict']} */ (word(read.value.verdict)), reason: oneLine(read.value.reason, LIMITS.reason) } }
}

/** @param {Record<string, any>} value */
const refutationError = (value) => {
  const unknown = unknownKey(value, REFUTATION_KEYS)
  if (unknown !== undefined) return `the key ${unknown} is not in the contract; the keys are ${REFUTATION_KEYS.join(', ')}`
  const verdict = word(value.verdict)
  if (!REFUTATIONS.includes(verdict)) return `verdict ${JSON.stringify(value.verdict ?? null)} is not one of ${REFUTATIONS.join(', ')}`
  return verdict === 'refuted' && oneLine(value.reason, LIMITS.reason) === '' ? 'a refutation needs its reason: the path:line you read and what it shows' : null
}
