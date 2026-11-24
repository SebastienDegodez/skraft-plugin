import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	coreSourceFiles, isCoreFile, mockHits,
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

test('mocking libraries are detected in core sources and unit tests', () => {
	const text = ['from unittest.mock import MagicMock', 'import mock', 'def test_x(mocker):', '@patch("a.b")', 'fake = InMemoryMock()', 'x = Mock()'].join('\n')
	assert.deepEqual(mockHits('t.py', text).map((hit) => hit.split(':')[1]), ['1', '2', '3', '4', '6'])
})
