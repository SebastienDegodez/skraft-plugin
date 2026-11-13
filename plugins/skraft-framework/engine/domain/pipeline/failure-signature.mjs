/** The same failure may occur twice before a run can safely continue. */
export const REPEATED_FAILURES = 2

const VARIABLE_TEXT = Object.freeze([
  [/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/gi, '<time>'],
  [/\b\d{4}-\d{2}-\d{2}\b/g, '<date>'],
  [/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s+\d{1,2}:\d{2}:\d{2}(?:\.\d+)?(?:\s*[AP]M)?\b/gi, '<time>'],
  [/\b\d{1,2}:\d{2}:\d{2}(?:\.\d+)?(?:\s*[AP]M)?\b/gi, '<time>'],
  [/\b(?:pid|proce(?:ss(?:\s+id)?)?)\s*[:=#]?\s*\d+\b/gi, '<pid>'],
  [/\b\d+(?:\.\d+)?\s*(?:ms|msec|seconds?|secs?|s)\b/gi, '<duration>'],
  [/\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi, '<guid>'],
  [/\b[0-9a-f]{7,40}\b/gi, '<sha>'],
  [/\battempt(?:=|:|\s+)\d+\b/gi, 'attempt <n>'],
])

/**
 * Stable comparison input for one failed step. Path roots and run-specific values are supplied
 * by the caller so this policy stays pure and works on every host.
 * @param {{ step: string, cause: string, proof: string, root?: string, slug?: string }} failure
 */
export const failureSignatureInput = ({ step, cause, proof, root = '', slug = '' }) =>
  JSON.stringify([step, cause, normalizeProof(proof, { root, slug })])

/** @param {string} proof @param {{ root: string, slug: string }} run */
const normalizeProof = (proof, { root, slug }) => normalizedLines(normalizePaths(proof, root, slug))

/** @param {string} proof @param {string} root @param {string} slug */
const normalizePaths = (proof, root, slug) => {
  const slashed = proof.replaceAll('\\', '/')
  const rooted = root === '' ? slashed : slashed.replaceAll(root.replaceAll('\\', '/'), '<repo>')
  const named = slug === '' ? rooted : rooted.replaceAll(slug, '<slug>')
  return named.replace(/-(\d+)\.log\b/g, '-<attempt>.log')
}

/** @param {string} proof */
const normalizedLines = (proof) => normalizePorts(VARIABLE_TEXT.reduce(replaceVariable, proof))
  .split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line !== '').join('\n')

/** @param {string} proof */
const normalizePorts = (proof) => proof.replace(/:(\d{5})\b/g, (match, port) => Number(port) >= 49152 ? ':<port>' : match)

/** @param {string} proof @param {[RegExp, string]} rule */
const replaceVariable = (proof, [pattern, replacement]) => proof.replace(pattern, replacement)

/** @param {Array<{ type?: string, incidents?: Array<{ signature?: string }> }>} events @param {string} signature */
export const signatureOccurrences = (events, signature) => events
  .filter(({ type, incidents = [] }) => (type === 'step.recorded' || type === 'question.asked') && incidents.some((incident) => incident.signature === signature))
  .length
