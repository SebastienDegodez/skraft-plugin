import { ELSEWHERE, elsewhereReason, keptThreadOf, pullRequestFactsOf } from '../../domain/review/azure-pull-request.mjs'
import { areThreads, createdThreadOf, rewrittenThreadOf, threadUrl } from '../../domain/pipeline/azure-thread.mjs'
import { refusalOf, served, UNREADABLE } from './mcp-route.mjs'

/**
 * The review of an Azure Repos pull request served first by the host's Azure DevOps MCP server,
 * then by az: the pull request read, its threads listed to find the review's thread again, and
 * that thread posted or its first comment rewritten. A call the person or the host refuses, a read
 * as a write, is refused, never retried with az. The diff stays with git.
 *
 * Tools of @azure-devops/mcp 2.11.0, read in its source (src/tools/repositories.ts):
 * `repo_pull_request` (`get`: lines 242-343), `repo_pull_request_thread` (`list`: lines 494-566)
 * and `repo_pull_request_thread_write` (`create`, `reply`, `update`, `update_status`: lines
 * 1090-1310; `update` is lines 1277-1291, with `fullResponse` to answer the comment). What they answer (the REST JSON as text) is not measured
 * (docs/v2/host-verification.md).
 *
 * @typedef {import('../ports/pull-requests.mjs').PullRequests} PullRequests
 * @typedef {import('./mcp-route.mjs').Failed} Failed
 * @typedef {import('./azure-mcp.mjs').Azure} Azure
 */

/** What a refusal of a tool of Azure Repos answers: refused for good, whatever the tool, never left to az. */
const refused = refusalOf({ server: 'Azure DevOps', place: 'Azure Repos', cli: 'az', writes: ['repo_pull_request_thread_write'] })

/**
 * The threads one listing answers at most (`top`; the server pages with `skip`, sorted by thread
 * id), and the most listings read: a pull request with more threads is never written to through
 * the server, since the review's could be past them; az lists them all.
 */
const PAGE = 100
const MAX_PAGES = 10

/**
 * @param {PullRequests} az Azure Repos's pull requests on git and az @param {() => Promise<Azure | Failed>} route
 * @returns {PullRequests}
 */
export const pullRequestsOf = (az, route) => Object.freeze({
  unavailable: async () => ('failure' in await route() ? az.unavailable() : null),
  repository: () => az.repository(),
  checkoutCommand: (number) => az.checkoutCommand(number),
  takesRequestFile: az.takesRequestFile,
  find: (number) => served(route, (at) => pullRequestRead(at, number), () => az.find(number), 'az', refused),
  keepComment: (request) => served(route, (at) => threadKept(at, request), () => az.keepComment(request), 'az', refused),
})

/** What every tool of one pull request is asked. @param {Azure} azure @param {number} number */
const where = ({ repository, project }, number) => ({ repositoryId: repository, project, pullRequestId: number })

/**
 * The pull request: its facts, ELSEWHERE when it is of another repository or project than the
 * remote's, failed when the server answers what skraft cannot read.
 * @param {Azure} azure @param {number} number
 */
const factsOf = async (azure, number) => {
  const answer = await azure.call('repo_pull_request', { action: 'get', ...where(azure, number) })
  if ('failure' in answer) return answer
  const facts = pullRequestFactsOf(azure, number, answer.json)
  return facts === null ? UNREADABLE : { facts }
}

/** @param {Azure} azure @param {number} number */
const pullRequestRead = async (azure, number) => {
  const read = await factsOf(azure, number)
  if ('failure' in read) return read
  return { served: read.facts === ELSEWHERE ? { ok: /** @type {const} */ (false), reason: elsewhereReason(azure, number) } : { ok: /** @type {const} */ (true), found: read.facts } }
}

/** The threads of the pull request, every one, page by page: failed when there are more than the pages followed. @param {Azure} azure @param {number} number @returns {Promise<{ threads: any[] } | Failed>} */
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

/** One page of threads, the deleted comments kept (`fullResponse`) so that they can be skipped. @param {Azure} azure @param {number} number @param {number} page @returns {Promise<{ threads: any[] } | Failed>} */
const pageOf = async (azure, number, page) => {
  const listed = await azure.call('repo_pull_request_thread', { action: 'list', ...where(azure, number), top: PAGE, skip: page * PAGE, fullResponse: true })
  if ('failure' in listed) return listed
  return areThreads(listed.json) ? { threads: listed.json } : UNREADABLE
}

/**
 * The review's thread rewritten (the one at the URL kept, else the latest holding the marker) or
 * posted, once the pull request is checked to be of the remote's repository.
 * @param {Azure} azure @param {import('../ports/pull-requests.mjs').ThreadCommentRequest} request
 * @returns {Promise<{ served: { ok: true, url: string } | { ok: false, reason: string } } | Failed>}
 */
const threadKept = async (azure, request) => {
  const read = await factsOf(azure, request.number)
  if ('failure' in read) return read
  if (read.facts === ELSEWHERE) return { served: { ok: false, reason: elsewhereReason(azure, request.number) } }
  const listed = await threadsOf(azure, request.number)
  return 'failure' in listed ? listed : write(azure, request, keptThreadOf(azure, request, listed.threads))
}

/** The new thread, Closed so that no branch policy waits on it, or the rewrite of the first comment of the thread kept. @param {import('../../domain/review/azure-pull-request.mjs').KeptThread | undefined} kept @param {string} body */
const requestOf = (kept, body) => (kept === undefined
  ? { action: 'create', status: 'Closed', content: body }
  : { action: 'update', threadId: kept.threadId, commentId: kept.commentId, content: body, fullResponse: true })

/** @param {Azure} azure @param {import('../ports/pull-requests.mjs').ThreadCommentRequest} request @param {import('../../domain/review/azure-pull-request.mjs').KeptThread | undefined} kept */
const write = async (azure, { number, body }, kept) => {
  const written = await azure.call('repo_pull_request_thread_write', { ...requestOf(kept, body), ...where(azure, number) })
  if ('failure' in written) return written
  const at = kept === undefined ? createdThreadOf(written.json) : rewrittenThreadOf(kept, written.json)
  return at === null ? UNREADABLE : { served: { ok: /** @type {const} */ (true), url: threadUrl(azure, number, at.threadId, at.commentId) } }
}
