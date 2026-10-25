import { joinPath } from './mod-files.mjs'

/**
 * @typedef {{ cwd?: string, timeoutMs?: number }} RunInit
 * @typedef {{ exitCode: number, stdout: string, stderr: string }} RunResult
 * @typedef {(argv: string[], init?: RunInit) => Promise<RunResult>} ModRun
 *   `$.process.run`: rejects when the program cannot be started, or is still running at the timeout.
 */

/** `$.process.run` refuses a longer timeout. */
const LONGEST_MS = 600_000

/** `/x`, `\\server\x`, `C:\x`, `C:/x`. */
const ABSOLUTE = /^(?:[\\/]|[A-Za-z]:[\\/])/

/**
 * The CommandRunner port on the Claude Code mod's `$.process.run`. An absolute cwd is taken as is.
 * @param {{ run: ModRun, root: string }} options root: the working copy
 * @returns {import('../../application/ports/command-runner.mjs').CommandRunner}
 */
export const createModCommandRunner = ({ run, root }) => Object.freeze({
  run: (request) => runThrough(run, root, request),
})

/**
 * A program started by `$.process.run`, ended at its time limit, never past the longest one it takes.
 * @param {ModRun} run @param {string} root
 * @param {import('../../application/ports/command-runner.mjs').CommandRequest} request
 * @returns {Promise<import('../../application/ports/command-runner.mjs').CommandResult>}
 */
const runThrough = async (run, root, { argv, cwd, timeoutMs = LONGEST_MS }) => {
  const limit = Math.min(timeoutMs, LONGEST_MS)
  try {
    const result = await run([...argv], { cwd: ABSOLUTE.test(cwd) ? cwd : joinPath(root, cwd), timeoutMs: limit })
    return { started: true, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/still running after/.test(message)) return { started: true, exitCode: null, stdout: '', stderr: '', error: `${argv[0]} did not finish within ${limit / 1000} s` }
    return { started: false, exitCode: null, stdout: '', stderr: '', error: `${argv[0]} could not be started: ${message}` }
  }
}
