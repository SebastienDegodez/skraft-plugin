/**
 * CodeHost — the forge the working copy's remote names: it takes the branch and holds its
 * pull request. Every failure is a reason fixed by the adapter, never a program's output.
 *
 * @typedef {{ number: number, url: string }} PullRequest
 * @typedef {PullRequest & { state: 'open' | 'closed' | 'merged', body: string }} FoundPullRequest
 * @typedef {{ base: string, head: string, title: string, bodyFile: string, draft: boolean }} PullRequestRequest
 *   base: the branch it merges into; head: the branch it brings; bodyFile: the absolute path of
 *   the file that holds its body.
 * @typedef {{ ok: true } | { ok: false, reason: string }} Done
 * @typedef {{ number: number, title: string, url: string, body: string }} Issue
 * @typedef {{ read: 'issue', issue: Issue } | { read: 'missing' } | { read: 'pull-request' } | { read: 'failed', reason: string }} IssueReading
 *   missing: the forge answered and has no issue of that number; pull-request: the number is a
 *   pull request's; failed: the forge could not be asked or did not answer, reason says why.
 * @typedef {{ number: number, marker: string, url: string | null, bodyFile: string }} IssueCommentRequest
 *   number: the issue, or the pull request, of the repository; marker: a line the comment's body
 *   holds, that finds it again; url: the comment as last kept, null when none was; bodyFile: the
 *   absolute path of the file that holds the body.
 * @typedef {{
 *   unavailable: () => Promise<string | null>,
 *   remotes: () => Promise<string[]>,
 *   repository: () => Promise<{ host: string, repository: string } | null>,
 *   currentBranch: () => Promise<string | null>,
 *   defaultBranch: () => Promise<string | null>,
 *   push: (branch: string) => Promise<Done>,
 *   findPullRequest: (head: string) => Promise<{ ok: true, found: FoundPullRequest | null } | { ok: false, reason: string }>,
 *   create: (request: PullRequestRequest) => Promise<({ ok: true } & PullRequest) | { ok: false, reason: string }>,
 *   edit: (request: { number: number, bodyFile: string }) => Promise<Done>,
 *   keepIssueComment: (request: IssueCommentRequest) => Promise<{ ok: true, url: string } | { ok: false, reason: string }>,
 *   issue: (number: number) => Promise<IssueReading>,
 * }} CodeHost
 *   unavailable: why no pull request can be opened from here (no remote, no forge client, not
 *   signed in), null when one can. remotes: the names of the repository's remotes. repository:
 *   the host and `<owner>/<repo>` the remote pull requests go to names, null when it names none. currentBranch: the branch HEAD is on, null when HEAD is
 *   detached. defaultBranch: the repository's default branch on the forge, null when it cannot
 *   tell. push: the branch to the same branch of the remote, never forced. findPullRequest: the
 *   latest pull request whose head is that branch, open, closed or merged, with its body; null
 *   when there is none. create: opens one.
 *   edit: replaces the body of one. keepIssueComment: rewrites the comment at url; without one, or
 *   when it is gone, the signed-in user's latest comment of that issue holding the marker; without
 *   one either, posts a new comment. Gives the URL of the comment kept. issue: the issue of that
 *   number on the repository gh would pick in a clone of a fork, its body as written; failed when
 *   there is no remote, no forge client, no sign-in to that forge, or the forge refused.
 */
export {}
