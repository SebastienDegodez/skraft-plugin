import { ADR_FOLDER, ADR_INDEX, ADR_MERGE_ACCEPTANCE, acceptedOnMerge, acceptedOnMergeInIndex, adrNumber, adrStatus, field } from '../../domain/decisions/adr.mjs'
import { engineMessage } from '../../domain/pipeline/commits.mjs'

/**
 * @typedef {{
 *   workspace: import('../ports/workspace.mjs').Workspace,
 *   sourceControl: import('../ports/source-control.mjs').SourceControl,
 * }} RatificationDeps
 */

/**
 * The ADRs of the working copy whose status is Proposed, in file order; a string says why the
 * ADR folder cannot be listed.
 * @param {Pick<RatificationDeps, 'workspace'>} deps
 * @returns {Promise<string[] | string>} paths relative to the working copy
 */
export const proposedAdrs = async ({ workspace }) => {
  const paths = await adrFiles({ workspace })
  if (typeof paths === 'string') return paths
  const texts = await Promise.all(paths.map((path) => workspace.read(path)))
  return paths.filter((_, index) => texts[index] !== null && adrStatus(/** @type {string} */ (texts[index])) === 'Proposed')
}

/**
 * ADRs this run marked Accepted, for retrying the PR record after an interrupted journal write.
 * @param {Pick<RatificationDeps, 'workspace'>} deps
 * @returns {Promise<string[] | string>}
 */
export const acceptedOnMergeAdrs = async ({ workspace }) => {
  const paths = await adrFiles({ workspace })
  if (typeof paths === 'string') return paths
  const texts = await Promise.all(paths.map((path) => workspace.read(path)))
  return paths.filter((_, index) => texts[index] !== null
    && adrStatus(/** @type {string} */ (texts[index])) === 'Accepted'
    && field(/** @type {string} */ (texts[index]), 'ratified_by') === ADR_MERGE_ACCEPTANCE)
}

/**
 * Proposed ADRs authored on this run's branch, excluding proposals already present on its base.
 * @param {RatificationDeps} deps
 * @param {import('../config/bases.mjs').Base[]} bases
 * @returns {Promise<string[] | string>}
 */
export const newProposedAdrs = async (deps, bases) => unpublishedAdrs(deps, bases, await proposedAdrs(deps))

/**
 * ADRs accepted by this run, excluding prior architecture PRs already on the base.
 * @param {RatificationDeps} deps
 * @param {import('../config/bases.mjs').Base[]} bases
 * @returns {Promise<string[] | string>}
 */
export const newAcceptedOnMergeAdrs = async (deps, bases) => unpublishedAdrs(deps, bases, await acceptedOnMergeAdrs(deps))

/** @param {RatificationDeps} deps @param {import('../config/bases.mjs').Base[]} bases @param {string[] | string} paths */
const unpublishedAdrs = async (deps, bases, paths) => {
  if (typeof paths === 'string') return paths
  if (paths.length === 0) return []
  const own = bases.find(({ component }) => component === null)
  if (own === undefined) return 'the working copy has no merge base; cannot distinguish new ADRs from published ADRs'
  const unpublished = []
  for (const path of paths) if (!await deps.sourceControl.existsAt('.', own.sha, path)) unpublished.push(path)
  return unpublished
}

/**
 * The ADR files of the working copy, in file order; none without an ADR folder, and a fixed
 * string when the machine cannot list it: the error's text reaches the journal and the prompts.
 * @param {Pick<RatificationDeps, 'workspace'>} deps
 * @returns {Promise<string[] | string>} paths relative to the working copy
 */
export const adrFiles = async ({ workspace }) => {
  try {
    return adrPaths(await workspace.list(ADR_FOLDER))
  } catch {
    return `${ADR_FOLDER} cannot be listed: Git or the file system refused to read it`
  }
}

/** @param {import('../ports/workspace.mjs').WorkspaceEntry[] | null} entries */
const adrPaths = (entries) => (entries ?? [])
  .filter((entry) => entry.kind === 'file')
  .map((entry) => `${ADR_FOLDER}/${entry.name}`)
  .filter((path) => adrNumber(path) !== null)
  .sort()

/**
 * The proposed ADRs are accepted by the architecture PR merge, and the branch records that condition.
 * @param {RatificationDeps} deps
 * @param {{ adrs: string[], issue: number | null }}
 */
export const acceptOnMerge = async (deps, { adrs, issue }) => {
  const changed = [...(await markAccepted(deps, adrs)), ...(await markIndex(deps, adrs))]
  return deps.sourceControl.commitFiles('.', changed, engineMessage(`docs(adr): accept on PR merge ${adrs.map(adrLabel).join(', ')}`, issue))
}

/** @param {RatificationDeps} deps @param {string[]} adrs @returns {Promise<string[]>} */
const markAccepted = async ({ workspace }, adrs) => {
  const marked = []
  for (const path of adrs) {
    const text = await workspace.read(path)
    if (text === null) continue
    await workspace.write(path, acceptedOnMerge(text))
    marked.push(path)
  }
  return marked
}

/** @param {RatificationDeps} deps @param {string[]} adrs @returns {Promise<string[]>} */
const markIndex = async ({ workspace }, adrs) => {
  const index = await workspace.read(ADR_INDEX)
  if (index === null) return []
  await workspace.write(ADR_INDEX, adrs.reduce((text, path) => acceptedOnMergeInIndex(text, /** @type {number} */ (adrNumber(path))), index))
  return [ADR_INDEX]
}

/** @param {string} path */
const adrLabel = (path) => `ADR-${String(adrNumber(path)).padStart(3, '0')}`
