/**
 * CommitReplay — runs one program on the files of a commit, in a throwaway checkout that
 * leaves the working copy as it is.
 *
 * @typedef {{ repository: string, sha: string, cwd: string, argv: string[], importRoots: string[], env?: Readonly<Record<string, string>>, javaTmpDir?: string }} ReplayRequest
 *   repository: the repository top, relative to the working copy; cwd: the folder the program
 *   starts from, relative to the repository top (`.`, `services/api`); env: variables added to
 *   the replayed program's environment; javaTmpDir: the Java runtime's temporary directory;
 *   argv: the program and its arguments; importRoots: folders of the
 *   commit, relative to cwd, put first on a Python program's import path (PYTHONPATH), before
 *   whatever was there; empty for any other program.
 * @typedef {import('./command-runner.mjs').CommandResult} ReplayResult
 * @typedef {{ run: (request: ReplayRequest) => Promise<ReplayResult> }} CommitReplay
 *   A commit that cannot be checked out answers started: false with its error, the program not
 *   tried; so does a checkout where the program does not start: `could not start <program>`.
 */
export {}
