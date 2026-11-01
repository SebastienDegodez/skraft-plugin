/**
 * A comment of a run on a pull request of Azure Repos, kept as the first comment of a thread and
 * found again among the pull request's threads: the same choice whichever way the threads were
 * listed by az and whatever the comment is (the review, the
 * run's details). Each caller says what starts its thread.
 *
 * @typedef {{ organization: string, project: string, repository: string }} ThreadSite the organization, project and repository of the Git remote
 * @typedef {{ threadId: number, commentId: number }} KeptThread the thread and its first comment
 */

/** CommentThreadStatus.Closed as the REST API takes it (CommentThreadStatus 4). */
export const THREAD_CLOSED = 4

/** @param {string} text */
export const escapedAsHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * The REST address of a comment of a pull request's thread, as skraft builds it: a web anchor for
 * a comment is not documented, so none is invented.
 * @param {ThreadSite} site @param {number} number @param {unknown} threadId @param {unknown} commentId
 */
export const threadUrl = ({ organization, project, repository }, number, threadId, commentId) =>
  `${organization}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repository)}/pullRequests/${number}/threads/${threadId}/comments/${commentId}`

/** The characters an HTML entity may stand for, by name. */
const NAMED = Object.freeze({ lt: '<', gt: '>' })

/** The highest code point a numeric entity may name. */
const LAST_CODE_POINT = 0x10FFFF

/** One entity: decimal, hexadecimal, or named for the only two characters of a marker an encoder escapes by name. */
const ENTITY = /&(?:#(\d+)|#x([0-9a-f]+)|(lt|gt));/gi

/** @param {string} entity @param {string | undefined} decimal @param {string | undefined} hexadecimal @param {string | undefined} name */
const characterOf = (entity, decimal, hexadecimal, name) => {
  if (name !== undefined) return NAMED[/** @type {keyof typeof NAMED} */ (name.toLowerCase())]
  const code = decimal === undefined ? Number.parseInt(String(hexadecimal), 16) : Number(decimal)
  return code <= LAST_CODE_POINT ? String.fromCodePoint(code) : entity
}

/**
 * A comment as the server may have stored it, read as it was written: the blank space before the
 * first line dropped (JavaScript counts a byte order mark as blank), each HTML entity (decimal or
 * hexadecimal, or `lt` and `gt`) decoded once. Not measured on what Azure Repos stores (docs/v2/host-verification.md).
 * @param {string} text
 */
export const normalisedComment = (text) => text.replace(/^\s+/, '').replace(ENTITY, characterOf)

/**
 * Whether the answer is a list of threads, each with the integer `id` a rewrite needs and comments
 * that each have one.
 * @param {unknown} threads @returns {threads is any[]}
 */
export const areThreads = (threads) => Array.isArray(threads) && threads.every((thread) => Number.isInteger(thread?.id) && areIdentified(thread.comments ?? []))

/** @param {unknown} comments */
const areIdentified = (comments) => Array.isArray(comments) && comments.every((comment) => Number.isInteger(comment?.id))

/** The thread and first comment a new thread's answer names; null when it names none. @param {any} json @returns {KeptThread | null} */
export const createdThreadOf = (json) => {
  const commentId = json?.comments?.[0]?.id
  return Number.isInteger(json?.id) && Number.isInteger(commentId) ? { threadId: json.id, commentId } : null
}

/** The thread the answer of a rewrite confirms, when it names the comment rewritten. @param {KeptThread} kept @param {any} json @returns {KeptThread | null} */
export const rewrittenThreadOf = (kept, json) => (json?.id === kept.commentId ? kept : null)

/** The first comment of a thread, when neither it nor its thread was deleted, with its text as written. @param {any} thread */
const openedBy = (thread) => {
  const comment = thread.comments?.find((/** @type {any} */ each) => each.isDeleted !== true)
  return thread.isDeleted === true || comment === undefined ? null : { threadId: thread.id, commentId: comment.id, text: normalisedComment(String(comment.content)) }
}

/**
 * The thread to rewrite: the one at the URL the journal kept, else the last whose first comment
 * (the first a person has not deleted) starts the thread as `startsTheThread` says, given its text
 * normalised (`normalisedComment`). A thread a person deleted is never found. Who wrote a thread is
 * not checked, since Azure does not tell it here (docs/v2/host-verification.md).
 * @param {ThreadSite} site @param {{ number: number, url: string | null }} request
 * @param {any[]} threads the pull request's threads, as REST answers them
 * @param {(text: string) => boolean} startsTheThread
 * @returns {KeptThread | undefined}
 */
export const keptThreadBy = (site, { number, url }, threads, startsTheThread) => {
  const opened = threads.map(openedBy).filter((first) => first !== null)
  const found = opened.find((first) => threadUrl(site, number, first.threadId, first.commentId) === url) ?? opened.findLast((first) => startsTheThread(first.text))
  return found === undefined ? undefined : { threadId: found.threadId, commentId: found.commentId }
}
