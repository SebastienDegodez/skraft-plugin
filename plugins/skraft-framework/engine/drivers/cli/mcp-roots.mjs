import { basename, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The folder a tool works in: a root the host shares, else the folder the host started the
 * server in, else, for a host that shares no root and starts the server in the plugin (Copilot
 * runtime 1.0.107, measured), the working copy the `workspace` argument names by its absolute path.
 *
 * @typedef {{ directory: string } | { directory: null, reason: string }} Workspace
 */

/** @param {unknown} uri @returns {string | null} the local path of a file URI, null for any other */
const pathOf = (uri) => {
  if (typeof uri !== 'string' || !uri.startsWith('file:')) return null
  try {
    return fileURLToPath(uri)
  } catch {
    return null
  }
}

/**
 * The local folders of a `roots/list` answer; none when the host gave no list.
 * @param {unknown} answer @returns {string[]}
 */
export const rootFolders = (answer) => {
  const roots = /** @type {{ roots?: unknown }} */ (answer ?? {}).roots
  if (!Array.isArray(roots)) return []
  return roots.map((root) => pathOf(root?.uri)).filter((path) => path !== null)
}

/** @param {string[]} folders */
const namesOf = (folders) => folders.map((folder) => basename(folder)).join(', ')

/**
 * The folder a tool call works in, out of the folders the host offers.
 * @param {string[]} folders @param {string | undefined} named the `workspace` argument
 * @returns {Workspace}
 */
export const chosenWorkspace = (folders, named) => {
  if (named !== undefined) return namedWorkspace(folders, named)
  if (folders.length === 1) return { directory: folders[0] }
  if (folders.length === 0) return { directory: null, reason: 'no-workspace: the host shares no root folder and started skraft outside a repository; call the tool again with the workspace argument set to the absolute path of the working copy' }
  return { directory: null, reason: `several-workspaces: the host shares several root folders; name one with the workspace argument: ${namesOf(folders)}` }
}

/** @param {string[]} folders @param {string} named @returns {Workspace} */
const namedWorkspace = (folders, named) => {
  const found = folders.find((folder) => folder === named || basename(folder) === named)
  if (found !== undefined) return { directory: found }
  return { directory: null, reason: `unknown-workspace: the workspace argument names none of the root folders the host shares: ${namesOf(folders)}` }
}

/** Whether `path` is `folder` or inside it. @param {string} path @param {string} folder */
export const insideFolder = (path, folder) => {
  const rest = relative(folder, path)
  return !rest.startsWith('..') && !isAbsolute(rest)
}

const REFUSED = Object.freeze({
  relative: 'relative-workspace: the host shares no root folder, so the workspace argument must be the absolute path of the working copy',
  plugin: 'plugin-workspace: the workspace argument names a folder inside the skraft plugin; give the absolute path of the working copy instead',
  copy: 'no-working-copy: the workspace argument names no root folder of a git working copy; give the absolute path of the folder that holds the working copy',
})

/**
 * The working copy the `workspace` argument names, for a host that shares no folder.
 * @param {string} named @param {{ pluginFolder: () => string, isWorkingCopy: (directory: string) => Promise<boolean> }} services
 * @returns {Promise<Workspace>}
 */
export const givenWorkingCopy = async (named, { pluginFolder, isWorkingCopy }) => {
  if (!isAbsolute(named)) return { directory: null, reason: REFUSED.relative }
  const directory = resolve(named)
  if (insideFolder(directory, pluginFolder())) return { directory: null, reason: REFUSED.plugin }
  if (!(await isWorkingCopy(directory))) return { directory: null, reason: REFUSED.copy }
  return { directory }
}
