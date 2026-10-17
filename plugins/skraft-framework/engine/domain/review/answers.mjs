/**
 * What a lens and the refuter answer: one JSON document, alone or in a fenced block, as the
 * last thing of their final message.
 *
 * @typedef {'blocker' | 'high' | 'medium' | 'low'} Severity
 * @typedef {{ id: string, severity: Severity, location: string, description: string, suggestion: string | null }} Finding
 * @typedef {{ lens: string, verdict: 'pass' | 'fail' | 'inconclusive', findings: Finding[] }} LensResult
 * @typedef {{ verdict: 'confirmed' | 'refuted' | 'unverifiable', reason: string }} Refutation
 * @typedef {{ ok: true, value: any } | { ok: false, error: string }} Reading
 */

export const SEVERITIES = Object.freeze(/** @type {Severity[]} */ (['blocker', 'high', 'medium', 'low']))
const VERDICTS = Object.freeze(['pass', 'fail', 'inconclusive'])
const REFUTATIONS = Object.freeze(['confirmed', 'refuted', 'unverifiable'])

/** The document a lens brief asks for. @param {string} lens */
export const lensShape = (lens) => `{"lens": "${lens}", "verdict": "pass" | "fail" | "inconclusive", "findings": [{"id": "F1", "severity": "blocker" | "high" | "medium" | "low", "location": "<path>:<line>", "description": "<what is wrong>", "suggestion": "<how to fix>"}]}`

/** The document a refuter brief asks for. */
export const REFUTATION_SHAPE = '{"verdict": "confirmed" | "refuted" | "unverifiable", "reason": "<the evidence you read>"}'

const FENCE = /^```([\w-]*)[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm

/**
 * The text of the document an answer carries: its last `json` block, else its last untagged
 * block, else the whole answer.
 * @param {string} text
 */
const documentOf = (text) => {
  const blocks = [...text.matchAll(FENCE)].map(([, tag, body]) => ({ tag: tag.toLowerCase(), body }))
  const chosen = blocks.filter(({ tag }) => tag === 'json').at(-1) ?? blocks.filter(({ tag }) => tag === '').at(-1)
  return (chosen?.body ?? text).trim()
}

/** @param {string} text @returns {Reading} */
const objectOf = (text) => {
  const source = documentOf(text)
  if (source === '') return { ok: false, error: 'the answer holds no JSON document' }
  try {
    const value = JSON.parse(source)
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? { ok: true, value } : { ok: false, error: 'the answer is not a JSON object' }
  } catch {
    return { ok: false, error: 'the answer is not JSON' }
  }
}

/** @param {unknown} value */
const text = (value) => (typeof value === 'string' ? value.trim() : '')

/**
 * @param {string} answer the lens's final message
 * @param {string} lens the lens it was asked as
 * @returns {{ ok: true, result: LensResult } | { ok: false, error: string }}
 */
export const readLensAnswer = (answer, lens) => {
  const read = objectOf(answer)
  if (!read.ok) return read
  const error = lensError(read.value, lens)
  if (error !== null) return { ok: false, error }
  const findings = (read.value.findings ?? []).map(findingOf)
  const twice = findings.find((finding, index) => findings.findIndex((other) => other.id === finding.id) !== index)
  if (twice !== undefined) return { ok: false, error: `finding id ${twice.id} is used twice` }
  return { ok: true, result: { lens, verdict: read.value.verdict, findings } }
}

/** What keeps a document from being the lens's answer; null when nothing does. @param {any} value @param {string} lens */
const lensError = (value, lens) => {
  if (value.lens !== lens) return `lens is ${JSON.stringify(value.lens ?? null)}, expected "${lens}"`
  if (!VERDICTS.includes(value.verdict)) return `verdict ${JSON.stringify(value.verdict ?? null)} is not one of ${VERDICTS.join(', ')}`
  return findingsError(value.findings ?? [])
}

/** @param {unknown} findings */
const findingsError = (findings) => {
  if (!Array.isArray(findings)) return 'findings is not a list'
  const bad = findings.findIndex((finding) => !SEVERITIES.includes(finding?.severity) || text(finding.description) === '')
  return bad < 0 ? null : `finding ${bad + 1} needs a severity among ${SEVERITIES.join(', ')} and a description`
}

/** @param {any} raw @param {number} index @returns {Finding} */
const findingOf = (raw, index) => ({
  id: text(raw.id) || `F${index + 1}`,
  severity: raw.severity,
  location: text(raw.location),
  description: text(raw.description),
  suggestion: text(raw.suggestion) || null,
})

/**
 * @param {string} answer the refuter's final message
 * @returns {{ ok: true, refutation: Refutation } | { ok: false, error: string }}
 */
export const readRefutation = (answer) => {
  const read = objectOf(answer)
  if (!read.ok) return read
  if (!REFUTATIONS.includes(read.value.verdict)) return { ok: false, error: `verdict ${JSON.stringify(read.value.verdict ?? null)} is not one of ${REFUTATIONS.join(', ')}` }
  return { ok: true, refutation: { verdict: read.value.verdict, reason: text(read.value.reason) } }
}
