/**
 * The signature of a failure: what failed and why, once everything a run changes from one try to
 * the next is taken out, so that the same failure gives the same signature on every attempt, every
 * pass and every machine, and two failures that differ give two.
 *
 * @typedef {{ step: string, code: string | null, lines: readonly string[] }} FailureEvidence
 *   step: the node that failed; code: its failure code; lines: what the engine says of the
 *   failure, then the output of the commands it ran, as they came
 * @typedef {{ slug: string, root: string }} SignatureContext
 *   root: the absolute path of the working copy, which holds the run's tracking folder
 */

/** How often the same failure may come back to a node since it last passed before the run stops. */
export const REPEATS = 3

/**
 * What changes from one try to the next and says nothing of the failure, each with what replaces
 * it; GUIDs before hashes and times before durations, which would cut them.
 * @type {ReadonlyArray<readonly [RegExp, string]>}
 */
const VARYING = Object.freeze([
  [/(?<=^|[\s'"(=:/])(?:(?:\/private)?\/var\/folders\/[^\s'"]+?\/T\/|\/tmp\/|[A-Za-z]:\\Users\\[^\\\s]+\\AppData\\Local\\Temp\\)[^\s'")]*/g, '<tmp>'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<guid>'],
  [/(?<!\d)\d{4}-\d{2}-\d{2}[T _]\d{2}[:_]\d{2}(?:[:_]\d{2}(?:[.,]\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/g, '<time>'],
  [/(?<!\d)(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})(?!\d)/g, '<date>'],
  [/\b\d{1,2}:\d{2}:\d{2}(?:[.,]\d+)?\b/g, '<time>'],
  [/\b\d+(?:[.,]\d+)?\s?(?:ms|s|sec|seconds?|min|minutes?|m|h)\b/g, '<duration>'],
  [/\b(pid|process)([\s:=#]*)\d+/gi, '$1$2<pid>'],
  [/\b(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|host\.docker\.internal):\d+/g, '$1:<port>'],
  [/\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b/g, '<sha>'],
  [/\b(attempt|pass|visit|round)( )\d+/gi, '$1$2<n>'],
  [/-\d+(?:-g\d+)?(?:-\d+)?\.(json|log|md)\b/g, '-<n>.$1'],
])

/**
 * The text of a failure as every try writes it: the working copy and the slug named, what varies
 * replaced, spaces at the end of a line and empty lines gone, the order of the lines kept.
 * @param {readonly string[]} lines @param {SignatureContext} context
 */
const steady = (lines, { slug, root }) => lines.join('\n').split(/\r?\n/)
  .map((line) => VARYING.reduce((text, [varying, by]) => text.replace(varying, by), line.replaceAll(root, '<repo>').replaceAll(slug, '<slug>')).trimEnd())
  .filter((line) => line !== '')
  .join('\n')

/**
 * A short, stable fingerprint of a text: FNV-1a on 32 bits, in hexadecimal.
 * @param {string} text
 */
const fingerprint = (text) => {
  let hash = 0x811c9dc5
  for (const char of text) hash = Math.imul(hash ^ /** @type {number} */ (char.codePointAt(0)), 0x01000193) >>> 0
  return hash.toString(16).padStart(8, '0')
}

/**
 * The signature of a failure: its step, its code and what it says, steady.
 * @param {FailureEvidence} evidence @param {SignatureContext} context
 */
export const failureSignature = ({ step, code, lines }, context) => fingerprint([step, String(code), steady(lines, context)].join('\n'))
