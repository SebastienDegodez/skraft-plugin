/**
 * A path of the working copy as a check can read it: its text, null when absent, or a marker
 * naming it when it is no readable file (a folder such as a nested repository, a device), so a
 * changed path of that kind counts by its name instead of stopping the run.
 * @param {import('../ports/workspace.mjs').ConfigSource} workspace
 * @param {string} path relative to the working copy
 * @returns {Promise<string | null>}
 */
export const readOrName = async (workspace, path) => {
  try {
    return await workspace.read(path)
  } catch {
    return `unreadable: ${path}`
  }
}

/**
 * A path of the working copy as a check that needs a file can read it: its text, null when the
 * working copy has none or the path is no readable file (a folder, a device).
 * @param {import('../ports/workspace.mjs').ConfigSource} workspace
 * @param {string} path relative to the working copy
 * @returns {Promise<string | null>}
 */
export const regularFile = async (workspace, path) => {
  try {
    return await workspace.read(path)
  } catch {
    return null
  }
}

/**
 * Each path with its text, read as given.
 * @param {string[]} paths @param {(path: string) => Promise<string | null>} read
 * @returns {Promise<Array<{ path: string, text: string | null }>>}
 */
export const textsOf = async (paths, read) => Promise.all(paths.map(async (path) => ({ path, text: await read(path) })))
