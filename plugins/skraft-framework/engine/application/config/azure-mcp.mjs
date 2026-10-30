import { azureRemoteOf } from '../../domain/config/azure-remote.mjs'
import { workItemReading } from '../../domain/pipeline/work-item.mjs'
import { answerOf, once, served, UNAVAILABLE, UNREADABLE } from './mcp-route.mjs'

/**
 * Azure DevOps's adapters served first by the host's Azure DevOps MCP server, then by az. An
 * operation goes through the server's tools when the host has the server connected under a
 * known name and the Git remote names an Azure DevOps repository; az does it when the server is
 * absent, lacks the tool, fails, or answers what skraft cannot read. A write the person or the
 * host refuses is refused, never retried with az. Each result says which way served it (`via`)
 * and, when az served after the server could not, why (`fallback`). The push, the remotes, the
 * branches and the pull requests stay with git and az.
 *
 * Tools of @azure-devops/mcp 2.11.0 as the azure-boards-work-items skill lists them
 * (plugins/skraft-backlog/skills/azure-boards-work-items/references/mcp-routes.md): `wit_work_item`
 * (`get`, `list_comments`) and `wit_work_item_comment_write` (`add`, `update`). What they answer
 * (the REST JSON as text) is assumed, not measured (docs/v2/host-verification.md).
 *
 * @typedef {import('./forge.mjs').ForgeAdapters} ForgeAdapters
 * @typedef {import('../ports/mcp-tools.mjs').McpTools} McpTools
 * @typedef {import('../ports/code-host.mjs').CodeHost} CodeHost
 * @typedef {import('./mcp-route.mjs').Failed} Failed
 * @typedef {{ organization: string, project: string, call: (tool: string, args: Record<string, unknown>) => Promise<{ json: any } | Failed> }} Azure
 * @typedef {Pick<import('../ports/source-control.mjs').SourceControl, 'remoteUrl'>} RemoteSource
 */

/**
 * The Azure DevOps servers skraft trusts, by exact name: the one @azure-devops/mcp's README gives
 * a client's configuration. Any other server, whatever its name holds, is never sent a body.
 */
const AZURE_SERVERS = Object.freeze(['ado'])

/** @param {ForgeAdapters} az Azure DevOps's adapters on git and az @param {McpTools} mcpTools @param {RemoteSource} sourceControl @returns {ForgeAdapters} */
export const azureMcpFirst = (az, mcpTools, sourceControl) => {
  const servers = once(() => mcpTools.servers())
  const route = once(() => reach(mcpTools, servers, sourceControl))
  return { codeHost: codeHostOf(az.codeHost, route), pullRequests: az.pullRequests }
}

/** @param {CodeHost} az @param {() => Promise<Azure | Failed>} route @returns {CodeHost} */
const codeHostOf = (az, route) => Object.freeze({
  ...onAz(az),
  unavailable: async () => ('failure' in await route() ? az.unavailable() : null),
  issue: (number) => served(route, (at) => issueOf(at, number), () => az.issue(number), 'az'),
  keepIssueComment: (request) => az.keepIssueComment(request),
})

/** What git and az answer alone: the pull request, the remotes, the branches, the story's link and the body limit. @param {CodeHost} az */
const onAz = (az) => ({
  remotes: () => az.remotes(),
  repository: () => az.repository(),
  currentBranch: () => az.currentBranch(),
  defaultBranch: () => az.defaultBranch(),
  push: (/** @type {string} */ branch) => az.push(branch),
  findPullRequest: (/** @type {string} */ head) => az.findPullRequest(head),
  create: (/** @type {import('../ports/code-host.mjs').PullRequestRequest} */ request) => az.create(request),
  edit: (/** @type {{ number: number, bodyFile: string, body: string }} */ request) => az.edit(request),
  storyLink: (/** @type {number} */ issue, /** @type {boolean} */ closes) => az.storyLink(issue, closes),
  bodyLimit: az.bodyLimit,
})

/**
 * The host's first trusted Azure DevOps server, on the organization and project the Git remote names.
 * @param {McpTools} mcpTools @param {() => Promise<string[]>} servers @param {RemoteSource} sourceControl @returns {Promise<Azure | Failed>}
 */
const reach = async (mcpTools, servers, sourceControl) => {
  const listed = await servers()
  const server = AZURE_SERVERS.find((name) => listed.includes(name))
  const remote = server === undefined ? null : azureRemoteOf(await sourceControl.remoteUrl() ?? '')
  if (server === undefined || remote === null) return UNAVAILABLE
  return { ...remote, call: (tool, args) => answerOf(mcpTools, { server, tool, arguments: args }) }
}

/**
 * Whether the work item's own address is on the remote's organization: the server is bound to one
 * organization when it starts (assumed, not measured), and may not be the remote's.
 * @param {string} organization @param {any} item
 */
const isOf = (organization, item) => String(item?.url).startsWith(`${organization}/`)

/** @param {Azure} azure @param {number} number @returns {Promise<{ served: import('../ports/code-host.mjs').IssueReading } | Failed>} */
const issueOf = async ({ organization, project, call }, number) => {
  const answer = await call('wit_work_item', { action: 'get', id: number, project })
  if ('failure' in answer) return answer
  if (!isOf(organization, answer.json)) return UNREADABLE
  const reading = workItemReading({ number, organization, project }, answer.json)
  return reading === null ? UNREADABLE : { served: reading }
}
