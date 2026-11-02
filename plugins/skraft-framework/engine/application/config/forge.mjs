import { forgeOfRemote, forgeUnreachable } from '../../domain/config/forge.mjs'

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
 *   forges: the adapters of each forge skraft reaches, by forge, each through the forge's command
 *   line (gh, az). The engine never calls an MCP server: that is an agent's tool.
 */

/** The forge the working copy's Git remote names. @param {Pick<import('../ports/source-control.mjs').SourceControl, 'remoteUrl'>} sourceControl @returns {Promise<Forge>} */
export const remoteForge = async (sourceControl) => forgeOfRemote(await sourceControl.remoteUrl())

/**
 * The forge a run uses and what chose it: config when skraft-config.json names one, remote otherwise.
 * @param {Pick<ForgeDeps, 'sourceControl'>} deps @param {Forge | null} named
 * @returns {Promise<{ forge: Forge, by: 'config' | 'remote' }>}
 */
export const chosenForge = async ({ sourceControl }, named) => (named === null ? { forge: await remoteForge(sourceControl), by: 'remote' } : { forge: named, by: 'config' })

/**
 * @param {ForgeDeps} deps @param {Forge | null} named the forge skraft-config.json names, null for none
 * @returns {Promise<ForgeAdapters>}
 */
export const forgeAdapters = async ({ forges, sourceControl }, named) => {
  const { forge } = await chosenForge({ sourceControl }, named)
  return forges[forge] ?? unreachable(forge)
}

/**
 * What this machine misses to reach the forge a run uses (no remote, no forge client, not signed
 * in), as the forge's adapter fixes it; null when it reaches it.
 * @param {ForgeDeps} deps @param {Forge | null} named the forge skraft-config.json names, null for none
 * @returns {Promise<string | null>}
 */
export const forgeMissing = async (deps, named) => (await forgeAdapters(deps, named)).codeHost.unavailable()

/**
 * Adapters that reach nothing: the forge cannot be asked, no issue is read, the remote names no
 * repository on it, no line links a pull request to its story, and every other call is refused
 * with the same reason.
 * @param {Forge} forge @returns {ForgeAdapters}
 */
const unreachable = (forge) => {
  const reason = forgeUnreachable(forge)
  return { codeHost: nowhereCodeHost(reason), pullRequests: nowherePullRequests(reason) }
}

/** What both ports answer of a forge skraft cannot reach. @param {string} reason */
const nowhere = (reason) => ({ unavailable: async () => reason, repository: async () => null })

/**
 * A call no run makes: every caller asks unavailable() first, which stops it.
 * @param {string} reason @returns {() => Promise<{ ok: false, reason: string }>}
 */
// Stryker disable next-line all: no run reaches it, every caller stops on unavailable() first
const refusal = (reason) => async () => ({ ok: false, reason })

/** @param {string} reason @returns {import('../ports/code-host.mjs').CodeHost} */
const nowhereCodeHost = (reason) => Object.freeze({
  ...nowhere(reason),
  // Stryker disable next-line all: no run reaches them, every caller stops on unavailable() first
  remotes: async () => [], currentBranch: async () => null, defaultBranch: async () => null,
  push: refusal(reason), findPullRequest: refusal(reason), create: refusal(reason), edit: refusal(reason), keepIssueComment: refusal(reason), keepPullRequestComment: refusal(reason),
  // Stryker disable next-line all: no run reaches them, every caller stops on unavailable() first
  localTip: async () => null, remoteTip: refusal(reason), readComment: refusal(reason), readPullRequest: refusal(reason),
  issue: async () => ({ read: /** @type {const} */ ('failed'), reason }),
  storyLink: () => null,
  // Stryker disable next-line all: a forge skraft cannot reach opens no pull request, whose body would be cut for it
  bodyLimit: Number.POSITIVE_INFINITY,
  // Stryker disable next-line all: a forge skraft cannot reach opens no pull request, whose details would be split for it
  commentLimit: Number.POSITIVE_INFINITY,
  // Stryker disable next-line all: a forge skraft cannot reach keeps no comment
  takesRequestFile: false,
})

/** @param {string} reason @returns {import('../ports/pull-requests.mjs').PullRequests} */
const nowherePullRequests = (reason) => Object.freeze({
  ...nowhere(reason),
  // Stryker disable next-line ArrowFunction,StringLiteral,BooleanLiteral: no run reaches the checkout command nor the request file of a forge skraft cannot reach, every caller stops on unavailable() first
  checkoutCommand: () => '', takesRequestFile: false,
  find: refusal(reason), keepComment: refusal(reason), readComment: refusal(reason),
})
