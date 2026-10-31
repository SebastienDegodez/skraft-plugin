import { isInOrganization } from '../../domain/config/azure-remote.mjs'
import { areThreads, createdThreadOf, keptThreadBy, rewrittenThreadOf, threadUrl } from '../../domain/pipeline/azure-thread.mjs'
import { UNREADABLE } from './mcp-route.mjs'

/**
 * The run details on a pull request of Azure Repos through the host's Azure DevOps MCP server
 * (@azure-devops/mcp 2.11.0, src/tools/repositories.ts): `repo_repository` (`get`) to check the
 * server reaches the remote's organization, `repo_pull_request_thread` (`list`) to find the run's
 * comment, `repo_pull_request_thread_write` (`create`, `update`) to keep it. `repo_pull_request`
 * is never used: the server wraps what it answers in text a client must not read as data. What
 * the tools answer is not measured (docs/v2/host-verification.md).
 *
 * @typedef {import('./mcp-route.mjs').Failed} Failed
 * @typedef {{ organization: string, project: string, repository: string, call: (tool: string, args: Record<string, unknown>) => Promise<{ json: any } | Failed> }} Azure
 * @typedef {import('../ports/code-host.mjs').PullRequestCommentRequest} CommentRequest
 */

/** The threads one listing answers at most, and the most listings read: a pull request with more threads is never written to, since the run's could be past them. */
const PAGE = 100
const MAX_PAGES = 10

/**
 * The run's comment rewritten (the first comment of the thread at the URL kept, else of the latest
 * thread starting with the marker) or posted in a new thread, once the server is checked to reach
 * the remote's organization.
 * @param {Azure} azure @param {CommentRequest} request
 * @returns {Promise<{ served: { ok: true, url: string } | { ok: false, reason: string } } | Failed>}
 */
export const threadKept = async (azure, request) => {
  const shown = await azure.call('repo_repository', { action: 'get', project: azure.project, repositoryNameOrId: azure.repository })
  if ('failure' in shown) return shown
  if (!isInOrganization(azure.organization, shown.json?.url ?? shown.json?.webUrl)) return UNREADABLE
  const listed = await threadsOf(azure, request.number)
  return 'failure' in listed ? listed : write(azure, request, keptThreadBy(azure, request, listed.threads, (text) => text.startsWith(request.marker)))
}

/** Every thread of the pull request, the deleted comments kept (`fullResponse`) so that they can be skipped, page by page; failed when there are more than the pages followed. @param {Azure} azure @param {number} number @returns {Promise<{ threads: any[] } | Failed>} */
const threadsOf = async (azure, number) => {
  const threads = []
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const listed = await pageOf(azure, number, page)
    if ('failure' in listed) return listed
    threads.push(...listed.threads)
    if (listed.threads.length < PAGE) return { threads }
  }
  return UNREADABLE
}

/** @param {Azure} azure @param {number} number @param {number} page @returns {Promise<{ threads: any[] } | Failed>} */
const pageOf = async (azure, number, page) => {
  const listed = await azure.call('repo_pull_request_thread', { action: 'list', repositoryId: azure.repository, project: azure.project, pullRequestId: number, top: PAGE, skip: page * PAGE, fullResponse: true })
  if ('failure' in listed) return listed
  return areThreads(listed.json) ? { threads: listed.json } : UNREADABLE
}

/**
 * A new thread is posted closed, so that a branch policy on comment resolution is not blocked by
 * it; a comment rewritten is answered in full (`fullResponse`), else the server answers a sentence.
 * @param {Azure} azure @param {CommentRequest} request @param {import('../../domain/pipeline/azure-thread.mjs').KeptThread | undefined} kept
 */
const write = async (azure, { number, body }, kept) => {
  const target = kept === undefined ? { action: 'create', status: 'Closed' } : { action: 'update', threadId: kept.threadId, commentId: kept.commentId, fullResponse: true }
  const written = await azure.call('repo_pull_request_thread_write', { ...target, repositoryId: azure.repository, project: azure.project, pullRequestId: number, content: body })
  if ('failure' in written) return written
  const ids = kept === undefined ? createdThreadOf(written.json) : rewrittenThreadOf(kept, written.json)
  return ids === null ? UNREADABLE : { served: { ok: /** @type {const} */ (true), url: threadUrl(azure, number, ids.threadId, ids.commentId) } }
}
