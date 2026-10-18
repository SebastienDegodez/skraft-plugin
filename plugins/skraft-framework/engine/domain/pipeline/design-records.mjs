/**
 * The DESIGN records the engine checks when the solution architect finishes, instead of a lens:
 *   G10       a consistency-matrix-<story>.md in the tracking folder, its consistency-gate PASS
 *   G13       every decision-drift-*.md beside its -resolution.md; an open one waits for a human
 *   G14       no ADR the run changed is named *-rejected.md
 *   G2, G12   every `**Supersedes:** ADR-MMM` of an ADR the run changed has its registry row
 *
 * @typedef {{ path: string, text: string | null }} Text
 * @typedef {{ matrices: Text[], changed: string[], adrs: Text[], registries: Text[] }} Records
 *   matrices: the consistency matrices of the tracking folder; changed: the working-copy paths
 *   the run changed; adrs: the ADRs among them; registries: the supersession registry beside each.
 */

const MATRIX = /(^|\/)consistency-matrix-[^/]+\.md$/
const DRIFT = /(^|\/)decision-drift-[^/]+\.md$/
const RESOLUTION = '-resolution.md'
const REJECTED = /(^|\/)docs\/adr\/[^/]+-rejected\.md$/
const ADR = /(^|\/)docs\/adr\/adr-(\d+)[^/]*\.md$/i
const GATE_PASS = /^\s*(?:[-*]\s*)?consistency-gate:\s*PASS\b/im
const SUPERSEDES = /\*\*Supersedes:\*\*\s*\[?(ADR-\d+)/gi

/** @param {string} path relative to the tracking folder */
export const isMatrix = (path) => MATRIX.test(path)

/** @param {string} path relative to the working copy */
export const isAdr = (path) => ADR.test(path)

/** The supersession registry of an ADR's folder. @param {string} adr relative to the working copy */
export const registryOf = (adr) => adr.replace(/[^/]+$/, 'supersessions.md')

/**
 * The decision drifts of the tracking folder with no resolution beside them, each as the line
 * that blocks the step.
 * @param {string[]} tracked the files of the tracking folder, relative to it
 */
export const openDrifts = (tracked) => tracked
  .filter((path) => DRIFT.test(path) && !path.endsWith(RESOLUTION) && !tracked.includes(resolutionOf(path)))
  .map((path) => `${path} has no ${resolutionOf(path).split('/').at(-1)} beside it: a human answers the drift there (G13)`)

/** @param {string} drift */
const resolutionOf = (drift) => `${drift.slice(0, -'.md'.length)}${RESOLUTION}`

/**
 * Why the records send the architect back; empty when they hold.
 * @param {Records} records
 * @returns {string[]}
 */
export const recordFailures = ({ matrices, changed, adrs, registries }) => [
  ...matrixFailures(matrices),
  ...changed.filter((path) => REJECTED.test(path)).map((path) => `${path}: an ADR's verdict goes in its Status line, never in its file name (G14)`),
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
  const own = `ADR-${/** @type {RegExpExecArray} */ (ADR.exec(path))[2]}`
  const registry = registries.find((entry) => entry.path === registryOf(path))?.text ?? ''
  return [...(text ?? '').matchAll(SUPERSEDES)]
    .map((match) => match[1].toUpperCase())
    .filter((old) => !hasRow(registry, old, own))
    .map((old) => `${path} supersedes ${old}, and ${registryOf(path)} has no row naming ${old} and ${own} (G2, G12)`)
}

/** @param {string} registry @param {string} old @param {string} own */
const hasRow = (registry, old, own) => registry.toUpperCase().split('\n').some((line) => line.includes(old) && line.includes(own))
