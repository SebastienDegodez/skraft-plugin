import { CONFIG_FILE, isAbsolutePath, writeConfig } from '../../domain/config/skraft-config.mjs'
import { normalizeRelative } from '../../domain/config/relative-path.mjs'
import { mutationCommandAt, newComponents } from './detected-components.mjs'
import { loadConfig } from './bases.mjs'
import { ignoreLocalConfig } from './local-config.mjs'

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
 * already listed, and every other key of the file, stay as the developer wrote them. No mutation
 * command is written unless asked for: a listed component without one then gets its stack's.
 * The working copy's `.gitignore` lists `skraft-design-config.local.json`, the developer's own layer.
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
const configure = async (deps, { workingCopyName, folders = [], mutation = false }) => {
  const { workspace } = deps
  const reading = await loadConfig(deps)
  if (!reading.ok) return reading
  const refusal = await refusalOf(workspace, folders)
  if (refusal) return refusal
  const starts = ['.', ...folders.map(normalizeRelative)]
  const added = await newComponents(workspace, starts, reading.config.components, { workingCopyName, mutation })
  await ignoreLocalConfig(workspace)
  const written = await writeAdded(workspace, reading.raw, added, mutation ? await mutationsOf(workspace, reading.raw) : null)
  return mutation ? { ...written, reason: `${written.reason}; ${mutationText(reading.raw, added)}` } : written
}

/**
 * The mutation command of each listed component that has none, set on its raw entry, when its
 * root holds a project.
 * @param {Workspace} workspace @param {Record<string, unknown>} raw
 * @returns {Promise<string[]>} the components given one
 */
const mutationsOf = async (workspace, raw) => {
  /** @type {string[]} */
  const set = []
  for (const component of listedOf(raw).filter((entry) => !commandsOf(entry).mutation)) {
    const line = await mutationCommandAt(workspace, normalizeRelative(String(component.root)))
    if (line === null) continue
    component.commands = { ...commandsOf(component), mutation: line }
    set.push(String(component.name))
  }
  return set
}

/** @param {Record<string, unknown>} component @returns {Record<string, string>} */
const commandsOf = (component) => /** @type {Record<string, string>} */ (component.commands ?? {})

/** @param {Record<string, unknown>} raw @returns {Array<Record<string, unknown>>} */
const listedOf = (raw) => (Array.isArray(raw.components) ? raw.components : [])

/**
 * Which components now carry a mutation command, in the file's order, and which are left without
 * one: a root that holds no project gives none.
 * @param {Record<string, unknown>} raw @param {ProposedComponent[]} added
 */
const mutationText = (raw, added) => {
  const all = [...listedOf(raw), ...added]
  const set = all.filter((component) => commandsOf(component).mutation).map(({ name }) => String(name))
  const none = all.filter((component) => !commandsOf(component).mutation).map(({ name, root }) => `${name} (${root} holds no project)`)
  return [`mutation: ${set.join(', ') || 'none'}`, ...(none.length === 0 ? [] : [`no mutation command found for ${none.join(', ')}`])].join('; ')
}

/**
 * Writes the added components after the listed ones; writes nothing when nothing is added and
 * the file already lists components.
 * @param {Workspace} workspace @param {Record<string, unknown>} raw @param {ProposedComponent[]} added
 * @param {string[] | null} mutations the listed components given a mutation command, null when none was asked for
 * @returns {Promise<ConfigureOutcome>}
 */
const writeAdded = async (workspace, raw, added, mutations) => {
  const hasList = Array.isArray(raw.components)
  const listed = listedOf(raw)
  if (added.length === 0 && hasList && (mutations?.length ?? 0) === 0) return { ok: true, reason: `${CONFIG_FILE} already lists every project found (${listed.length} components)` }
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
