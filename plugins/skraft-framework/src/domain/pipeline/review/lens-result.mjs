import { Ok, Err } from '../../result.mjs'
import { parseYaml } from '../../yaml-parser.mjs'

// Pure: a lens's answer, read and checked. A lens returns one YAML document
// { lens, verdict, defects[] } (its descriptor's Output section); a document that does
// not parse, names another lens, or uses a verdict or severity outside the enums is
// malformed: RunReview asks the lens once more, then records it inconclusive.

export const LENS_VERDICTS = Object.freeze(['pass', 'fail', 'inconclusive'])
export const SEVERITIES = Object.freeze(['blocker', 'high', 'medium', 'low'])

const FENCED = /```(?:ya?ml)?[ \t]*\n([\s\S]*?)\n```/i

// The YAML of an answer: its first fenced block, else the whole text.
export const lensDocumentOf = (text) => {
  const source = String(text ?? '')
  return (source.match(FENCED)?.[1] ?? source).trim()
}

const text = (value) => (value === null || value === undefined ? '' : String(value))

const defectOf = (raw, index) => Object.freeze({
  id: text(raw.id) || `D${index + 1}`,
  gate: text(raw.gate) || 'meta',
  severity: raw.severity,
  location: text(raw.location),
  description: text(raw.description),
  ...(raw.suggestion ? { suggestion: text(raw.suggestion) } : {}),
})

// Ok({ lens, verdict, defects }) or Err(reason).
export const parseLensResult = (answer, expectedLens) => {
  const source = lensDocumentOf(answer)
  if (source === '') return Err('the lens returned no YAML document')
  let document
  try { document = parseYaml(source) } catch (error) { return Err(`the YAML does not parse: ${error?.message ?? error}`) }
  if (document?.lens !== expectedLens) return Err(`lens is ${JSON.stringify(document?.lens ?? null)}, expected "${expectedLens}"`)
  if (!LENS_VERDICTS.includes(document.verdict)) return Err(`verdict ${JSON.stringify(document.verdict ?? null)} is not one of ${LENS_VERDICTS.join(', ')}`)
  const defects = document.defects ?? []
  if (!Array.isArray(defects)) return Err('defects is not a list')
  const malformed = defects.findIndex((defect) => !defect || typeof defect !== 'object' || !SEVERITIES.includes(defect.severity))
  if (malformed >= 0) return Err(`defect ${malformed + 1} has severity ${JSON.stringify(defects[malformed]?.severity ?? null)}, not one of ${SEVERITIES.join(', ')}`)
  return Ok(Object.freeze({ lens: expectedLens, verdict: document.verdict, defects: Object.freeze(defects.map(defectOf)) }))
}

// The result recorded for a lens whose answer stayed malformed, or that answered nothing.
export const inconclusiveLens = (lensName, reason) => Object.freeze({
  lens: lensName,
  verdict: 'inconclusive',
  defects: Object.freeze([Object.freeze({
    id: 'D1',
    gate: 'meta',
    severity: 'medium',
    location: 'review',
    description: `lens output unusable after one retry: ${reason}`,
  })]),
})
