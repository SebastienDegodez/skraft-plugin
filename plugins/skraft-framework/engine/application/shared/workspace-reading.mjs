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
