/**
 * The DESIGN records the engine checks when the solution architect finishes, instead of a lens:
 *   G10       a consistency-matrix-<story>.md in the tracking folder, its consistency-gate PASS,
 *             a comment in brackets or after a dash allowed after it
 *   G14      no ADR the run wrote is named *-rejected.md, *-accepted.md, *-deprecated.md or
 *             *-superseded.md
 *   G2, G12   every `**Supersedes:** ADR-MMM` of an ADR the run wrote has its registry row, ADR
 *             numbers compared without their leading zeros
 *
 * @typedef {{ path: string, text: string | null }} Text
 * @typedef {{ matrices: Text[], written: string[], adrs: Text[], registries: Text[] }} Records
 *   matrices: the consistency matrices of the tracking folder; written: the files under a
 *   docs/adr folder the run changed and that exist; adrs: the ADRs among them; registries: the
 *   supersession registry beside each.
 */

import { supersededInText } from '../decisions/adr.mjs'

const MATRIX = /(^|\/)consistency-matrix-[^/]+\.md$/
const ADR_FOLDER = /(^|\/)docs\/adr\/[^/]+$/
const VERDICT_NAME = /-(rejected|accepted|deprecated|superseded)\.md$/
const ADR = /(^|\/)docs\/adr\/adr-(\d+)[^/]*\.md$/i
const GATE_PASS = /^\s*(?:[-*]\s+)?(?:\*\*)?consistency-gate:(?:\*\*)?\s*(?:\*\*)?PASS(?:\*\*)?(?:\s+(?:\(.*\)|[—–-]\s.*))?\s*$/im
const ADR_ID = /ADR-(\d+)/gi

/** @param {string} path relative to the tracking folder */
export const isMatrix = (path) => MATRIX.test(path)

/** @param {string} path relative to the working copy */
export const isAdr = (path) => ADR.test(path)

/** A file right in a docs/adr folder. @param {string} path relative to the working copy */
export const inAdrFolder = (path) => ADR_FOLDER.test(path)

/** The supersession registry of an ADR's folder. @param {string} adr relative to the working copy */
export const registryOf = (adr) => adr.replace(/[^/]+$/, 'supersessions.md')

/**
 * Why the records send the architect back; empty when they hold.
 * @param {Records} records
 * @returns {string[]}
 */
export const recordFailures = ({ matrices, written, adrs, registries }) => [
  ...matrixFailures(matrices),
  ...written.filter((path) => VERDICT_NAME.test(path)).map((path) => `${path}: an ADR's verdict goes in its Status line, never in its file name (G14)`),
  ...adrs.flatMap((adr) => supersessionFailures(adr, registries)),
]

/** @param {Text[]} matrices */
const matrixFailures = (matrices) => {
  if (matrices.length === 0) return ['no consistency-matrix-<story>.md in the tracking folder: write it, its consistency-gate line reading PASS (G10)']
  return matrices.filter(({ text }) => !GATE_PASS.test(text ?? '')).map(({ path }) => `${path}: its consistency-gate line does not read PASS (G10)`)
}

/**
 * Each ADR an ADR supersedes and its registry does not name on one row with it.
 * @param {Text} adr @param {Text[]} registries
 */
const supersessionFailures = ({ path, text }, registries) => {
  const own = Number(/** @type {RegExpExecArray} */ (ADR.exec(path))[2])
  const registry = registries.find((entry) => entry.path === registryOf(path))?.text ?? ''
  return supersededInText(/** @type {string} */ (text))
    .filter((old) => !hasRow(registry, old, own))
    .map((old) => `${path} supersedes ${label(old)}, and ${registryOf(path)} has no row naming ${label(old)} and ${label(own)} (G2, G12)`)
}

/** `ADR-007`. @param {number} number */
const label = (number) => `ADR-${String(number).padStart(3, '0')}`

/** A row of the registry naming both ADRs. @param {string} registry @param {number} old @param {number} own */
const hasRow = (registry, old, own) => registry.split('\n').some((line) => {
  const named = [...line.matchAll(ADR_ID)].map((match) => Number(match[1]))
  return named.includes(old) && named.includes(own)
})
