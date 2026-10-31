import { isInOrganization } from '../config/azure-remote.mjs'
import { escapedAsHtml } from '../pipeline/work-item-comment.mjs'
import { commentStartOf } from './pull-request.mjs'

/**
 * A pull request of Azure Repos and its review thread: the same reading whichever way they were
 * fetched (the host's Azure DevOps MCP server or az), as REST answers them.
 *
 * @typedef {import('../../application/ports/pull-requests.mjs').PullRequestFacts} PullRequestFacts
 * @typedef {{ organization: string, project: string, repository: string }} PullRequestSite
 *   the organization, project and repository of the Git remote
 * @typedef {{ threadId: number, commentId: number }} KeptThread the thread of the review and its first comment
 */

/** What a pull request of another repository or project than the remote's is read as. */
export const ELSEWHERE = 'elsewhere'

/** Why a pull request of another repository or project is not reviewed. @param {PullRequestSite} site @param {number} number */
export const elsewhereReason = ({ project, repository }, number) => `pull request #${number} is not in ${project}/${repository} of the Git remote, so skraft does not review it`

/** The page of a pull request. @param {PullRequestSite} site @param {number} number */
export const pullRequestPage = ({ organization, project, repository }, number) =>
  `${organization}/${encodeURIComponent(project)}/_git/${encodeURIComponent(repository)}/pullrequest/${number}`

/** @param {unknown} text */
const isText = (text) => typeof text === 'string'

/** @param {unknown} ref @param {any} commit */
const isEnd = (ref, commit) => isText(ref) && isText(commit?.commitId)

/** A pull request that names its repository and project, its branches and the commits of its last merge. @param {any} json */
const isLocated = (json) => isText(json.repository?.name) && isText(json.repository?.project?.name) && isText(json.title) && (json.description == null || isText(json.description))

/** @param {any} json */
const hasEnds = (json) => isEnd(json.sourceRefName, json.lastMergeSourceCommit) && isEnd(json.targetRefName, json.lastMergeTargetCommit)

/** @param {PullRequestSite} site @param {number} number @param {any} json */
const isReadable = (site, number, json) => json?.pullRequestId === number && isInOrganization(site.organization, json.url) && isLocated(json) && hasEnds(json)

/** @param {unknown} left @param {string} right */
const sameName = (left, right) => String(left).toLowerCase() === right.toLowerCase()

/** @param {PullRequestSite} site @param {any} json */
const isOfRemote = (site, json) => sameName(json.repository.name, site.repository) && sameName(json.repository.project.name, site.project)

/** @param {string} ref @param {any} commit */
const endOf = (ref, commit) => ({ ref: ref.replace(/^refs\/heads\//, ''), sha: commit.commitId })

/**
 * The pull request as the review reads it: its title and description, the branches and the commits
 * of its last merge. The address is the page skraft builds. null when the answer is not a pull
 * request of that number on the remote's organization that skraft can read; ELSEWHERE when it is
 * of another repository or project than the remote's.
 * @param {PullRequestSite} site @param {number} number @param {any} json the pull request as REST answers it
 * @returns {PullRequestFacts | typeof ELSEWHERE | null}
 */
export const pullRequestFactsOf = (site, number, json) => {
  if (!isReadable(site, number, json)) return null
  if (!isOfRemote(site, json)) return ELSEWHERE
  return {
    number, url: pullRequestPage(site, number), title: json.title, body: json.description ?? '',
    base: endOf(json.targetRefName, json.lastMergeTargetCommit), head: endOf(json.sourceRefName, json.lastMergeSourceCommit),
  }
}

/**
 * The REST address of a comment of a thread, as skraft builds it: a web anchor for a thread is not
 * documented, so none is invented.
 * @param {PullRequestSite} site @param {number} number @param {unknown} threadId @param {unknown} commentId
 */
export const threadUrl = ({ organization, project, repository }, number, threadId, commentId) =>
  `${organization}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repository)}/pullRequests/${number}/threads/${threadId}/comments/${commentId}`

/** @param {unknown} comments */
const areIdentified = (comments) => Array.isArray(comments) && comments.every((comment) => Number.isInteger(comment?.id))

/**
 * Whether the answer is a list of threads, each with the integer `id` a rewrite needs and comments
 * that have one.
 * @param {unknown} threads @returns {threads is any[]}
 */
export const areThreads = (threads) => Array.isArray(threads) && threads.every((thread) => Number.isInteger(thread?.id) && areIdentified(thread.comments ?? []))

/** The first comment of a thread, when neither it nor its thread was deleted. @param {any} thread */
const openedBy = (thread) => {
  const comment = thread.comments?.[0]
  return thread.isDeleted === true || comment === undefined || comment.isDeleted === true ? null : { threadId: thread.id, commentId: comment.id, text: String(comment.content) }
}

/**
 * The thread to rewrite: the one at the URL the journal kept, else the last whose first comment
 * is the review's: it STARTS as the review's comment does (its heading) and holds the marker, as
 * written or with `<`, `>` and `&` as HTML entities (the MCP server rewrites work items' comments
 * so, 2.11.0; not measured for threads). The marker closes the review's comment, so it is the
 * heading that tells a reply quoting it (its first line is a quote or its own words) from the
 * review: that reply is someone else's, never rewritten. Who wrote a thread is not checked, since
 * Azure does not tell it here (docs/v2/host-verification.md). A thread or first comment a person
 * deleted is not found.
 * @param {PullRequestSite} site @param {{ number: number, marker: string, url: string | null }} request
 * @param {any[]} threads the pull request's threads, as REST answers them
 * @returns {KeptThread | undefined}
 */
export const keptThreadOf = (site, { number, marker, url }, threads) => {
  const opened = threads.map(openedBy).filter((first) => first !== null)
  const marks = (/** @type {{ text: string }} */ { text }) => text.startsWith(commentStartOf(number)) && [marker, escapedAsHtml(marker)].some((mark) => text.includes(mark))
  const found = opened.find((first) => threadUrl(site, number, first.threadId, first.commentId) === url) ?? opened.findLast(marks)
  return found === undefined ? undefined : { threadId: found.threadId, commentId: found.commentId }
}

/** The thread and first comment a new thread's answer names; null when it names none. @param {any} json @returns {KeptThread | null} */
export const createdThreadOf = (json) => {
  const commentId = json?.comments?.[0]?.id
  return Number.isInteger(json?.id) && Number.isInteger(commentId) ? { threadId: json.id, commentId } : null
}

/** The thread the answer of a rewrite confirms, when it names the comment rewritten. @param {KeptThread} kept @param {any} json @returns {KeptThread | null} */
export const rewrittenThreadOf = (kept, json) => (json?.id === kept.commentId ? kept : null)

/** The request of a new thread: the review as its one comment, the thread Closed so that no policy waits on it. @param {string} body */
export const threadRequestOf = (body) => JSON.stringify({ comments: [{ parentCommentId: 0, content: body, commentType: 1 }], status: THREAD_CLOSED })

/** The request that rewrites a comment. @param {string} body */
export const contentRequestOf = (body) => JSON.stringify({ content: body })

/** CommentThreadStatus.Closed as the REST API takes it (4 in @azure-devops/mcp's enum, whose name 'Closed' the server's tool takes). */
const THREAD_CLOSED = 4
