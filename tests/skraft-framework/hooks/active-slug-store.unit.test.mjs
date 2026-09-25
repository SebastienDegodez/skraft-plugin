import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { firstValidProjectSlug, isValidProjectSlug } from '../../../plugins/skraft-framework/src/domain/value-objects.mjs'
import { createActiveSlugStore, ACTIVE_SLUG_FILE } from '../../../plugins/skraft-framework/src/adapters/infrastructure/active-slug-store.mjs'

test('isValidProjectSlug: kebab-case only', () => {
  for (const slug of ['a', 'checkout-pricing', 'us-12-x']) assert.equal(isValidProjectSlug(slug), true, slug)
  for (const slug of ['', 'Checkout', '../x', 'a/b', 'a.b', '-a', 'a-', 'a--b', null, undefined, 7]) {
    assert.equal(isValidProjectSlug(slug), false, String(slug))
  }
})

test('firstValidProjectSlug: the first valid candidate wins, invalid ones are skipped', () => {
  assert.equal(firstValidProjectSlug('first', 'second'), 'first')
  assert.equal(firstValidProjectSlug(undefined, '../etc', 'second'), 'second')
  assert.equal(firstValidProjectSlug(undefined, null), null)
  assert.equal(firstValidProjectSlug(), null)
})

test('active slug store: writes the pointer, reads it back trimmed, ignores anything malformed', () => {
  const root = mkdtempSync(join(tmpdir(), 'skraft-store-'))
  try {
    const store = createActiveSlugStore(join(root, 'nested', 'deeper'))
    assert.equal(store.read(), null, 'no pointer yet')
    store.write('checkout-pricing')
    assert.equal(readFileSync(join(root, 'nested', 'deeper', ACTIVE_SLUG_FILE), 'utf8'), 'checkout-pricing\n')
    assert.equal(store.read(), 'checkout-pricing')
    writeFileSync(join(root, 'nested', 'deeper', ACTIVE_SLUG_FILE), '../../etc\n')
    assert.equal(store.read(), null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
