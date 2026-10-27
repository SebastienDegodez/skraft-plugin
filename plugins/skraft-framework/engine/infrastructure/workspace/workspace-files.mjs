/**
 * @typedef {import('../tracking/tracking-store.mjs').FileFunctions} FileFunctions
 * @typedef {import('../../application/ports/workspace.mjs').WorkspaceEntry} WorkspaceEntry
 */

/**
 * The Workspace port over a host's file functions, relative to the working copy, folders listed
 * by the host's own `list`; a host whose files cannot be renamed (the Claude Code mod) replaces
 * a file by writing it.
 * @param {{ files: FileFunctions, root: string, list?: (path: string) => Promise<WorkspaceEntry[] | null> }} options
 * @returns {import('../../application/ports/workspace.mjs').Workspace}
 */
export const createWorkspaceFiles = ({ files, root, list }) => {
  const at = (/** @type {string} */ path) => files.join(root, ...path.split('/'))
  return Object.freeze({
    read: (path) => files.read(at(path)),
    write: (path, text) => files.write(at(path), text),
    replace: (path, text) => (files.replace ?? files.write)(at(path), text),
    list: (path) => /** @type {NonNullable<typeof list>} */ (list)(at(path)),
  })
}
