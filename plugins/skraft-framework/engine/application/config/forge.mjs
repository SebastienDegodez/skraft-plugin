import { CONFIG_FILE } from '../../domain/config/skraft-config.mjs'
import { forgeOfRemote } from '../../domain/config/forge.mjs'

/**
 * The adapters of the forge the working copy reads its stories from and opens its pull requests
 * on: the one skraft-config.json names, else the one its Git remote's host names. A forge skraft
 * has no adapters for says why it cannot be reached, so that no forge client runs on another
 * forge's remote.
 *
 * @typedef {import('../../domain/config/forge.mjs').Forge} Forge
 * @typedef {{
 *   codeHost: import('../ports/code-host.mjs').CodeHost,
 *   pullRequests: import('../ports/pull-requests.mjs').PullRequests,
 * }} ForgeAdapters
 * @typedef {{
 *   forges: Partial<Record<Forge, ForgeAdapters>>,
 *   sourceControl: Pick<import('../ports/source-control.mjs').SourceControl, 'remoteUrl'>,
 * }} ForgeDeps
 *   forges: the adapters of each forge skraft reaches, by forge.
 */

/**
 * @param {ForgeDeps} deps @param {Forge | null} named the forge skraft-config.json names, null for none
 * @returns {Promise<ForgeAdapters>}
 */
export const forgeAdapters = async ({ forges, sourceControl }, named) => {
  const forge = named ?? forgeOfRemote(await sourceControl.remoteUrl())
  return forges[forge] ?? unreachable(forge)
}

/**
 * Adapters that reach nothing: the forge cannot be asked, no issue is read, the remote names no
 * repository on it, and no line links a pull request to its story.
 * @param {Forge} forge @returns {ForgeAdapters}
 */
const unreachable = (forge) => {
  const reason = `skraft cannot reach the forge ${forge} yet (forge in ${CONFIG_FILE}, else the host of the Git remote, chooses it)`
  const nowhere = Object.freeze({ unavailable: async () => reason, issue: async () => ({ read: 'failed', reason }), repository: async () => null, storyLink: () => null })
  return /** @type {ForgeAdapters} */ (/** @type {unknown} */ ({ codeHost: nowhere, pullRequests: nowhere }))
}
