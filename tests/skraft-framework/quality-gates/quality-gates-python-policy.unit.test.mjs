import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	LIMITS, bindInterpreter, coverageVerdict, mockHits, mutationVerdict, noCoverHits, pragmaProblems, renderConfig, selectChanged, validateConfig,
} from '../../../plugins/skraft-framework/skills/quality-gates-python/scripts/gate-policy.mjs'

const table = (patch = {}) => ({
	'cosmic-ray': {
		'module-path': ['src/shop/domain', 'src/shop/application'], timeout: 30, 'excluded-modules': [],
		'test-command': 'python -m pytest -x -q tests/unit', distributor: { name: 'local' }, ...patch,
	},
})

test('the thresholds are the quality bar: 100 core, 80 boundary', () => {
	assert.deepEqual({ ...LIMITS }, { core: 100, boundary: 80 })
})

test('a checked-in config normalizes to module paths, timeout and test command', () => {
	assert.deepEqual(validateConfig(table(), 'core'), {
		modulePaths: ['src/shop/domain', 'src/shop/application'], timeout: 30, testCommand: 'python -m pytest -x -q tests/unit',
	})
	assert.deepEqual(validateConfig(table({ 'module-path': './src/shop/api' }), 'boundary').modulePaths, ['src/shop/api'])
})

const unsafe = {
	unknownScope: [table(), 'other'],
	extraTable: [{ ...table(), tool: {} }, 'core'],
	filters: [table({ filters: { 'git-filter': { branch: 'main' } } }), 'core'],
	exclusions: [table({ 'excluded-modules': ['src/shop/domain/legacy.py'] }), 'core'],
	traversal: [table({ 'module-path': ['../other/src'] }), 'core'],
	absolute: [table({ 'module-path': ['/srv/src'] }), 'core'],
	drive: [table({ 'module-path': ['C:/src'] }), 'core'],
	pattern: [table({ 'module-path': ['src/**/domain'] }), 'core'],
	duplicate: [table({ 'module-path': ['src/a', './src/a'] }), 'core'],
	noTimeout: [table({ timeout: 0 }), 'core'],
	noTests: [table({ 'test-command': ' ' }), 'core'],
	httpDistributor: [table({ distributor: { name: 'http', http: { 'worker-urls': [] } } }), 'core'],
}
for (const [name, [config, scope]] of Object.entries(unsafe)) {
	test(`reject unsafe config: ${name}`, () => assert.throws(() => validateConfig(config, scope)))
}

test('the rendered config is the validated subset with a local distributor', () => {
	const text = renderConfig({ modulePaths: ['src/shop/domain/order.py'], timeout: 30, testCommand: 'python -m pytest -q "tests/unit"' })
	assert.match(text, /^\[cosmic-ray\]\nmodule-path = \["src\/shop\/domain\/order.py"\]\ntimeout = 30.0\nexcluded-modules = \[\]\ntest-command = "python -m pytest -q \\"tests\/unit\\""\n\n\[cosmic-ray.distributor\]\nname = "local"\n$/)
	assert.throws(() => renderConfig({ modulePaths: [], timeout: 1, testCommand: 'x' }))
})

test('a leading python in the test command becomes the quoted project interpreter', () => {
	assert.equal(bindInterpreter('python -m pytest -x tests/unit', 'C:\\repo\\.venv\\Scripts\\python.exe'), "'C:\\repo\\.venv\\Scripts\\python.exe' -m pytest -x tests/unit")
	assert.equal(bindInterpreter('python3 -m pytest', '/r/.venv/bin/python'), "'/r/.venv/bin/python' -m pytest")
	assert.equal(bindInterpreter('pytest -x', '/r/.venv/bin/python'), 'pytest -x')
	assert.equal(bindInterpreter('python3.12 -m pytest', '/r/.venv/bin/python'), 'python3.12 -m pytest')
	assert.throws(() => bindInterpreter('python -m pytest', "/it's/python"), /single quote/)
})

test('--since keeps only the scope files that changed', () => {
	assert.deepEqual(selectChanged(['src/a.py', 'src/b.py'], ['src\\b.py', 'README.md']), ['src/b.py'])
})

const item = (line, operator = 'core/AddNot') => ({ mutations: [{ module_path: 'src/shop/domain/order.py', start_pos: [line, 0], operator_name: operator, occurrence: 0 }] })
const result = (test_outcome, worker_outcome = 'normal') => ({ worker_outcome, test_outcome })

test('core passes only with every tested mutant killed; suppressed and incompetent mutants stay visible', () => {
	const pass = mutationVerdict([JSON.stringify([item(1), result('killed')]), JSON.stringify([item(2), result('incompetent')]), JSON.stringify([item(3), result(null, 'skipped')]), ''], 'core')
	assert.equal(pass.passed, true)
	assert.deepEqual([pass.killed, pass.incompetent, pass.suppressed, pass.score], [1, 1, 1, 100])
	const fail = mutationVerdict([JSON.stringify([item(1), result('killed')]), JSON.stringify([item(9), result('survived')])], 'core')
	assert.equal(fail.passed, false)
	assert.deepEqual(fail.survivors, [{ module: 'src/shop/domain/order.py', line: 9, operator: 'core/AddNot', occurrence: 0 }])
	assert.match(fail.problems.join(), /50.00% is below 100%/)
})

test('boundary passes at 80 and fails below', () => {
	const lines = (killed, survived) => [...Array(killed).fill(JSON.stringify([item(1), result('killed')])), ...Array(survived).fill(JSON.stringify([item(2), result('survived')]))]
	assert.equal(mutationVerdict(lines(4, 1), 'boundary').passed, true)
	assert.equal(mutationVerdict(lines(3, 1), 'boundary').passed, false)
})

test('a mutant that never ran, a worker error or nothing tested fails the gate', () => {
	assert.equal(mutationVerdict([JSON.stringify([item(1), null])], 'core').passed, false)
	assert.equal(mutationVerdict([JSON.stringify([item(1), result(null, 'exception')])], 'core').passed, false)
	assert.equal(mutationVerdict([JSON.stringify([item(1), result('incompetent')])], 'core').passed, false)
	assert.equal(mutationVerdict([], 'core').passed, true)
})

test('a no-mutate pragma needs a reason', () => {
	assert.deepEqual(pragmaProblems('a.py', '@final  # pragma: no mutate -- typing.final has no runtime effect\n'), [])
	assert.equal(pragmaProblems('a.py', 'x = 1  # pragma: no mutate\n').length, 1)
	assert.equal(pragmaProblems('a.py', 'x = 1  # pragma: no mutate -- ok\n').length, 1)
})

const coverage = (files) => ({ files: Object.fromEntries(Object.entries(files).map(([name, [statements, missing]]) => [name, {
	summary: { num_statements: statements, covered_lines: statements - missing.length, missing_lines: missing.length }, missing_lines: missing,
}])) })

test('coverage passes at 100% of the core files and names every uncovered line', () => {
	assert.equal(coverageVerdict(coverage({ 'src/d/a.py': [4, []], 'src/x/other.py': [9, [1]] }), ['src/d/a.py']).passed, true)
	const fail = coverageVerdict(coverage({ 'src\\d\\a.py': [4, [3]] }), ['src/d/a.py'])
	assert.equal(fail.passed, false)
	assert.deepEqual(fail.missing, ['src/d/a.py: 3'])
})

test('coverage fails on an unimported core file, nothing measured, or a no-cover pragma', () => {
	assert.equal(coverageVerdict(coverage({ 'src/d/a.py': [4, []] }), ['src/d/a.py', 'src/d/b.py']).passed, false)
	assert.equal(coverageVerdict(coverage({}), ['src/d/a.py']).passed, false)
	assert.equal(coverageVerdict(coverage({ 'src/d/a.py': [4, []] }), ['src/d/a.py'], ['src/d/a.py:3: # pragma: no cover']).passed, false)
	assert.deepEqual(noCoverHits('a.py', 'x = 1\nif y:  # pragma: no cover\n'), ['a.py:2: if y:  # pragma: no cover'])
})

test('mocking libraries are detected in core sources and unit tests', () => {
	const text = ['from unittest.mock import MagicMock', 'import mock', 'def test_x(mocker):', '@patch("a.b")', 'fake = InMemoryMock()', 'x = Mock()'].join('\n')
	assert.deepEqual(mockHits('t.py', text).map((hit) => hit.split(':')[1]), ['1', '2', '3', '4', '6'])
})
