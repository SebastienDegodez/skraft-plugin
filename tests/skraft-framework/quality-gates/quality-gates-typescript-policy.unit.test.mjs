import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	architectureRuleProblems, effectiveConfig, hasRuntimeCode, matchSources, mockHits, mutationVerdict, suppressionProblems, validateConfig,
} from '../../../plugins/skraft-framework/skills/quality-gates-typescript/scripts/gate-policy.mjs'

const report = (...statuses) => ({ files: { 'src/a.ts': { mutants: statuses.map((status, index) => ({ status, mutatorName: 'BooleanLiteral', location: { start: { line: index + 1 } } })) } } })

test('the score counts killed and timed-out mutants over every tested one', () => {
	const verdict = mutationVerdict(report('Killed', 'Timeout', 'Survived', 'NoCoverage', 'Ignored'), 'boundary')
	assert.equal(verdict.score, 50)
	assert.equal(verdict.suppressed, 1)
	assert.equal(verdict.passed, false)
	assert.deepEqual(verdict.survivors.map((s) => s.line), [3, 4])
})

test('pending, compile and runtime errors fail the verdict instead of shrinking the denominator', () => {
	assert.match(mutationVerdict(report('Killed', 'Pending'), 'core').problems.join(), /never ran/)
	assert.match(mutationVerdict(report('Killed', 'RuntimeError'), 'core').problems.join(), /compile or runtime error/)
	assert.match(mutationVerdict(report('Ignored'), 'core').problems.join(), /no mutant was tested/)
	assert.equal(mutationVerdict({ files: {} }, 'core').passed, true)
})

test('a type-only file has no runtime code; anything executable does', () => {
	assert.equal(hasRuntimeCode("import type { A } from './a'\n\nexport interface Gateway {\n  list(): Promise<A[]>\n}\n\nexport type View = {\n  readonly id: string\n}\n"), false)
	assert.equal(hasRuntimeCode('// only a comment\nexport type Id = string\n'), false)
	assert.equal(hasRuntimeCode('export type Id = string\nexport const none: Id = ""\n'), true)
	assert.equal(hasRuntimeCode('export class ListTodos {}\n'), true)
	assert.equal(hasRuntimeCode('export enum Status { Open, Done }\n'), true)
})

test('only one-line disable comments with a reason are accepted', () => {
	assert.deepEqual(suppressionProblems('a.ts', '// Stryker disable next-line StringLiteral: the label is only displayed\n'), [])
	assert.equal(suppressionProblems('a.ts', '// Stryker disable next-line StringLiteral\n').length, 1)
	assert.equal(suppressionProblems('a.ts', '// Stryker disable all: legacy\n').length, 1)
	assert.equal(suppressionProblems('a.ts', '// Stryker restore all\n').length, 1)
})

test('configs accept the Vitest runner and positive patterns only', () => {
	assert.deepEqual(validateConfig({ testRunner: 'vitest', mutate: ['./src/*/application/**/*.ts'], vitest: { related: false } }, 'core').mutate, ['src/*/application/**/*.ts'])
	assert.throws(() => validateConfig({ testRunner: 'vitest', mutate: ['src/../x/*.ts'] }, 'core'), /inside the package/)
	assert.throws(() => validateConfig({ testRunner: 'vitest', mutate: ['src/a.ts:1-3'] }, 'core'), /line ranges/)
	assert.throws(() => validateConfig({ testRunner: 'vitest', mutate: ['src/**/*.ts'], ignorers: ['x'] }, 'core'), /Unsupported Stryker option ignorers/)
	assert.throws(() => validateConfig({ testRunner: 'vitest', mutate: ['src/**/*.ts'], vitest: { project: 'x' } }, 'core'), /vitest accepts only/)
})

test('pattern matching skips declaration files and non-sources', () => {
	assert.deepEqual(matchSources(['src/a/application/X.ts', 'src/a/application/types.d.ts', 'src/a/application/x.css', 'src/a/ui/Y.tsx'], ['src/*/application/**/*.{ts,tsx}']), ['src/a/application/X.ts'])
})

test('the effective config carries no threshold or reuse of its own', () => {
	const effective = effectiveConfig({ vitest: {}, coverageAnalysis: 'perTest' }, ['src/a.ts'], 'evidence/report.json')
	assert.deepEqual(effective.thresholds, { high: 100, low: 0, break: null })
	assert.equal(effective.incremental, false)
	assert.deepEqual(effective.reporters, ['json', 'clear-text'])
})

test('Vitest doubles, mocking libraries and MSW are mock hits; a hand-written fake is not', () => {
	assert.equal(mockHits('t.ts', "vi.mock('../x')\nconst spy = vi.spyOn(a, 'b')\nimport { mock } from 'vitest-mock-extended'\n").length, 3)
	assert.deepEqual(mockHits('t.ts', 'class InMemoryTodoGateway {}\nconst saved: string[] = []\n'), [])
})

test('the architecture gate wants both boundaries rules as errors', () => {
	assert.deepEqual(architectureRuleProblems({ 'boundaries/dependencies': [2, {}], 'boundaries/no-unknown-files': 'error' }), [])
	assert.deepEqual(architectureRuleProblems({ 'boundaries/element-types': ['error'], 'boundaries/no-unknown-files': [2] }), [])
	assert.equal(architectureRuleProblems({ 'boundaries/dependencies': [1, {}] }).length, 2)
})
