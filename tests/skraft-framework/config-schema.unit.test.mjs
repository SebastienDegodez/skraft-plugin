import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isOk, isErr } from '../../plugins/skraft-framework/src/domain/result.mjs'
import { validateConfig, TRACKING_LAYOUTS, DEFAULT_TRACKING_LAYOUT } from '../../plugins/skraft-framework/src/domain/config-schema.mjs'

// ─── constants ─────────────────────────────────────────────────────────────────

test('config-schema: exposes the namespaced tracking layout as the only layout and default', () => {
  assert.deepEqual([...TRACKING_LAYOUTS], ['namespaced'])
  assert.equal(DEFAULT_TRACKING_LAYOUT, 'namespaced')
})

// ─── trackingLayout ──────────────────────────────────────────────────────────

test('validateConfig: coerces missing trackingLayout to the namespaced default', () => {
  const r = validateConfig({})
  assert.ok(isOk(r))
  assert.equal(r.value.trackingLayout, 'namespaced')
})

test('validateConfig: coerces an unknown trackingLayout to the default', () => {
  const r = validateConfig({ trackingLayout: 'sideways' })
  assert.ok(isOk(r))
  assert.equal(r.value.trackingLayout, 'namespaced')
})

for (const layout of ['namespaced']) {
  test(`validateConfig: accepts trackingLayout '${layout}'`, () => {
    const r = validateConfig({ trackingLayout: layout })
    assert.ok(isOk(r))
    assert.equal(r.value.trackingLayout, layout)
  })
}

test('validateConfig: a numeric trackingLayout coerces to default (type guard)', () => {
  const r = validateConfig({ trackingLayout: 7 })
  assert.ok(isOk(r))
  assert.equal(r.value.trackingLayout, 'namespaced')
})

// ─── validateConfig ────────────────────────────────────────────────────────────

test('validateConfig: accepts a well-formed config and freezes it', () => {
  const r = validateConfig({ trackingLayout: 'namespaced' })
  assert.ok(isOk(r))
  assert.equal(r.value.trackingLayout, 'namespaced')
  assert.ok(Object.isFrozen(r.value))
})

test('validateConfig: rejects a non-object input', () => {
  assert.ok(isErr(validateConfig(null)))
  assert.ok(isErr(validateConfig([])))
  assert.equal(validateConfig(null).error.code, 'INVALID_CONFIG')
})

test('validateConfig: round-trip fidelity — preserves unknown fields verbatim', () => {
  const raw = { trackingLayout: 'namespaced', teamOwner: 'platform', nested: { a: 1 } }
  const r = validateConfig(raw)
  assert.ok(isOk(r))
  assert.equal(r.value.teamOwner, 'platform')
  assert.deepEqual(r.value.nested, { a: 1 })
})

// The depth-tier dial was removed. A repo whose skraft-config.json still carries the
// key is not corrupt and is not migrated: `depthTier` is now an ordinary unknown field,
// so fidelity carries it through untouched rather than scrubbing someone's file. The
// key governs nothing — it is no longer settable, no longer read, and no longer echoed.
test('validateConfig: a legacy depthTier survives as an ordinary unknown field', () => {
  const r = validateConfig({ depthTier: 'basic', depthTierRationale: 'small repo' })
  assert.ok(isOk(r))
  assert.equal(r.value.depthTier, 'basic')
  assert.equal(r.value.depthTierRationale, 'small repo')
  assert.equal(r.value.trackingLayout, 'namespaced')
})

test('validateConfig: a non-object scalar (string) is rejected', () => {
  const r = validateConfig('nope')
  assert.ok(isErr(r))
  assert.equal(r.error.code, 'INVALID_CONFIG')
})

test('validateConfig: a number input is rejected', () => {
  assert.ok(isErr(validateConfig(42)))
})
