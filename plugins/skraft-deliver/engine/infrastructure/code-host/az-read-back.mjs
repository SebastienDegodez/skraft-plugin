import { commentAddressOf } from '../../domain/pipeline/azure-comment-url.mjs'
import { normalisedComment } from '../../domain/pipeline/azure-thread.mjs'
import { NO_AZURE_REMOTE, readJson, refused, remoteOf, run, succeeded } from './az-cli.mjs'

/**
 * A comment skraft kept on Azure DevOps, read back at the REST address it gave through az devops
 * invoke: a work item's comment, or a thread's comment of a pull request. Its text as written
 * (`normalisedComment`), none for a comment deleted. Every failure is a fixed reason: no output of
 * az reaches the caller. No Node API here.
 * @typedef {import('../../application/ports/command-runner.mjs').CommandRunner} CommandRunner
 * @typedef {import('./az-cli.mjs').Remote} Remote
 * @typedef {import('../../domain/pipeline/azure-comment-url.mjs').CommentAddress} CommentAddress
 */

/** The versions of the comments APIs, as the writes send them; not measured through az (docs/v2/host-verification.md). */
const WIT_API = '--api-version=7.2-preview.4'
const GIT_API = '--api-version=7.1'

/**
 * @param {CommandRunner} commandRunner @param {string} url
 * @returns {Promise<import('../../application/ports/code-host.mjs').CommentReading>}
 */
export const readComment = async (commandRunner, url) => {
  const remote = await remoteOf(commandRunner)
  if (remote === null) return refused(NO_AZURE_REMOTE)
  const address = commentAddressOf(remote, url)
  if (address === null) return refused(`${url} names no comment of ${remote.project}/${remote.repository}`)
  const read = await run(commandRunner, invocation(remote, address))
  const comment = succeeded(read) ? readJson(read.stdout) : null
  return typeof comment?.id === 'number' ? { ok: true, body: textOf(comment) } : refused(`az could not read back the comment at ${url}`)
}

/** The comment's text as written; none once a person deleted it. @param {any} comment */
const textOf = (comment) => {
  const text = comment.text ?? comment.content
  return comment.isDeleted === true || typeof text !== 'string' ? null : normalisedComment(text)
}

/** `az devops invoke` that GETs the comment at that address. @param {Remote} remote @param {CommentAddress} address */
const invocation = (remote, address) => [
  'az', 'devops', 'invoke', ...routeOf(remote, address), `--organization=${remote.organization}`, '--only-show-errors', '--output=json',
]

/** @param {Remote} remote @param {CommentAddress} address */
const routeOf = (remote, address) => (address.kind === 'work-item'
  ? ['--area=wit', '--resource=comments', '--route-parameters', `project=${remote.project}`, `workItemId=${address.number}`, `commentId=${address.id}`, WIT_API]
  : ['--area=git', '--resource=pullRequestThreadComments', '--route-parameters', `project=${remote.project}`, `repositoryId=${remote.repository}`, `pullRequestId=${address.number}`, `threadId=${address.threadId}`, `commentId=${address.commentId}`, GIT_API])
