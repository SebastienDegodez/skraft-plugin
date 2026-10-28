/**
 * CommitReplay — runs one program on the files of a commit, in a throwaway checkout that
 * leaves the working copy as it is.
 *
 * @typedef {{ repository: string, sha: string, cwd: string, choices: string[][], importRoots: string[] }} ReplayRequest
 *   repository: the repository top, relative to the working copy; cwd: the folder the program
 *   starts from, relative to the repository top (`.`, `services/api`); choices: the argvs to
 *   try, in order, in that one checkout: the first that starts runs; importRoots: folders of the
 *   commit, relative to cwd, put first on a Python program's import path (PYTHONPATH), before
 *   whatever was there; empty for any other program.
 * @typedef {{ run: (request: ReplayRequest) => Promise<import('./command-runner.mjs').CommandResult> }} CommitReplay
 *   A commit that cannot be checked out answers started: false with its error, no choice tried;
 *   so does a checkout where no choice starts: `could not start <program> nor <program>`.
 */
export {}
