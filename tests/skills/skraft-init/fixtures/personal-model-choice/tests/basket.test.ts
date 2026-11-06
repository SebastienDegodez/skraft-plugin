import { expect, test } from 'vitest'
import { total } from '../src/storefront/basket.ts'

test('a basket totals its lines', () => {
  expect(total([1000, 500])).toBe(1500)
})
