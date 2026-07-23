import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveTrackingLayout,
  stateBaseSegments,
  stateDirSegments,
} from '../../plugins/src/domain/tracking-layout-policy.mjs'

// ─── resolveTrackingLayout ──────────────────────────────────────────────────

test('resolveTrackingLayout: keeps a known layout', () => {
  assert.equal(resolveTrackingLayout('bare'), 'bare')
  assert.equal(resolveTrackingLayout('namespaced'), 'namespaced')
})

test('resolveTrackingLayout: coerces unknown / missing / wrong-type to namespaced', () => {
  assert.equal(resolveTrackingLayout('sideways'), 'namespaced')
  assert.equal(resolveTrackingLayout(undefined), 'namespaced')
  assert.equal(resolveTrackingLayout(null), 'namespaced')
  assert.equal(resolveTrackingLayout(7), 'namespaced')
})

// ─── stateBaseSegments ──────────────────────────────────────────────────────

test('stateBaseSegments: namespaced points at skraft-plans (legacy)', () => {
  assert.deepEqual(stateBaseSegments('namespaced'), ['.copilot-tracking', 'skraft-plans'])
})

test('stateBaseSegments: bare points at the dedicated skraft control dir', () => {
  assert.deepEqual(stateBaseSegments('bare'), ['.copilot-tracking', 'skraft'])
})

test('stateBaseSegments: an unknown layout falls back to namespaced', () => {
  assert.deepEqual(stateBaseSegments('turbo'), ['.copilot-tracking', 'skraft-plans'])
})

// ─── stateDirSegments ───────────────────────────────────────────────────────

test('stateDirSegments: appends the slug under the layout base', () => {
  assert.deepEqual(stateDirSegments('namespaced', 'my-proj'), ['.copilot-tracking', 'skraft-plans', 'my-proj'])
  assert.deepEqual(stateDirSegments('bare', 'my-proj'), ['.copilot-tracking', 'skraft', 'my-proj'])
})
