/**
 * What a replayed test command proves, read from the JUnit XML reports it wrote (pytest
 * `--junitxml`, Vitest's junit reporter, Surefire, `dotnet test`'s junit logger) or the TRX
 * `dotnet test --logger trx` writes: the exit code alone cannot tell a failing assertion from a
 * build, collection or import error.
 *
 * @typedef {'passed' | 'failed' | 'error' | 'skipped'} Outcome
 * @typedef {{ id: string, outcome: Outcome, message: string }} TestCase
 *   id: `<classname>.<name>`, or the name alone when the report gives no class.
 * @typedef {{ path: string, text: string }} Report
 * @typedef {{ started: boolean, exitCode: number | null, stdout: string, stderr: string, error?: string, reports?: Report[] }} ReplayAnswer
 * @typedef {'assertion' | 'no-report' | 'error' | 'skipped' | 'green' | 'timeout' | 'indeterminate'} Reading
 *   assertion: a test fails on an assertion, the only red that proves something; no-report: the
 *   command wrote no test report (a build, collection or import error); error: tests end on an
 *   error, never on an assertion; skipped: no test fails and some are skipped; green: every test
 *   passes; timeout: the command did not finish in time; indeterminate: no container runtime
 *   answers, so the tests that need one could not run.
 */

const TESTCASE = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g
const TRX_RESULT = /<UnitTestResult\b([^>]*?)(?:\/>|>([\s\S]*?)<\/UnitTestResult>)/g
const TRX_MESSAGE = /<Message>([\s\S]*?)<\/Message>/
/** A TRX outcome, by the outcome of a JUnit test case it stands for. @type {Readonly<Record<string, Outcome>>} */
const TRX_OUTCOMES = Object.freeze({ Passed: 'passed', Failed: 'failed', NotExecuted: 'skipped', Inconclusive: 'skipped' })
const ATTRIBUTE = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
const MESSAGE = /<(?:failure|error)\b[^>]*?message\s*=\s*(?:"([^"]*)"|'([^']*)')/
const ENTITIES = Object.freeze({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })
const TIMED_OUT = /did not finish within/
/**
 * A failure that is an exception the code under test threw, not an assertion that ran: a skeleton
 * that throws, or a name it has not got yet. Every runner reports both as a failed test.
 */
const THROWN = /^\s*(?:[\w$]+\.)*(?:NotImplementedException|NullReferenceException|NullPointerException|InvalidCastException|ClassCastException|UnsupportedOperationException|NotImplementedError|TypeError|AttributeError|ImportError|ModuleNotFoundError|NameError|ReferenceError|KeyError|IndexError|NoSuchMethodError|NoClassDefFoundError|ArgumentNullException|TypeLoadException|MissingMethodException)\b/
/** What a test or a container library says when no Docker or Podman answers. */
const NO_RUNTIME = /Could not find a valid Docker environment|Cannot connect to the Docker daemon|docker\.sock|DockerClientProviderStrategy|Docker is not running|no container runtime|podman\.sock|Cannot connect to Podman|Failed to connect to Docker|Docker environment should have more than|Is the docker daemon running|Error while fetching server API version|DockerException|Could not connect to Ryuk|Cannot connect to the container runtime/i

/** The test cases every report holds, in report order. @param {Report[]} reports @returns {TestCase[]} */
export const testCasesOf = (reports) => reports.flatMap(({ text }) => [...junitCases(text), ...trxCases(text)])

/** @param {string} text @returns {TestCase[]} */
// Stryker disable next-line StringLiteral: a self-closing test case has no body; any text without a failure, error or skipped element reads as passed, and no reading looks at a passed test's message
const junitCases = (text) => [...text.matchAll(TESTCASE)].map(([, attributes, body = '']) => testCaseOf(attributesOf(attributes), body))

/** A TRX result: its test, its outcome, the message of a failure; any other outcome is an error. @param {string} text @returns {TestCase[]} */
// Stryker disable next-line StringLiteral: a self-closing result has no body, so no message, as any text holding no Message element
const trxCases = (text) => [...text.matchAll(TRX_RESULT)].map(([, attributes, body = '']) => {
  const { testName, outcome } = attributesOf(attributes)
  // Stryker disable next-line StringLiteral: a result with no Message is a passed or skipped one, whose message no reading looks at
  return thrownAsError({ id: testName, outcome: TRX_OUTCOMES[outcome] ?? 'error', message: decoded(TRX_MESSAGE.exec(body)?.[1] ?? '') })
})

/** @param {Record<string, string>} attributes @param {string} body @returns {TestCase} */
const testCaseOf = ({ name, classname = '' }, body) => thrownAsError({ id: classname === '' ? name : `${classname}.${name}`, outcome: outcomeOf(body), message: messageOf(body) })

/** A failed test whose message names an exception the code threw ended on an error. @param {TestCase} test @returns {TestCase} */
const thrownAsError = (test) => (test.outcome === 'failed' && THROWN.test(test.message) ? { ...test, outcome: 'error' } : test)

/** @param {string} text @returns {Record<string, string>} */
const attributesOf = (text) => Object.fromEntries([...text.matchAll(ATTRIBUTE)].map(([, key, double, single]) => [key, decoded(double ?? single)]))

/** @param {string} text */
const decoded = (text) => text.replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => ENTITIES[/** @type {keyof typeof ENTITIES} */ (name)])

/** @param {string} body @returns {Outcome} */
const outcomeOf = (body) => {
  if (/<failure\b/.test(body)) return 'failed'
  if (/<error\b/.test(body)) return 'error'
  return /<skipped\b/.test(body) ? 'skipped' : 'passed'
}

/** @param {string} body */
const messageOf = (body) => {
  const found = MESSAGE.exec(body)
  return found === null ? body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) : decoded(found[1] ?? found[2])
}

/**
 * What a replay of a commit proves, from its reports, its output and how it ended: read on the
 * test cases of the test files it commits when the reports name them (each id holds a file's
 * name), on every test case otherwise.
 * @param {ReplayAnswer} answer @param {string[]} [files] the test files the commit changes
 * @returns {{ reading: Reading, cases: TestCase[] }}
 */
export const readReplay = (answer, files = []) => {
  const cases = focused(testCasesOf(answer.reports ?? []), files.map(stemOf))
  if (answer.exitCode === null && TIMED_OUT.test(String(answer.error))) return { reading: 'timeout', cases }
  if (NO_RUNTIME.test([answer.stdout, answer.stderr, ...cases.map(({ message }) => message)].join('\n'))) return { reading: 'indeterminate', cases }
  return { reading: casesReading(cases), cases }
}

/** A file's name without its last extension. @param {string} file */
const stemOf = (file) => /** @type {string} */ (file.split('/').at(-1)).replace(/\.[^.]+$/, '')

/** The test cases of the files named, when the reports hold some; every one otherwise. @param {TestCase[]} cases @param {string[]} stems */
const focused = (cases, stems) => {
  const named = cases.filter(({ id }) => stems.some((stem) => stem !== '' && id.includes(stem)))
  return named.length > 0 ? named : cases
}

/** @param {TestCase[]} cases @returns {Reading} */
const casesReading = (cases) => {
  if (cases.length === 0) return 'no-report'
  if (cases.some(({ outcome }) => outcome === 'failed')) return 'assertion'
  if (cases.some(({ outcome }) => outcome === 'error')) return 'error'
  return cases.some(({ outcome }) => outcome === 'skipped') ? 'skipped' : 'green'
}

/** Why a red that is not proven is refused, by reading. @type {Readonly<Record<Exclude<Reading, 'assertion' | 'indeterminate'>, string>>} */
const NOT_RED = Object.freeze({
  'no-report': 'its test command wrote no test report: the build, the test collection or an import failed before any test ran, or the command writes none where testReports looks (skraft doctor names what to add)',
  error: 'its tests end on an error, never on an assertion: make the skeleton answer the empty value of its type so that the assertion runs',
  skipped: 'no test fails and some are skipped: a scenario\'s test is never skipped',
  green: 'its tests pass at it',
  timeout: 'its test command did not finish in time',
})

/** @param {Exclude<Reading, 'assertion' | 'indeterminate'>} reading */
export const notRedBecause = (reading) => NOT_RED[reading]

/** The ids of the test cases that failed on an assertion. @param {TestCase[]} cases */
export const failingIds = (cases) => cases.filter(({ outcome }) => outcome === 'failed').map(({ id }) => id)

/**
 * Why a green commit does not make its scenario pass: a test still fails or errs, a test of the
 * scenario is missing from the reports or skipped; null when it passes.
 * @param {TestCase[]} cases @param {string[]} oracle the ids of the scenario's tests
 */
export const notGreenBecause = (cases, oracle) => {
  const failing = cases.filter(({ outcome }) => outcome === 'failed' || outcome === 'error').map(({ id }) => id)
  if (failing.length > 0) return `these tests fail at it: ${failing.join(', ')}`
  const unpassed = oracle.filter((id) => !cases.some((test) => test.id === id && test.outcome === 'passed'))
  return unpassed.length === 0 ? null : `the scenario's tests do not pass at it: ${unpassed.join(', ')}`
}
