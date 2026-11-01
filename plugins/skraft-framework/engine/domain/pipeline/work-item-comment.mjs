import { escapedAsHtml } from './azure-thread.mjs'

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
 * escaped as the Azure DevOps MCP server 2.11.0 writes them for an agent (as the
 * azure-boards-work-items skill says; not measured). A reply that quotes the marker further in is someone else's, never rewritten; who
 * wrote a comment is not checked, since Azure does not tell it here (docs/v2/host-verification.md).
 * @param {WorkItemSite} site @param {{ number: number, marker: string, url: string | null }} request
 * @param {any[]} comments the work item's comments, as REST answers them: `id` and `text`
 */
export const keptCommentOf = (site, { number, marker, url }, comments) => {
  const marks = (/** @type {any} */ comment) => [marker, escapedAsHtml(marker)].some((mark) => String(comment?.text).startsWith(mark))
  return comments.find((comment) => commentUrl(site, number, comment?.id) === url) ?? comments.findLast(marks)
}
