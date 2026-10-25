/**
 * SourceControl — the Git facts of a folder of the working copy or of a neighbour repository.
 *
 * @typedef {{ sha: string, subject: string, body: string, files: string[] }} Commit
 *   body: the message after the subject and its blank line, trailers included, '' when there
 *   is none; files: the files the commit changed, relative to the folder asked about, `/`-separated.
 * @typedef {{
 *   unavailable: () => Promise<string | null>,
 *   repository: (dir: string) => Promise<string | null>,
 *   mergeBase: (dir: string, ref: string) => Promise<string | null>,
 *   changedFiles: (dir: string, sha: string) => Promise<string[] | null>,
 *   head: (dir: string) => Promise<string | null>,
 *   files: (dir: string) => Promise<string[] | null>,
 *   commits: (dir: string, since: string) => Promise<Commit[] | null>,
 *   diff: (dir: string, sha: string) => Promise<string | null>,
 *   existsAt: (dir: string, sha: string, path: string) => Promise<boolean>,
 *   commitFiles: (dir: string, paths: string[], message: string) => Promise<{ ok: true } | { ok: false, error: string }>,
 *   commitCopies: (dir: string, copies: Array<{ from: string, to: string }>, message: string) => Promise<{ ok: true } | { ok: false, error: string }>,
 * }} SourceControl
 *   unavailable: null when Git runs on this host, else why it does not. dir is relative to the
 *   working copy. repository: the folder's repository top, relative
 *   to the working copy, null when dir is in no repository. mergeBase: `git merge-base HEAD
 *   <ref>` in dir, null when the ref or the merge base does not exist. changedFiles: files
 *   under dir changed since sha (committed, staged, unstaged, untracked), relative to dir;
 *   null when Git cannot tell. head: the sha HEAD points at in dir, null when there is none.
 *   files: the files Git lists under dir, tracked or untracked and not ignored, relative to dir;
 *   null when Git cannot tell.
 *   commits: the commits reachable from HEAD and not from since, oldest first; null when Git
 *   cannot tell. diff: the unified diff of the tracked files under dir since sha (committed,
 *   staged, unstaged), paths relative to dir; null when Git cannot tell. existsAt: whether the
 *   commit holds the file (path relative to dir). commitFiles: stages the files (relative to dir)
 *   and commits them alone with that message; ok with nothing to commit. commitCopies: copies
 *   each file, byte for byte, from `from` to `to` (both relative to dir), ignored or not, then
 *   commits the copies alone with that message.

 */
export {}
