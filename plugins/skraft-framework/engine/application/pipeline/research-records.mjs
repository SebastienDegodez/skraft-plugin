import { citedPaths, isResearch, researchFailures } from '../../domain/pipeline/research-records.mjs'
import { regularFile, textsOf } from '../shared/workspace-reading.mjs'

/**
 * @typedef {{
 *   files: import('../ports/tracking-files.mjs').TrackingFiles,
 *   workspace: import('../ports/workspace.mjs').ConfigSource,
 * }} CitationDeps
 */

/**
 * Why the citations of a solution researcher's attempt send it back.
 * @param {CitationDeps} deps
 * @param {{ slug: string }} run
 * @returns {Promise<string[]>}
 */
export const checkResearchRecords = async (deps, { slug }) => {
  const tracked = await deps.files.list(slug, '')
  const documents = await textsOf(tracked.filter(isResearch), (path) => deps.files.read(slug, path))
  const cited = [...new Set(documents.flatMap(({ text }) => citedPaths(text)))]
  return researchFailures({ documents, cited: await textsOf(cited, (path) => regularFile(deps.workspace, path)) })
}
