import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateConfig, validateReport, effectiveOptions, parseArgs } from '../../../plugins/skraft-framework/skills/quality-gates-javascript/scripts/gate-policy.mjs'
import { config, report, source } from './quality-gates-javascript.fixture.mjs'

test('core and boundary preserve the permanent thresholds', () => {
  assert.equal(validateConfig(config(), 'core'), 100)
  assert.equal(validateConfig(config('boundary'), 'boundary'), 80)
  assert.throws(() => validateConfig(config(), 'other'))
})

const invalidConfigs = {
  null: null, array: [], runner: { testRunner: 'node' },
  lowered: { thresholds: { high: 100, low: 100, break: 99 } },
  missingThreshold: { thresholds: { high: 100, low: 100 } },
  negative: { mutate: ['src/*.mjs', '!src/core.mjs'] },
  range: { mutate: ['src/core.mjs:1-2'] },
  traversal: { mutate: ['../src/*.mjs'] },
  absolute: { mutate: ['/src/core.mjs'] },
  empty: { mutate: [] }, emptyString: { mutate: [''] },
  unknown: { mysteryOption: true }, exclude: { ignorePatterns: ['src/core.mjs'] },
  mutator: { mutator: { excludedMutations: ['BooleanLiteral'] } },
  ignore: { ignorers: ['console'] }, static: { ignoreStatic: true },
  incremental: { incremental: true }, dryRun: { dryRunOnly: true },
  files: { files: ['src/core.mjs'] }, inPlace: { inPlace: true },
  plugins: { plugins: ['fake-runner'] }, checker: { checkers: ['typescript'] },
  reporters: { reporters: ['clear-text'] },
  dashboard: { reporters: ['json', 'dashboard'] },
  noTests: { tap: { testFiles: [] } },
  testExclusion: { tap: { testFiles: ['!tests/*.mjs'] } },
  testFilter: { testFiles: ['one.test.mjs'] },
  testArgs: { tap: { testFiles: ['tests/*.mjs'], nodeArgs: ['--test-name-pattern=one'] } },
  command: { buildCommand: 'echo nope' },
  forceBail: { tap: { testFiles: ['tests/*.mjs'], forceBail: 1 } },
  coverage: { coverageAnalysis: 'guess' }, concurrency: { concurrency: 0 },
  timeout: { timeoutMS: -1 }, reuse: { maxTestRunnerReuse: '1' },
  bail: { disableBail: 'false' }, log: { logLevel: 'other' },
}
for (const [name, patch] of Object.entries(invalidConfigs)) {
  test(`reject unsafe config: ${name}`, () => {
    const value = patch === null || Array.isArray(patch) ? patch : { ...config(), ...patch }
    assert.throws(() => validateConfig(value, 'core'))
  })
}

test('effective options bind fresh report and installed TAP plugin, without mutating input', () => {
  const input = config()
  const effective = effectiveOptions(input, ['src/core.mjs'], '/fresh/report.json', '/local/tap.js')
  assert.deepEqual(input, config())
  assert.equal(effective.jsonReporter.fileName, '/fresh/report.json')
  assert.deepEqual(effective.plugins, ['/local/tap.js'])
  assert.equal(effective.incremental, false)
  assert.equal(effective.ignoreStatic, false)
  assert.equal(effective.allowEmpty, false)
  assert.deepEqual(effective.thresholds, { high: 100, low: 100, break: 100 })
})

function evaluate(statuses, scope = 'core', edit = () => {}) {
  const options = effectiveOptions(config(scope), [`src/${scope}.mjs`], '/fresh/report.json', '/local/tap.js')
  const value = report(options, '/repo', statuses)
  edit(value)
  return validateReport(value, { root: '/repo', options, sources: { [`src/${scope}.mjs`]: source } })
}

test('native detected score counts timeouts, never rounds a failed gate upward', () => {
  assert.equal(evaluate(['Killed', 'Timeout']).score, 100)
  assert.equal(evaluate(['Killed', 'Killed', 'Killed', 'Killed', 'Survived'], 'boundary').passed, true)
  assert.equal(evaluate(['Killed', 'Killed', 'Killed', 'NoCoverage'], 'boundary').passed, false)
  assert.equal(evaluate(['Killed', 'Survived']).passed, false)
})

for (const status of ['Ignored', 'Pending', 'CompileError', 'RuntimeError', 'unknown']) {
  test(`report cannot pass with ${status}`, () => assert.throws(() => evaluate([status])))
}

const malformedReports = {
  version: (r) => { r.schemaVersion = '2.0' },
  root: (r) => { r.projectRoot = '/other' },
  framework: (r) => { r.framework.name = 'Other' },
  files: (r) => { r.files = [] },
  missingFile: (r) => { r.files = {} },
  extraFile: (r) => { r.files['src/other.mjs'] = r.files['src/core.mjs'] },
  source: (r) => { r.files['src/core.mjs'].source = 'old source' },
  mutants: (r) => { r.files['src/core.mjs'].mutants = [] },
  shape: (r) => { r.files['src/core.mjs'].mutants = {} },
  id: (r) => { r.files['src/core.mjs'].mutants[0].id = null },
  duplicate: (r) => { r.files['src/core.mjs'].mutants.push(r.files['src/core.mjs'].mutants[0]) },
  position: (r) => { r.files['src/core.mjs'].mutants[0].location.start.line = 0 },
  replacement: (r) => { delete r.files['src/core.mjs'].mutants[0].replacement },
  mutator: (r) => { r.files['src/core.mjs'].mutants[0].mutatorName = '' },
  threshold: (r) => { r.thresholds = { high: 80, low: 80, break: 80 } },
  stale: (r) => { r.config = { ...r.config, jsonReporter: { fileName: '/previous/report.json' } } },
  scope: (r) => { r.config = { ...r.config, mutate: ['src/other.mjs'] } },
  ignoredSource: (r) => { r.config.ignorePatterns = ['src/core.mjs'] },
  excludedOperator: (r) => { r.config.mutator = { excludedMutations: ['NumberLiteral'] } },
  additionalPlugin: (r) => { r.config.appendPlugins = ['fake'] },
  backwards: (r) => { r.files['src/core.mjs'].mutants[0].location.end.column = 1 },
  noLocation: (r) => { delete r.files['src/core.mjs'].mutants[0].location },
}
for (const [name, edit] of Object.entries(malformedReports)) {
  test(`reject malformed or unexpected report: ${name}`, () => assert.throws(() => evaluate(['Killed'], 'core', edit)))
}

test('CLI requires explicit inputs and refuses flags that could override gates', () => {
  const args = ['--root', '/repo', '--package', 'pkg', '--core', 'core.json', '--boundary', 'boundary.json', '--evidence', 'ev']
  assert.deepEqual(parseArgs(args), { root: '/repo', package: 'pkg', core: 'core.json', boundary: 'boundary.json', evidence: 'ev', coreOnly: false })
  assert.equal(parseArgs([...args, '--core-only']).coreOnly, true)
  for (const bad of [[], [...args, '--threshold', '0'], [...args, '--core', 'other'], args.slice(0, -1), [...args, '--core-only', '--core-only']]) {
    assert.throws(() => parseArgs(bad))
  }
})

test('explicit supported tuning survives config snapshot and native report defaults', () => {
  const input = { ...config(), coverageAnalysis: 'off', concurrency: 1, timeoutMS: 1000,
    timeoutFactor: 1.5, dryRunTimeoutMinutes: 2, maxTestRunnerReuse: 10,
    disableBail: false, logLevel: 'warn',
    tap: { testFiles: ['tests/*.mjs'], forceBail: false, nodeArgs: ['--test-reporter=tap'] } }
  assert.equal(validateConfig(input, 'core'), 100)
  const options = effectiveOptions(input, input.mutate, '/new/report.json', '/tap.js')
  const value = report(options, '/repo')
  value.config = { ...options, ignorePatterns: [], appendPlugins: [], mutator: { excludedMutations: [] } }
  assert.equal(validateReport(value, { root: '/repo', options, sources: { 'src/core.mjs': source } }).passed, true)
})