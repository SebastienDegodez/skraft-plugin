/**
 * The comment of a run on a pull request of Azure Repos, found again among the pull request's
 * threads: the same choice whichever way the threads were listed (the host's MCP server or az).
 *
 * @typedef {{ organization: string, project: string, repository: string }} ThreadSite the organization, project and repository of the Git remote
 * @typedef {{ threadId: number, commentId: number }} KeptThread
 */

/**
 * The REST address of a comment of a pull request's thread, as skraft builds it: a web anchor for
 * a comment is not documented, so none is invented.
 * @param {ThreadSite} site @param {number} number @param {number} threadId @param {number} commentId
 */
export const threadUrl = ({ organization, project, repository }, number, threadId, commentId) =>
  `${organization}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repository)}/pullRequests/${number}/threads/${threadId}/comments/${commentId}`

/**
 * Whether the answer is a list of threads, each with the integer `id` an update needs and its comments.
 * @param {unknown} threads @returns {threads is any[]}
 */
export const areThreads = (threads) => Array.isArray(threads) && threads.every((thread) => Number.isInteger(thread?.id) && Array.isArray(thread.comments))

/**
 * The thread and comment a write answered with: a posted thread's own id and its first comment's,
 * a rewritten comment's own id in the thread kept; null for any other answer.
 * @param {any} answer @param {KeptThread | undefined} kept @returns {KeptThread | null}
 */
export const writtenIds = (answer, kept) => {
  if (kept !== undefined) return Number.isInteger(answer?.id) ? { threadId: kept.threadId, commentId: answer.id } : null
  const commentId = answer?.comments?.[0]?.id
  return Number.isInteger(answer?.id) && Number.isInteger(commentId) ? { threadId: answer.id, commentId } : null
}

/** @param {string} text */
const escapedAsHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The first comment of a thread a human has not deleted, as REST answers it: `id` and `content`. @param {any} thread */
const firstOf = (thread) => thread.comments.find((/** @type {any} */ comment) => Number.isInteger(comment?.id) && comment.isDeleted !== true)

/**
 * The comment to rewrite: the first comment of the thread at the URL the journal kept, else of the
 * last thread whose first comment STARTS with the marker (the first line of a comment of the run),
 * as written or with `<`, `>` and `&` escaped as the MCP server may write them (not measured). A
 * thread that quotes the marker further in is someone else's, never rewritten; who wrote a
 * comment is not checked, since the trimmed answers do not tell it (docs/v2/host-verification.md).
 * @param {ThreadSite} site @param {{ number: number, marker: string, url: string | null }} request
 * @param {any[]} threads the pull request's threads
 * @returns {KeptThread | undefined}
 */
export const keptThreadOf = (site, { number, marker, url }, threads) => {
  const marks = (/** @type {any} */ thread) => [marker, escapedAsHtml(marker)].some((mark) => String(firstOf(thread)?.content).startsWith(mark))
  const kept = threads.find((thread) => firstOf(thread) !== undefined && threadUrl(site, number, thread.id, firstOf(thread).id) === url) ?? threads.findLast((thread) => firstOf(thread) !== undefined && marks(thread))
  return kept === undefined ? undefined : { threadId: kept.id, commentId: firstOf(kept).id }
}
