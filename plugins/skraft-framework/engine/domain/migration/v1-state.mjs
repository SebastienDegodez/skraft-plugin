import { isRecord, parsedJson } from './json-text.mjs'

/**
 * `<slug>/state.json` of skraft v1: the run's state before the journal. A file of any other
 * shape is refused: v1 wrote no version, so its schema is the only mark of a v1 state.
 * @typedef {{ currentPhase: string, phasesCompleted: string[], phaseArtifacts: Record<string, unknown> }} V1State
 *   currentPhase: a phase, or DONE once every phase closed; phasesCompleted: in closing order;
 *   phaseArtifacts: the documents each phase recorded, by phase, as v1 wrote them.
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
  const raw = parsedJson(text)
  if (!isRecord(raw)) return { ok: false, reason: NOT_AN_OBJECT }
  if (Object.keys(raw).some((key) => !DECLARED.includes(key))) return { ok: false, reason: UNDECLARED }
  if (!isName(raw.currentPhase)) return { ok: false, reason: NO_PHASE }
  if (!wellTyped(raw)) return { ok: false, reason: WRONG_TYPE }
  return { ok: true, state: { currentPhase: raw.currentPhase, phasesCompleted: raw.phasesCompleted ?? [], phaseArtifacts: raw.phaseArtifacts ?? {} } }
}

/** Where v1 kept each run's folder, relative to the working copy. */
const TRACKING = '.copilot-tracking/skraft-plans/'

/**
 * Why a path is no document of the run, in the order a report lists them; `missing` is the
 * caller's, for a path whose file is gone.
 */
export const DROP_REASONS = Object.freeze(['not-a-path', 'absolute', 'separator', 'outside-run', 'missing'])

/** @type {ReadonlyArray<[string, (path: unknown) => boolean]>} each reason and the paths it drops, first match wins */
const DROPS = Object.freeze([
  ['not-a-path', (path) => !isName(path)],
  ['absolute', (path) => /** @type {string} */ (path).startsWith('/')],
  ['separator', (path) => /[\\:]/.test(/** @type {string} */ (path))],
  ['outside-run', (path) => /** @type {string} */ (path).split('/').includes('..')],
])

/**
 * The documents the completed phases recorded, in closing order, each once, relative to the
 * run's folder: a path v1 wrote from the working copy into that folder is made relative to it.
 * dropped: the reason of each other entry, a path not given (`not-a-path`), absolute, holding
 * `\` or `:` (`separator`) or leaving the folder (`outside-run`).
 * @param {V1State} state @param {string} slug the run's folder
 * @returns {{ documents: string[], dropped: string[] }}
 */
export const completedDocuments = ({ phasesCompleted, phaseArtifacts }, slug) => {
  const listed = phasesCompleted.flatMap((phase) => entriesOf(phaseArtifacts[phase])).map((entry) => insideRun(entry, slug))
  const kept = listed.filter((entry) => dropOf(entry) === null)
  return { documents: [...new Set(/** @type {string[]} */ (kept))], dropped: listed.map(dropOf).filter((reason) => reason !== null) }
}

/** @param {unknown} value @returns {unknown[]} */
// Stryker disable next-line ArrayDeclaration: a phase that recorded no list has no document, and a placeholder entry names no file of the run
const entriesOf = (value) => (Array.isArray(value) ? value : [])

/** A path v1 wrote from the working copy into the run's folder, made relative to it. @param {unknown} entry @param {string} slug */
const insideRun = (entry, slug) => {
  const folder = `${TRACKING}${slug}/`
  return typeof entry === 'string' && entry.startsWith(folder) ? entry.slice(folder.length) : entry
}

/** @param {unknown} entry @returns {string | null} why the entry is no document of the run, null when it is one */
const dropOf = (entry) => DROPS.find(([, drops]) => drops(entry))?.[0] ?? null

/** @param {Record<string, any>} raw */
const wellTyped = (raw) =>
  (raw.phasesCompleted === undefined || isNames(raw.phasesCompleted)) && isOptionalName(raw.projectSlug) && OBJECTS.every((key) => raw[key] === undefined || isRecord(raw[key]))

/** @param {unknown} value @returns {value is string} */
const isName = (value) => typeof value === 'string' && value !== ''

/** @param {unknown} value */
const isOptionalName = (value) => value === undefined || value === null || isName(value)

/** @param {unknown} value */
const isNames = (value) => Array.isArray(value) && value.every(isName)
