/**
 * CommitReplay — runs one program on the files of a commit, in a throwaway checkout that
 * leaves the working copy as it is, and reads the JUnit reports it wrote there.
 *
 * @typedef {{ repository: string, sha: string, cwd: string, choices: string[][], importRoots: string[], reports: string[] }} ReplayRequest
 *   repository: the repository top, relative to the working copy; cwd: the folder the program
 *   starts from, relative to the repository top (`.`, `services/api`); choices: the argvs to
 *   try, in order, in that one checkout: the first that starts runs; importRoots: folders of the
 *   commit, relative to cwd, put first on a Python program's import path (PYTHONPATH), before
 *   whatever was there; empty for any other program. reports: globs relative to cwd (`**` any
 *   folders, `*` and `?` within a name) of the JUnit XML files the program writes.
 * @typedef {import('./command-runner.mjs').CommandResult & { reports?: Array<{ path: string, text: string }> }} ReplayResult
 *   reports: the files of the checkout the globs match, relative to cwd, in path order, read
 *   before the checkout goes; none when the request names no glob.
 * @typedef {{ run: (request: ReplayRequest) => Promise<ReplayResult> }} CommitReplay
 *   A commit that cannot be checked out answers started: false with its error, no choice tried;
 *   so does a checkout where no choice starts: `could not start <program> nor <program>`.
 */
export {}
