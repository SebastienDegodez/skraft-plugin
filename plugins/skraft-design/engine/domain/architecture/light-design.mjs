import { field, linkedAdrs } from '../decisions/adr.mjs'

/**
 * What takes a delivery's light design beyond a light design (#669), each read without a model:
 * an ADR that replaces or amends a decision already taken, a bounded context the context map does
 * not hold yet, more ADRs or a bigger story than a light design carries. A person then chooses to
 * go on with it or to design the story first.
 */
/**
 * The plugin a delivery waits on to design a story, named in parts so that the delivery plugin's
 * copy of this engine, which writes every other name of this plugin as its own, names it as it is.
 */
export const DESIGN_PLUGIN = ['skraft', 'design'].join('-')

export const LIGHT_LIMITS = Object.freeze({ adrs: 2, criteria: 8, components: 3, contexts: 2, useCases: 6 })

const AMENDS_LINE = /\*\*Amends:\*\*\s*\[?ADR-(\d+)/gi
const NEW_MARK = /\(new\)/i

/**
 * @param {{ brief: { criteria: unknown[], components: unknown[] }, text: string, adrs: Array<{ path: string, text: string }> }} design
 *   text: the brief's whole text; adrs: the ADRs the light design wrote
 * @returns {string[]} one sentence each, none when it stays a light design
 */
export const lightDesignReasons = ({ brief, text, adrs }) => [
  ...adrs.flatMap(replacing),
  ...(NEW_MARK.test(sectionOf(text, 'Context')) ? ['the brief names a bounded context the context map does not hold'] : []),
  ...over(adrs.length, LIGHT_LIMITS.adrs, (count) => `it wrote ${count} ADRs`),
  ...over(brief.criteria.length, LIGHT_LIMITS.criteria, (count) => `the story has ${count} acceptance criteria`),
  ...over(brief.components.length, LIGHT_LIMITS.components, (count) => `it changes ${count} components`),
  ...over(itemsOf(sectionOf(text, 'Context')).length, LIGHT_LIMITS.contexts, (count) => `it touches ${count} bounded contexts`),
  ...over(itemsOf(sectionOf(text, 'Use cases')).length, LIGHT_LIMITS.useCases, (count) => `it adds or changes ${count} use cases`),
]

/** The text of a `## <heading>` section of the brief, empty without one. @param {string} text @param {string} heading */
const sectionOf = (text, heading) => new RegExp(`^## ${heading}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(text)?.[1] ?? ''

/** The top-level items of a section's list, each on one line, without its bullet. @param {string} section */
const itemsOf = (section) => section.split('\n').filter((line) => /^[-*] /.test(line)).map((line) => line.slice(2).trim())

/** @param {{ path: string, text: string }} adr */
const replacing = ({ path, text }) => {
  const numbers = [...linkedAdrs(text).map(({ number }) => number), ...[...text.matchAll(AMENDS_LINE)].map((match) => Number(match[1]))]
  return [...new Set(numbers)].map((number) => `${path} replaces or amends ADR-${String(number).padStart(3, '0')}, a decision already taken`)
}

/** @param {number} count @param {number} limit @param {(count: number) => string} sentence */
const over = (count, limit, sentence) => (count > limit ? [`${sentence(count)}, more than ${limit}`] : [])

const NONE = /^none\.?$/i
const ASSUMPTIONS_LENGTH = 1500

/**
 * What the light design assumed where the story leaves a choice open: each item of its brief's
 * `## Assumptions`, numbered, as many whole items as fit, then how many more the brief holds; null
 * when it assumed nothing.
 * @param {string} text the brief's whole text
 */
export const assumptionsOf = (text) => {
  const stated = assumedItems(text)
  if (stated.length === 0) return null
  const shown = fitting(stated.map((item, index) => `(${index + 1}) ${item}`))
  return [...shown, ...(shown.length < stated.length ? [`and ${stated.length - shown.length} more in the brief`] : [])].join('; ')
}

/**
 * Each thing the light design assumed, as its brief's `## Assumptions` lists it; none when it
 * assumed nothing. @param {string} text the brief's whole text
 */
export const assumedItems = (text) => {
  const section = sectionOf(text, 'Assumptions')
  const items = itemsOf(section)
  return items.length > 0 ? items : [section.replace(/\s+/g, ' ').trim()].filter((one) => one !== '' && !NONE.test(one))
}

/** The leading items whose total length fits, at least one. @param {string[]} items */
const fitting = (items) => {
  let length = 0
  return items.filter((item, index) => {
    length += item.length + 2
    return index === 0 || length <= ASSUMPTIONS_LENGTH
  })
}

/** The one-sentence decision of an ADR, as its header states it. @param {string} text */
export const decisionLine = (text) => field(text, 'decision') ?? 'no decision line'
