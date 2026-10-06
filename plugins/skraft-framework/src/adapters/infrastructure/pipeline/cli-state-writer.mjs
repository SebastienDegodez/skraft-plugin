import { Ok, Err } from '../../../domain/result.mjs'

// StateWriter (ports/infrastructure/state-writer.mjs) for hosts that cannot rename files
// (the Claude Code mod sandbox): the state goes on stdin to `src/cli/state-io.mjs`, which
// writes it with the CLI's atomic writer. runProcess is injected; it must accept `stdin`.
// No Node API here.
const TIMEOUT_MS = 30_000

export const createCliStateWriter = ({ runProcess, pluginRoot, trackingRoot }) => Object.freeze({
  write: async (projectSlug, state) => {
    try {
      const { exitCode, stderr } = await runProcess(
        ['node', `${pluginRoot}/src/cli/state-io.mjs`, 'write', '--root', trackingRoot, '--slug', projectSlug],
        { timeoutMs: TIMEOUT_MS, stdin: JSON.stringify(state) },
      )
      if (exitCode === 0) return Ok(undefined)
      return Err({ code: exitCode === 1 ? 'CORRUPTED_STATE' : 'IO_ERROR', reason: (stderr ?? '').trim() || `state-io exit ${exitCode}` })
    } catch (error) {
      return Err({ code: 'IO_ERROR', reason: String(error?.message ?? error) })
    }
  },
})
