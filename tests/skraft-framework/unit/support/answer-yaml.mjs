// What a lens or the refuter writes as its YAML answer, from a plain object: lens, verdict and
// findings, or verdict and reason. Words stay plain; every other text is double-quoted.

/** @param {unknown} value */
const scalar = (value) => (typeof value === 'string' && /^[\w.-]+$/.test(value) ? value : JSON.stringify(value))

/** @param {string} key @param {object[]} items */
const listLines = (key, items) => (items.length === 0
  ? [`${key}: []`]
  : [`${key}:`, ...items.flatMap((item) => Object.entries(item).map(([field, value], index) => `${index === 0 ? '  - ' : '    '}${field}: ${scalar(value)}`))])

/** @param {Record<string, unknown>} document */
export const answerYaml = (document) => Object.entries(document)
  .flatMap(([key, value]) => (Array.isArray(value) ? listLines(key, value) : [`${key}: ${scalar(value)}`]))
  .join('\n')
