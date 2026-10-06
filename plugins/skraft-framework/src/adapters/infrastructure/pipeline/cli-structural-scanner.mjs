// StructuralScanner (ports/infrastructure/structural-scanner.mjs) implemented by the
// existing command `src/cli/structural-scan.mjs`. runProcess is injected (see
// cli-quality-gate-verifier.mjs). No Node API here.
const TIMEOUT_MS = 120_000

export const createCliStructuralScanner = ({ runProcess, pluginRoot, trackingStore }) => Object.freeze({
  scan: async ({ slug, outputPath }) => {
    const argv = ['node', `${pluginRoot}/src/cli/structural-scan.mjs`, '--out', `${trackingStore.prefix(slug)}${outputPath}`]
    try {
      const { exitCode, stderr } = await runProcess(argv, { timeoutMs: TIMEOUT_MS })
      return exitCode === 0
        ? Object.freeze({ ok: true })
        : Object.freeze({ ok: false, reason: `structural-scan exit ${exitCode}${stderr ? `: ${stderr.trim().slice(0, 500)}` : ''}` })
    } catch (error) {
      return Object.freeze({ ok: false, reason: `structural-scan could not run: ${error?.message ?? error}` })
    }
  },
})
