import { joinRelative } from '../../domain/config/relative-path.mjs'
import { inAdrFolder, indexOf, isAdr, isMatrix, recordFailures, registryOf, reliedOn } from '../../domain/pipeline/design-records.mjs'
import { readOrName, regularFile, textsOf } from '../shared/workspace-reading.mjs'
import { storyBriefFailures } from '../architecture/story-briefs.mjs'
import { sharedCitationProblems } from '../../domain/decisions/adr-citations.mjs'
import { glossaryProblems } from '../../domain/architecture/glossary.mjs'
import { laidOut, layoutProblem } from '../../domain/architecture/layout.mjs'

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
  return [...await layoutFailures(deps, base, changed), ...recordFailures(await recordsOf(deps, slug, { tracked, changed })), ...await storyBriefFailures(deps, slug), ...await sharedFailures(deps, changed)]
}

/**
 * The architecture documents the run created outside the layout (#669); one already on the base
 * keeps its path, so a repository designed before keeps working.
 * @param {RecordDeps} deps @param {ReadonlyArray<{ repository: string, sha: string }>} base @param {string[]} paths
 */
const layoutFailures = async ({ sourceControl }, base, paths) => {
  const own = base.find(({ repository }) => repository === '.')
  const failures = []
  for (const path of paths.filter((each) => !laidOut(each))) if (own === undefined || !await sourceControl.existsAt('.', own.sha, path)) failures.push(layoutProblem(path))
  return failures
}

/** A story's own document, which names its story: a brief, in its run's folder or where an earlier run left it. @param {string} path */
const isStoryDocument = (path) => path.startsWith('docs/architecture/stories/') || path.startsWith('docs/architecture/runs/')

const sharedFailures = async ({ workspace }, paths) => {
  const shared = paths.filter((path) => /^(?:docs\/architecture\/|docs\/domain\/event-model\/)/.test(path) && !isStoryDocument(path) && path.endsWith('.md'))
  const texts = await textsOf(shared, (path) => workspace.read(path))
  return texts.flatMap(({ path, text }) => text === null ? [] : [...sharedCitationProblems(path, text), ...glossaryProblems(path, text)])
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
  const matrices = await textsOf(tracked.filter(isMatrix), (path) => files.read(slug, path))
  const relied = await textsOf([...new Set(matrices.flatMap(({ text }) => reliedOn(text)))], (path) => regularFile(workspace, path))
  const registries = await textsOf([...new Set(adrs.map(({ path }) => registryOf(path)))], fromWorkspace)
  const indexes = await textsOf([...new Set(adrs.map(({ path }) => indexOf(path)))], fromWorkspace)
  return { matrices, relied, written: adrFolder.map(({ path }) => path), adrs, registries, indexes }
}
