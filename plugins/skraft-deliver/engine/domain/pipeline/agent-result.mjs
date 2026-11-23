/**
 * The JSON an agent writes when it ends a dispatch, at the path its brief gives:
 * `{ "status": "done" | "blocked", "summary": "<what was done, or why it cannot go on>" }`.
 *
 * @typedef {{ status: 'done' | 'blocked', summary: string }} AgentResult
 * @typedef {{ ok: true, result: AgentResult } | { ok: false, errors: string[] }} ResultReading
 */

const STATUSES = Object.freeze(['done', 'blocked'])
const KEYS = Object.freeze(['status', 'summary'])

/** The shape a brief shows the agent. */
export const RESULT_SHAPE = '{"status": "done" | "blocked", "summary": "<what you did, or why you cannot go on>"}'

/**
 * @param {string | null} text the file's content, null when absent
 * @returns {ResultReading}
 */
export const readResult = (text) => {
  if (text === null) return refused(['is missing'])
  const parsed = parseJson(text)
  if (parsed === null) return refused(['is not JSON'])
  if (!isJsonObject(parsed.value)) return refused(['must hold a JSON object'])
  const errors = shapeErrors(parsed.value)
  return errors.length > 0 ? refused(errors) : { ok: true, result: { status: parsed.value.status, summary: parsed.value.summary } }
}

/** @param {string[]} errors @returns {ResultReading} */
const refused = (errors) => ({ ok: false, errors })

/** @param {string} text @returns {{ value: any } | null} null when the text is not JSON */
const parseJson = (text) => {
  try {
    return { value: JSON.parse(text) }
  } catch {
    return null
  }
}

/** @param {unknown} value */
const isJsonObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** What keeps a JSON object from being a result, status first. @param {any} value */
const shapeErrors = (value) => [
  ...(STATUSES.includes(value.status) ? [] : [`status must be ${STATUSES.map((status) => JSON.stringify(status)).join(' or ')}`]),
  ...(typeof value.summary === 'string' && value.summary.trim() !== '' ? [] : ['summary must be a non-empty string']),
  ...Object.keys(value).filter((key) => !KEYS.includes(key)).map((key) => `unknown key ${key}`),
]
