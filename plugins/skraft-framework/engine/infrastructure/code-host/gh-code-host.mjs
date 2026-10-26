/**
 * @typedef {import('../../application/ports/command-runner.mjs').CommandRunner} CommandRunner
 * @typedef {import('../../application/ports/command-runner.mjs').CommandResult} CommandResult
 * @typedef {import('../../application/ports/code-host.mjs').PullRequestRequest} PullRequestRequest
 * @typedef {{ name: string, host: string, repository: string }} Remote
 *   name: the Git remote (origin when there is one); repository: `<host>/<owner>/<repo>`, as gh's --repo takes it.
 */

/**
 * CodeHost on `git` and `gh`, the GitHub CLI, through any host's CommandRunner: Node's processes
 * or the Claude Code mod's `$.process.run`. The forge is the one the remote's URL names, GitHub
 * Enterprise included. The body always goes through a file; nothing is ever force-pushed. Every
 * failure is a fixed reason: no output of git or gh reaches the caller. No Node API here.
 * @param {{ commandRunner: CommandRunner }} options
 * @returns {import('../../application/ports/code-host.mjs').CodeHost}
 */
export const createGhCodeHost = ({ commandRunner }) => Object.freeze({
  unavailable: () => unavailable(commandRunner),
  remotes: async () => lines((await run(commandRunner, ['git', 'remote'])).stdout),
  repository: () => repositoryOf(commandRunner),
  currentBranch: () => currentBranch(commandRunner),
  defaultBranch: () => defaultBranch(commandRunner),
  push: (branch) => push(commandRunner, branch),
  findPullRequest: (head) => findPullRequest(commandRunner, head),
  create: (request) => create(commandRunner, request),
  edit: (request) => edit(commandRunner, request),
  commentIssue: (request) => commentIssue(commandRunner, request),
})

export const NO_REMOTE = 'the working copy has no Git remote whose URL names a host and a repository'
export const NO_GH = 'gh, the GitHub CLI, is not installed'

/**
 * No program may wait for a human: git asks no password and ssh no passphrase or host key, they
 * fail at once, and the failure is a fixed reason. The mod's runner cannot set the environment,
 * so git is also told by its own configuration.
 */
const NO_PROMPT = Object.freeze({ GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' })

/** @param {CommandRunner} commandRunner @param {string[]} argv */
// Stryker disable next-line StringLiteral: '' and '.' are both the working copy to the CommandRunner
const run = (commandRunner, argv) => commandRunner.run({ argv, cwd: '.', env: NO_PROMPT, timeoutMs: CALL_TIMEOUT_MS })

/** The longest a git or gh call may run, a push included: past it the run goes on and says why. */
const CALL_TIMEOUT_MS = 120_000

/** @param {CommandResult} result */
const succeeded = (result) => result.started && result.exitCode === 0

/** Why no pull request can be opened from here; null when one can. @param {CommandRunner} commandRunner */
const unavailable = async (commandRunner) => {
  const remote = await remoteOf(commandRunner)
  if (remote === null) return NO_REMOTE
  if (!(await run(commandRunner, ['gh', '--version'])).started) return NO_GH
  const signedIn = succeeded(await run(commandRunner, ['gh', 'auth', 'status', `--hostname=${remote.host}`]))
  return signedIn ? null : `gh is not signed in to ${remote.host}; run gh auth login --hostname ${remote.host}`
}

/**
 * The remote pull requests go to: origin, else the first one; null without one whose URL parses.
 * @param {CommandRunner} commandRunner @returns {Promise<Remote | null>}
 */
const remoteOf = async (commandRunner) => {
  const listed = await run(commandRunner, ['git', 'remote'])
  const names = lines(listed.stdout)
  const name = names.includes('origin') ? 'origin' : names[0]
  if (name === undefined) return null
  const url = await run(commandRunner, ['git', 'remote', 'get-url', name])
  const parsed = succeeded(url) ? parseRemote(url.stdout.trim()) : null
  return parsed === null ? null : { name, ...parsed }
}

/** The host and `<owner>/<repo>` of the remote pull requests go to; null without one. @param {CommandRunner} commandRunner */
const repositoryOf = async (commandRunner) => {
  const remote = await remoteOf(commandRunner)
  return remote === null ? null : { host: remote.host, repository: remote.repository.slice(remote.host.length + 1) }
}

/** `https://host/owner/repo(.git)`, `ssh://git@host:22/owner/repo.git`. */
const URL_REMOTE = /^[a-z][a-z+]*:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/([^/]+\/[^/]+?)(?:\.git)?\/?$/i
/** `git@host:owner/repo.git`. */
const SCP_REMOTE = /^(?:[^@/]+@)?([^/:]+):([^/]+\/[^/]+?)(?:\.git)?\/?$/

/** @param {string} url @returns {{ host: string, repository: string } | null} */
const parseRemote = (url) => {
  const match = URL_REMOTE.exec(url) ?? SCP_REMOTE.exec(url)
  return match === null ? null : { host: match[1], repository: `${match[1]}/${match[2]}` }
}

/** @param {string} text */
const lines = (text) => text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '')

/** The branch HEAD is on; null when it is detached. @param {CommandRunner} commandRunner */
const currentBranch = async (commandRunner) => {
  const result = await run(commandRunner, ['git', 'symbolic-ref', '--quiet', '--short', 'HEAD'])
  return result.stdout.trim() || null
}

/** The repository's default branch as the forge says it; null when gh cannot tell. @param {CommandRunner} commandRunner */
const defaultBranch = async (commandRunner) => {
  const remote = await remoteOf(commandRunner)
  if (remote === null) return null
  const result = await run(commandRunner, ['gh', 'repo', 'view', remote.repository, '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name'])
  return succeeded(result) ? result.stdout.trim() || null : null
}

/**
 * Pushes the branch to the same branch of the remote, never forced: a remote that moved refuses it.
 * @param {CommandRunner} commandRunner @param {string} branch
 */
const push = async (commandRunner, branch) => {
  const remote = await remoteOf(commandRunner)
  if (remote === null) return refused(NO_REMOTE)
  const result = await run(commandRunner, ['git', '-c', 'core.sshCommand=ssh -o BatchMode=yes', '-c', 'credential.interactive=never', 'push', '--porcelain', remote.name, `refs/heads/${branch}:refs/heads/${branch}`])
  return succeeded(result) ? { ok: /** @type {const} */ (true) } : refused(`git push of ${branch} to ${remote.name} failed or was refused`)
}

/** The latest pull request whose head is the branch, whatever its state. @param {CommandRunner} commandRunner @param {string} head */
const findPullRequest = async (commandRunner, head) => {
  const remote = await remoteOf(commandRunner)
  if (remote === null) return refused(NO_REMOTE)
  const result = await run(commandRunner, ['gh', 'pr', 'list', `--repo=${remote.repository}`, `--head=${head}`, '--state=all', '--json=number,url,state,body', '--limit=1'])
  const listed = succeeded(result) ? readList(result.stdout) : null
  return listed === null ? refused(`gh could not list the pull requests of ${remote.repository}`) : { ok: /** @type {const} */ (true), found: listed[0] ?? null }
}

/** @param {string} text @returns {Array<import('../../application/ports/code-host.mjs').FoundPullRequest> | null} */
const readList = (text) => {
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed.map(({ number, url, state, body }) => ({ number, url, state: String(state).toLowerCase(), body })) : null
  } catch {
    return null
  }
}

/** Opens the pull request; gh prints its URL. @param {CommandRunner} commandRunner @param {PullRequestRequest} request */
const create = async (commandRunner, { base, head, title, bodyFile, draft }) => {
  const remote = await remoteOf(commandRunner)
  if (remote === null) return refused(NO_REMOTE)
  const result = await run(commandRunner, ['gh', 'pr', 'create', `--repo=${remote.repository}`, `--base=${base}`, `--head=${head}`, `--title=${title}`, `--body-file=${bodyFile}`, ...(draft ? ['--draft'] : [])])
  const url = succeeded(result) ? /https?:\/\/\S+\/pull\/(\d+)/.exec(result.stdout) : null
  return url === null ? refused(`gh could not open the pull request of ${head} on ${remote.repository}`) : { ok: /** @type {const} */ (true), number: Number(url[1]), url: url[0] }
}

/** Replaces the pull request's body. @param {CommandRunner} commandRunner @param {{ number: number, bodyFile: string }} request */
const edit = async (commandRunner, { number, bodyFile }) => {
  const remote = await remoteOf(commandRunner)
  if (remote === null) return refused(NO_REMOTE)
  const result = await run(commandRunner, ['gh', 'pr', 'edit', String(number), `--repo=${remote.repository}`, `--body-file=${bodyFile}`])
  return succeeded(result) ? { ok: /** @type {const} */ (true) } : refused(`gh could not update pull request #${number} on ${remote.repository}`)
}

/** Comments the issue, or the pull request the number names; gh prints the comment's URL. @param {CommandRunner} commandRunner @param {{ number: number, bodyFile: string }} request */
const commentIssue = async (commandRunner, { number, bodyFile }) => {
  const remote = await remoteOf(commandRunner)
  if (remote === null) return refused(NO_REMOTE)
  const result = await run(commandRunner, ['gh', 'issue', 'comment', String(number), `--repo=${remote.repository}`, `--body-file=${bodyFile}`])
  const url = succeeded(result) ? /https:\/\/\S+\/(?:issues|pull)\/\d+#issuecomment-\d+/.exec(result.stdout) : null
  return url === null ? refused(`gh could not comment issue #${number} on ${remote.repository}`) : { ok: /** @type {const} */ (true), url: url[0] }
}

/** @param {string} reason */
const refused = (reason) => ({ ok: /** @type {const} */ (false), reason })
