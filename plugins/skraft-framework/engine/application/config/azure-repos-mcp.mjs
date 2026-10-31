import { areThreads, createdThreadOf, ELSEWHERE, elsewhereReason, keptThreadOf, pullRequestFactsOf, rewrittenThreadOf, threadUrl } from '../../domain/review/azure-pull-request.mjs'
import { served, UNREADABLE } from './mcp-route.mjs'

/**
 * The review of an Azure Repos pull request served first by the host's Azure DevOps MCP server,
 * then by az: the pull request read, its threads listed to find the review's thread again, and
 * that thread posted or its first comment rewritten. A write the person or the host refuses is
 * refused, never retried with az. The diff stays with git.
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

/** The most threads one listing answers: the tool's own default `top`, a page this adapter does not follow. */
const LISTED = 100

/**
 * @param {PullRequests} az Azure Repos's pull requests on git and az @param {() => Promise<Azure | Failed>} route
 * @returns {PullRequests}
 */
export const pullRequestsOf = (az, route) => Object.freeze({
  unavailable: async () => ('failure' in await route() ? az.unavailable() : null),
  repository: () => az.repository(),
  checkoutCommand: (number) => az.checkoutCommand(number),
  takesRequestFile: az.takesRequestFile,
  find: (number) => served(route, (at) => pullRequestRead(at, number), () => az.find(number), 'az'),
  keepComment: (request) => served(route, (at) => threadKept(at, request), () => az.keepComment(request), 'az'),
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

/** The threads of the pull request, every one: failed when the listing may be cut at its page. @param {Azure} azure @param {number} number @returns {Promise<{ threads: any[] } | Failed>} */
const threadsOf = async (azure, number) => {
  const listed = await azure.call('repo_pull_request_thread', { action: 'list', ...where(azure, number), fullResponse: true })
  if ('failure' in listed) return listed
  return areThreads(listed.json) && listed.json.length < LISTED ? { threads: listed.json } : UNREADABLE
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

/** A write the person or the host refused: the run says so and writes nothing else. */
const REFUSED = { served: { ok: /** @type {const} */ (false), reason: 'the host refused the Azure DevOps MCP server\'s repo_pull_request_thread_write, so skraft wrote nothing on Azure Repos; allow it, or run again where it is allowed' } }

/** The new thread, Closed so that no branch policy waits on it, or the rewrite of the first comment of the thread kept. @param {import('../../domain/review/azure-pull-request.mjs').KeptThread | undefined} kept @param {string} body */
const requestOf = (kept, body) => (kept === undefined
  ? { action: 'create', status: 'Closed', content: body }
  : { action: 'update', threadId: kept.threadId, commentId: kept.commentId, content: body, fullResponse: true })

/** @param {Azure} azure @param {import('../ports/pull-requests.mjs').ThreadCommentRequest} request @param {import('../../domain/review/azure-pull-request.mjs').KeptThread | undefined} kept */
const write = async (azure, { number, body }, kept) => {
  const written = await azure.call('repo_pull_request_thread_write', { ...requestOf(kept, body), ...where(azure, number) })
  if ('failure' in written) return written.failure === 'mcp-refused' ? REFUSED : written
  const at = kept === undefined ? createdThreadOf(written.json) : rewrittenThreadOf(kept, written.json)
  return at === null ? UNREADABLE : { served: { ok: /** @type {const} */ (true), url: threadUrl(azure, number, at.threadId, at.commentId) } }
}
