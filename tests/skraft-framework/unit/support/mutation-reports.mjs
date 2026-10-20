// Mutation reports as the tools write them: the mutation-testing-elements JSON of Stryker and
// the mutations.xml of PIT.

/**
 * A Stryker report: its mutants by file, each `[line, mutator, replacement, status]`.
 * @param {Record<string, Array<[number, string, string | null, string]>>} files
 * @param {{ projectRoot?: string }} [options]
 */
export const strykerReport = (files, { projectRoot } = {}) => JSON.stringify({
  schemaVersion: '1',
  thresholds: { high: 80, low: 60 },
  ...(projectRoot === undefined ? {} : { projectRoot }),
  files: Object.fromEntries(Object.entries(files).map(([file, mutants]) => [file, {
    language: 'cs',
    source: '',
    mutants: mutants.map(([line, mutatorName, replacement, status], index) => ({
      id: String(index + 1),
      mutatorName,
      ...(replacement === null ? {} : { replacement }),
      location: { start: { line, column: 5 }, end: { line, column: 9 } },
      status,
    })),
  }])),
}, null, 2)

/**
 * A PIT report: its mutations, each `[class, source file, line, mutator, description, status]`; a null
 * description writes no description.
 * @param {Array<[string, string, number, string, string | null, string]>} mutations
 */
export const pitReport = (mutations) => [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<mutations partial="false">',
  ...mutations.map(([mutatedClass, sourceFile, line, mutator, description, status]) => [
    `<mutation detected='${status === 'KILLED'}' status='${status}' numberOfTestsRun='1'>`,
    `<sourceFile>${sourceFile}</sourceFile><mutatedClass>${mutatedClass}</mutatedClass><mutatedMethod>pay</mutatedMethod>`,
    `<lineNumber>${line}</lineNumber><mutator>org.pitest.mutationtest.engine.gregor.mutators.${mutator}</mutator>`,
    `${description === null ? '' : `<description>${description}</description>`}</mutation>`,
  ].join('')),
  '</mutations>',
  '',
].join('\n')
