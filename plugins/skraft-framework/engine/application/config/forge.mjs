import { forgeOfRemote, forgeUnreachable } from '../../domain/config/forge.mjs'
import { azureMcpFirst } from './azure-mcp.mjs'
import { githubMcpFirst } from './github-mcp.mjs'

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
 *   mcpTools?: import('../ports/mcp-tools.mjs').McpTools,
 * }} ForgeDeps
 *   forges: the adapters of each forge skraft reaches, by forge; mcpTools: the host's MCP
 *   servers, which serve GitHub before gh does; none where the host offers none.
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
export const forgeAdapters = async ({ forges, sourceControl, mcpTools }, named) => {
  const { forge } = await chosenForge({ sourceControl }, named)
  const adapters = forges[forge]
  if (adapters === undefined) return unreachable(forge)
  return mcpTools === undefined ? adapters : mcpFirst(forge, adapters, { mcpTools, sourceControl })
}

/** The adapters of the forge served first by the host's MCP server, when skraft knows one for that forge. @param {Forge} forge @param {ForgeAdapters} adapters @param {{ mcpTools: import('../ports/mcp-tools.mjs').McpTools, sourceControl: ForgeDeps['sourceControl'] }} host */
const mcpFirst = (forge, adapters, { mcpTools, sourceControl }) => {
  if (forge === 'github') return githubMcpFirst(adapters, mcpTools)
  return forge === 'azure-devops' ? azureMcpFirst(adapters, mcpTools, sourceControl) : adapters
}

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
const nowherePullRequests = (reason) => Object.freeze({ ...nowhere(reason), find: refusal(reason), keepComment: refusal(reason) })
