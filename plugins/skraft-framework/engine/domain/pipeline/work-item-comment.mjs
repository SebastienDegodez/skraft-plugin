/**
 * The comment of a run on its work item, found again among the work item's comments: the same
 * choice whichever way the comments were listed (the host's MCP server or az).
 *
 * @typedef {{ organization: string, project: string }} WorkItemSite the organization and project of the Git remote
 */

/**
 * The REST address of a comment of a work item, as skraft builds it: a web anchor for a comment is
 * not documented, so none is invented.
 * @param {WorkItemSite} site @param {number} number @param {unknown} id
 */
export const commentUrl = ({ organization, project }, number, id) => `${organization}/${encodeURIComponent(project)}/_apis/wit/workItems/${number}/comments/${id}`

/** @param {string} text */
const escapedAsHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * The comment to rewrite: the one at the URL the journal kept, else the last holding the marker,
 * as written or with `<`, `>` and `&` as the MCP server rewrites them (2.11.0, as the
 * azure-boards-work-items skill says; not measured through az).
 * @param {WorkItemSite} site @param {{ number: number, marker: string, url: string | null }} request
 * @param {any[]} comments the work item's comments, as REST answers them: `id` and `text`
 */
export const keptCommentOf = (site, { number, marker, url }, comments) => {
  const marks = (/** @type {any} */ comment) => [marker, escapedAsHtml(marker)].some((mark) => String(comment?.text).includes(mark))
  return comments.find((comment) => commentUrl(site, number, comment?.id) === url) ?? comments.findLast(marks)
}
