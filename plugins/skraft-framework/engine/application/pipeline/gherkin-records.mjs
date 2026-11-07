import { featuresFolders } from '../../domain/config/bdd-folders.mjs'
import { gherkinFailures } from '../../domain/pipeline/gherkin-records.mjs'

/**
 * The Gherkin the acceptance designer's attempt leaves: every `.feature` its test plan names is a
 * file of the features folder of the working copy, and each scenario it holds is well formed.
 *
 * @typedef {import('../ports/tracking.mjs').Tracking} Tracking
 * @typedef {import('../ports/workspace.mjs').Workspace} Workspace
 * @typedef {import('../../domain/config/skraft-config.mjs').Component} Component
 * @typedef {{ files: Tracking, workspace: Workspace }} GherkinDeps
 */
/** A test plan of the tracking folder, as the acceptance designer's role names it. */
const TEST_PLAN = /(^|\/)details\/[^/]+\/test-plan-[^/]+\.md$/
/** The acceptance criteria of a story, as DISCUSS leaves them in the tracking folder. */
const CRITERIA = /(^|\/)plans\/[^/]+\/ac-draft-[^/]+\.md$/

/**
 * Why the Gherkin of the story sends the designer back; empty when it holds.
 * @param {GherkinDeps} deps @param {{ slug: string, components: readonly Component[] }} run
 * @returns {Promise<string[]>}
 */
export const checkGherkinRecords = async (deps, { slug, components }) => {
  const tracked = await deps.files.list(slug, '')
  const plans = await documentsOf(deps, slug, tracked.filter((path) => TEST_PLAN.test(path)))
  const criteria = await documentsOf(deps, slug, tracked.filter((path) => CRITERIA.test(path)))
  return gherkinFailures({ plans, criteria, features: await featuresOf(deps.workspace, components) })
}

/** Each tracked file with its text. @param {GherkinDeps} deps @param {string} slug @param {string[]} paths */
const documentsOf = async (deps, slug, paths) => {
  const texts = await Promise.all(paths.map((path) => trackedText(deps, slug, path)))
  return paths.map((path, index) => ({ path, text: texts[index] }))
}

/** The text of a tracked file, empty when the folder lost it between the listing and the read. @param {GherkinDeps} deps @param {string} slug @param {string} path */
// Stryker disable next-line StringLiteral: a file that is gone names nothing, as any stand-in text that names no feature
const trackedText = async (deps, slug, path) => (await deps.files.read(slug, path)) ?? ''

/**
 * Every file of the folders the components declare for their scenarios, one bounded context deep,
 * as the designer writes them; none for a folder the working copy has not got.
 * @param {Workspace} workspace @param {readonly Component[]} components
 * @returns {Promise<Array<{ path: string, text: string }>>}
 */
const featuresOf = async (workspace, components) => {
  const folders = featuresFolders(components)
  const paths = (await Promise.all(folders.map((folder) => filesUnder(workspace, folder)))).flat()
  const texts = await Promise.all(paths.map((path) => fileText(workspace, path)))
  return paths.map((path, index) => ({ path, text: texts[index] }))
}

/** The files of a features folder, those of its bounded contexts included. @param {Workspace} workspace @param {string} folder */
const filesUnder = async (workspace, folder) => {
  const entries = await entriesOf(workspace, folder)
  return (await Promise.all(entries.map((entry) => pathsOf(workspace, folder, entry)))).flat()
}

/** The paths an entry of a features folder holds: itself, or the files of its context. @param {Workspace} workspace @param {string} folder @param {import('../ports/workspace.mjs').WorkspaceEntry} entry @returns {Promise<string[]>} */
const pathsOf = async (workspace, folder, entry) => {
  if (entry.kind === 'file') return [`${folder}/${entry.name}`]
  const entries = await entriesOf(workspace, `${folder}/${entry.name}`)
  return entries.map((inner) => `${folder}/${entry.name}/${inner.name}`)
}

/** The entries of a folder of the working copy, none when it is no folder of it. @param {Workspace} workspace @param {string} path */
// Stryker disable next-line ArrayDeclaration: a stand-in entry names no path a plan can cite, so the walk reads the same files
const entriesOf = async (workspace, path) => (await workspace.list(path)) ?? []

/** The text of a file of the working copy, empty when it is a folder or gone. @param {Workspace} workspace @param {string} path */
// Stryker disable next-line StringLiteral: a file that is gone holds no scenario, as any stand-in text that opens none
const fileText = async (workspace, path) => (await workspace.read(path)) ?? ''
