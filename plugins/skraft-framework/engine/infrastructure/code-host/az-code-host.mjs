import { pullRequestPage } from '../../domain/review/azure-pull-request.mjs'
import { find as findByNumber, keepComment as keepThread, repositoryOf } from './az-repos.mjs'
import { keepComment, workItem } from './az-boards.mjs'
import { keepPullRequestComment } from './az-threads.mjs'
import { NO_AZURE_REMOTE, QUIET, repos, run, succeeded, unavailable, remoteOf, lines, readJson, refused, failedWrite } from './az-cli.mjs'
import { branchOnRemote } from './git-push.mjs'
import { readComment } from './az-read-back.mjs'

/**
 * @typedef {import('../../application/ports/command-runner.mjs').CommandRunner} CommandRunner
 * @typedef {import('../../application/ports/command-runner.mjs').CommandResult} CommandResult
 * @typedef {import('../../application/ports/code-host.mjs').PullRequestRequest} PullRequestRequest
 * @typedef {import('./az-cli.mjs').Remote} Remote
 */

/**
 * CodeHost on `git` and `az`, the Azure CLI with its azure-devops extension, through any host's
 * CommandRunner: the organization, project and repository the remote's URL names. The body always
 * goes through a file (az reads `@<file>`); nothing is ever force-pushed. Every failure is a fixed
 * reason: no output of git or az reaches the caller. No Node API here.
 * @param {{ commandRunner: CommandRunner }} options
 * @returns {import('../../application/ports/code-host.mjs').CodeHost}
 */
export const createAzCodeHost = ({ commandRunner }) => Object.freeze({
  ...whereTo(commandRunner),
  ...branchOnRemote((argv) => run(commandRunner, argv), () => remoteOf(commandRunner), NO_AZURE_REMOTE),
  ...pullRequestsOf(commandRunner),
  ...comments(commandRunner),
  issue: (number) => workItem(commandRunner, number),
  // Azure Repos links `#N`; `Fixes #N` also completes the work item when the pull request merges.
  storyLink: (issue, closes) => `${closes ? 'Fixes ' : ''}#${issue}`,
  // Azure DevOps refuses a pull request description past 4,000 characters.
  bodyLimit: 4_000,
  // az sends a comment from a JSON file.
  takesRequestFile: true,
})

/**
 * The pull request of a branch, found, read whole by its number, opened, its description replaced.
 * @param {CommandRunner} commandRunner
 */
const pullRequestsOf = (commandRunner) => ({
  findPullRequest: (/** @type {string} */ head) => findPullRequest(commandRunner, head),
  readPullRequest: (/** @type {number} */ number) => readOwn(commandRunner, number),
  create: (/** @type {PullRequestRequest} */ request) => create(commandRunner, request),
  edit: (/** @type {{ number: number, bodyFile: string }} */ request) => edit(commandRunner, request),
})

/**
 * What Azure DevOps keeps for a run: its comment on the work item, its run details on the pull
 * request, as threads, and the longest comment it takes. Microsoft documents 150,000 characters
 * for a comment; the engine takes 140,000, the margin GitHub's 65,536 gets to 60,000 (not
 * measured: docs/v2/host-verification.md). @param {CommandRunner} commandRunner
 */
const comments = (commandRunner) => ({
  keepIssueComment: (/** @type {import('../../application/ports/code-host.mjs').IssueCommentRequest} */ request) => keepComment(commandRunner, request),
  keepPullRequestComment: (/** @type {import('../../application/ports/code-host.mjs').PullRequestCommentRequest} */ request) => keepPullRequestComment(commandRunner, request),
  readComment: (/** @type {string} */ url) => readComment(commandRunner, url),
  commentLimit: 140_000,
})

/**
 * Where the working copy's pull requests go: whether they can, the remotes, the branch HEAD is
 * on and the repository's default branch; no repository is named, so no screenshot links a raw
 * file URL skraft does not write for Azure DevOps. @param {CommandRunner} commandRunner
 */
const whereTo = (commandRunner) => ({
  unavailable: () => unavailable(commandRunner),
  remotes: async () => lines((await run(commandRunner, ['git', 'remote'])).stdout),
  repository: async () => null,
  currentBranch: () => currentBranch(commandRunner),
  defaultBranch: () => defaultBranch(commandRunner),
})

/**
 * PullRequests on Azure Repos: a pull request read by its number, and the review's comment kept on
 * it as one thread, rewritten at each pass. The consent is kept for the repository the remote
 * names, from git alone. Every failure is a fixed reason.
 * @param {{ commandRunner: CommandRunner }} options
 * @returns {import('../../application/ports/pull-requests.mjs').PullRequests}
 */
export const createAzPullRequests = ({ commandRunner }) => Object.freeze({
  unavailable: () => unavailable(commandRunner),
  repository: () => repositoryOf(commandRunner),
  checkoutCommand: (number) => `az repos pr checkout --id ${number}`,
  // az sends a thread and a rewritten comment from JSON files.
  takesRequestFile: true,
  find: (number) => findByNumber(commandRunner, number),
  keepComment: (request) => keepThread(commandRunner, request),
  readComment: (url) => readComment(commandRunner, url),
})

/** The branch HEAD is on; null when it is detached. @param {CommandRunner} commandRunner */
const currentBranch = async (commandRunner) => {
  const result = await run(commandRunner, ['git', 'symbolic-ref', '--quiet', '--short', 'HEAD'])
  return result.stdout.trim() || null
}

/** The repository's default branch as Azure DevOps says it; null when az cannot tell. @param {CommandRunner} commandRunner */
const defaultBranch = async (commandRunner) => {
  const remote = await remoteOf(commandRunner)
  if (remote === null) return null
  const result = await repos(commandRunner, remote, ['show'])
  const shown = succeeded(result) ? readJson(result.stdout) : null
  return typeof shown?.defaultBranch === 'string' ? shown.defaultBranch.replace(/^refs\/heads\//, '') : null
}

/** A pull request's state as Azure DevOps names it, as the CodeHost says it. */
const STATES = Object.freeze({ __proto__: null, active: 'open', abandoned: 'closed', completed: 'merged' })

/** The latest pull request whose source is the branch, whatever its state. @param {CommandRunner} commandRunner @param {string} head */
const findPullRequest = async (commandRunner, head) => {
  const remote = await remoteOf(commandRunner)
  return remote === null ? refused(NO_AZURE_REMOTE) : findOn(commandRunner, remote, head)
}

/** @param {CommandRunner} commandRunner @param {Remote} remote @param {string} head */
const findOn = async (commandRunner, remote, head) => {
  const result = await repos(commandRunner, remote, ['pr', 'list', `--source-branch=refs/heads/${head}`, '--status=all'])
  const listed = succeeded(result) ? pullsOf(result.stdout) : null
  if (listed === null) return refused(`az could not list the pull requests of ${remote.project}/${remote.repository}`)
  const latest = listed.reduce((last, pull) => (last === null || pull.pullRequestId > last.pullRequestId ? pull : last), /** @type {Pull | null} */ (null))
  return { ok: /** @type {const} */ (true), found: latest === null ? null : foundOf(remote, latest) }
}

/** @typedef {{ pullRequestId: number, status: string, description?: string | null }} Pull */

/** The pull requests az printed; null unless each has a whole number and a description that is text or none. @param {string} text @returns {Pull[] | null} */
const pullsOf = (text) => {
  const listed = readJson(text)
  return Array.isArray(listed) && listed.every(isPull) ? listed : null
}

/** @param {any} pull @returns {pull is Pull} */
const isPull = (pull) => typeof pull === 'object' && pull !== null && Number.isInteger(pull.pullRequestId) && isTextOrNone(pull.description)

/** @param {unknown} description */
const isTextOrNone = (description) => description === undefined || description === null || typeof description === 'string'

/** @param {Remote} remote @param {Pull} pull */
const foundOf = (remote, { pullRequestId, status, description }) => ({
  number: pullRequestId, url: pullRequestPage(remote, pullRequestId), state: STATES[status] ?? 'closed', body: description ?? '',
})

/**
 * The pull request of that number, as `az repos pr show` prints it: its description whole, where a
 * listing keeps only its first 400 characters. null when Azure DevOps says it has none; one of
 * another repository or project than the remote's is refused.
 * @param {CommandRunner} commandRunner @param {number} number
 */
const readOwn = async (commandRunner, number) => {
  const remote = await remoteOf(commandRunner)
  if (remote === null) return refused(NO_AZURE_REMOTE)
  const shown = await run(commandRunner, ['az', 'repos', 'pr', 'show', `--id=${number}`, `--organization=${remote.organization}`, ...QUIET])
  if (!succeeded(shown)) return NO_SUCH_PULL_REQUEST.test(shown.stderr) ? { ok: /** @type {const} */ (true), found: null } : refused(`az could not read pull request #${number} of ${remote.organization}`)
  const read = ownPullRequestOf(remote, number, readJson(shown.stdout))
  return read === null ? refused(`Azure DevOps answered pull request #${number} in a form skraft cannot read, or of another repository than ${remote.project}/${remote.repository}`) : { ok: /** @type {const} */ (true), found: read }
}

/** What az prints for a pull request that does not exist; read only to tell that case apart, never passed on. Not measured: docs/v2/host-verification.md. */
const NO_SUCH_PULL_REQUEST = /TF401180/

/**
 * The pull request az showed, when it is of the remote's repository: forkSource names the fork a
 * pull request comes from. @param {Remote} remote @param {number} number @param {any} json
 * @returns {import('../../application/ports/code-host.mjs').ReadPullRequest | null}
 */
const ownPullRequestOf = (remote, number, json) => {
  if (json?.pullRequestId !== number || typeof json.sourceRefName !== 'string' || !isTextOrNone(json.description)) return null
  if (String(json.repository?.name).toLowerCase() !== remote.repository.toLowerCase()) return null
  return { ...foundOf(remote, json), head: json.sourceRefName.replace(/^refs\/heads\//, ''), fromFork: json.forkSource != null }
}

/**
 * Opens the pull request, linked to the story's work item when there is one. When that fails, a
 * work item Azure DevOps refuses to link (a wrong id, another project's) must not keep the pull
 * request from opening: the one Azure DevOps opened anyway is kept, else it is opened again
 * without the link, and a fixed note says so.
 * @param {CommandRunner} commandRunner @param {PullRequestRequest} request
 */
const create = async (commandRunner, request) => {
  const remote = await remoteOf(commandRunner)
  if (remote === null) return refused(NO_AZURE_REMOTE)
  const made = await open(commandRunner, remote, request)
  return made.ok || request.issue === null ? made : unlinked(commandRunner, remote, request)
}

/** @param {CommandRunner} commandRunner @param {Remote} remote @param {PullRequestRequest & { issue: number }} request */
const unlinked = async (commandRunner, remote, request) => {
  const listed = await findOn(commandRunner, remote, request.head)
  const kept = listed.ok && listed.found?.state === 'open' ? listed.found : null
  const made = kept ?? (await open(commandRunner, remote, { ...request, issue: null }))
  if ('ok' in made && !made.ok) return made
  return { ok: /** @type {const} */ (true), number: made.number, url: made.url, note: `it is not linked to work item #${request.issue}, which Azure DevOps refused to link` }
}

/** az prints the pull request it opened as JSON. @param {CommandRunner} commandRunner @param {Remote} remote @param {PullRequestRequest} request */
const open = async (commandRunner, remote, { base, head, title, bodyFile, draft, issue }) => {
  const options = [...(draft ? ['--draft=true'] : []), ...(issue === null ? [] : [`--work-items=${issue}`])]
  const result = await repos(commandRunner, remote, ['pr', 'create', `--source-branch=${head}`, `--target-branch=${base}`, `--title=${title}`, `--description=@${bodyFile}`, ...options])
  const made = succeeded(result) ? readJson(result.stdout) : null
  if (!Number.isInteger(made?.pullRequestId)) return failedWrite(result, `az could not open the pull request of ${head} on ${remote.project}/${remote.repository}`)
  return { ok: /** @type {const} */ (true), number: made.pullRequestId, url: pullRequestPage(remote, made.pullRequestId) }
}

/** Replaces the pull request's description. @param {CommandRunner} commandRunner @param {{ number: number, bodyFile: string }} request */
const edit = async (commandRunner, { number, bodyFile }) => {
  const remote = await remoteOf(commandRunner)
  if (remote === null) return refused(NO_AZURE_REMOTE)
  const result = await run(commandRunner, ['az', 'repos', 'pr', 'update', `--id=${number}`, `--description=@${bodyFile}`, `--organization=${remote.organization}`, ...QUIET])
  return succeeded(result) ? { ok: /** @type {const} */ (true) } : failedWrite(result, `az could not update pull request #${number} on ${remote.project}/${remote.repository}`)
}
