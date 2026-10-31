import { ELSEWHERE, elsewhereReason, keptThreadOf, pullRequestFactsOf } from '../../domain/review/azure-pull-request.mjs'
import { areThreads, createdThreadOf, rewrittenThreadOf, threadUrl } from '../../domain/pipeline/azure-thread.mjs'
import { azureRepositoryKeyOf } from '../../domain/config/azure-remote.mjs'
import { NO_AZURE_REMOTE, QUIET, readJson, refused, remoteOf, run, succeeded } from './az-cli.mjs'

/**
 * The pull requests of Azure Repos through az, the Azure CLI with its azure-devops extension: one
 * read by its number, and the review's thread, found again among the pull request's threads and
 * rewritten, else posted. Every failure is a fixed reason: no output of az reaches the caller,
 * which the one stderr this reads (a pull request that does not exist) never does either. No
 * Node API here.
 * @typedef {import('../../application/ports/command-runner.mjs').CommandRunner} CommandRunner
 * @typedef {import('../../application/ports/pull-requests.mjs').ThreadCommentRequest} ThreadCommentRequest
 * @typedef {import('./az-cli.mjs').Remote} Remote
 */

/**
 * What az prints for a pull request that does not exist. This text is read only to tell that case
 * from the others and is never passed on. Not measured: docs/v2/host-verification.md.
 */
const NO_SUCH_PULL_REQUEST = /TF401180/

/** The version of the Git REST API `az devops invoke` sends; not measured (docs/v2/host-verification.md). */
const GIT_API = '--api-version=7.1'

/** The host and `<organization>/<project>/<repository>` the remote names, from git alone; null without a remote that names one. @param {CommandRunner} commandRunner */
export const repositoryOf = async (commandRunner) => {
  const remote = await remoteOf(commandRunner)
  return remote === null ? null : azureRepositoryKeyOf(remote)
}

/**
 * The pull request of that number, read as `az repos pr show` prints it; found is null when
 * Azure DevOps says it has none, and a pull request of another repository or project than the
 * remote's is refused.
 * @param {CommandRunner} commandRunner @param {number} number
 */
export const find = async (commandRunner, number) => {
  const remote = await remoteOf(commandRunner)
  return remote === null ? refused(NO_AZURE_REMOTE) : read(commandRunner, remote, number)
}

/** @param {CommandRunner} commandRunner @param {Remote} remote @param {number} number */
const read = async (commandRunner, remote, number) => {
  const shown = await run(commandRunner, ['az', 'repos', 'pr', 'show', `--id=${number}`, `--organization=${remote.organization}`, ...QUIET])
  if (!succeeded(shown)) return NO_SUCH_PULL_REQUEST.test(shown.stderr) ? { ok: /** @type {const} */ (true), found: null } : refused(couldNotRead(remote, number))
  const facts = pullRequestFactsOf(remote, number, readJson(shown.stdout))
  if (facts === null) return refused(`Azure DevOps answered pull request #${number} in a form skraft cannot read`)
  return facts === ELSEWHERE ? refused(elsewhereReason(remote, number)) : { ok: /** @type {const} */ (true), found: facts }
}

/** @param {Remote} remote @param {number} number */
const couldNotRead = (remote, number) => `az could not read pull request #${number} of ${remote.organization}`

/** @param {Remote} remote @param {number} number */
const couldNotComment = (remote, number) => refused(`az could not comment pull request #${number} of ${remote.project}/${remote.repository}`)

/**
 * The review's thread rewritten (the one at the URL kept, else the latest whose first comment
 * starts with the marker) or posted, once the pull request is checked to be of the remote's
 * repository. Refused without a comment written when az cannot read the pull request or its
 * threads, so that none is posted twice.
 * @param {CommandRunner} commandRunner @param {ThreadCommentRequest} request
 */
export const keepComment = async (commandRunner, request) => {
  const remote = await remoteOf(commandRunner)
  if (remote === null) return refused(NO_AZURE_REMOTE)
  const shown = await read(commandRunner, remote, request.number)
  if (!shown.ok) return shown
  if (shown.found === null) return refused(couldNotRead(remote, request.number))
  const threads = await threadsOf(commandRunner, remote, request.number)
  return threads === null ? couldNotComment(remote, request.number) : write(commandRunner, remote, request, keptThreadOf(remote, request, threads))
}

/** `az devops invoke` on a resource of the pull request's threads. @param {CommandRunner} commandRunner @param {Remote} remote @param {string} resource @param {string[]} route @param {string[]} [more] */
const invoke = (commandRunner, remote, resource, route, more = []) =>
  run(commandRunner, ['az', 'devops', 'invoke', '--area=git', `--resource=${resource}`, '--route-parameters', `project=${remote.project}`, `repositoryId=${remote.repository}`, ...route, ...more, GIT_API, `--organization=${remote.organization}`, '--only-show-errors', '--output=json'])

/** Every thread of the pull request; null when az fails or answers what skraft cannot read. @param {CommandRunner} commandRunner @param {Remote} remote @param {number} number @returns {Promise<any[] | null>} */
const threadsOf = async (commandRunner, remote, number) => {
  const listed = await invoke(commandRunner, remote, 'pullRequestThreads', [`pullRequestId=${number}`])
  const answer = succeeded(listed) ? readJson(listed.stdout) : null
  return areThreads(answer?.value) && answer.count === answer.value.length ? answer.value : null
}

/** @param {CommandRunner} commandRunner @param {Remote} remote @param {ThreadCommentRequest} request @param {import('../../domain/review/azure-pull-request.mjs').KeptThread | undefined} kept */
const write = async (commandRunner, remote, { number, threadFile, contentFile }, kept) => {
  const route = [`pullRequestId=${number}`]
  const written = kept === undefined
    ? await invoke(commandRunner, remote, 'pullRequestThreads', route, ['--http-method=POST', `--in-file=${threadFile}`])
    : await invoke(commandRunner, remote, 'pullRequestThreadComments', [...route, `threadId=${kept.threadId}`, `commentId=${kept.commentId}`], ['--http-method=PATCH', `--in-file=${contentFile}`])
  const json = succeeded(written) ? readJson(written.stdout) : null
  const at = kept === undefined ? createdThreadOf(json) : rewrittenThreadOf(kept, json)
  return at === null ? couldNotComment(remote, number) : { ok: /** @type {const} */ (true), url: threadUrl(remote, number, at.threadId, at.commentId) }
}
