import { citedPaths, isResearch, researchFailures, underRoots } from '../../domain/pipeline/research-records.mjs'
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
 * @param {{ slug: string, roots: string[], template: string }} run roots: the component roots of the configuration
 * @returns {Promise<string[]>}
 */
export const checkResearchRecords = async (deps, { slug, roots, template }) => {
  const tracked = await deps.files.list(slug, '')
  const documents = await textsOf(tracked.filter(isResearch), (path) => readDocument(deps, slug, path))
  const cited = [...new Set(documents.flatMap(({ text }) => citedPaths(text)).flatMap((path) => [path, ...underRoots(path, roots)]))]
  return researchFailures({ documents, cited: await textsOf(cited, (path) => regularFile(deps.workspace, path)), roots, template })
}

/** A research document, empty when the tracking folder lost it between the listing and the read. @param {CitationDeps} deps @param {string} slug @param {string} path */
// Stryker disable next-line StringLiteral: a document that is gone cites nothing, as any stand-in text that holds no path
const readDocument = async (deps, slug, path) => (await deps.files.read(slug, path)) ?? ''
