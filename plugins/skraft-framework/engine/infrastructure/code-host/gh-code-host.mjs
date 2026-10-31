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
  ...whereTo(commandRunner),
  push: (branch) => push(commandRunner, branch),
  findPullRequest: (head) => findPullRequest(commandRunner, head),
  create: (request) => create(commandRunner, request),
  edit: (request) => edit(commandRunner, request),
  keepIssueComment: (request) => keepIssueComment(commandRunner, request),
  issue: (number) => findIssue(commandRunner, number),
  storyLink: (issue, closes) => `${closes ? 'Closes' : 'Refs'} #${issue}`,
  // GitHub refuses a body past 65,536 characters; the margin leaves room for what it adds.
  bodyLimit: 60_000,
  // gh takes the body file itself.
  takesRequestFile: false,
})

/**
 * Where the working copy's pull requests go: whether they can, the remotes, the repository, the
 * branch HEAD is on and the forge's default branch. @param {CommandRunner} commandRunner
 */
const whereTo = (commandRunner) => ({
  unavailable: () => unavailable(commandRunner),
  remotes: async () => lines((await run(commandRunner, ['git', 'remote'])).stdout),
  repository: () => repositoryOf(commandRunner),
  currentBranch: () => currentBranch(commandRunner),
  defaultBranch: () => defaultBranch(commandRunner),
})

/**
 * PullRequests on `gh`: a pull request read by its number, and the review's comment kept on it as
 * the run keeps its issue comment, both on the repository gh would pick in a clone of a fork:
 * its default (`gh repo set-default`), else the `upstream` remote, else origin. Every failure is a
 * fixed reason. No Node API here.
 * @param {{ commandRunner: CommandRunner }} options
 * @returns {import('../../application/ports/pull-requests.mjs').PullRequests}
 */
export const createGhPullRequests = ({ commandRunner }) => Object.freeze({
  unavailable: () => unavailable(commandRunner, reviewedRemote),
  repository: () => repositoryOf(commandRunner, reviewedRemote),
  find: (number) => findByNumber(commandRunner, number),
  keepComment: (request) => keepIssueComment(commandRunner, request, reviewedRemote),
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

/**
 * @typedef {(commandRunner: CommandRunner) => Promise<Remote | null>} RemoteLookup
 *   which remote a call acts on.
 */

/** Why no pull request can be opened from here; null when one can. @param {CommandRunner} commandRunner @param {RemoteLookup} [locate] */
const unavailable = async (commandRunner, locate = remoteOf) => {
  const remote = await locate(commandRunner)
  if (remote === null) return NO_REMOTE
  if (!(await run(commandRunner, ['gh', '--version'])).started) return NO_GH
  const signedIn = succeeded(await run(commandRunner, ['gh', 'auth', 'status', `--hostname=${remote.host}`]))
  return signedIn ? null : `gh is not signed in to ${remote.host}; run gh auth login --hostname ${remote.host}`
}

/**
 * The remote pull requests go to: the first of the preferred names the repository has (origin),
 * else its first remote; null without one whose URL parses.
 * @param {CommandRunner} commandRunner @param {string[]} [preferred] @returns {Promise<Remote | null>}
 */
const remoteOf = async (commandRunner, preferred = ['origin']) => {
  const listed = await run(commandRunner, ['git', 'remote'])
  const names = lines(listed.stdout)
  const name = preferred.find((each) => names.includes(each)) ?? names[0]
  if (name === undefined) return null
  const url = await run(commandRunner, ['git', 'remote', 'get-url', name])
  const parsed = succeeded(url) ? parseRemote(url.stdout.trim()) : null
  return parsed === null ? null : { name, ...parsed }
}

/** An `<owner>/<repo>` as gh prints one. */
const OWNER_REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

/**
 * The repository a pull request is reviewed on, as gh picks it in a clone of a fork: the default
 * `gh repo set-default` names, on the host of the upstream remote, else upstream, else origin.
 * @param {CommandRunner} commandRunner @returns {Promise<Remote | null>}
 */
const reviewedRemote = async (commandRunner) => {
  const remote = await remoteOf(commandRunner, ['upstream', 'origin'])
  if (remote === null) return null
  const view = await run(commandRunner, ['gh', 'repo', 'set-default', '--view'])
  const chosen = succeeded(view) ? view.stdout.trim() : ''
  return OWNER_REPO.test(chosen) ? { ...remote, repository: `${remote.host}/${chosen}` } : remote
}

/** The host and `<owner>/<repo>` of the remote pull requests go to; null without one. @param {CommandRunner} commandRunner @param {RemoteLookup} [locate] */
const repositoryOf = async (commandRunner, locate = remoteOf) => {
  const remote = await locate(commandRunner)
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

/** What `gh pr view` prints of a pull request. */
const VIEWED = 'number,url,title,body,baseRefName,baseRefOid,headRefName,headRefOid'

/** gh's own line for a pull request the forge does not have, read only to tell it apart; never passed on. */
const NO_SUCH_PULL_REQUEST = /Could not resolve to a PullRequest/

/** The pull request of that number; none when the forge says it has none. @param {CommandRunner} commandRunner @param {number} number */
const findByNumber = async (commandRunner, number) => {
  const remote = await reviewedRemote(commandRunner)
  if (remote === null) return refused(NO_REMOTE)
  const result = await run(commandRunner, ['gh', 'pr', 'view', String(number), `--repo=${remote.repository}`, `--json=${VIEWED}`])
  if (result.started && NO_SUCH_PULL_REQUEST.test(result.stderr)) return { ok: /** @type {const} */ (true), found: null }
  const found = succeeded(result) ? readPullRequest(result.stdout) : null
  return found === null ? refused(`gh could not read pull request #${number} of ${remote.repository}`) : { ok: /** @type {const} */ (true), found }
}

/** @param {string} text @returns {import('../../application/ports/pull-requests.mjs').PullRequestFacts | null} */
const readPullRequest = (text) => {
  try {
    const { number, url, title, body, baseRefName, baseRefOid, headRefName, headRefOid } = JSON.parse(text)
    return { number, url, title, body, base: { ref: baseRefName, sha: baseRefOid }, head: { ref: headRefName, sha: headRefOid } }
  } catch {
    return null
  }
}

/** What `gh issue view` prints of an issue. */
const ISSUE_VIEWED = 'number,title,url,body'

/** gh's own line for an issue the forge does not have (gh 2.92.0), read only to tell it apart; never passed on. */
const NO_SUCH_ISSUE = /Could not resolve to an issue/

/**
 * The issue of that number on the repository gh would pick in a clone of a fork, once gh is
 * installed and signed in to its forge: missing when the forge says it has none, pull-request
 * when the number is a pull request's. @param {CommandRunner} commandRunner @param {number} number
 * @returns {Promise<import('../../application/ports/code-host.mjs').IssueReading>}
 */
const findIssue = async (commandRunner, number) => {
  const unreachable = await unavailable(commandRunner, reviewedRemote)
  if (unreachable !== null) return unread(unreachable)
  const remote = /** @type {Remote} */ (await reviewedRemote(commandRunner))
  const result = await run(commandRunner, ['gh', 'issue', 'view', String(number), `--repo=${remote.repository}`, `--json=${ISSUE_VIEWED}`])
  if (NO_SUCH_ISSUE.test(result.stderr)) return { read: 'missing' }
  // Stryker disable next-line ConditionalExpression: gh prints the issue's JSON only when it succeeds, so a failed view leaves nothing to parse
  const issue = succeeded(result) ? readIssue(result.stdout) : null
  return issue === null ? unread(`gh could not read issue #${number} of ${remote.repository}`) : readingOf(issue)
}

/** @param {string} reason @returns {{ read: 'failed', reason: string }} */
const unread = (reason) => ({ read: 'failed', reason })

/** An issue's page; gh views the number of a pull request too, whose page is `/pull/<number>`. */
const ISSUE_PAGE = /\/issues\/\d+$/

/** @param {import('../../application/ports/code-host.mjs').Issue} issue @returns {import('../../application/ports/code-host.mjs').IssueReading} */
const readingOf = (issue) => (ISSUE_PAGE.test(issue.url) ? { read: 'issue', issue } : { read: 'pull-request' })

/** The issue gh printed; null unless its title, URL and body are text. @param {string} text @returns {import('../../application/ports/code-host.mjs').Issue | null} */
const readIssue = (text) => {
  try {
    const { number, title, url, body } = JSON.parse(text)
    return [title, url, body].every((field) => typeof field === 'string') ? { number, title, url, body } : null
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

/**
 * Rewrites the run's comment on the issue, or the pull request the number names: the one at the
 * URL kept, else the signed-in user's latest one holding the marker, else a new one. Through gh's
 * REST calls, on the forge the remote names; the body is read from its file by gh.
 * @param {CommandRunner} commandRunner @param {import('../../application/ports/code-host.mjs').IssueCommentRequest} request @param {RemoteLookup} [locate]
 */
const keepIssueComment = async (commandRunner, request, locate = remoteOf) => {
  const remote = await locate(commandRunner)
  if (remote === null) return refused(NO_REMOTE)
  return (await rewriteOrPost({ commandRunner, remote }, request)) ?? refused(`gh could not comment issue #${request.number} on ${remote.repository}`)
}

/**
 * The comment kept; null when gh failed, so that a comment gh could not reach is never posted
 * twice. Only a kept URL the forge says is gone, then no comment of the user's holding the marker,
 * lead to a new one: a comment found by its marker that the forge refuses to rewrite is a failure.
 * @param {Forge} forge @param {import('../../application/ports/code-host.mjs').IssueCommentRequest} request
 * @returns {Promise<KeptComment | Refusal | null>}
 */
const rewriteOrPost = async (forge, { number, marker, url, bodyFile }) => {
  const edited = url === null ? GONE : await editOwn(forge, { url, number, bodyFile })
  if (edited !== GONE) return edited
  const found = await findComment(forge, number, marker)
  if (found === undefined) return null
  if (found === null) return postComment(forge, number, bodyFile)
  if (typeof found !== 'string') return found
  const rewritten = await editComment(forge, found, bodyFile)
  return rewritten === GONE ? null : rewritten
}

/**
 * @typedef {{ commandRunner: CommandRunner, remote: Remote }} Forge
 * @typedef {{ ok: true, url: string }} KeptComment
 * @typedef {{ ok: false, reason: string }} Refusal
 */

/** A comment the forge says is not there, or not the user's to rewrite: deleted by a human, say. */
const GONE = Symbol('gone')

/** An issue comment's URL, the only line `--jq=.html_url` prints. */
const COMMENT_URL = /^https:\/\/\S+\/(?:issues|pull)\/\d+#issuecomment-\d+$/

/**
 * `gh api` on the remote's forge for `repos/<owner>/<repo>/<path>`.
 * @param {Forge} forge @param {string} path @param {string[]} options
 */
const api = ({ commandRunner, remote }, path, options) =>
  run(commandRunner, ['gh', 'api', `--hostname=${remote.host}`, ...options, `repos/${remote.repository.slice(remote.host.length + 1)}/${path}`])

/** The URL gh printed for the comment it wrote; null when it wrote none. @param {CommandResult} result @returns {KeptComment | null} */
const keptOf = (result) => {
  const url = result.stdout.trim()
  return succeeded(result) && COMMENT_URL.test(url) ? { ok: true, url } : null
}

/** gh's own line for a refusal by status, read only to tell a missing comment apart; never passed on. */
const NOT_THERE = /\(HTTP 40[34]\)/

/**
 * The comment at the URL rewritten; GONE when the forge says it is not there to rewrite; null
 * when gh failed. @param {Forge} forge @param {string} url @param {string} bodyFile
 * @returns {Promise<KeptComment | typeof GONE | null>}
 */
const editComment = async (forge, url, bodyFile) => {
  const result = await api(forge, `issues/comments/${url.slice(url.lastIndexOf('-') + 1)}`, ['--method=PATCH', `--field=body=@${bodyFile}`, '--jq=.html_url'])
  return keptOf(result) ?? (NOT_THERE.test(result.stderr) ? GONE : null)
}

/**
 * The kept comment rewritten once the forge says it is the signed-in user's comment on that
 * issue; GONE when it is not, or not there, so that the user's own is found or posted instead.
 * @param {Forge} forge @param {{ url: string, number: number, bodyFile: string }} kept
 * @returns {Promise<KeptComment | Refusal | typeof GONE | null>}
 */
const editOwn = async (forge, { url, number, bodyFile }) => {
  const owner = await commentOwner(forge, url)
  if (owner === null || owner === GONE) return owner
  const me = await signedIn(forge)
  if (me === null) return null
  return owner.login === me && owner.issue.endsWith(`/issues/${number}`) ? editComment(forge, url, bodyFile) : GONE
}

/**
 * Who wrote the comment at the URL, and on which issue; GONE when the forge has none there; null
 * when gh failed. @param {Forge} forge @param {string} url
 * @returns {Promise<{ login: unknown, issue: string } | typeof GONE | null>}
 */
const commentOwner = async (forge, url) => {
  const result = await api(forge, `issues/comments/${url.slice(url.lastIndexOf('-') + 1)}`, [])
  if (!succeeded(result)) return NOT_THERE.test(result.stderr) ? GONE : null
  try {
    const { user, issue_url: issue } = JSON.parse(result.stdout)
    return { login: user?.login, issue: String(issue) }
  } catch {
    return null
  }
}

/** The signed-in user's login; null when gh cannot tell. @param {Forge} forge */
const signedIn = async (forge) => {
  const me = await run(forge.commandRunner, ['gh', 'api', `--hostname=${forge.remote.host}`, '--jq=.login', 'user'])
  const login = me.stdout.trim()
  return succeeded(me) && LOGIN.test(login) ? login : null
}

/** @param {Forge} forge @param {number} number @param {string} bodyFile @returns {Promise<KeptComment | null>} */
const postComment = async (forge, number, bodyFile) => keptOf(await api(forge, `issues/${number}/comments`, ['--method=POST', `--field=body=@${bodyFile}`, '--jq=.html_url']))

/** A login as the forge spells one, a bot's included. */
const LOGIN = /^[A-Za-z0-9][A-Za-z0-9-]*(?:\[bot\])?$/

/**
 * The URL of the signed-in user's latest comment of the issue holding the marker: null when there
 * is none; undefined when gh cannot list them; a refusal when gh cannot say who the user is, the
 * token unable to read the authenticated user. Only the user's own comment is ever rewritten.
 * @param {Forge} forge @param {number} number @param {string} marker @returns {Promise<string | null | undefined | Refusal>}
 */
const findComment = async (forge, number, marker) => {
  const login = await signedIn(forge)
  if (login === null) return refused(`gh could not tell which user is signed in on ${forge.remote.host}, so the run's comment on issue #${number} is neither found nor posted`)
  const listed = await api(forge, `issues/${number}/comments`, ['--paginate', '--jq=.[]'])
  const comments = succeeded(listed) ? readComments(listed.stdout) : null
  if (comments === null) return undefined
  const mine = comments.filter((comment) => comment.user?.login === login && String(comment.body).includes(marker) && COMMENT_URL.test(comment.html_url))
  return mine.at(-1)?.html_url ?? null
}

/**
 * The comments gh printed one JSON object per line; null when a line is not one. The filter runs
 * here, not in a --jq argument: quotes, pipes and the marker's <!-- --> in an argument do not
 * survive a gh started through a .cmd under Windows.
 * @param {string} text @returns {Array<{ user?: { login?: string }, body?: string, html_url?: string }> | null}
 */
const readComments = (text) => {
  try {
    return lines(text).map((line) => JSON.parse(line))
  } catch {
    return null
  }
}

/** @param {string} reason */
const refused = (reason) => ({ ok: /** @type {const} */ (false), reason })
