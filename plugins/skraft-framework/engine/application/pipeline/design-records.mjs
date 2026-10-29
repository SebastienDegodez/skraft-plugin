import { joinRelative } from '../../domain/config/relative-path.mjs'
import { inAdrFolder, isAdr, isMatrix, recordFailures, registryOf } from '../../domain/pipeline/design-records.mjs'
import { readOrName } from '../shared/workspace-reading.mjs'

/**
 * @typedef {{
 *   files: import('../ports/tracking-files.mjs').TrackingFiles,
 *   workspace: import('../ports/workspace.mjs').ConfigSource,
 *   sourceControl: import('../ports/source-control.mjs').SourceControl,
 * }} RecordDeps
 * @typedef {import('../../domain/pipeline/design-records.mjs').Text} Text
 */

/**
 * Why the DESIGN records a solution architect's attempt leaves send it back.
 * @param {RecordDeps} deps
 * @param {{ slug: string, base: ReadonlyArray<{ repository: string, sha: string }> }} run
 * @returns {Promise<string[] | string>} a string: why the machine could not tell what the run changed
 */
export const checkDesignRecords = async (deps, { slug, base }) => {
  const tracked = await deps.files.list(slug, '')
  const changed = await changedSinceBase(deps, base)
  if (typeof changed === 'string') return changed
  return recordFailures(await recordsOf(deps, slug, { tracked, changed }))
}

/**
 * The working-copy paths the run changed in each of its repositories.
 * @param {RecordDeps} deps @param {ReadonlyArray<{ repository: string, sha: string }>} base
 * @returns {Promise<string[] | string>}
 */
const changedSinceBase = async ({ sourceControl }, base) => {
  const changed = []
  for (const { repository, sha } of base.filter((entry, index) => base.findIndex((other) => other.repository === entry.repository) === index)) {
    const files = await sourceControl.changedFiles(repository, sha)
    if (files === null) return `Git cannot list what changed in ${repository} since ${sha}`
    changed.push(...files.map((file) => joinRelative(repository, file)))
  }
  return changed
}

/**
 * @param {RecordDeps} deps @param {string} slug @param {{ tracked: string[], changed: string[] }} paths
 * @returns {Promise<import('../../domain/pipeline/design-records.mjs').Records>}
 */
const recordsOf = async ({ files, workspace }, slug, { tracked, changed }) => {
  const fromWorkspace = (/** @type {string} */ path) => readOrName(workspace, path)
  const adrFolder = (await textsOf(changed.filter(inAdrFolder), fromWorkspace)).filter(({ text }) => text !== null)
  const adrs = adrFolder.filter(({ path }) => isAdr(path))
  return {
    matrices: await textsOf(tracked.filter(isMatrix), (path) => files.read(slug, path)),
    written: adrFolder.map(({ path }) => path),
    adrs,
    registries: await textsOf([...new Set(adrs.map(({ path }) => registryOf(path)))], fromWorkspace),
  }
}

/** @param {string[]} paths @param {(path: string) => Promise<string | null>} read @returns {Promise<Text[]>} */
const textsOf = async (paths, read) => Promise.all(paths.map(async (path) => ({ path, text: await read(path) })))
