import { gherkinFailures } from '../../domain/pipeline/gherkin-records.mjs'

/**
 * The Gherkin the acceptance designer's attempt leaves: every `.feature` its test plan names is a
 * file of the features folder of the working copy, and each scenario it holds is well formed.
 *
 * @typedef {import('../ports/tracking.mjs').Tracking} Tracking
 * @typedef {import('../ports/workspace.mjs').Workspace} Workspace
 * @typedef {{ files: Tracking, workspace: Workspace }} GherkinDeps
 */

/** The features folder of the working copy, where a repository keeps its scenarios. */
const FEATURES = 'docs/features'
/** A test plan of the tracking folder, as the acceptance designer's role names it. */
const TEST_PLAN = /(^|\/)details\/[^/]+\/test-plan-[^/]+\.md$/

/**
 * Why the Gherkin of the story sends the designer back; empty when it holds.
 * @param {GherkinDeps} deps @param {{ slug: string }} run
 * @returns {Promise<string[]>}
 */
export const checkGherkinRecords = async (deps, { slug }) => {
  const tracked = await deps.files.list(slug, '')
  const paths = tracked.filter((path) => TEST_PLAN.test(path))
  const texts = await Promise.all(paths.map((path) => readPlan(deps, slug, path)))
  const plans = paths.map((path, index) => ({ path, text: texts[index] }))
  return gherkinFailures({ plans, features: await featuresOf(deps.workspace) })
}

/** A test plan, empty when the tracking folder lost it between the listing and the read. @param {GherkinDeps} deps @param {string} slug @param {string} path */
// Stryker disable next-line StringLiteral: a plan that is gone names nothing, as any stand-in text that names no feature
const readPlan = async (deps, slug, path) => (await deps.files.read(slug, path)) ?? ''

/**
 * Every `.feature` of the features folder, one bounded context deep, as the designer writes them;
 * none when the working copy has no such folder.
 * @param {Workspace} workspace @returns {Promise<string[]>}
 */
const featuresOf = async (workspace) => {
  const contexts = await workspace.list(FEATURES)
  if (contexts === null) return []
  const inside = await Promise.all(contexts.map((entry) => pathsOf(workspace, entry)))
  const paths = inside.flat()
  const texts = await Promise.all(paths.map((path) => workspace.read(path)))
  return paths.map((path, index) => ({ path, text: texts[index] ?? '' }))
}

/** The `.feature` paths an entry of the features folder holds: itself, or those of its context. @param {Workspace} workspace @param {import('../ports/workspace.mjs').WorkspaceEntry} entry @returns {Promise<string[]>} */
const pathsOf = async (workspace, entry) => {
  if (entry.kind === 'file') return entry.name.endsWith('.feature') ? [`${FEATURES}/${entry.name}`] : []
  const entries = (await workspace.list(`${FEATURES}/${entry.name}`)) ?? []
  return entries.filter((inner) => inner.kind === 'file' && inner.name.endsWith('.feature')).map((inner) => `${FEATURES}/${entry.name}/${inner.name}`)
}
