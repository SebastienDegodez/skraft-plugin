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
  if (text === null) return { ok: false, errors: ['is missing'] }
  let value
  try {
    value = JSON.parse(text)
  } catch {
    return { ok: false, errors: ['is not JSON'] }
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { ok: false, errors: ['must hold a JSON object'] }
  const errors = [
    ...(STATUSES.includes(value.status) ? [] : [`status must be ${STATUSES.map((status) => JSON.stringify(status)).join(' or ')}`]),
    ...(typeof value.summary === 'string' && value.summary.trim() !== '' ? [] : ['summary must be a non-empty string']),
    ...Object.keys(value).filter((key) => !KEYS.includes(key)).map((key) => `unknown key ${key}`),
  ]
  return errors.length > 0 ? { ok: false, errors } : { ok: true, result: { status: value.status, summary: value.summary } }
}
