import { ADR_FOLDER, ADR_INDEX, adrNumber, adrStatus, ratified, ratifiedInIndex } from '../domain/decisions/adr.mjs'

/**
 * @typedef {{
 *   workspace: import('./ports/workspace.mjs').Workspace,
 *   sourceControl: import('./ports/source-control.mjs').SourceControl,
 * }} RatificationDeps
 */

/**
 * The ADRs of the working copy whose status is Proposed, in file order.
 * @param {Pick<RatificationDeps, 'workspace'>} deps
 * @returns {Promise<string[]>} paths relative to the working copy
 */
export const proposedAdrs = async ({ workspace }) => {
  const paths = adrPaths(await workspace.list(ADR_FOLDER))
  const texts = await Promise.all(paths.map((path) => workspace.read(path)))
  return paths.filter((_, index) => texts[index] !== null && adrStatus(/** @type {string} */ (texts[index])) === 'Proposed')
}

/** @param {import('./ports/workspace.mjs').WorkspaceEntry[] | null} entries */
const adrPaths = (entries) => (entries ?? [])
  .filter((entry) => entry.kind === 'file')
  .map((entry) => `${ADR_FOLDER}/${entry.name}`)
  .filter((path) => adrNumber(path) !== null)
  .sort()

/**
 * The human ratified the ADRs: each is marked Accepted, in its header and in the decisions
 * index, and the change is committed on its own.
 * @param {RatificationDeps} deps
 * @param {{ adrs: string[], day: string }} ratification day: YYYY-MM-DD
 */
export const ratify = async (deps, { adrs, day }) => {
  const changed = [...(await markAccepted(deps, adrs, day)), ...(await markIndex(deps, adrs, day))]
  return deps.sourceControl.commitFiles('.', changed, `docs(adr): ratify ${adrs.map(adrLabel).join(', ')}`)
}

/** @param {RatificationDeps} deps @param {string[]} adrs @param {string} day @returns {Promise<string[]>} */
const markAccepted = async ({ workspace }, adrs, day) => {
  const marked = []
  for (const path of adrs) {
    const text = await workspace.read(path)
    if (text === null) continue
    await workspace.write(path, ratified(text, day))
    marked.push(path)
  }
  return marked
}

/** @param {RatificationDeps} deps @param {string[]} adrs @param {string} day @returns {Promise<string[]>} */
const markIndex = async ({ workspace }, adrs, day) => {
  const index = await workspace.read(ADR_INDEX)
  if (index === null) return []
  await workspace.write(ADR_INDEX, adrs.reduce((text, path) => ratifiedInIndex(text, /** @type {number} */ (adrNumber(path)), day), index))
  return [ADR_INDEX]
}

/** @param {string} path */
const adrLabel = (path) => `ADR-${String(adrNumber(path)).padStart(3, '0')}`
