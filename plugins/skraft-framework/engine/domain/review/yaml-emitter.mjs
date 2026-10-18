/**
 * The small YAML the engine writes: top-level `key: value` lines and lists of flat mappings,
 * the shape the answer reader (answer-yaml.mjs) reads back. Every string is double-quoted with
 * JSON's escapes, which YAML's double-quoted style shares; null is `null`, an empty list `[]`.
 * The texts it gets are on one line already (answers.mjs folds every white space, U+2028 too).
 *
 * @typedef {string | null} Scalar
 * @typedef {Record<string, Scalar>} Mapping a mapping with at least one key
 * @typedef {Record<string, Scalar | Mapping[]>} Document
 */

/** @param {Document} document */
export const emitYaml = (document) => `${Object.entries(document).flatMap(([key, value]) => entryLines(key, value)).join('\n')}\n`

/** @param {string} key @param {Scalar | Mapping[]} value */
const entryLines = (key, value) => (Array.isArray(value) ? listLines(key, value) : [`${key}: ${scalar(value)}`])

/** @param {string} key @param {Mapping[]} items */
const listLines = (key, items) => (items.length === 0 ? [`${key}: []`] : [`${key}:`, ...items.flatMap(itemLines)])

/** @param {Mapping} item */
const itemLines = (item) => Object.entries(item).map(([field, value], index) => `${index === 0 ? '  - ' : '    '}${field}: ${scalar(value)}`)

/** @param {Scalar} value */
const scalar = (value) => (value === null ? 'null' : JSON.stringify(value))
