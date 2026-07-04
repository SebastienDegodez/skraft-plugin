/** @type {import('@stryker-mutator/core').PartialStrykerOptions} */
export default {
  testRunner: 'tap',
  tap: {
    testFiles: ['tests/skraft-framework/*.test.mjs'],
    nodeArgs: ['--test-reporter=tap', '--test-reporter-destination=stdout'],
  },
  mutate: [
    'plugins/src/adapters/api/hooks/*.mjs',
    'plugins/src/adapters/infrastructure/*.mjs',
    'plugins/src/application/config-loader.mjs',
    'plugins/src/application/resolve-model.mjs',
    'plugins/src/domain/model-tier.mjs',
    'plugins/src/domain/model-class-policy.mjs',
    'plugins/src/domain/framework-config-policy.mjs',
    'plugins/src/domain/dispatch-policy.mjs',
    'plugins/src/domain/state-schema.mjs',
    'plugins/src/domain/pipeline-policy.mjs',
    'plugins/src/application/pre-tool-use-service.mjs',
    // US4 — G2/G3 skill-loading guardrail (#50)
    'plugins/src/domain/skill-policy.mjs',
    'plugins/src/application/subagent-start-service.mjs',
    'plugins/src/application/subagent-stop-service.mjs',
    'plugins/src/application/post-tool-use-service.mjs',
    // US5 — State Transition Bridge (#60)
    'plugins/src/domain/state-machine.mjs',
    'plugins/src/domain/state-schema.mjs',
    'plugins/src/adapters/infrastructure/state/json-state-writer.mjs',
    'plugins/src/application/state-service.mjs',
    // US8 — G4/G5 artifact + verdict + commit completion guard (#8)
    'plugins/src/domain/artifact-policy.mjs',
    // CLI ensemble freshness gate (versions, hooks parity, CI parity)
    'plugins/src/domain/freshness-policy.mjs',
    // Auto-update staleness notice (SessionStart)
    'plugins/src/domain/update-policy.mjs',
    'plugins/src/application/session-start-service.mjs',
  ],
  coverageAnalysis: 'perTest',
  thresholds: { high: 90, low: 80, break: 80 },
  reporters: ['html', 'clear-text', 'progress'],
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  // Incremental mode (StrykerJS equivalent of Stryker.NET --since): only mutants
  // affected by the code/test diff since the last run are re-executed. The state
  // file lives under reports/mutation/ (gitignored) — first run is always full;
  // CI runners without the file fall back to a full authoritative run.
  incremental: true,
  incrementalFile: 'reports/mutation/stryker-incremental.json',
}
