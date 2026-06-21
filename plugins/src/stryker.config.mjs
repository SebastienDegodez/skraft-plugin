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
  ],
  coverageAnalysis: 'perTest',
  thresholds: { high: 90, low: 80, break: 80 },
  reporters: ['html', 'clear-text', 'progress'],
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
}
