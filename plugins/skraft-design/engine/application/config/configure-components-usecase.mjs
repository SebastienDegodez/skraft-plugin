import { CONFIG_FILE, isAbsolutePath, writeConfig } from '../../domain/config/skraft-config.mjs'
import { normalizeRelative } from '../../domain/config/relative-path.mjs'
import { newComponents } from './detected-components.mjs'
import { loadConfig } from './bases.mjs'
import { ignoreLocalConfig, ignoreReplPackages } from './local-config.mjs'

/**
 * @typedef {import('../ports/workspace.mjs').Workspace} Workspace
 * @typedef {import('./detected-components.mjs').ProposedComponent} ProposedComponent
 * @typedef {{ workingCopyName: string, folders?: string[], mutation?: boolean }} ConfigureRequest
 *   mutation: write each project's mutation command too, to the components listed without one
 * @typedef {{ ok: boolean, reason: string }} ConfigureOutcome
 */

/**
 * ConfigureComponents — `skraft init` without a slug: one component per project found in the
 * working copy and in the neighbour folders named, written to `skraft-design-config.json`. Components
 * already listed, and every other key of the file, stay as the developer wrote them. No command is written.
 * The working copy's `.gitignore` lists `skraft-design-config.local.json`, the developer's own layer, and
 * `/.repl/node_modules/`, the packages of the project's REPL library.
 * @param {{ workspace: Workspace, userSettings: import('../ports/user-settings.mjs').UserSettings }} deps
 */
export const createConfigureComponents = (deps) => Object.freeze({
  /** @param {ConfigureRequest} request */
  configure: (request) => configure(deps, request),
})

/**
 * @param {{ workspace: Workspace, userSettings: import('../ports/user-settings.mjs').UserSettings }} deps
 * @param {ConfigureRequest} request folders: neighbour folders to search too, relative to the
 *   working copy (`../payment-web`)
 * @returns {Promise<ConfigureOutcome>}
 */
const configure = async (deps, { workingCopyName, folders = [] }) => {
  const { workspace } = deps
  const reading = await loadConfig(deps)
  if (!reading.ok) return reading
  const refusal = await refusalOf(workspace, folders)
  if (refusal) return refusal
  const starts = ['.', ...folders.map(normalizeRelative)]
  const added = await newComponents(workspace, starts, reading.config.components, { workingCopyName })
  await ignoreLocalConfig(workspace)
  await ignoreReplPackages(workspace)
  return writeAdded(workspace, reading.raw, added)
}

/** @param {Record<string, unknown>} raw @returns {Array<Record<string, unknown>>} */
const listedOf = (raw) => (Array.isArray(raw.components) ? raw.components : [])

/**
 * Writes the added components after the listed ones; writes nothing when nothing is added and
 * the file already lists components.
 * @param {Workspace} workspace @param {Record<string, unknown>} raw @param {ProposedComponent[]} added
 * @returns {Promise<ConfigureOutcome>}
 */
const writeAdded = async (workspace, raw, added) => {
  const hasList = Array.isArray(raw.components)
  const listed = listedOf(raw)
  if (added.length === 0 && hasList) return { ok: true, reason: `${CONFIG_FILE} already lists every project found (${listed.length} components)` }
  await workspace.write(CONFIG_FILE, writeConfig(raw, [...listed, ...added]))
  return { ok: true, reason: reasonOf(added) }
}

/**
 * The refusal of the first `--add` folder that cannot be searched, or null.
 * @param {Workspace} workspace @param {string[]} folders
 * @returns {Promise<ConfigureOutcome | null>}
 */
const refusalOf = async (workspace, folders) => {
  for (const folder of folders) {
    const refused = await refusedFolder(workspace, folder)
    if (refused) return { ok: false, reason: `--add ${folder} ${refused}` }
  }
  return null
}

/** Why a folder cannot be searched, or null. @param {Workspace} workspace @param {string} folder */
const refusedFolder = async (workspace, folder) => {
  if (isAbsolutePath(folder)) return 'is not relative to the working copy'
  return (await workspace.list(normalizeRelative(folder))) === null ? 'is not a folder' : null
}

/** @param {ProposedComponent[]} added */
const reasonOf = (added) => (added.length === 0
  ? `no project found; ${CONFIG_FILE} lists no component`
  : `${CONFIG_FILE}: ${added.map((component) => `${component.name} (${component.stack}, ${component.root})`).join(', ')}`)
