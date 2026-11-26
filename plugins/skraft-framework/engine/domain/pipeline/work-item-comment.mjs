import { escapedAsHtml } from './azure-thread.mjs'
import { markdownOf } from './html-markdown.mjs'

/**
 * The comment of a run on its work item, found again among the work item's comments: the same
 * choice on the comments az lists.
 *
 * @typedef {{ organization: string, project: string }} WorkItemSite the organization and project of the Git remote
 */

/**
 * The REST address of a comment of a work item, as skraft builds it: a web anchor for a comment is
 * not documented, so none is invented.
 * @param {WorkItemSite} site @param {number} number @param {unknown} id
 */
export const commentUrl = ({ organization, project }, number, id) => `${organization}/${encodeURIComponent(project)}/_apis/wit/workItems/${number}/comments/${id}`

/**
 * Whether the answer is a list of comments, each with the integer `id` an update needs.
 * @param {unknown} comments @returns {comments is any[]}
 */
export const areComments = (comments) => Array.isArray(comments) && comments.every((comment) => Number.isInteger(comment?.id))

/**
 * The comment to rewrite: the one at the URL the journal kept, else the last whose text STARTS
 * with the marker (the first line of a comment of the run), as written or with `<`, `>` and `&`
 * escaped as HTML: the form Azure Boards keeps when the comment's text was sent escaped, by an
 * agent's client rather than by az (not measured: docs/v2/host-verification.md). A reply that quotes the marker further in is someone else's, never rewritten; who
 * wrote a comment is not checked, since Azure does not tell it here (docs/v2/host-verification.md).
 * @param {WorkItemSite} site @param {{ number: number, marker: string, url: string | null }} request
 * @param {any[]} comments the work item's comments, as REST answers them: `id` and `text`
 */
export const keptCommentOf = (site, { number, marker, url }, comments) => {
  const marks = (/** @type {any} */ comment) => [marker, escapedAsHtml(marker)].some((mark) => String(comment?.text).startsWith(mark))
  return comments.find((comment) => commentUrl(site, number, comment?.id) === url) ?? comments.findLast(marks)
}

/**
 * The comments of a work item as the story's comments: who wrote each, when, and its text in
 * Markdown, as the work item's fields are read; a deleted one left out.
 * @param {any[]} comments the work item's comments, as REST answers them: `createdBy`, `createdDate`, `text`
 * @returns {import('../../application/ports/code-host.mjs').IssueComment[]}
 */
export const storyComments = (comments) => comments.filter((comment) => comment?.isDeleted !== true).map(storyComment)

/** @param {any} comment */
const storyComment = ({ createdBy, createdDate, text }) => ({
  author: String(createdBy?.displayName ?? createdBy?.uniqueName ?? ''),
  date: String(createdDate ?? ''),
  body: markdownOf(String(text ?? '')),
})
