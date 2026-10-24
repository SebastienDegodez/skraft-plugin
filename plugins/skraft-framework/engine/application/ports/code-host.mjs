/**
 * CodeHost — the forge the working copy's remote names: it takes the branch and holds its
 * pull request. Every failure is a reason fixed by the adapter, never a program's output.
 *
 * @typedef {{ number: number, url: string }} PullRequest
 * @typedef {{ base: string, head: string, title: string, bodyFile: string, draft: boolean }} PullRequestRequest
 *   base: the branch it merges into; head: the branch it brings; bodyFile: the absolute path of
 *   the file that holds its body.
 * @typedef {{ ok: true } | { ok: false, reason: string }} Done
 * @typedef {{
 *   unavailable: () => Promise<string | null>,
 *   currentBranch: () => Promise<string | null>,
 *   defaultBranch: () => Promise<string | null>,
 *   push: (branch: string) => Promise<Done>,
 *   findPullRequest: (head: string) => Promise<{ ok: true, found: PullRequest | null } | { ok: false, reason: string }>,
 *   create: (request: PullRequestRequest) => Promise<({ ok: true } & PullRequest) | { ok: false, reason: string }>,
 *   edit: (request: { number: number, bodyFile: string }) => Promise<Done>,
 * }} CodeHost
 *   unavailable: why no pull request can be opened from here (no remote, no forge client, not
 *   signed in), null when one can. currentBranch: the branch HEAD is on, null when HEAD is
 *   detached. defaultBranch: the repository's default branch on the forge, null when it cannot
 *   tell. push: the branch to the same branch of the remote, never forced. findPullRequest: the
 *   open pull request whose head is that branch, null when there is none. create: opens one.
 *   edit: replaces the body of one.
 */
export {}
