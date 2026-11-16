import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	coreRoots, coreSourceFiles, coverageVerdict, isCoreFile, mockHits, noCoverHits,
} from '../../../plugins/skraft-framework/skills/quality-gates-python/scripts/gate-policy.mjs'

test('core is any source under a folder whose last word is domain or application, tests left out', () => {
	for (const file of ['src/shop/domain/order.py', 'src/shop/application/place.py', 'billing_domain/rules.py', 'src/Checkout.Application/x.py', 'src/cart-domain/__init__.py']) {
		assert.equal(isCoreFile(file), true, file)
	}
	for (const file of ['src/shop/api/routes.py', 'src/shop/infrastructure/db.py', 'src/domainx/a.py', 'tests/unit/domain/test_order.py', 'src/shop/domain/test_order.py', 'src/shop/domain/order_test.py', 'src/shop/domain/conftest.py', 'src/shop/domain/order.txt', 'src/shop/domain.py']) {
		assert.equal(isCoreFile(file), false, file)
	}
	assert.deepEqual(coreSourceFiles(['b/domain/x.py', 'a/application/y.py', 'a/api/z.py', 'a\\domain\\w.py']), ['a/application/y.py', 'a/domain/w.py', 'b/domain/x.py'])
})

test('coverage measures from each core folder', () => {
	assert.deepEqual(coreRoots(['src/shop/domain/order.py', 'src/shop/domain/sub/x.py', 'src/shop/application/a.py', 'billing_domain/r.py']), ['billing_domain', 'src/shop/application', 'src/shop/domain'])
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
