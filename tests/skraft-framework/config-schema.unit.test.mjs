import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isOk, isErr } from '../../plugins/src/domain/result.mjs'
import { validateConfig, DEPTH_TIERS, DEFAULT_DEPTH_TIER, TRACKING_LAYOUTS, DEFAULT_TRACKING_LAYOUT } from '../../plugins/src/domain/config-schema.mjs'

// ─── constants ─────────────────────────────────────────────────────────────────

test('config-schema: exposes the four depth tiers and comprehensive default', () => {
  assert.deepEqual([...DEPTH_TIERS].sort(), ['basic', 'comprehensive', 'custom', 'standard'])
  assert.equal(DEFAULT_DEPTH_TIER, 'comprehensive')
})

test('config-schema: exposes the two tracking layouts and namespaced default', () => {
  assert.deepEqual([...TRACKING_LAYOUTS].sort(), ['bare', 'namespaced'])
  assert.equal(DEFAULT_TRACKING_LAYOUT, 'namespaced')
})

// ─── trackingLayout ──────────────────────────────────────────────────────────

test('validateConfig: coerces missing trackingLayout to the namespaced default', () => {
  const r = validateConfig({ depthTier: 'standard' })
  assert.ok(isOk(r))
  assert.equal(r.value.trackingLayout, 'namespaced')
})

test('validateConfig: coerces an unknown trackingLayout to the default', () => {
  const r = validateConfig({ trackingLayout: 'sideways' })
  assert.ok(isOk(r))
  assert.equal(r.value.trackingLayout, 'namespaced')
})

for (const layout of ['namespaced', 'bare']) {
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
  const r = validateConfig({ depthTier: 'standard' })
  assert.ok(isOk(r))
  assert.equal(r.value.depthTier, 'standard')
  assert.ok(Object.isFrozen(r.value))
})

test('validateConfig: coerces missing depthTier to the comprehensive default', () => {
  const r = validateConfig({})
  assert.ok(isOk(r))
  assert.equal(r.value.depthTier, 'comprehensive')
})

test('validateConfig: coerces an unknown depthTier to the default', () => {
  const r = validateConfig({ depthTier: 'turbo' })
  assert.ok(isOk(r))
  assert.equal(r.value.depthTier, 'comprehensive')
})

for (const tier of ['basic', 'standard', 'comprehensive', 'custom']) {
  test(`validateConfig: accepts depthTier '${tier}'`, () => {
    const r = validateConfig({ depthTier: tier })
    assert.ok(isOk(r))
    assert.equal(r.value.depthTier, tier)
  })
}

test('validateConfig: rejects a non-object input', () => {
  assert.ok(isErr(validateConfig(null)))
  assert.ok(isErr(validateConfig([])))
  assert.equal(validateConfig(null).error.code, 'INVALID_CONFIG')
})

test('validateConfig: round-trip fidelity — preserves unknown fields verbatim', () => {
  const raw = { depthTier: 'standard', depthTierRationale: 'small repo', teamOwner: 'platform', nested: { a: 1 } }
  const r = validateConfig(raw)
  assert.ok(isOk(r))
  assert.equal(r.value.depthTierRationale, 'small repo')
  assert.equal(r.value.teamOwner, 'platform')
  assert.deepEqual(r.value.nested, { a: 1 })
})

test('validateConfig: a numeric depthTier coerces to default (type guard)', () => {
  const r = validateConfig({ depthTier: 3 })
  assert.ok(isOk(r))
  assert.equal(r.value.depthTier, 'comprehensive')
})

test('validateConfig: a non-object scalar (string) is rejected', () => {
  const r = validateConfig('nope')
  assert.ok(isErr(r))
  assert.equal(r.error.code, 'INVALID_CONFIG')
})

test('validateConfig: a number input is rejected', () => {
  assert.ok(isErr(validateConfig(42)))
})
