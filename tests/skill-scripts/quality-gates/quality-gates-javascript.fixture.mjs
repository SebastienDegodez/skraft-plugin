export const source = 'export const answer = () => 42\n'

export function config(scope = 'core') {
  const threshold = scope === 'core' ? 100 : 80
  return {
    testRunner: 'tap',
    tap: { testFiles: ['tests/*.test.mjs'] },
    mutate: [`src/${scope}.mjs`],
    thresholds: { high: threshold, low: threshold, break: threshold },
    reporters: ['json', 'clear-text'],
  }
}

export function report(options, root, statuses = ['Killed']) {
  return {
    schemaVersion: '1.0', projectRoot: root,
    thresholds: structuredClone(options.thresholds), config: structuredClone(options),
    framework: { name: 'StrykerJS', version: '9.6.1' },
    files: Object.fromEntries(options.mutate.map((file) => [file, {
      language: 'javascript', source,
      mutants: statuses.map((status, index) => ({
        id: String(index), status, mutatorName: 'NumberLiteral', replacement: '0',
        location: { start: { line: 1, column: 29 }, end: { line: 1, column: 31 } },
      })),
    }])),
  }
}