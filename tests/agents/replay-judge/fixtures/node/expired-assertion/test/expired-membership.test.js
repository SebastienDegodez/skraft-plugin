import assert from 'node:assert/strict'
import { test } from 'node:test'

import { priceOf } from '../src/price.js'

test('an expired member pays the standard price', () => {
  assert.equal(priceOf({ items: [{ price: 5, quantity: 2 }], member: { status: 'expired' } }), 10)
})
