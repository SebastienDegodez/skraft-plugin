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

export const LIGHT_LIMITS = Object.freeze({ adrs: 2, criteria: 8, components: 3 })

const AMENDS_LINE = /\*\*Amends:\*\*\s*\[?ADR-(\d+)/gi
const CONTEXT_SECTION = /^## Context[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m
const NEW_MARK = /\(new\)/i

/**
 * @param {{ brief: { criteria: unknown[], components: unknown[] }, text: string, adrs: Array<{ path: string, text: string }> }} design
 *   text: the brief's whole text; adrs: the ADRs the light design wrote
 * @returns {string[]} one sentence each, none when it stays a light design
 */
export const lightDesignReasons = ({ brief, text, adrs }) => [
  ...adrs.flatMap(replacing),
  ...(NEW_MARK.test(CONTEXT_SECTION.exec(text)?.[1] ?? '') ? ['the brief names a bounded context the context map does not hold'] : []),
  ...over(adrs.length, LIGHT_LIMITS.adrs, (count) => `it wrote ${count} ADRs`),
  ...over(brief.criteria.length, LIGHT_LIMITS.criteria, (count) => `the story has ${count} acceptance criteria`),
  ...over(brief.components.length, LIGHT_LIMITS.components, (count) => `it changes ${count} components`),
]

/** @param {{ path: string, text: string }} adr */
const replacing = ({ path, text }) => {
  const numbers = [...linkedAdrs(text).map(({ number }) => number), ...[...text.matchAll(AMENDS_LINE)].map((match) => Number(match[1]))]
  return [...new Set(numbers)].map((number) => `${path} replaces or amends ADR-${String(number).padStart(3, '0')}, a decision already taken`)
}

/** @param {number} count @param {number} limit @param {(count: number) => string} sentence */
const over = (count, limit, sentence) => (count > limit ? [`${sentence(count)}, more than ${limit}`] : [])

/** The one-sentence decision of an ADR, as its header states it. @param {string} text */
export const decisionLine = (text) => field(text, 'decision') ?? 'no decision line'
