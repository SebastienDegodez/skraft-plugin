/**
 * @typedef {import('../tracking/tracking-store.mjs').FileFunctions} FileFunctions
 * @typedef {import('../../application/ports/workspace.mjs').WorkspaceEntry} WorkspaceEntry
 */

/**
 * The Workspace port over a host's file functions, relative to the working copy.
 * @param {{ files: FileFunctions, root: string, list?: (path: string) => Promise<WorkspaceEntry[] | null> }} options
 *   list: a folder's entries, null when it is not a folder; a host without it cannot detect projects.
 * @returns {import('../../application/ports/workspace.mjs').Workspace}
 */
export const createWorkspaceFiles = ({ files, root, list }) => {
  const at = (/** @type {string} */ path) => files.join(root, ...path.split('/').filter((part) => part !== '.' && part !== ''))
  return Object.freeze({
    read: (path) => files.read(at(path)),
    write: (path, text) => files.write(at(path), text),
    list: async (path) => {
      if (!list) throw new Error('this host cannot list folders')
      return list(at(path))
    },
  })
}
