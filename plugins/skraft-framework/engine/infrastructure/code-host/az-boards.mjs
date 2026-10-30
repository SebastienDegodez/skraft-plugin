import { inProject, workItemReading } from '../../domain/pipeline/work-item.mjs'
import { areComments, commentUrl, keptCommentOf } from '../../domain/pipeline/work-item-comment.mjs'
import { NO_AZURE_REMOTE, QUIET, readJson, refused, remoteOf, run, succeeded, unavailable } from './az-cli.mjs'

/**
 * The work items of Azure Boards through az, the Azure CLI with its azure-devops extension: the
 * story a run starts from, and the comment that keeps its progress. Every failure is a fixed reason: no output of az reaches the caller,
 * which the one stderr this reads (a work item that does not exist) never does either.
 * @typedef {import('../../application/ports/command-runner.mjs').CommandRunner} CommandRunner
 * @typedef {import('../../application/ports/code-host.mjs').IssueReading} IssueReading
 * @typedef {import('./az-cli.mjs').Remote} Remote
 */

/**
 * The work item of that number, read as the story of the run. Failed without an az that reaches
 * the organization; missing when Azure DevOps says it has no such work item.
 * @param {CommandRunner} commandRunner @param {number} number @returns {Promise<IssueReading>}
 */
export const workItem = async (commandRunner, number) => {
  const unreachable = await unavailable(commandRunner)
  const remote = unreachable === null ? await remoteOf(commandRunner) : null
  if (unreachable !== null || remote === null) return failed(unreachable ?? NO_AZURE_REMOTE)
  const shown = await run(commandRunner, ['az', 'boards', 'work-item', 'show', `--id=${number}`, `--organization=${remote.organization}`, ...QUIET])
  if (!succeeded(shown)) return NO_SUCH_WORK_ITEM.test(shown.stderr) ? { read: 'missing' } : failed(`az could not read work item #${number} of ${remote.organization}`)
  return workItemReading({ number, ...remote }, readJson(shown.stdout)) ?? failed(`Azure DevOps answered work item #${number} in a form skraft cannot read`)
}

/**
 * What az prints for a work item that does not exist, or that its user may not read. This text is
 * read only to tell the two cases apart and is never passed on. Not measured: docs/v2/host-verification.md.
 */
const NO_SUCH_WORK_ITEM = /TF401232/

/** @param {string} reason @returns {IssueReading} */
const failed = (reason) => ({ read: 'failed', reason })

/** The most pages of comments one work item's conversation is read in; a longer one is never written to. */
const MAX_PAGES = 10

/** The version of the comments API the MCP server 2.11.0 sends; not measured through az (docs/v2/host-verification.md). */
const COMMENTS_API = '--api-version=7.2-preview.4'

/**
 * The run's comment on the work item rewritten (the one at the URL kept, else the latest holding
 * the marker) or posted, once the work item is checked to be of the remote's project. Refused
 * without a comment written when az cannot read the work item or its comments, so that none is
 * posted twice.
 * @param {CommandRunner} commandRunner @param {import('../../application/ports/code-host.mjs').IssueCommentRequest} request
 */
export const keepComment = async (commandRunner, request) => {
  const unreachable = await unavailable(commandRunner)
  const remote = unreachable === null ? await remoteOf(commandRunner) : null
  if (unreachable !== null || remote === null) return refused(unreachable ?? NO_AZURE_REMOTE)
  const guard = await guarded(commandRunner, remote, request.number)
  if (guard !== null) return refused(guard)
  const comments = await commentsOf(commandRunner, remote, request.number)
  if (comments === null) return couldNotComment(remote, request.number)
  return write(commandRunner, remote, request, keptCommentOf(remote, request, comments))
}

/** @param {Remote} remote @param {number} number */
const couldNotComment = (remote, number) => refused(`az could not comment work item #${number} of ${remote.project}`)

/** Why the work item is not written to: unreadable, or of another project than the remote's; null when it may be. @param {CommandRunner} commandRunner @param {Remote} remote @param {number} number */
const guarded = async (commandRunner, remote, number) => {
  const shown = await run(commandRunner, ['az', 'boards', 'work-item', 'show', `--id=${number}`, `--organization=${remote.organization}`, ...QUIET])
  if (!succeeded(shown)) return `az could not read work item #${number} of ${remote.organization}`
  const item = readJson(shown.stdout)
  if (item?.id !== number) return `Azure DevOps answered work item #${number} in a form skraft cannot read`
  return inProject(item, remote.project) ? null : `work item #${number} is not in project ${remote.project} of the Git remote, so skraft wrote nothing on it`
}

/** `az devops invoke` on the comments of the organization's work items. @param {CommandRunner} commandRunner @param {Remote} remote @param {string[]} route @param {string[]} [more] */
const invoke = (commandRunner, remote, route, more = []) =>
  run(commandRunner, ['az', 'devops', 'invoke', '--area=wit', '--resource=comments', '--route-parameters', ...route, ...more, COMMENTS_API, `--organization=${remote.organization}`, '--only-show-errors', '--output=json'])

/**
 * Every comment of the work item, page by page; null when az fails, answers what skraft cannot
 * read, or the conversation is longer than the pages it follows.
 * @param {CommandRunner} commandRunner @param {Remote} remote @param {number} number @returns {Promise<any[] | null>}
 */
const commentsOf = async (commandRunner, remote, number) => {
  const comments = []
  /** @type {string | undefined} */
  let token
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const answer = await pageOf(commandRunner, remote, number, token)
    if (!areComments(answer?.comments)) return null
    comments.push(...answer.comments)
    token = answer.continuationToken
    if (token === undefined) return comments
  }
  return null
}

/** One page of the comments, from the token the page before gave; null when az fails or answers no JSON. @param {CommandRunner} commandRunner @param {Remote} remote @param {number} number @param {string | undefined} token */
const pageOf = async (commandRunner, remote, number, token) => {
  const route = [`project=${remote.project}`, `workItemId=${number}`]
  const listed = await invoke(commandRunner, remote, route, token === undefined ? [] : ['--query-parameters', `continuationToken=${token}`])
  return succeeded(listed) ? readJson(listed.stdout) : null
}

/** @param {CommandRunner} commandRunner @param {Remote} remote @param {import('../../application/ports/code-host.mjs').IssueCommentRequest} request @param {any} kept */
const write = async (commandRunner, remote, { number, requestFile }, kept) => {
  const route = [`project=${remote.project}`, `workItemId=${number}`]
  const more = kept === undefined ? ['--http-method=POST', '--query-parameters', 'format=0'] : ['--http-method=PATCH']
  const written = await invoke(commandRunner, remote, kept === undefined ? route : [...route, `commentId=${kept.id}`], [...more, `--in-file=${requestFile}`])
  const id = succeeded(written) ? readJson(written.stdout)?.id : null
  return Number.isInteger(id) ? { ok: /** @type {const} */ (true), url: commentUrl(remote, number, id) } : couldNotComment(remote, number)
}
