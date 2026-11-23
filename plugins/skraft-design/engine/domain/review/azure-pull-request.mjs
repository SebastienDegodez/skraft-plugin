import { isInOrganization } from '../config/azure-remote.mjs'
import { keptThreadBy, THREAD_CLOSED } from '../pipeline/azure-thread.mjs'
import { commentStartOf } from './pull-request.mjs'

/**
 * A pull request of Azure Repos and its review thread: the same reading whichever way they were
 * fetched by az, as REST answers them. The threads are
 * kept as azure-thread.mjs says.
 *
 * @typedef {import('../../application/ports/pull-requests.mjs').PullRequestFacts} PullRequestFacts
 * @typedef {import('../pipeline/azure-thread.mjs').ThreadSite} ThreadSite
 * @typedef {import('../pipeline/azure-thread.mjs').KeptThread} KeptThread
 * @typedef {ThreadSite} PullRequestSite the organization, project and repository of the Git remote
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
 * The thread to rewrite: the one at the URL the journal kept, else the last whose first comment is
 * the review's: it STARTS as the review's comment does (its heading) and holds the marker, which
 * the server may have stored with entities, a byte order mark or blank lines
 * (`normalisedComment`; not measured for threads). The marker closes the review's comment, so it
 * is the heading that tells a reply quoting it (its first line is a quote or its own words) from
 * the review: that reply is someone else's, never rewritten.
 * @param {ThreadSite} site @param {{ number: number, marker: string, url: string | null }} request
 * @param {any[]} threads the pull request's threads, as REST answers them
 * @returns {KeptThread | undefined}
 */
export const keptThreadOf = (site, { number, marker, url }, threads) =>
  keptThreadBy(site, { number, url }, threads, (text) => text.startsWith(commentStartOf(number)) && text.includes(marker))

/** The request of a new thread: the review as its one comment, the thread Closed so that no policy waits on it. @param {string} body */
export const threadRequestOf = (body) => JSON.stringify({ comments: [{ parentCommentId: 0, content: body, commentType: 1 }], status: THREAD_CLOSED })

/** The request that rewrites a comment. @param {string} body */
export const contentRequestOf = (body) => JSON.stringify({ content: body })
