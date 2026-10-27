/**
 * `<slug>/state.json` of skraft v1: the run's state before the journal. A file of any other
 * shape is refused: v1 wrote no version, so its schema is the only mark of a v1 state.
 * @typedef {{ currentPhase: string, phasesCompleted: string[] }} V1State
 *   currentPhase: a phase, or DONE once every phase closed; phasesCompleted: in closing order.
 */

/** The phase v1 records once every phase closed. */
export const V1_DONE = 'DONE'

/** The fields the v1 schema declares; it allows no other. */
const DECLARED = Object.freeze([
  'projectSlug', 'currentPhase', 'phasesCompleted', 'phaseArtifacts', 'verdicts', 'reviewArtifacts', 'retryCount', 'reworkCount',
  'findingsResolved', 'phaseHistory', 'userPreferences', 'adrRatification',
])
/** The declared fields that hold an object. */
const OBJECTS = DECLARED.slice(3)

const NOTHING = 'nothing was migrated'
const NOT_AN_OBJECT = `state.json holds no JSON object; ${NOTHING}`
const UNDECLARED = `state.json holds a field the v1 state schema does not declare; ${NOTHING}`
const NO_PHASE = `state.json names no currentPhase; ${NOTHING}`
const WRONG_TYPE = `state.json holds a field whose type the v1 state schema does not allow; ${NOTHING}`

/**
 * @param {string} text the content of state.json
 * @returns {{ ok: true, state: V1State } | { ok: false, reason: string }} reason: fixed, it never quotes the file
 */
export const readV1State = (text) => {
  const raw = parsed(text)
  if (!isRecord(raw)) return { ok: false, reason: NOT_AN_OBJECT }
  if (Object.keys(raw).some((key) => !DECLARED.includes(key))) return { ok: false, reason: UNDECLARED }
  if (!isName(raw.currentPhase)) return { ok: false, reason: NO_PHASE }
  if (!wellTyped(raw)) return { ok: false, reason: WRONG_TYPE }
  return { ok: true, state: { currentPhase: raw.currentPhase, phasesCompleted: raw.phasesCompleted ?? [] } }
}

/** @param {string} text @returns {unknown} undefined when the text is no JSON */
const parsed = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** @param {Record<string, any>} raw */
const wellTyped = (raw) =>
  isNames(raw.phasesCompleted ?? []) && isOptionalName(raw.projectSlug) && OBJECTS.every((key) => raw[key] === undefined || isRecord(raw[key]))

/** @param {unknown} value @returns {value is string} */
const isName = (value) => typeof value === 'string' && value !== ''

/** @param {unknown} value */
const isOptionalName = (value) => value === undefined || value === null || isName(value)

/** @param {unknown} value */
const isNames = (value) => Array.isArray(value) && value.every(isName)

/** @param {unknown} value @returns {value is Record<string, any>} */
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
