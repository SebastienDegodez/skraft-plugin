/**
 * CodeHost — the forge the working copy's remote names: it takes the branch and holds its
 * pull request. Every failure is a reason fixed by the adapter, never a program's output.
 *
 * @typedef {{ number: number, url: string }} PullRequest
 * @typedef {PullRequest & { state: 'open' | 'closed' | 'merged', body: string }} FoundPullRequest
 * @typedef {FoundPullRequest & { head: string, fromFork: boolean }} ReadPullRequest
 *   body: the whole description; head: its source branch, as the forge names it; fromFork: it comes from a fork of the
 *   remote's repository, not from the repository itself.
 * @typedef {{ path: string, alt: string, reference: string }} Attachment
 *   path: a file of the working copy, relative to it; alt: its alt text, made safe to publish;
 *   reference: how the body refers to it, relative to the folder of the body's file, where the
 *   forge's client resolves it (gh is run from there).
 * @typedef {{ base: string, head: string, title: string, bodyFile: string, body: string, draft: boolean, issue: number | null, attachments: Attachment[] }} PullRequestRequest
 *   base: the branch it merges into; head: the branch it brings; bodyFile: the absolute path of
 *   the file that holds its body; body: that body, for a forge reached without files; issue: the
 *   story's issue, or work item, that a forge linking one at creation links it to; null for a run
 *   from none; attachments: the files the forge's client uploads with the body, each reference
 *   to one rewritten to the uploaded file (none for a forge that attaches no file).
 * @typedef {'refused' | 'unknown'} Unapplied
 *   refused: the write did not happen (the forge or git said no, or it was never sent); unknown:
 *   no answer came (a time limit, a cut), so it may have happened.
 * @typedef {{ ok: false, reason: string, outcome?: Unapplied }} Failed
 *   outcome: refused when absent.
 * @typedef {{ ok: true } | Failed} Done
 * @typedef {{ ok: true, body: string | null } | { ok: false, reason: string }} CommentReading
 *   body: the comment's text as written (on Azure DevOps decoded as `normalisedComment` reads it),
 *   null when the forge has no comment there.
 * @typedef {{ number: number, title: string, url: string, body: string }} Issue
 * @typedef {{ read: 'issue', issue: Issue } | { read: 'missing' } | { read: 'pull-request' } | { read: 'other-project', project: string } | { read: 'not-a-story' } | { read: 'failed', reason: string }} IssueReading
 *   missing: the forge answered and has no issue of that number; pull-request: the number is a
 *   pull request's; other-project: the work item is of another project than the remote's, which
 *   `project` names (Azure Boards only); not-a-story: the work item's type is not a story's
 *   (Azure Boards only); failed: the forge could not be asked or did not answer, reason says why.
 * @typedef {{ number: number, marker: string, url: string | null, bodyFile: string, requestFile: string, body: string }} IssueCommentRequest
 *   number: the issue, the pull request, or the work item, of the repository; marker: a line the
 *   comment's body holds, that finds it again; url: the comment as last kept, null when none was;
 *   bodyFile: the absolute path of the file that holds the body; requestFile: the absolute path of
 *   a file holding `{"text": <body>}` as JSON, for a forge client that sends a JSON request (az on
 *   Azure Boards; GitHub ignores it); body: that body. On Azure Boards the comment's url is the
 *   REST address skraft builds, `<organization>/<project>/_apis/wit/workItems/<id>/comments/<comment>`:
 *   a web anchor for a comment is not documented, so none is invented.
 * @typedef {{ number: number, marker: string, url: string | null, bodyFile: string, body: string, threadFile: string, commentFile: string, attachments: Attachment[] }} PullRequestCommentRequest
 *   number: the pull request; marker: the first line of the comment's body, that finds it again;
 *   url: the comment as last kept, null when none was; bodyFile, body: the Markdown to keep;
 *   threadFile: the absolute path of a file holding the thread to post as JSON
 *   (`{"comments":[{"parentCommentId":0,"content":<body>,"commentType":1}],"status":4}`) and
 *   commentFile: that of a file holding `{"content":<body>}`, for a forge whose client sends JSON
 *   (az on Azure Repos); both empty for another forge; attachments: the files the forge's client
 *   uploads with the comment, each reference to one rewritten (gh pr comment --attach); a request
 *   with any is always posted as a new comment, whatever url says, and the caller empties the one
 *   it kept before.
 * @typedef {{
 *   unavailable: () => Promise<string | null>,
 *   remotes: () => Promise<string[]>,
 *   repository: () => Promise<{ host: string, repository: string } | null>,
 *   currentBranch: () => Promise<string | null>,
 *   defaultBranch: () => Promise<string | null>,
 *   push: (branch: string) => Promise<Done>,
 *   localTip: (branch: string) => Promise<string | null>,
 *   remoteTip: (branch: string) => Promise<{ ok: true, sha: string | null } | { ok: false, reason: string }>,
 *   findPullRequest: (head: string) => Promise<{ ok: true, found: FoundPullRequest | null } | { ok: false, reason: string }>,
 *   readPullRequest: (number: number) => Promise<{ ok: true, found: ReadPullRequest | null } | { ok: false, reason: string }>,
 *   create: (request: PullRequestRequest) => Promise<({ ok: true, note?: string } & PullRequest) | Failed>,
 *   edit: (request: { number: number, bodyFile: string, body: string, attachments: Attachment[] }) => Promise<Done>,
 *   keepIssueComment: (request: IssueCommentRequest) => Promise<{ ok: true, url: string } | Failed>,
 *   keepPullRequestComment: (request: PullRequestCommentRequest) => Promise<{ ok: true, url: string } | Failed>,
 *   readComment: (url: string) => Promise<CommentReading>,
 *   issue: (number: number) => Promise<IssueReading>,
 *   storyLink: (issue: number, closes: boolean) => string | null,
 *   bodyLimit: number,
 *   commentLimit: number,
 *   takesRequestFile: boolean,
 *   attachesFiles: boolean,
 *   fileUrl: (commit: string, path: string) => Promise<string | null>,
 *   screenshotsBlocked: () => Promise<string | null>,
 *   attachLimit?: number,
 * }} CodeHost
 *   unavailable: why no pull request can be opened from here (no remote, no forge client, not
 *   signed in), null when one can. remotes: the names of the repository's remotes. repository:
 *   the host and `<owner>/<repo>` the remote pull requests go to names, null when it names none. currentBranch: the branch HEAD is on, null when HEAD is
 *   detached. defaultBranch: the repository's default branch on the forge, null when it cannot
 *   tell. push: the branch to the same branch of the remote, never forced. localTip: the commit
 *   the branch points at in the working copy, null when it has none. remoteTip: the commit the
 *   branch points at where it is pushed, as `git ls-remote` reads it, null when the remote has no
 *   such branch. findPullRequest: the
 *   latest pull request whose head is that branch, open, closed or merged, with its body; null
 *   when there is none; its body may be cut (Azure DevOps lists 400 characters of a description).
 *   readPullRequest: the pull request of that number, its description whole; null when the forge
 *   has none. create: opens one; note: a fixed line on what it could not do (link the issue).
 *   edit: replaces the body of one. keepIssueComment: rewrites the comment at url; without one, or
 *   when it is gone, the signed-in user's latest comment of that issue holding the marker; without
 *   one either, posts a new comment. Gives the URL of the comment kept. issue: the issue of that
 *   number on the repository gh would pick in a clone of a fork, its body as written; failed when
 *   there is no remote, no forge client, no sign-in to that forge, or the forge refused.
 *   keepPullRequestComment: keepIssueComment on a pull request (GitHub: the same comment route; Azure
 *   Repos: a thread of the pull request, posted closed, its first comment rewritten). readComment:
 *   the comment at a URL keepIssueComment or keepPullRequestComment gave, read back. bodyLimit: the
 *   longest body the forge takes, in characters; commentLimit: the longest comment. takesRequestFile: whether the
 *   forge's client sends a JSON request file (az on Azure Boards), which keepIssueComment is then
 *   handed; false: no such file is written.
 *   attachesFiles: whether the forge's client uploads a pull request's images with its body (gh
 *   --attach); false: a screenshot is committed on the working branch and linked at its commit.
 *   fileUrl: the address of a file of the repository at a commit (path relative to the working
 *   copy) that the forge's pull request shows as an image, null when the remote names no
 *   repository. screenshotsBlocked: why this machine's forge client cannot show screenshots in a
 *   pull request (gh without --attach, az without its azure-devops extension), null when it can.
 *   attachLimit: the most screenshots the forge's client attaches in one command (gh: 50); none when it attaches none.
 *   storyLink: the line of a pull request's body that links it to the story's issue, as the
 *   forge reads it: one that closes the issue when the pull request merges, when closes is true;
 *   null when the forge links none.
 */
export {}
