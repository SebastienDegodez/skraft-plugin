// Run from the repository root:
//   npx --prefix plugins/skraft-framework/engine stryker run plugins/skraft-framework/engine/stryker.config.mjs
const ENGINE = 'plugins/skraft-framework/engine'

/** @type {import('@stryker-mutator/core').PartialStrykerOptions} */
export default {
  testRunner: 'tap',
  tap: {
    testFiles: ['tests/skraft-framework/unit/**/*.test.mjs', 'tests/skraft-framework/integration/**/*.test.mjs'],
    nodeArgs: ['--test-reporter=tap', '--test-reporter-destination=stdout'],
  },
  mutate: [
    `${ENGINE}/**/*.mjs`,
    `!${ENGINE}/drivers/cli/skraft.mjs`,
    `!${ENGINE}/stryker.config.mjs`,
    `!${ENGINE}/node_modules/**`,
  ],
  // The CLI tests spawn the engine in a child process, which inherits the active mutant
  // but reports no coverage back: per-test coverage would mark those mutants NoCoverage.
  coverageAnalysis: 'off',
  incremental: true,
  incrementalFile: `${ENGINE}/reports/stryker-incremental.json`,
  thresholds: { high: 90, low: 80, break: 80 },
  reporters: ['html', 'clear-text', 'progress', 'json'],
  htmlReporter: { fileName: `${ENGINE}/reports/mutation/mutation.html` },
  jsonReporter: { fileName: `${ENGINE}/reports/mutation/mutation.json` },
}
