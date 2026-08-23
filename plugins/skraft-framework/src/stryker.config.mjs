/** @type {import('@stryker-mutator/core').PartialStrykerOptions} */
export default {
  testRunner: 'tap',
  tap: {
    testFiles: ['tests/skraft-framework/*.test.mjs'],
    nodeArgs: ['--test-reporter=tap', '--test-reporter-destination=stdout'],
  },
  mutate: [
    'plugins/skraft-framework/src/adapters/api/hooks/*.mjs',
    'plugins/skraft-framework/src/adapters/infrastructure/*.mjs',
    'plugins/skraft-framework/src/application/config-loader.mjs',
    'plugins/skraft-framework/src/application/resolve-model.mjs',
    'plugins/skraft-framework/src/domain/model-tier.mjs',
    'plugins/skraft-framework/src/domain/model-class-policy.mjs',
    'plugins/skraft-framework/src/domain/framework-config-policy.mjs',
    'plugins/skraft-framework/src/domain/dispatch-policy.mjs',
    'plugins/skraft-framework/src/domain/state-schema.mjs',
    'plugins/skraft-framework/src/domain/pipeline-policy.mjs',
    'plugins/skraft-framework/src/application/pre-tool-use-service.mjs',
    'plugins/skraft-framework/src/application/pre-tool-use-composite.mjs',
    // US4 — G2/G3 skill-loading guardrail (#50)
    'plugins/skraft-framework/src/domain/skill-policy.mjs',
    'plugins/skraft-framework/src/application/subagent-start-service.mjs',
    'plugins/skraft-framework/src/application/subagent-stop-service.mjs',
    'plugins/skraft-framework/src/application/post-tool-use-service.mjs',
    // US5 — State Transition Bridge (#60)
    'plugins/skraft-framework/src/domain/state-machine.mjs',
    'plugins/skraft-framework/src/domain/state-schema.mjs',
    'plugins/skraft-framework/src/adapters/infrastructure/state/json-state-writer.mjs',
    'plugins/skraft-framework/src/application/state-service.mjs',
    // US8 — G4/G5 artifact + verdict + commit completion guard (#8)
    'plugins/skraft-framework/src/domain/artifact-policy.mjs',
    // Repo-wide config bridge (tracking layout) — config CLI
    'plugins/skraft-framework/src/domain/config-schema.mjs',
    'plugins/skraft-framework/src/application/config-service.mjs',
    'plugins/skraft-framework/src/adapters/infrastructure/config/json-config-writer.mjs',
    // Issue #105/#106 — commit-convention scan for manual DELIVER closure
    'plugins/skraft-framework/src/domain/commit-convention.mjs',
    'plugins/skraft-framework/src/application/commit-scan-service.mjs',
    // US9 — S7 execution-log + CLI bridge (#55)
    'plugins/skraft-framework/src/domain/execution-log-schema.mjs',
    'plugins/skraft-framework/src/application/execution-log-service.mjs',
    'plugins/skraft-framework/src/adapters/infrastructure/execution-log/json-execution-log-writer.mjs',
    // US11 — G7/G8 state protection + session guard (#57)
    'plugins/skraft-framework/src/domain/session-guard-policy.mjs',
    'plugins/skraft-framework/src/application/pre-tool-use-session-guard-service.mjs',
    // US12 — Observabilité (timeout/stale + health-check + housekeeping) (#58)
    'plugins/skraft-framework/src/domain/observability-policy.mjs',
    'plugins/skraft-framework/src/application/health-check-service.mjs',
    'plugins/skraft-framework/src/application/session-start-service.mjs',
    // US13 — Recovery / rollback (#59)
    'plugins/skraft-framework/src/domain/recovery-policy.mjs',
    'plugins/skraft-framework/src/application/recovery-service.mjs',
    'plugins/skraft-framework/src/adapters/infrastructure/state/json-state-backup-reader.mjs',
    // US16 — Consumer hook deployment / plugin-root resolution (#63)
    'plugins/skraft-framework/src/domain/plugin-root-policy.mjs',
    'plugins/skraft-framework/src/adapters/infrastructure/plugin-root-resolver.mjs',
    // Layer separation — tracking layout (namespaced|bare) resolution
    'plugins/skraft-framework/src/domain/tracking-layout-policy.mjs',
  ],
  coverageAnalysis: 'perTest',
  thresholds: { high: 90, low: 80, break: 80 },
  reporters: ['html', 'clear-text', 'progress'],
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
}
