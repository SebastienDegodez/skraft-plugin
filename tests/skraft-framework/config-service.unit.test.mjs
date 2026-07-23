import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createConfigService } from '../../plugins/src/application/config-service.mjs'
import { Ok, Err } from '../../plugins/src/domain/result.mjs'

// ─── Test doubles ─────────────────────────────────────────────────────────────
const readerOk = (config) => ({ read: async () => config })
const readerEnoent = () => ({
  read: async () => { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e },
})
const readerCorrupted = () => ({
  read: async () => { const e = new Error('bad json'); e.code = 'CORRUPTED_CONFIG'; throw e },
})
const readerIoError = () => ({
  read: async () => { const e = new Error('disk'); e.code = 'EIO'; throw e },
})
const writerOk = () => {
  let written = null
  return { write: async (c) => { written = c; return Ok(undefined) }, get _written() { return written } }
}
const writerFail = () => ({ write: async () => Err({ code: 'IO_ERROR', reason: 'disk full' }) })

// ─── init ─────────────────────────────────────────────────────────────────────

test('config-service init: creates default config on ENOENT, created=true', async () => {
  const writer = writerOk()
  const svc = createConfigService({ configReader: readerEnoent(), configWriter: writer })
  const r = await svc.init()
  assert.equal(r.ok, true)
  assert.equal(r.value.created, true)
  assert.equal(r.value.depthTier, 'comprehensive')
  assert.equal(writer._written.depthTier, 'comprehensive')
})

test('config-service init: idempotent — returns existing config with created=false', async () => {
  const svc = createConfigService({ configReader: readerOk({ depthTier: 'standard' }), configWriter: writerOk() })
  const r = await svc.init()
  assert.equal(r.ok, true)
  assert.equal(r.value.created, false)
  assert.equal(r.value.depthTier, 'standard')
})

test('config-service init: propagates CORRUPTED_CONFIG', async () => {
  const svc = createConfigService({ configReader: readerCorrupted(), configWriter: writerOk() })
  const r = await svc.init()
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'CORRUPTED_CONFIG')
})

test('config-service init: propagates write failure on ENOENT', async () => {
  const svc = createConfigService({ configReader: readerEnoent(), configWriter: writerFail() })
  const r = await svc.init()
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'IO_ERROR')
})

// ─── get ──────────────────────────────────────────────────────────────────────

test('config-service get: returns the whole config when no key', async () => {
  const svc = createConfigService({ configReader: readerOk({ depthTier: 'basic' }), configWriter: writerOk() })
  const r = await svc.get()
  assert.equal(r.ok, true)
  assert.equal(r.value.depthTier, 'basic')
})

test('config-service get: returns one field when key given', async () => {
  const svc = createConfigService({ configReader: readerOk({ depthTier: 'basic' }), configWriter: writerOk() })
  const r = await svc.get('depthTier')
  assert.equal(r.ok, true)
  assert.equal(r.value, 'basic')
})

test('config-service get: on ENOENT returns validated default (no write)', async () => {
  const writer = writerOk()
  const svc = createConfigService({ configReader: readerEnoent(), configWriter: writer })
  const r = await svc.get('depthTier')
  assert.equal(r.ok, true)
  assert.equal(r.value, 'comprehensive')
  assert.equal(writer._written, null, 'get must not write')
})

test('config-service get: propagates IO_ERROR', async () => {
  const svc = createConfigService({ configReader: readerIoError(), configWriter: writerOk() })
  const r = await svc.get()
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'IO_ERROR')
})

test('config-service init: returns CORRUPTED_CONFIG when stored value is not an object', async () => {
  const svc = createConfigService({ configReader: readerOk(42), configWriter: writerOk() })
  const r = await svc.init()
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'CORRUPTED_CONFIG')
})

test('config-service get: returns CORRUPTED_CONFIG when stored value is not an object', async () => {
  const svc = createConfigService({ configReader: readerOk('nope'), configWriter: writerOk() })
  const r = await svc.get('depthTier')
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'CORRUPTED_CONFIG')
})

test('config-service get (no key) on ENOENT returns the whole default config', async () => {
  const svc = createConfigService({ configReader: readerEnoent(), configWriter: writerOk() })
  const r = await svc.get()
  assert.equal(r.ok, true)
  assert.equal(r.value.depthTier, 'comprehensive')
})

test('config-service set: returns CORRUPTED_CONFIG when stored value is not an object', async () => {
  const svc = createConfigService({ configReader: readerOk([]), configWriter: writerOk() })
  const r = await svc.set('depthTier', 'basic')
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'CORRUPTED_CONFIG')
})

test('config-service set: propagates write failure', async () => {
  const svc = createConfigService({ configReader: readerOk({ depthTier: 'comprehensive' }), configWriter: writerFail() })
  const r = await svc.set('depthTier', 'basic')
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'IO_ERROR')
})

test('config-service set: propagates IO_ERROR from reader', async () => {
  const svc = createConfigService({ configReader: readerIoError(), configWriter: writerOk() })
  const r = await svc.set('depthTier', 'basic')
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'IO_ERROR')
})

// ─── set ──────────────────────────────────────────────────────────────────────

test('config-service set: writes a valid depthTier and returns the new config', async () => {
  const writer = writerOk()
  const svc = createConfigService({ configReader: readerOk({ depthTier: 'comprehensive' }), configWriter: writer })
  const r = await svc.set('depthTier', 'standard')
  assert.equal(r.ok, true)
  assert.equal(r.value.depthTier, 'standard')
  assert.equal(writer._written.depthTier, 'standard')
})

test('config-service set: rejects an invalid depthTier value', async () => {
  const writer = writerOk()
  const svc = createConfigService({ configReader: readerOk({ depthTier: 'comprehensive' }), configWriter: writer })
  const r = await svc.set('depthTier', 'turbo')
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'INVALID_VALUE')
  assert.equal(writer._written, null, 'invalid set must not write')
})

test('config-service set: preserves other fields when setting one key', async () => {
  const writer = writerOk()
  const svc = createConfigService({ configReader: readerOk({ depthTier: 'comprehensive', teamOwner: 'platform' }), configWriter: writer })
  const r = await svc.set('depthTier', 'basic')
  assert.equal(r.ok, true)
  assert.equal(writer._written.teamOwner, 'platform')
  assert.equal(writer._written.depthTier, 'basic')
})

test('config-service set: on ENOENT starts from default then applies the set', async () => {
  const writer = writerOk()
  const svc = createConfigService({ configReader: readerEnoent(), configWriter: writer })
  const r = await svc.set('depthTier', 'standard')
  assert.equal(r.ok, true)
  assert.equal(writer._written.depthTier, 'standard')
})

test('config-service set: writes a valid trackingLayout and returns the new config', async () => {
  const writer = writerOk()
  const svc = createConfigService({ configReader: readerOk({ depthTier: 'comprehensive' }), configWriter: writer })
  const r = await svc.set('trackingLayout', 'bare')
  assert.equal(r.ok, true)
  assert.equal(r.value.trackingLayout, 'bare')
  assert.equal(writer._written.trackingLayout, 'bare')
})

test('config-service set: rejects an invalid trackingLayout value', async () => {
  const writer = writerOk()
  const svc = createConfigService({ configReader: readerOk({ depthTier: 'comprehensive' }), configWriter: writer })
  const r = await svc.set('trackingLayout', 'sideways')
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'INVALID_VALUE')
  assert.equal(writer._written, null, 'invalid set must not write')
})

test('config-service init: default config carries the namespaced trackingLayout', async () => {
  const writer = writerOk()
  const svc = createConfigService({ configReader: readerEnoent(), configWriter: writer })
  const r = await svc.init()
  assert.equal(r.ok, true)
  assert.equal(r.value.trackingLayout, 'namespaced')
  assert.equal(writer._written.trackingLayout, 'namespaced')
})

test('config-service set: rejects an unknown key', async () => {
  const writer = writerOk()
  const svc = createConfigService({ configReader: readerOk({ depthTier: 'comprehensive' }), configWriter: writer })
  const r = await svc.set('bogusKey', 'x')
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'UNKNOWN_KEY')
  assert.equal(writer._written, null)
})

test('config-service set: accepts depthTierRationale free text', async () => {
  const writer = writerOk()
  const svc = createConfigService({ configReader: readerOk({ depthTier: 'basic' }), configWriter: writer })
  const r = await svc.set('depthTierRationale', 'internal tooling repo, speed over rigor')
  assert.equal(r.ok, true)
  assert.equal(writer._written.depthTierRationale, 'internal tooling repo, speed over rigor')
})

test('config-service set: rejects an empty depthTierRationale', async () => {
  const writer = writerOk()
  const svc = createConfigService({ configReader: readerOk({ depthTier: 'basic' }), configWriter: writer })
  const r = await svc.set('depthTierRationale', '')
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'INVALID_VALUE')
  assert.equal(writer._written, null)
})
