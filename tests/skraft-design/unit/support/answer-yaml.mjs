// What a lens or the refuter writes as its YAML answer, from a plain object: lens, verdict and
// findings, or verdict and reason. Words stay plain; every other text is double-quoted.

/** @param {unknown} value */
const scalar = (value) => (typeof value === 'string' && /^[\w.-]+$/.test(value) ? value : JSON.stringify(value))

/** @param {string} key @param {object[]} items */
const listLines = (key, items) => (items.length === 0
  ? [`${key}: []`]
  : [`${key}:`, ...items.flatMap((item) => Object.entries(item).flatMap(([field, value], index) => fieldLines(`${index === 0 ? '  - ' : '    '}${field}:`, value)))])

/** A field of an item: a value on its line, or a list of values, one `- <value>` line each under it. @param {string} head @param {unknown} value */
const fieldLines = (head, value) => (Array.isArray(value) ? [head, ...value.map((one) => `      - ${scalar(one)}`)] : [`${head} ${scalar(value)}`])

/** @param {Record<string, unknown>} document */
export const answerYaml = (document) => Object.entries(document)
  .flatMap(([key, value]) => (Array.isArray(value) ? listLines(key, value) : [`${key}: ${scalar(value)}`]))
  .join('\n')

/**
 * A lens's finding with the context every finding carries, unless given: why its severity, its
 * drift, where it holds (its location).
 * @param {Record<string, any>} given
 */
export const withContext = (given) => ({ severityReason: `${given.severity} by the criterion`, drift: 'structural', occurrences: given.location || 'nowhere:0', ...given })
