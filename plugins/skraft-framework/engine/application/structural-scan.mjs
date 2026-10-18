import { joinRelative } from '../domain/config/relative-path.mjs'
import { isScannable, scanReport, scanSource } from '../domain/pipeline/structural-scan.mjs'

/**
 * @typedef {{
 *   files: import('./ports/tracking-files.mjs').TrackingFiles,
 *   workspace: import('./ports/workspace.mjs').ConfigSource,
 *   sourceControl: import('./ports/source-control.mjs').SourceControl,
 * }} ScanDeps
 * @typedef {import('../domain/config/skraft-config.mjs').Component} Component
 */

/**
 * Scans the source files Git lists in each component's root and writes the report in the
 * tracking folder.
 * @param {ScanDeps} deps
 * @param {{ slug: string, path: string, components: readonly Component[] }} scan path relative to the tracking folder
 * @returns {Promise<string | null>} the report's path, null when Git cannot list a component's files: no report then
 */
export const writeStructuralScan = async (deps, { slug, path, components }) => {
  const listed = await listRoots(deps, [...new Set(components.map(({ root }) => joinRelative(root)))])
  if (listed === null) return null
  const sources = [...new Set(listed.flatMap(({ root, files }) => files.map((file) => joinRelative(root, file))))].filter(isScannable)
  const hits = await Promise.all(sources.map(async (source) => scanSource(source, await textOf(deps.workspace, source))))
  await deps.files.write(slug, path, `${JSON.stringify(scanReport(hits.flat(), sources.length), null, 2)}\n`)
  return path
}

/**
 * Each root with the files Git lists in it; null when Git cannot list one.
 * @param {ScanDeps} deps @param {string[]} roots
 */
const listRoots = async ({ sourceControl }, roots) => {
  const listed = await Promise.all(roots.map(async (root) => ({ root, files: await sourceControl.files(root) })))
  return listed.some(({ files }) => files === null) ? null : /** @type {Array<{ root: string, files: string[] }>} */ (listed)
}

/** A source file's text; empty when it cannot be read. @param {ScanDeps['workspace']} workspace @param {string} path */
const textOf = async (workspace, path) => {
  try {
    return (await workspace.read(path)) ?? ''
  } catch {
    return ''
  }
}
