import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Membership } from '../src/membership.js'
import { priceOf } from '../src/price.js'

test('an expired member pays the standard price', () => {
  const member = Membership.expiredOn('2026-10-31')
  assert.equal(priceOf({ items: [{ price: 5, quantity: 2 }], member }), 10)
})
