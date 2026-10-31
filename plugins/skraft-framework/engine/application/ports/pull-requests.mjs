/**
 * PullRequests — the pull requests of the forge the working copy's remote names: one read by its
 * number, and the one comment a review keeps on it. Every failure is a reason fixed by the
 * adapter, never a program's output nor a credential.
 *
 * @typedef {{ ref: string, sha: string }} PullRequestEnd
 *   ref: the branch; sha: the commit it points at.
 * @typedef {{ number: number, url: string, title: string, body: string, base: PullRequestEnd, head: PullRequestEnd }} PullRequestFacts
 *   base: the branch it merges into; head: the branch it brings, the sha the review reads.
 * @typedef {import('./code-host.mjs').IssueCommentRequest} IssueCommentRequest
 * @typedef {{ number: number, marker: string, url: string | null, bodyFile: string, body: string, threadFile: string, contentFile: string }} ThreadCommentRequest
 *   number: the pull request; marker: the line the comment's body holds, that finds it again; url:
 *   the comment as last kept, null when none was; bodyFile: the absolute path of the file that
 *   holds the body; body: that body; threadFile and contentFile: the absolute paths of the files
 *   that hold the body as the JSON of a new thread and of the rewrite of a comment, for a forge
 *   client that sends a JSON request (az on Azure Repos), else empty (GitHub ignores them). On
 *   Azure Repos the comment's url is the REST address skraft builds, `<organization>/<project>/_apis/git/repositories/<repository>/pullRequests/<id>/threads/<thread>/comments/<comment>`:
 *   a web anchor for a thread is not documented, so none is invented.
 * @typedef {{
 *   unavailable: () => Promise<string | null>,
 *   checkoutCommand: (number: number) => string,
 *   takesRequestFile: boolean,
 *   repository: () => Promise<{ host: string, repository: string } | null>,
 *   find: (number: number) => Promise<{ ok: true, found: PullRequestFacts | null } | { ok: false, reason: string }>,
 *   keepComment: (request: ThreadCommentRequest) => Promise<{ ok: true, url: string } | { ok: false, reason: string }>,
 * }} PullRequests
 *   unavailable: why no pull request can be read from here (no remote, no forge client, not
 *   signed in), null when one can. repository: the host and `<owner>/<repo>` the remote names, null
 *   when it names none. checkoutCommand: what a person types to check the pull request out, as
 *   the forge's client says it. takesRequestFile: whether the forge's client sends JSON request
 *   files (az), which keepComment is then handed; false: none is written. find: null when the
 *   forge has no pull request of that number. keepComment: rewrites the comment at url; without
 *   one, or when it is gone, the signed-in user's latest comment of the pull request holding the
 *   marker (on Azure Repos, the latest thread whose first comment starts with it, whoever wrote
 *   it); without one either, posts a new comment. Gives the URL of the comment kept. Never a
 *   review, never a vote, never a request for changes.
 */
export {}
