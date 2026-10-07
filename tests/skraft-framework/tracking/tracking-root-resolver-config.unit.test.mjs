import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveTrackingRoot } from '../../../plugins/skraft-framework/src/adapters/infrastructure/tracking-root-resolver.mjs'

// The resolved base never depends on the layout value (one layout today), so these
// tests observe the config lookup itself: an env double records which variables the
// resolver reads.
const recordingEnv = (values) => {
  const reads = []
  const env = new Proxy(values, {
    get: (target, key) => {
      reads.push(key)
      return target[key]
    },
  })
  return { env, reads }
}

const withTempCwd = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'skraft-track-config-'))
  try { return fn(dir) } finally { rmSync(dir, { recursive: true, force: true }) }
}

test('resolveTrackingRoot: without a layout env, the config root is consulted', () => withTempCwd((cwd) => {
  writeFileSync(join(cwd, 'skraft-config.json'), JSON.stringify({ trackingLayout: 'namespaced' }))
  const { env, reads } = recordingEnv({ SKRAFT_CONFIG_ROOT: cwd })
  assert.equal(resolveTrackingRoot({ env, cwd }), join(cwd, '.copilot-tracking', 'skraft-plans'))
  assert.ok(reads.includes('SKRAFT_CONFIG_ROOT'))
}))

test('resolveTrackingRoot: an env layout skips the config lookup entirely', () => withTempCwd((cwd) => {
  const { env, reads } = recordingEnv({ SKRAFT_TRACKING_LAYOUT: 'namespaced', SKRAFT_CONFIG_ROOT: cwd })
  assert.equal(resolveTrackingRoot({ env, cwd }), join(cwd, '.copilot-tracking', 'skraft-plans'))
  assert.equal(reads.includes('SKRAFT_CONFIG_ROOT'), false)
}))

test('resolveTrackingRoot: an explicit tracking root skips every other variable', () => {
  const { env, reads } = recordingEnv({ SKRAFT_TRACKING_ROOT: '/explicit', SKRAFT_TRACKING_LAYOUT: 'bare' })
  assert.equal(resolveTrackingRoot({ env, cwd: '/ignored' }), '/explicit')
  assert.ok(reads.includes('SKRAFT_TRACKING_ROOT'))
  assert.equal(reads.includes('SKRAFT_TRACKING_LAYOUT'), false)
  assert.equal(reads.includes('SKRAFT_CONFIG_ROOT'), false)
})

test('resolveTrackingRoot: a null or corrupt config never throws', () => withTempCwd((cwd) => {
  for (const raw of ['null', '{ broken', '[]', '"bare"']) {
    writeFileSync(join(cwd, 'skraft-config.json'), raw)
    assert.equal(resolveTrackingRoot({ env: {}, cwd }), join(cwd, '.copilot-tracking', 'skraft-plans'))
  }
}))
