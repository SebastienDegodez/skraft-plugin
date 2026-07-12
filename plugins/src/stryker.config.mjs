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
    // Repo-wide config bridge (depthTier) — skraft-config configurateur
    'plugins/src/domain/config-schema.mjs',
    'plugins/src/application/config-service.mjs',
    'plugins/src/adapters/infrastructure/config/json-config-writer.mjs',
    // Issue #105/#106 — commit-convention scan for manual DELIVER closure
    'plugins/src/domain/commit-convention.mjs',
    'plugins/src/application/commit-scan-service.mjs',
    // US13 — Recovery / rollback (#59)
    'plugins/src/domain/recovery-policy.mjs',
    'plugins/src/application/recovery-service.mjs',
    'plugins/src/adapters/infrastructure/state/json-state-backup-reader.mjs',
  ],
  coverageAnalysis: 'perTest',
  thresholds: { high: 90, low: 80, break: 80 },
  reporters: ['html', 'clear-text', 'progress'],
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
}
