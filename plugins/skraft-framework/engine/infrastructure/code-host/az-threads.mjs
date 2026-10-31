import { areThreads, createdThreadOf, keptThreadBy, rewrittenThreadOf, threadUrl } from '../../domain/pipeline/azure-thread.mjs'
import { NO_AZURE_REMOTE, readJson, refused, remoteOf, run, succeeded, unavailable } from './az-cli.mjs'

/**
 * The comment of a run on a pull request of Azure Repos through az, the Azure CLI with its
 * azure-devops extension: the threads of the pull request listed, the run's comment rewritten
 * in its thread or a thread posted. Refused without a comment written when az cannot list the
 * threads, so that none is posted twice. Every failure is a fixed reason: no output of az
 * reaches the caller.
 * @typedef {import('../../application/ports/command-runner.mjs').CommandRunner} CommandRunner
 * @typedef {import('./az-cli.mjs').Remote} Remote
 */

/** The version of the pull request threads API; not measured through az (docs/v2/host-verification.md). */
const THREADS_API = '--api-version=7.1'

/**
 * @param {CommandRunner} commandRunner @param {import('../../application/ports/code-host.mjs').PullRequestCommentRequest} request
 */
export const keepPullRequestComment = async (commandRunner, request) => {
  const unreachable = await unavailable(commandRunner)
  const remote = unreachable === null ? await remoteOf(commandRunner) : null
  if (unreachable !== null || remote === null) return refused(unreachable ?? NO_AZURE_REMOTE)
  const listed = await threadsOf(commandRunner, remote, request.number)
  if (listed === null) return refused(`az could not list the comment threads of pull request #${request.number} on ${remote.project}/${remote.repository}`)
  return write(commandRunner, remote, request, keptThreadBy(remote, request, listed, (text) => text.startsWith(request.marker)))
}

/** `az devops invoke` on the pull request's threads or one thread's comments. @param {CommandRunner} commandRunner @param {Remote} remote @param {string} resource @param {string[]} route @param {string[]} [more] */
const invoke = (commandRunner, remote, resource, route, more = []) =>
  run(commandRunner, ['az', 'devops', 'invoke', '--area=git', `--resource=${resource}`, '--route-parameters', `project=${remote.project}`, `repositoryId=${remote.repository}`, ...route, ...more, THREADS_API, `--organization=${remote.organization}`, '--only-show-errors', '--output=json'])

/** Every thread of the pull request; null when az fails or answers what skraft cannot read. @param {CommandRunner} commandRunner @param {Remote} remote @param {number} number @returns {Promise<any[] | null>} */
const threadsOf = async (commandRunner, remote, number) => {
  const listed = await invoke(commandRunner, remote, 'pullRequestThreads', [`pullRequestId=${number}`])
  const threads = succeeded(listed) ? readJson(listed.stdout)?.value : null
  return areThreads(threads) ? threads : null
}

/** The thread a write answered with: the new thread's, or the one kept when the answer is the comment rewritten. @param {any} json @param {import('../../domain/pipeline/azure-thread.mjs').KeptThread | undefined} kept */
const writtenThread = (json, kept) => (kept === undefined ? createdThreadOf(json) : rewrittenThreadOf(kept, json))

/** @param {CommandRunner} commandRunner @param {Remote} remote @param {import('../../application/ports/code-host.mjs').PullRequestCommentRequest} request @param {import('../../domain/pipeline/azure-thread.mjs').KeptThread | undefined} kept */
const write = async (commandRunner, remote, { number, threadFile, commentFile }, kept) => {
  const route = [`pullRequestId=${number}`]
  const written = kept === undefined
    ? await invoke(commandRunner, remote, 'pullRequestThreads', route, ['--http-method=POST', `--in-file=${threadFile}`])
    : await invoke(commandRunner, remote, 'pullRequestThreadComments', [...route, `threadId=${kept.threadId}`, `commentId=${kept.commentId}`], ['--http-method=PATCH', `--in-file=${commentFile}`])
  const ids = succeeded(written) ? writtenThread(readJson(written.stdout), kept) : null
  return ids === null ? refused(`az could not comment pull request #${number} on ${remote.project}/${remote.repository}`) : { ok: /** @type {const} */ (true), url: threadUrl(remote, number, ids.threadId, ids.commentId) }
}
