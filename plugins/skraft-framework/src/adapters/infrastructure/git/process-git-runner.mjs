// A git runner on any process runner — runProcess(argv, { timeoutMs }) =>
// { exitCode, stdout, isStdoutTruncated? } — for hosts whose process API is not Node's
// (the Claude Code mod's $.process.run). stdout, or null when git fails, cannot start or
// its output was cut: a partial answer is never taken for a whole one. No Node API here.
const GIT_TIMEOUT_MS = 60_000

export const createProcessGitRunner = ({ runProcess }) => async (args) => {
  try {
    const { exitCode, stdout, isStdoutTruncated } = await runProcess(['git', ...args], { timeoutMs: GIT_TIMEOUT_MS })
    return exitCode === 0 && !isStdoutTruncated ? stdout : null
  } catch {
    return null
  }
}
