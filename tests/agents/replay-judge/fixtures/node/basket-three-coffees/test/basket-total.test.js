import assert from 'node:assert/strict'
import { test } from 'node:test'

import { priceOf } from '../src/price.js'

test('a basket without membership pays the sum of its items', () => {
  assert.equal(priceOf({ items: [{ price: 4, quantity: 2 }, { price: 2, quantity: 1 }], member: null }), 10)
})

test('an active member gets ten percent off', () => {
  assert.equal(priceOf({ items: [{ price: 5, quantity: 3 }], member: { status: 'active' } }), 9)
})
