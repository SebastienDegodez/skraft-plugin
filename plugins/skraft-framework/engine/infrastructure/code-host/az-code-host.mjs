import { forgeUnreachable } from '../../domain/config/forge.mjs'

/**
 * @typedef {import('../../application/ports/command-runner.mjs').CommandRunner} CommandRunner
 * @typedef {import('../../application/ports/command-runner.mjs').CommandResult} CommandResult
 * @typedef {import('../../application/ports/code-host.mjs').PullRequestRequest} PullRequestRequest
 * @typedef {{ name: string, organization: string, project: string, repository: string }} Remote
 *   name: the Git remote (origin when there is one); organization: its URL, as az's
 *   --organization takes it; project and repository: their names, decoded.
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
  issue: async () => ({ read: /** @type {const} */ ('failed'), reason: UNREACHED }),
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

export const NO_AZURE_REMOTE = 'the working copy has no Git remote whose URL names an Azure DevOps organization, project and repository'
export const NO_AZ = 'az, the Azure CLI, is not installed'
/** Why az does not start under Windows from anything but the installer's az.cmd (process/az-launch.mjs). */
export const AZ_NOT_FROM_INSTALLER = 'skraft runs az under Windows only from the Azure CLI installer (MSI or winget), which starts it without cmd.exe; install the Azure CLI that way'
export const NO_EXTENSION = 'the azure-devops extension of the Azure CLI is not installed; run az extension add --name azure-devops'

/**
 * No program may wait for a human: git asks no password and ssh no passphrase; az installs no
 * extension on its own. The mod's runner cannot set the environment, so git is also told by its
 * own configuration, and az by --only-show-errors and stdin closed.
 */
const NO_PROMPT = Object.freeze({ GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes', AZURE_EXTENSION_USE_DYNAMIC_INSTALL: 'no' })

/** The longest a git or az call may run, a push included. */
const CALL_TIMEOUT_MS = 120_000

/** @param {CommandRunner} commandRunner @param {string[]} argv */
// Stryker disable next-line StringLiteral: '' and '.' are both the working copy to the CommandRunner
const run = (commandRunner, argv) => commandRunner.run({ argv, cwd: '.', env: NO_PROMPT, timeoutMs: CALL_TIMEOUT_MS })

/**
 * What every call to az ends with: JSON, errors only, no repository guessed from the working copy.
 * Every value goes as `--option=value`, so that one starting with `-` (a title) is never read as an option.
 */
const QUIET = ['--detect=false', '--only-show-errors', '--output=json']

/** `az repos …` on the remote's organization, project and repository. @param {CommandRunner} commandRunner @param {Remote} remote @param {string[]} args */
const repos = (commandRunner, remote, args) =>
  run(commandRunner, ['az', 'repos', ...args, `--organization=${remote.organization}`, `--project=${remote.project}`, `--repository=${remote.repository}`, ...QUIET])

/** @param {CommandResult} result */
const succeeded = (result) => result.started && result.exitCode === 0

/** Why no pull request can be opened from here; null when one can. @param {CommandRunner} commandRunner */
const unavailable = async (commandRunner) => {
  const version = await run(commandRunner, ['az', '--version'])
  if (!version.started) return version.error === AZ_NOT_FROM_INSTALLER ? AZ_NOT_FROM_INSTALLER : NO_AZ
  const remote = await remoteOf(commandRunner)
  if (remote === null) return NO_AZURE_REMOTE
  if (!succeeded(await run(commandRunner, ['az', 'extension', 'show', '--name=azure-devops', '--only-show-errors', '--output=json']))) return NO_EXTENSION
  return succeeded(await repos(commandRunner, remote, ['show'])) ? null : notSignedIn(remote)
}

/** @param {Remote} remote */
const notSignedIn = ({ organization, project, repository }) =>
  `az is not signed in to the Azure DevOps organization ${organization}, or cannot read ${project}/${repository} there; run az login, or az devops login --organization ${organization}`

/**
 * The remote pull requests go to: origin when there is one, else the first remote; null without
 * one whose URL names an Azure DevOps repository.
 * @param {CommandRunner} commandRunner @returns {Promise<Remote | null>}
 */
const remoteOf = async (commandRunner) => {
  const names = lines((await run(commandRunner, ['git', 'remote'])).stdout)
  const name = names.includes('origin') ? 'origin' : names[0]
  if (name === undefined) return null
  const url = await run(commandRunner, ['git', 'remote', 'get-url', name])
  const parsed = succeeded(url) ? parseRemote(url.stdout.trim()) : null
  return parsed === null ? null : { name, ...parsed }
}

/**
 * The URLs Azure DevOps gives a remote, each with its organization, project and repository:
 * `https://[user@]dev.azure.com/<org>/[<project>/]_git/<repo>`, `git@ssh.dev.azure.com:v3/<org>/<project>/<repo>`
 * (or `ssh://…:22/v3/…`), `https://<org>.visualstudio.com/[DefaultCollection/][<project>/]_git/<repo>`
 * and `<org>@vs-ssh.visualstudio.com:v3/<org>/<project>/<repo>`; a URL without a project names
 * a repository of the project of the same name. visualstudio: the organization's URL is its own host.
 */
const AZURE_REMOTES = Object.freeze([
  { pattern: /^https:\/\/(?:[^@/]+@)?dev\.azure\.com\/([^/]+)\/(?:([^/]+)\/)?_git\/([^/]+?)\/?$/i, visualstudio: false },
  { pattern: /^(?:ssh:\/\/)?[^@/]+@ssh\.dev\.azure\.com(?::22)?[:/]v3\/([^/]+)\/([^/]+)\/([^/]+?)\/?$/i, visualstudio: false },
  { pattern: /^https:\/\/(?:[^@/]+@)?([^./@]+)\.visualstudio\.com\/(?:DefaultCollection\/)?(?:([^/]+)\/)?_git\/([^/]+?)\/?$/i, visualstudio: true },
  { pattern: /^(?:ssh:\/\/)?[^@/]+@vs-ssh\.visualstudio\.com(?::22)?[:/]v3\/([^/]+)\/([^/]+)\/([^/]+?)\/?$/i, visualstudio: true },
])

/** @param {string} url @returns {Omit<Remote, 'name'> | null} */
const parseRemote = (url) => {
  for (const { pattern, visualstudio } of AZURE_REMOTES) {
    const match = pattern.exec(url)
    if (match !== null) return named(match, visualstudio)
  }
  return null
}

/** @param {RegExpExecArray} match @param {boolean} visualstudio @returns {Omit<Remote, 'name'> | null} */
const named = ([, organization, project, repository], visualstudio) => {
  try {
    const decoded = { project: decodeURIComponent(project ?? repository), repository: decodeURIComponent(repository) }
    return { organization: visualstudio ? `https://${organization}.visualstudio.com` : `https://dev.azure.com/${organization}`, ...decoded }
  } catch {
    return null
  }
}

/** @param {string} text */
const lines = (text) => text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '')

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

/** @param {string} text @returns {any} */
const readJson = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
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

/** @param {string} reason */
const refused = (reason) => ({ ok: /** @type {const} */ (false), reason })
