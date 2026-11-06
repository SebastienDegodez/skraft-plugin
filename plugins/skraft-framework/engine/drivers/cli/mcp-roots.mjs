import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The folder a tool works in: a root the host shares, else the folder the host started the
 * server in. The model only names one of these folders, never another.
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
  if (folders.length === 0) return { directory: null, reason: 'no-workspace: the host shares no root folder and started skraft outside a repository; open the repository in the host' }
  return { directory: null, reason: `several-workspaces: the host shares several root folders; name one with the workspace argument: ${namesOf(folders)}` }
}

/** @param {string[]} folders @param {string} named @returns {Workspace} */
const namedWorkspace = (folders, named) => {
  const found = folders.find((folder) => folder === named || basename(folder) === named)
  if (found !== undefined) return { directory: found }
  return { directory: null, reason: `unknown-workspace: the workspace argument names none of the root folders the host shares: ${namesOf(folders) || 'none'}` }
}
