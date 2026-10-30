/**
 * GitHub's adapters served first by the host's GitHub MCP server, then by gh. An operation goes
 * through the server's tools when the host has a known GitHub server connected and the
 * repository the operation acts on is on github.com; gh does it when the server is absent, lacks
 * the tool, fails, or answers what skraft cannot read. A write the person or the host refuses is
 * refused, never retried with gh. Each result says which way served it (`via`) and, when gh
 * served after the server could not, why (`fallback`). The push, the remotes and the branches
 * stay with git and gh.
 *
 * Tools of github/github-mcp-server v2.0.3: issue_read, get_me, add_issue_comment,
 * update_issue_comment, list_pull_requests, create_pull_request, update_pull_request,
 * pull_request_read. What they answer (`html_url`, `url` on a write, `merged_at`, the comments as
 * an array) is read in that version's source, not measured (docs/v2/host-verification.md).
 *
 * @typedef {import('./forge.mjs').ForgeAdapters} ForgeAdapters
 * @typedef {import('../ports/mcp-tools.mjs').McpTools} McpTools
 * @typedef {import('../ports/mcp-tools.mjs').McpFailure} McpFailure
 * @typedef {import('../ports/code-host.mjs').CodeHost} CodeHost
 * @typedef {import('../ports/pull-requests.mjs').PullRequests} PullRequests
 * @typedef {McpFailure | 'mcp-unreadable'} Fallback
 *   mcp-unreadable: the server answered what skraft cannot read for that repository.
 * @typedef {{ failure: Fallback }} Failed
 * @typedef {{ issue: RegExp, pull: RegExp, comment: RegExp }} Pages
 * @typedef {{ at: { owner: string, repo: string }, pages: Pages, call: (tool: string, args: Record<string, unknown>) => Promise<{ json: any } | Failed> }} GitHub
 * @typedef {() => Promise<GitHub | Failed>} Route
 */

/**
 * The GitHub servers skraft trusts, by exact name, in this order: Copilot CLI's built-in one
 * (`github-mcp-server`, #400), the name github/github-mcp-server's README gives it in a client's
 * configuration (`github`), and the claude.ai GitHub connector as Claude Code names its tools
 * (`mcp__claude_ai_Github__<tool>`). Any other server, whatever its name holds, is never sent a body.
 */
const GITHUB_SERVERS = Object.freeze(['github-mcp-server', 'github', 'claude_ai_Github'])
/** The host the GitHub MCP server reaches. */
const GITHUB_HOST = 'github.com'

/**
 * @param {ForgeAdapters} gh GitHub's adapters on git and gh @param {McpTools} mcpTools
 * @returns {ForgeAdapters}
 */
export const githubMcpFirst = (gh, mcpTools) => {
  const servers = once(() => mcpTools.servers())
  const origin = once(() => reach(mcpTools, servers, () => gh.codeHost.repository()))
  const reviewed = once(() => reach(mcpTools, servers, () => gh.pullRequests.repository()))
  return { codeHost: codeHostOf(gh.codeHost, { origin, reviewed }), pullRequests: pullRequestsOf(gh.pullRequests, reviewed) }
}

/**
 * The route of a result, as a journal event keeps it: none when no MCP server was offered.
 * @param {{ via?: 'mcp' | 'gh', fallback?: Fallback }} result
 */
export const routeOf = ({ via, fallback }) => ({ ...(via === undefined ? {} : { via }), ...(fallback === undefined ? {} : { fallback }) })

/** @template T @param {() => Promise<T>} load @returns {() => Promise<T>} what load gives, asked once */
const once = (load) => {
  /** @type {Promise<T> | undefined} */
  let kept
  return () => {
    kept ??= load()
    return kept
  }
}

/**
 * Issues are read on the repository gh reads them on (its default, else upstream, else origin);
 * pull requests and issue comments go to origin, as gh's do.
 * @param {CodeHost} gh @param {{ origin: Route, reviewed: Route }} routes @returns {CodeHost}
 */
const codeHostOf = (gh, { origin, reviewed }) => Object.freeze({
  ...onGit(gh),
  unavailable: async () => ('failure' in await origin() ? gh.unavailable() : null),
  issue: (number) => served(reviewed, (at) => issueOf(at, number), () => gh.issue(number)),
  findPullRequest: (head) => served(origin, (at) => pullRequestOf(at, head), () => gh.findPullRequest(head)),
  create: (request) => served(origin, (at) => created(at, request), () => gh.create(request)),
  edit: (request) => served(origin, (at) => edited(at, request), () => gh.edit(request)),
  keepIssueComment: (request) => served(origin, (at) => commentKept(at, request), () => gh.keepIssueComment(request)),
})

/**
 * What git and gh answer alone, the line that links a pull request to its story, and the longest
 * body GitHub takes, whichever way the body goes. @param {CodeHost} gh
 */
const onGit = (gh) => ({
  remotes: () => gh.remotes(),
  repository: () => gh.repository(),
  currentBranch: () => gh.currentBranch(),
  defaultBranch: () => gh.defaultBranch(),
  push: (/** @type {string} */ branch) => gh.push(branch),
  storyLink: (/** @type {number} */ issue, /** @type {boolean} */ closes) => gh.storyLink(issue, closes),
  bodyLimit: gh.bodyLimit,
})

/** @param {PullRequests} gh @param {Route} reviewed @returns {PullRequests} */
const pullRequestsOf = (gh, reviewed) => Object.freeze({
  unavailable: async () => ('failure' in await reviewed() ? gh.unavailable() : null),
  repository: () => gh.repository(),
  find: (number) => served(reviewed, (at) => pullRequestRead(at, number), () => gh.find(number)),
  keepComment: (request) => served(reviewed, (at) => commentKept(at, request), () => gh.keepComment(request)),
})

/**
 * The operation on the GitHub server, else on gh, with the way that served it.
 * @template T @param {Route} route @param {(github: GitHub) => Promise<{ served: T } | Failed>} attempt @param {() => Promise<T>} fallback
 */
const served = async (route, attempt, fallback) => {
  const reached = await route()
  const tried = 'failure' in reached ? reached : await attempt(reached)
  if ('served' in tried) return { ...tried.served, via: /** @type {const} */ ('mcp') }
  return { ...(await fallback()), via: /** @type {const} */ ('gh'), fallback: tried.failure }
}

/** @type {Failed} */
const UNAVAILABLE = Object.freeze({ failure: 'mcp-unavailable' })
/** @type {Failed} */
const UNREADABLE = Object.freeze({ failure: 'mcp-unreadable' })

/**
 * The host's first trusted GitHub server, on the repository the adapter names on github.com.
 * @param {McpTools} mcpTools @param {() => Promise<string[]>} servers
 * @param {() => Promise<{ host: string, repository: string } | null>} repositoryOf
 * @returns {Promise<GitHub | Failed>}
 */
const reach = async (mcpTools, servers, repositoryOf) => {
  const listed = await servers()
  const server = GITHUB_SERVERS.find((name) => listed.includes(name))
  if (server === undefined) return UNAVAILABLE
  const named = await repositoryOf()
  if (named?.host !== GITHUB_HOST) return UNAVAILABLE
  const [owner, repo] = named.repository.split('/')
  return { at: { owner, repo }, pages: pagesOf(owner, repo), call: (tool, args) => answerOf(mcpTools, { server, tool, arguments: args }) }
}

/** @param {McpTools} mcpTools @param {{ server: string, tool: string, arguments: Record<string, unknown> }} request */
const answerOf = async (mcpTools, request) => {
  const called = await mcpTools.call(request)
  if (!called.ok) return { failure: called.reason }
  const json = jsonOf(called.text)
  return json === null ? UNREADABLE : { json }
}

/** @param {string} text */
const jsonOf = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** The pages of the repository on github.com: an issue, a pull request, a comment on either. @param {string} owner @param {string} repo @returns {Pages} */
const pagesOf = (owner, repo) => {
  const base = `^https://github\\.com/${escaped(owner)}/${escaped(repo)}`
  return {
    issue: new RegExp(`${base}/issues/(\\d+)$`, 'i'),
    pull: new RegExp(`${base}/pull/(\\d+)$`, 'i'),
    comment: new RegExp(`${base}/(?:issues|pull)/(\\d+)#issuecomment-\\d+$`, 'i'),
  }
}

/** @param {string} name an owner or a repository, as a remote's URL spells it */
const escaped = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The number a page of the repository names; NaN for any other URL. @param {RegExp} page @param {unknown} url */
const numberOn = (page, url) => Number(page.exec(String(url))?.[1])

/** The page a tool's answer names: GitHub's `html_url`, else the `url` a write answers. @param {any} answer */
const urlOf = (answer) => String(answer?.html_url ?? answer?.url)

/** @param {unknown} text */
const textOf = (text) => (typeof text === 'string' ? text : '')

/** @param {GitHub} github @param {number} number @returns {Promise<{ served: import('../ports/code-host.mjs').IssueReading } | Failed>} */
const issueOf = async ({ at, pages, call }, number) => {
  const answer = await call('issue_read', { ...at, method: 'get', issue_number: number })
  if ('failure' in answer) return answer
  return readingOf(pages, number, answer.json) ?? UNREADABLE
}

/** @param {Pages} pages @param {number} number @param {any} found */
const readingOf = (pages, number, found) => {
  if (typeof found?.title !== 'string') return null
  const url = urlOf(found)
  if (numberOn(pages.issue, url) === number) return { served: { read: /** @type {const} */ ('issue'), issue: { number, title: found.title, url, body: textOf(found.body) } } }
  return numberOn(pages.pull, url) === number ? { served: { read: /** @type {const} */ ('pull-request') } } : null
}

/** The latest pull request whose head is the branch, whatever its state. @param {GitHub} github @param {string} head */
const pullRequestOf = async ({ at, pages, call }, head) => {
  const answer = await call('list_pull_requests', { ...at, head: `${at.owner}:${head}`, state: 'all', sort: 'created', direction: 'desc', perPage: 1 })
  if ('failure' in answer) return answer
  if (!Array.isArray(answer.json)) return UNREADABLE
  if (answer.json.length === 0) return { served: { ok: /** @type {const} */ (true), found: null } }
  const found = foundOf(pages, answer.json[0])
  return found === null ? UNREADABLE : { served: { ok: /** @type {const} */ (true), found } }
}

/**
 * A listed pull request; null when skraft cannot tell its state: a closed one is merged only when
 * the server says when, and a listing that leaves the date out leaves it to gh.
 * @param {Pages} pages @param {any} listed @returns {import('../ports/code-host.mjs').FoundPullRequest | null}
 */
const foundOf = (pages, listed) => {
  const url = urlOf(listed)
  const state = stateOf(listed ?? {})
  if (Number.isNaN(numberOn(pages.pull, url)) || state === null) return null
  return { number: numberOn(pages.pull, url), url, state, body: textOf(listed.body) }
}

/** @param {{ state?: unknown, merged?: unknown, merged_at?: unknown }} listed @returns {'open' | 'merged' | null} */
const stateOf = ({ state, merged, merged_at: mergedAt }) => {
  if (state === 'open') return 'open'
  return state === 'closed' && (merged === true || Boolean(mergedAt)) ? 'merged' : null
}

/** A write the person or the host refused: the run says so and writes nothing else. @param {string} tool */
const refusedBy = (tool) => ({ served: { ok: /** @type {const} */ (false), reason: `the host refused the GitHub MCP server's ${tool}, so skraft wrote nothing on GitHub; allow it, or run again where it is allowed` } })

/** A failed write: refused for good, else left to gh. @param {Failed} failed @param {string} tool */
const writeFailed = (failed, tool) => (failed.failure === 'mcp-refused' ? refusedBy(tool) : failed)

/**
 * Opens the pull request; an answer skraft cannot read is checked by finding the pull request
 * once, so that gh never tries to open it a second time.
 * @param {GitHub} github @param {import('../ports/code-host.mjs').PullRequestRequest} request
 */
const created = async (github, { base, head, title, body, draft }) => {
  const made = await github.call('create_pull_request', { ...github.at, base, head, title, body, draft })
  if ('failure' in made) return writeFailed(made, 'create_pull_request')
  const number = numberOn(github.pages.pull, urlOf(made.json))
  if (!Number.isNaN(number)) return { served: { ok: /** @type {const} */ (true), number, url: urlOf(made.json) } }
  return openedOf(await pullRequestOf(github, head))
}

/** The pull request found after an unreadable opening, when it is open. @param {Awaited<ReturnType<typeof pullRequestOf>>} found */
const openedOf = (found) => {
  const pull = 'served' in found ? found.served.found : null
  if (pull?.state !== 'open') return UNREADABLE
  return { served: { ok: /** @type {const} */ (true), number: pull.number, url: pull.url } }
}

/** @param {GitHub} github @param {{ number: number, body: string }} request */
const edited = async ({ at, pages, call }, { number, body }) => {
  const answer = await call('update_pull_request', { ...at, pullNumber: number, body })
  if ('failure' in answer) return writeFailed(answer, 'update_pull_request')
  return numberOn(pages.pull, urlOf(answer.json)) === number ? { served: { ok: /** @type {const} */ (true) } } : UNREADABLE
}

/** @param {GitHub} github @param {number} number @returns {Promise<{ served: { ok: true, found: import('../ports/pull-requests.mjs').PullRequestFacts } } | Failed>} */
const pullRequestRead = async ({ at, pages, call }, number) => {
  const answer = await call('pull_request_read', { ...at, method: 'get', pullNumber: number })
  if ('failure' in answer) return answer
  const found = factsOf(pages, number, answer.json)
  return found === null ? UNREADABLE : { served: { ok: true, found } }
}

/** @param {Pages} pages @param {number} number @param {any} read @returns {import('../ports/pull-requests.mjs').PullRequestFacts | null} */
const factsOf = (pages, number, read) => {
  const url = urlOf(read)
  if (numberOn(pages.pull, url) !== number) return null
  if (typeof read.base?.sha !== 'string' || typeof read.head?.sha !== 'string') return null
  const { base, head } = read
  return { number, url, title: textOf(read.title), body: textOf(read.body), base: { ref: base.ref, sha: base.sha }, head: { ref: head.ref, sha: head.sha } }
}

/** The most comments one listing reads; a longer conversation is left to gh, which reads every page. */
const PAGE = 100

/**
 * The run's comment rewritten (the one at the URL kept, else the user's latest holding the marker)
 * or posted; left to gh when the server cannot tell whose comments are whose, so that none is
 * posted twice. @param {GitHub} github @param {import('../ports/code-host.mjs').IssueCommentRequest} request
 */
const commentKept = async (github, request) => {
  const mine = await ownComments(github, request.number)
  if ('failure' in mine) return mine
  const kept = mine.comments.find((comment) => urlOf(comment) === request.url) ?? mine.comments.findLast((comment) => textOf(comment.body).includes(request.marker))
  const tool = kept === undefined ? 'add_issue_comment' : 'update_issue_comment'
  const written = await github.call(tool, { ...github.at, ...(kept === undefined ? { issue_number: request.number } : { comment_id: kept.id }), body: request.body })
  if ('failure' in written) return writeFailed(written, tool)
  const url = urlOf(written.json)
  return numberOn(github.pages.comment, url) === request.number ? { served: { ok: /** @type {const} */ (true), url } } : UNREADABLE
}

/**
 * The signed-in user's comments of the issue or pull request, in order; failed when the server
 * cannot say who the user is or list them all on one page.
 * @param {GitHub} github @param {number} number @returns {Promise<{ comments: any[] } | Failed>}
 */
const ownComments = async ({ at, pages, call }, number) => {
  const me = await call('get_me', {})
  if ('failure' in me) return me
  const listed = await call('issue_read', { ...at, method: 'get_comments', issue_number: number, perPage: PAGE })
  if ('failure' in listed) return listed
  if (typeof me.json?.login !== 'string' || !Array.isArray(listed.json) || listed.json.length >= PAGE) return UNREADABLE
  return { comments: listed.json.filter((comment) => comment?.user?.login === me.json.login && numberOn(pages.comment, urlOf(comment)) === number) }
}
