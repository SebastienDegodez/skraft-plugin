/**
 * PullRequests — the pull requests of the forge the working copy's remote names: one read by its
 * number, and the one comment a review keeps on it. Every failure is a reason fixed by the
 * adapter, never a program's output nor a credential.
 *
 * @typedef {{ ref: string, sha: string }} PullRequestEnd
 *   ref: the branch; sha: the commit it points at.
 * @typedef {{ number: number, url: string, title: string, body: string, base: PullRequestEnd, head: PullRequestEnd }} PullRequestFacts
 *   base: the branch it merges into; head: the branch it brings, the sha the review reads.
 * @typedef {{
 *   unavailable: () => Promise<string | null>,
 *   repository: () => Promise<{ host: string, repository: string } | null>,
 *   find: (number: number) => Promise<{ ok: true, found: PullRequestFacts | null } | { ok: false, reason: string }>,
 *   keepComment: (request: import('./code-host.mjs').IssueCommentRequest) => Promise<{ ok: true, url: string } | { ok: false, reason: string }>,
 * }} PullRequests
 *   unavailable: why no pull request can be read from here (no remote, no forge client, not
 *   signed in), null when one can. repository: the host and `<owner>/<repo>` the remote names, null
 *   when it names none. find: null when the forge has no pull request of that number.
 *   keepComment: rewrites the comment at url; without one, or when it is gone, the signed-in
 *   user's latest comment of the pull request holding the marker; without one either, posts a new
 *   comment. Gives the URL of the comment kept. Never a review, never a request for changes.
 */
export {}
