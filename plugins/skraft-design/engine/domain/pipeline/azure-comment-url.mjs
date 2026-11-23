import { threadUrl } from './azure-thread.mjs'
import { commentUrl } from './work-item-comment.mjs'

/**
 * Which comment a REST address skraft built for Azure DevOps names, so that it is read back where
 * it was written: a comment of a work item of the remote's project, or the comment of a thread of
 * a pull request of the remote's repository. An address of another organization, project or
 * repository names none.
 *
 * @typedef {{ organization: string, project: string, repository: string }} CommentSite
 * @typedef {{ kind: 'work-item', number: number, id: number } | { kind: 'thread', number: number, threadId: number, commentId: number }} CommentAddress
 */

/** The ids an address skraft built ends with: a work item's comment, or a thread's comment. */
const WORK_ITEM = /\/_apis\/wit\/workItems\/(\d+)\/comments\/(\d+)$/
const THREAD = /\/pullRequests\/(\d+)\/threads\/(\d+)\/comments\/(\d+)$/

/** @param {CommentSite} site @param {string} url @returns {CommentAddress | null} */
export const commentAddressOf = (site, url) => {
  const item = WORK_ITEM.exec(url)
  if (item !== null) return built(url, commentUrl(site, Number(item[1]), Number(item[2])), { kind: 'work-item', number: Number(item[1]), id: Number(item[2]) })
  const thread = THREAD.exec(url)
  if (thread === null) return null
  const [number, threadId, commentId] = thread.slice(1).map(Number)
  return built(url, threadUrl(site, number, threadId, commentId), { kind: 'thread', number, threadId, commentId })
}

/** The address, when skraft would have built that very URL on the remote's site. @param {string} url @param {string} rebuilt @param {CommentAddress} address */
const built = (url, rebuilt, address) => (url === rebuilt ? address : null)
