// QualityGateVerifier (ports/infrastructure/quality-gate-verifier.mjs) implemented by the
// existing command `src/cli/qg-verify.mjs`. Knows the command line and its exit codes;
// the process itself is whatever runner the host has (Node child process, Claude Code
// $.process.run), injected as runProcess(argv, { timeoutMs }) => { exitCode, stdout, stderr }.
// No Node API here, so the Claude Code mod can use it.

const OUTCOME_BY_EXIT_CODE = Object.freeze({ 0: 'pass', 1: 'fail', 2: 'inconclusive' })
const TIMEOUT_MS = 600_000
const FINDINGS_TAIL = 8_000

export const qualityGateOutcomeOf = (exitCode) => OUTCOME_BY_EXIT_CODE[exitCode] ?? 'error'

export const createCliQualityGateVerifier = ({ runProcess, pluginRoot, trackingStore }) => Object.freeze({
  verify: async ({ slug, evidenceLog, baseSha }) => {
    const argv = [
      'node', `${pluginRoot}/src/cli/qg-verify.mjs`,
      '--log', `${trackingStore.prefix(slug)}${evidenceLog}`,
      ...(baseSha ? ['--base', baseSha] : []),
    ]
    try {
      const { exitCode, stdout, stderr } = await runProcess(argv, { timeoutMs: TIMEOUT_MS })
      return Object.freeze({
        outcome: qualityGateOutcomeOf(exitCode),
        findings: [stdout, stderr].filter(Boolean).join('\n').slice(-FINDINGS_TAIL),
      })
    } catch (error) {
      return Object.freeze({ outcome: 'error', findings: `qg-verify could not run: ${error?.message ?? error}` })
    }
  },
})
