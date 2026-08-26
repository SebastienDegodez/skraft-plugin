import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveTrackingRoot } from '../../plugins/skraft-framework/src/adapters/infrastructure/tracking-root-resolver.mjs'

const withTempCwd = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'skraft-track-'))
  try { return fn(dir) } finally { rmSync(dir, { recursive: true, force: true }) }
}
const writeConfig = (dir, obj) => writeFileSync(join(dir, 'skraft-config.json'), JSON.stringify(obj), 'utf8')

test('resolveTrackingRoot: SKRAFT_TRACKING_ROOT wins outright (back-compat)', () => {
  withTempCwd((cwd) => {
    writeConfig(cwd, { trackingLayout: 'namespaced' })
    const root = resolveTrackingRoot({ env: { SKRAFT_TRACKING_ROOT: '/explicit/root' }, cwd })
    assert.equal(root, '/explicit/root')
  })
})

test('resolveTrackingRoot: SKRAFT_TRACKING_LAYOUT env override resolves the correct dir', () => {
  withTempCwd((cwd) => {
    const root = resolveTrackingRoot({ env: { SKRAFT_TRACKING_LAYOUT: 'namespaced' }, cwd })
    assert.equal(root, join(cwd, '.copilot-tracking', 'skraft-plans'))
  })
})

test('resolveTrackingRoot: env layout overrides the config file', () => {
  withTempCwd((cwd) => {
    writeConfig(cwd, { trackingLayout: 'namespaced' })
    const root = resolveTrackingRoot({ env: { SKRAFT_TRACKING_LAYOUT: 'namespaced', SKRAFT_CONFIG_ROOT: cwd }, cwd })
    assert.equal(root, join(cwd, '.copilot-tracking', 'skraft-plans'))
  })
})

test('resolveTrackingRoot: reads trackingLayout=namespaced from skraft-config.json', () => {
  withTempCwd((cwd) => {
    writeConfig(cwd, { trackingLayout: 'namespaced' })
    const root = resolveTrackingRoot({ env: { SKRAFT_CONFIG_ROOT: cwd }, cwd })
    assert.equal(root, join(cwd, '.copilot-tracking', 'skraft-plans'))
  })
})

test('resolveTrackingRoot: config trackingLayout=namespaced resolves the legacy dir', () => {
  withTempCwd((cwd) => {
    writeConfig(cwd, { trackingLayout: 'namespaced' })
    const root = resolveTrackingRoot({ env: { SKRAFT_CONFIG_ROOT: cwd }, cwd })
    assert.equal(root, join(cwd, '.copilot-tracking', 'skraft-plans'))
  })
})

test('resolveTrackingRoot: reads the config from SKRAFT_CONFIG_ROOT, not cwd', () => {
  withTempCwd((configDir) => {
    withTempCwd((cwd) => {
      // config lives in a SEPARATE dir; cwd has none. The layout must come from configDir.
      writeConfig(configDir, { trackingLayout: 'namespaced' })
      const root = resolveTrackingRoot({ env: { SKRAFT_CONFIG_ROOT: configDir }, cwd })
      assert.equal(root, join(cwd, '.copilot-tracking', 'skraft-plans'), 'layout resolved from SKRAFT_CONFIG_ROOT')
    })
  })
})

test('resolveTrackingRoot: no config file falls back to namespaced (default, fail-open)', () => {
  withTempCwd((cwd) => {
    const root = resolveTrackingRoot({ env: { SKRAFT_CONFIG_ROOT: cwd }, cwd })
    assert.equal(root, join(cwd, '.copilot-tracking', 'skraft-plans'))
  })
})

test('resolveTrackingRoot: a corrupt config file falls back to namespaced (fail-open, never throws)', () => {
  withTempCwd((cwd) => {
    writeFileSync(join(cwd, 'skraft-config.json'), '{ not json', 'utf8')
    const root = resolveTrackingRoot({ env: { SKRAFT_CONFIG_ROOT: cwd }, cwd })
    assert.equal(root, join(cwd, '.copilot-tracking', 'skraft-plans'))
  })
})
