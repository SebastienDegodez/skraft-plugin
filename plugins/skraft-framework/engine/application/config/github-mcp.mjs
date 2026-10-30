/**
 * GitHub's adapters served first by the host's GitHub MCP server, then by gh. An operation goes
 * through the server's tools (github/github-mcp-server v2.0.3: issue_read, list_pull_requests,
 * create_pull_request, update_pull_request, pull_request_read, get_me, add_issue_comment,
 * update_issue_comment, search_repositories) when the host has a GitHub server connected and the
 * remote is on github.com; gh does it when the server is absent, refuses, lacks the tool, fails or
 * answers what skraft cannot read. The push, the remotes and the branches stay with git.
 *
 * @typedef {import('./forge.mjs').ForgeAdapters} ForgeAdapters
 * @typedef {import('../ports/mcp-tools.mjs').McpTools} McpTools
 * @typedef {import('../ports/code-host.mjs').CodeHost} CodeHost
 * @typedef {import('../ports/pull-requests.mjs').PullRequests} PullRequests
 * @typedef {{ owner: string, repo: string }} At
 * @typedef {{ at: At, call: (tool: string, args: Record<string, unknown>) => Promise<any> }} GitHub
 *   call: the tool's answer read as JSON; null when the call failed or the answer is no JSON.
 * @typedef {() => Promise<GitHub | null>} Reach
 *   the GitHub server and the repository it acts on; null when the operation goes to gh.
 */

/** A server whose name says GitHub: Copilot CLI's `github-mcp-server`, a developer's `github`, a connector's `claude_ai_Github`. */
const GITHUB_SERVER = /github/i
/** The host the GitHub MCP server reaches. */
const GITHUB_HOST = 'github.com'

/**
 * @param {ForgeAdapters} gh GitHub's adapters on git and gh @param {McpTools} mcpTools
 * @returns {ForgeAdapters}
 */
export const githubMcpFirst = (gh, mcpTools) => ({
  codeHost: codeHostOf(gh.codeHost, () => reach(mcpTools, gh.codeHost)),
  pullRequests: pullRequestsOf(gh.pullRequests, () => reach(mcpTools, gh.pullRequests)),
})

/** @param {CodeHost} gh @param {Reach} github @returns {CodeHost} */
const codeHostOf = (gh, github) => Object.freeze({
  ...onGit(gh),
  unavailable: async () => ((await github()) === null ? gh.unavailable() : null),
  defaultBranch: () => served(github, defaultBranchOf, () => gh.defaultBranch()),
  issue: (number) => served(github, (at) => issueOf(at, number), () => gh.issue(number)),
  findPullRequest: (head) => served(github, (at) => pullRequestOf(at, head), () => gh.findPullRequest(head)),
  create: (request) => served(github, (at) => created(at, request), () => gh.create(request)),
  edit: (request) => served(github, (at) => edited(at, request), () => gh.edit(request)),
  keepIssueComment: (request) => served(github, (at) => commentKept(at, request), () => gh.keepIssueComment(request)),
})

/** What git answers, and the line that links a pull request to its story. @param {CodeHost} gh */
const onGit = (gh) => ({
  remotes: () => gh.remotes(),
  repository: () => gh.repository(),
  currentBranch: () => gh.currentBranch(),
  push: (/** @type {string} */ branch) => gh.push(branch),
  storyLink: (/** @type {number} */ issue, /** @type {boolean} */ closes) => gh.storyLink(issue, closes),
})

/** @param {PullRequests} gh @param {Reach} github @returns {PullRequests} */
const pullRequestsOf = (gh, github) => Object.freeze({
  unavailable: async () => ((await github()) === null ? gh.unavailable() : null),
  repository: () => gh.repository(),
  find: (number) => served(github, (at) => pullRequestRead(at, number), () => gh.find(number)),
  keepComment: (request) => served(github, (at) => commentKept(at, request), () => gh.keepComment(request)),
})

/**
 * The operation on the GitHub server, else on gh.
 * @template T @param {Reach} github @param {(github: GitHub) => Promise<T | null>} attempt @param {() => Promise<T>} fallback
 * @returns {Promise<T>}
 */
const served = async (github, attempt, fallback) => {
  const reached = await github()
  const answer = reached === null ? null : await attempt(reached)
  return answer ?? fallback()
}

/**
 * The host's GitHub server and the repository the adapter's remote names on github.com; null
 * without either. @param {McpTools} mcpTools @param {{ repository: CodeHost['repository'] }} gh
 * @returns {Promise<GitHub | null>}
 */
const reach = async (mcpTools, gh) => {
  const server = (await mcpTools.servers()).find((name) => GITHUB_SERVER.test(name))
  if (server === undefined) return null
  const named = await gh.repository()
  if (named?.host !== GITHUB_HOST) return null
  const [owner, repo] = named.repository.split('/')
  return { at: { owner, repo }, call: (tool, args) => answerOf(mcpTools, { server, tool, arguments: args }) }
}

/** @param {McpTools} mcpTools @param {{ server: string, tool: string, arguments: Record<string, unknown> }} request */
const answerOf = async (mcpTools, request) => {
  const called = await mcpTools.call(request)
  return called.ok ? jsonOf(called.text) : null
}

/** @param {string} text */
const jsonOf = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** An issue's page, a pull request's page, and the URL of a comment on either. */
const ISSUE_PAGE = /^https:\/\/\S+\/issues\/\d+$/
const PULL_PAGE = /^https:\/\/\S+\/pull\/(\d+)$/
const COMMENT_URL = /^https:\/\/\S+\/(?:issues|pull)\/\d+#issuecomment-\d+$/

/** @param {GitHub} github @param {number} number @returns {Promise<import('../ports/code-host.mjs').IssueReading | null>} */
const issueOf = async ({ at, call }, number) => {
  const found = await call('issue_read', { ...at, method: 'get', issue_number: number })
  if (typeof found?.title !== 'string') return null
  if (ISSUE_PAGE.test(found.html_url)) return { read: 'issue', issue: { number, title: found.title, url: found.html_url, body: found.body ?? '' } }
  return PULL_PAGE.test(found.html_url) ? { read: 'pull-request' } : null
}

/** The latest pull request whose head is the branch, whatever its state. @param {GitHub} github @param {string} head */
const pullRequestOf = async ({ at, call }, head) => {
  const listed = await call('list_pull_requests', { ...at, head: `${at.owner}:${head}`, state: 'all', sort: 'created', direction: 'desc', perPage: 1 })
  if (!Array.isArray(listed)) return null
  return { ok: /** @type {const} */ (true), found: listed.length === 0 ? null : foundOf(listed[0]) }
}

/**
 * A listed pull request: merged when the forge says it merged, which a listing tells by its date.
 * @param {{ number: number, html_url: string, state: string, merged?: boolean, merged_at?: string, body?: string }} listed
 * @returns {import('../ports/code-host.mjs').FoundPullRequest}
 */
const foundOf = ({ number, html_url: url, state, merged, merged_at: mergedAt, body }) => ({
  number, url, state: merged || Boolean(mergedAt) ? 'merged' : /** @type {'open' | 'closed'} */ (String(state).toLowerCase()), body: body ?? '',
})

/** @param {GitHub} github @param {import('../ports/code-host.mjs').PullRequestRequest} request */
const created = async ({ at, call }, { base, head, title, body, draft }) => {
  const made = await call('create_pull_request', { ...at, base, head, title, body, draft })
  const page = PULL_PAGE.exec(String(made?.url))
  return page === null ? null : { ok: /** @type {const} */ (true), number: Number(page[1]), url: page[0] }
}

/** @param {GitHub} github @param {{ number: number, body: string }} request */
const edited = async ({ at, call }, { number, body }) => ((await call('update_pull_request', { ...at, pullNumber: number, body })) === null ? null : { ok: /** @type {const} */ (true) })

/** The repository's default branch as GitHub says it; null when the server does not. @param {GitHub} github */
const defaultBranchOf = async ({ at, call }) => {
  const found = await call('search_repositories', { query: `repo:${at.owner}/${at.repo}`, perPage: 1 })
  const items = Array.isArray(found?.items) ? found.items : []
  const named = items.find((item) => String(item?.full_name).toLowerCase() === `${at.owner}/${at.repo}`.toLowerCase())
  return typeof named?.default_branch === 'string' && named.default_branch !== '' ? named.default_branch : null
}

/** @param {GitHub} github @param {number} number @returns {Promise<{ ok: true, found: import('../ports/pull-requests.mjs').PullRequestFacts } | null>} */
const pullRequestRead = async ({ at, call }, number) => {
  const read = await call('pull_request_read', { ...at, method: 'get', pullNumber: number })
  if (!PULL_PAGE.test(read?.html_url) || typeof read.base?.sha !== 'string' || typeof read.head?.sha !== 'string') return null
  const { title, html_url: url, body, base, head } = read
  return { ok: true, found: { number, url, title, body: body ?? '', base: { ref: base.ref, sha: base.sha }, head: { ref: head.ref, sha: head.sha } } }
}

/** The most comments one listing reads; a longer conversation is left to gh, which reads every page. */
const PAGE = 100

/**
 * The run's comment rewritten (the one at the URL kept, else the user's latest holding the marker)
 * or posted; null when the server cannot tell whose comments are whose, so that none is posted twice.
 * @param {GitHub} github @param {import('../ports/code-host.mjs').IssueCommentRequest} request
 */
const commentKept = async (github, { number, marker, url, body }) => {
  const mine = await ownComments(github, number)
  if (mine === null) return null
  const kept = mine.find((comment) => comment.html_url === url) ?? mine.findLast((comment) => String(comment.body).includes(marker))
  const written = kept === undefined
    ? await github.call('add_issue_comment', { ...github.at, issue_number: number, body })
    : await github.call('update_issue_comment', { ...github.at, comment_id: kept.id, body })
  return COMMENT_URL.test(String(written?.url)) ? { ok: /** @type {const} */ (true), url: String(written.url) } : null
}

/**
 * The signed-in user's comments of the issue or pull request, in order; null when the server
 * cannot say who the user is or list them all on one page.
 * @param {GitHub} github @param {number} number @returns {Promise<Array<{ id: number, html_url: string, body?: string }> | null>}
 */
const ownComments = async ({ at, call }, number) => {
  const me = await call('get_me', {})
  const listed = await call('issue_read', { ...at, method: 'get_comments', issue_number: number, perPage: PAGE })
  if (typeof me?.login !== 'string' || !Array.isArray(listed) || listed.length >= PAGE) return null
  return listed.filter((comment) => comment?.user?.login === me.login && COMMENT_URL.test(String(comment.html_url)))
}
