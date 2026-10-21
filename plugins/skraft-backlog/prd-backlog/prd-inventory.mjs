// What a PRD asks for, read deterministically: the requirement ids it defines, the epic each one
// is written under, and the language the backlog is written in. The slicer and every check after
// it work from this inventory, never from a model's reading of the PRD.
import { createHash } from 'node:crypto'

const DEFINITION = /^\s*[*-]\s+`?((?:FR|NFR|AC|CON|GOAL)-\d{3,})`?\s*:\s*(.*)$/
const EPIC_HEADING = /^#{2,4}\s+(EP-\d{3,})\s*[:\-–—]\s*(.+?)\s*$/
const HEADING = /^(#{1,6})\s+/

/** @param {string} text */
export const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex')

/** The fingerprint of a story file's content, however it is indented on disk. @param {unknown} value */
export const fingerprintOf = (value) => sha256(JSON.stringify(value))

const FRENCH = /\b(le|la|les|des|une|est|doit|pour|avec|dans|qui|sur)\b/gi
const ENGLISH = /\b(the|and|must|shall|with|for|that|which|when|from|into)\b/gi

/** @param {string} text @returns {'fr' | 'en'} */
export const languageOf = (text) => {
  const sample = text.slice(0, 20000)
  return (sample.match(FRENCH)?.length ?? 0) > (sample.match(ENGLISH)?.length ?? 0) ? 'fr' : 'en'
}

/**
 * @typedef {{ id: string, kind: 'FR' | 'NFR' | 'AC' | 'CON' | 'GOAL', statement: string, epic: string | null, line: number }} Requirement
 * @typedef {{ id: string, title: string, line: number }} Epic
 * @typedef {{ sha256: string, language: 'fr' | 'en', epics: Epic[], requirements: Requirement[] }} Inventory
 */

/**
 * The inventory of a PRD written on the canonical template: `* \`FR-001\` : statement` bullets,
 * epics as `### EP-001 : Title` headings. A requirement belongs to the epic heading above it until
 * a heading of the same or a higher level closes that epic.
 * @param {string} text
 * @returns {Inventory}
 */
export const inventoryOf = (text) => {
  const epics = []
  const requirements = []
  const seen = new Set()
  let epic = null
  text.split(/\r?\n/).forEach((line, index) => {
    const heading = HEADING.exec(line)
    if (heading) epic = nextEpic(line, heading[1].length, epic, epics, index + 1)
    const definition = DEFINITION.exec(line)
    if (!definition || seen.has(definition[1])) return
    seen.add(definition[1])
    const kind = /** @type {Requirement['kind']} */ (definition[1].split('-')[0])
    requirements.push({ id: definition[1], kind, statement: definition[2].trim(), epic: kind === 'FR' ? epic?.id ?? null : null, line: index + 1 })
  })
  return { sha256: sha256(text), language: languageOf(text), epics, requirements }
}

/**
 * @param {string} line @param {number} level @param {{ id: string, level: number } | null} current
 * @param {Epic[]} epics @param {number} lineNumber
 */
const nextEpic = (line, level, current, epics, lineNumber) => {
  const match = EPIC_HEADING.exec(line)
  if (match) {
    if (!epics.some((e) => e.id === match[1])) epics.push({ id: match[1], title: match[2], line: lineNumber })
    return { id: match[1], level }
  }
  return current && level <= current.level ? null : current
}

/** @param {Inventory} inventory @param {Requirement['kind']} kind */
export const idsOf = (inventory, kind) => inventory.requirements.filter((r) => r.kind === kind).map((r) => r.id)
