import assert from 'node:assert/strict'
import { test } from 'node:test'

import { priceOf } from '../src/price.js'

const twoCoffees = [{ price: 5, quantity: 2 }]
const expired = { status: 'expired' }

test('an expired member pays the standard price', () => {
  assert.equal(priceOf({ items: twoCoffees, member: expired }), 10)
})
