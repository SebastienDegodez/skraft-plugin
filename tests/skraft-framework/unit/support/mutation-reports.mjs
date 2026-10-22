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

/** A Stryker report whose mutants were all detected: it meets every bar. */
export const ALL_KILLED = strykerReport({ 'src/Checkout.cs': [[12, 'Equality', '!=', 'Killed'], [31, 'String', null, 'Timeout']] })

/**
 * `count` mutants of a file, one per line from `from`, all with the same status.
 * @param {number} count @param {string} status @param {number} [from]
 * @returns {Array<[number, string, string | null, string]>}
 */
export const mutants = (count, status, from = 1) => Array.from({ length: count }, (_, index) => [from + index, 'Equality', '!=', status])

/** Where Stryker writes its report, by stack, relative to the component root. */
const STRYKER_REPORTS = Object.freeze({ dotnet: 'StrykerOutput/reports/mutation-report.json', typescript: 'reports/mutation/mutation.json', javascript: 'reports/mutation/mutation.json', react: 'reports/mutation/mutation.json' })

/**
 * The Stryker mutation command of a component of the current skraft-config.json, `{baseSha}`
 * standing for any sha, writes a report whose mutants are all killed where its tool writes it;
 * unless the test scripts that command line itself in the machine's `meanwhile`.
 * @param {{ commandRunner: { run: Function, meanwhile: Record<string, unknown> }, workspace: { read: Function, write: Function } }} deps
 */
export const strykerWritesItsReports = ({ commandRunner, workspace }) => {
  const run = commandRunner.run.bind(commandRunner)
  commandRunner.run = async (request) => {
    const answer = await run(request)
    const scripted = `${request.cwd} $ ${request.argv.join(' ')}` in commandRunner.meanwhile
    const report = answer.started && !scripted ? await strykerReportOf(workspace, request) : null
    if (report !== null) await workspace.write(report, ALL_KILLED)
    return answer
  }
}

/** @param {{ read: Function }} workspace @param {{ argv: string[], cwd: string }} request @returns {Promise<string | null>} */
const strykerReportOf = async (workspace, { argv, cwd }) => {
  let config
  try { config = JSON.parse(await workspace.read('skraft-config.json')) } catch { return null }
  const component = (config?.components ?? []).find((each) => each.root === cwd && STRYKER_REPORTS[each.stack] !== undefined && runs(each.commands?.mutation, argv))
  if (component === undefined) return null
  const report = component.mutationReport ?? STRYKER_REPORTS[component.stack]
  return cwd === '.' ? report : `${cwd}/${report}`
}

/** @param {unknown} command @param {string[]} argv */
const runs = (command, argv) => typeof command === 'string' &&
  new RegExp(`^${command.split('{baseSha}').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\S+')}$`).test(argv.join(' '))
