import { forgeUnreachable } from '../../domain/config/forge.mjs'
import { workItem } from './az-boards.mjs'
import { NO_AZURE_REMOTE, QUIET, repos, run, succeeded, unavailable, remoteOf, lines, readJson, refused } from './az-cli.mjs'

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
 * reason: no output of git or az reaches the caller. Issues, their comments and pull request
 * reviews are not reached on Azure DevOps yet. No Node API here.
 * @param {{ commandRunner: CommandRunner }} options
 * @returns {import('../../application/ports/code-host.mjs').CodeHost}
 */
export const createAzCodeHost = ({ commandRunner }) => Object.freeze({
  ...whereTo(commandRunner),
  push: (branch) => push(commandRunner, branch),
  findPullRequest: (head) => findPullRequest(commandRunner, head),
  create: (request) => create(commandRunner, request),
  edit: (request) => edit(commandRunner, request),
  keepIssueComment: async () => refused(UNREACHED),
  issue: (number) => workItem(commandRunner, number),
  storyLink: (issue) => `AB#${issue}`,
  // Azure DevOps refuses a pull request description past 4,000 characters.
  bodyLimit: 4_000,
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
 * PullRequests on Azure DevOps: not reached yet, a fixed reason.
 * @returns {import('../../application/ports/pull-requests.mjs').PullRequests}
 */
export const createAzPullRequests = () => Object.freeze({
  unavailable: async () => UNREACHED,
  repository: async () => null,
  find: async () => refused(UNREACHED),
  keepComment: async () => refused(UNREACHED),
})

const UNREACHED = forgeUnreachable('azure-devops')

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

/**
 * Pushes the branch to the same branch of the remote, never forced: a remote that moved refuses it.
 * @param {CommandRunner} commandRunner @param {string} branch
 */
const push = async (commandRunner, branch) => {
  const remote = await remoteOf(commandRunner)
  if (remote === null) return refused(NO_AZURE_REMOTE)
  const result = await run(commandRunner, ['git', '-c', 'core.sshCommand=ssh -o BatchMode=yes', '-c', 'credential.interactive=never', 'push', '--porcelain', remote.name, `refs/heads/${branch}:refs/heads/${branch}`])
  return succeeded(result) ? { ok: /** @type {const} */ (true) } : refused(`git push of ${branch} to ${remote.name} failed or was refused`)
}

/** A pull request's state as Azure DevOps names it, as the CodeHost says it. */
const STATES = Object.freeze({ __proto__: null, active: 'open', abandoned: 'closed', completed: 'merged' })

/** The page of a pull request. @param {Remote} remote @param {number} number */
const pageOf = ({ organization, project, repository }, number) =>
  `${organization}/${encodeURIComponent(project)}/_git/${encodeURIComponent(repository)}/pullrequest/${number}`

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
  number: pullRequestId, url: pageOf(remote, pullRequestId), state: STATES[status] ?? 'closed', body: description ?? '',
})

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
  if (!Number.isInteger(made?.pullRequestId)) return refused(`az could not open the pull request of ${head} on ${remote.project}/${remote.repository}`)
  return { ok: /** @type {const} */ (true), number: made.pullRequestId, url: pageOf(remote, made.pullRequestId) }
}

/** Replaces the pull request's description. @param {CommandRunner} commandRunner @param {{ number: number, bodyFile: string }} request */
const edit = async (commandRunner, { number, bodyFile }) => {
  const remote = await remoteOf(commandRunner)
  if (remote === null) return refused(NO_AZURE_REMOTE)
  const result = await run(commandRunner, ['az', 'repos', 'pr', 'update', `--id=${number}`, `--description=@${bodyFile}`, `--organization=${remote.organization}`, ...QUIET])
  return succeeded(result) ? { ok: /** @type {const} */ (true) } : refused(`az could not update pull request #${number} on ${remote.project}/${remote.repository}`)
}
