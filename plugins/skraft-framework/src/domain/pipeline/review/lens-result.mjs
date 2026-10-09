import { Ok, Err } from '../../result.mjs'
import { parseYaml } from '../../yaml-parser.mjs'

// Pure: a lens's answer, read and checked. A lens returns one YAML document
// { lens, verdict, defects[] } (its descriptor's Output section); a document that does
// not parse, names another lens, or uses a verdict or severity outside the enums is
// malformed: RunReview asks the lens once more, then records it inconclusive.

export const LENS_VERDICTS = Object.freeze(['pass', 'fail', 'inconclusive'])
export const SEVERITIES = Object.freeze(['blocker', 'high', 'medium', 'low'])

// Fenced blocks open and close at the start of a line; the tag says what they hold.
const FENCE = /^```([\w-]*)[ \t]*\n([\s\S]*?)\n```[ \t]*$/gm
const YAML_TAG = /^ya?ml$/i

// The YAML documents an answer may carry, last first: its `yaml` blocks, else its untagged
// blocks, else the whole text. A lens that quotes code in a tagged block (```cs) or
// corrects itself in a second block is still read right.
export const lensDocumentsOf = (text) => {
  const source = String(text ?? '')
  const blocks = [...source.matchAll(FENCE)].map(([, tag, body]) => ({ tag, body: body.trim() }))
  const yaml = blocks.filter(({ tag }) => YAML_TAG.test(tag))
  const untagged = blocks.filter(({ tag }) => tag === '')
  const chosen = yaml.length > 0 ? yaml : untagged
  return chosen.length > 0 ? chosen.map(({ body }) => body).reverse() : [source.trim()]
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

// Ok({ lens, verdict, defects }) or Err(reason): the last document naming the lens is read;
// when none names it, the reason is the last document's.
export const parseLensResult = (answer, expectedLens) => {
  const documents = lensDocumentsOf(answer)
  const named = documents.find((source) => {
    try { return parseYaml(source)?.lens === expectedLens } catch { return false }
  })
  return parseLensDocument(named ?? documents[0], expectedLens)
}

const parseLensDocument = (source, expectedLens) => {
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
