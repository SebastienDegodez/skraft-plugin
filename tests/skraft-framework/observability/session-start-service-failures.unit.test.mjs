import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { createSessionStartService } from '../../../plugins/skraft-framework/src/application/session-start-service.mjs'

const NOW = new Date('2026-01-01T00:00:00Z')
const nowMs = NOW.getTime()
const DAY = 24 * 60 * 60 * 1000
const CONFIG = '/repo/skraft-config.json'
const AUDIT = '/logs/audit.jsonl'
const TRACKING = '/repo/tracking'

// Hand-written filesystem double: a flat map of files, directory listings derived from
// it, every call recorded, and per-operation failures injectable.
// The service joins paths with node:path (backslashes on Windows); the double keys them
// with '/' whatever the OS.
const slash = (path) => path.replace(/\\/g, '/')
const fakeFs = (files, failures = {}) => {
  const store = new Map(Object.entries(files))
  const calls = []
  const fail = (op, path) => {
    const f = failures[op]
    if (f && (f === true || slash(f) === path)) throw new Error(`${op} boom`)
  }
  return {
    calls,
    store,
    exists: async (raw) => { const path = slash(raw); calls.push(['exists', path]); return store.has(path) },
    readFile: async (raw) => {
      const path = slash(raw)
      calls.push(['readFile', path])
      fail('readFile', path)
      if (!store.has(path)) throw new Error(`ENOENT ${path}`)
      const v = store.get(path)
      return typeof v === 'string' ? v : v.content
    },
    writeFile: async (raw, content) => { const path = slash(raw); calls.push(['writeFile', path, content]); store.set(path, content) },
    listDir: async (raw) => {
      const dir = slash(raw)
      calls.push(['listDir', dir])
      fail('listDir', dir)
      const prefix = `${dir}/`
      const names = new Set()
      for (const key of store.keys()) if (key.startsWith(prefix)) names.add(key.slice(prefix.length).split('/')[0])
      return [...names]
    },
    stat: async (raw) => {
      const path = slash(raw)
      calls.push(['stat', path])
      fail('stat', path)
      const v = store.get(path)
      return { mtimeMs: v.mtimeMs }
    },
    remove: async (raw) => { const path = slash(raw); calls.push(['remove', path]); fail('remove', path); store.delete(path) },
  }
}

const serviceOn = (fs) => createSessionStartService({
  filesystem: fs,
  clock: { now: () => NOW },
  configPath: CONFIG,
  auditLogPath: AUDIT,
  trackingRoot: TRACKING,
})

const line = (ageDays) => JSON.stringify({ timestamp: new Date(nowMs - ageDays * DAY).toISOString() })

test('session-start: a missing audit log is never read', async () => {
  const fs = fakeFs({ [CONFIG]: '{}', [`${TRACKING}/p/keep.txt`]: { content: '', mtimeMs: 0 } })
  const summary = await serviceOn(fs).run()
  assert.deepEqual(summary, { auditPurged: 0, signalsPurged: 0, warnings: [] })
  assert.equal(fs.calls.some(([op, path]) => op === 'readFile' && path === AUDIT), false)
})

test('session-start: an audit log with nothing to purge is not rewritten', async () => {
  const fs = fakeFs({ [CONFIG]: '{}', [AUDIT]: `${line(1)}\n` })
  const summary = await serviceOn(fs).run()
  assert.equal(summary.auditPurged, 0)
  assert.equal(fs.calls.some(([op]) => op === 'writeFile'), false)
})

test('session-start: an audit log whose every line is purged is emptied', async () => {
  const fs = fakeFs({ [CONFIG]: JSON.stringify({ observability: { auditRetentionDays: 30 } }), [AUDIT]: `${line(40)}\n${line(50)}\n` })
  const summary = await serviceOn(fs).run()
  assert.equal(summary.auditPurged, 2)
  assert.deepEqual(fs.calls.filter(([op]) => op === 'writeFile'), [['writeFile', AUDIT, '']])
})

test('session-start: kept lines are rewritten newline-joined with a trailing newline', async () => {
  const fs = fakeFs({ [CONFIG]: '{}', [AUDIT]: `${line(40)}\n${line(1)}\n${line(2)}\n` })
  await serviceOn(fs).run()
  assert.equal(fs.store.get(AUDIT), `${line(1)}\n${line(2)}\n`)
})

test('session-start: an unreadable audit log is reported and does not stop the purge', async () => {
  const fs = fakeFs({
    [CONFIG]: '{}',
    [AUDIT]: `${line(1)}\n`,
    [`${TRACKING}/p/state.json.bak.1`]: { content: 'x', mtimeMs: nowMs - 100 * DAY },
  }, { readFile: AUDIT })
  const summary = await serviceOn(fs).run()
  assert.deepEqual(summary, { auditPurged: 0, signalsPurged: 1, warnings: ['audit trim failed: readFile boom'] })
})

test('session-start: an unlistable project is reported and the others are still purged', async () => {
  const fs = fakeFs({
    [CONFIG]: '{}',
    [`${TRACKING}/a/state.json.bak.1`]: { content: 'x', mtimeMs: nowMs - 100 * DAY },
    [`${TRACKING}/b/state.json.bak.1`]: { content: 'x', mtimeMs: nowMs - 100 * DAY },
  }, { listDir: join(TRACKING, 'a') })
  const summary = await serviceOn(fs).run()
  assert.deepEqual(summary, { auditPurged: 0, signalsPurged: 1, warnings: ['list a failed: listDir boom'] })
  assert.equal(fs.store.has(`${TRACKING}/b/state.json.bak.1`), false)
})

test('session-start: a failed removal is reported and not counted', async () => {
  const fs = fakeFs({
    [CONFIG]: '{}',
    [`${TRACKING}/a/state.json.bak.1`]: { content: 'x', mtimeMs: nowMs - 100 * DAY },
    [`${TRACKING}/a/state.json.bak.2`]: { content: 'x', mtimeMs: nowMs - 100 * DAY },
  }, { remove: join(TRACKING, 'a', 'state.json.bak.1') })
  const summary = await serviceOn(fs).run()
  assert.deepEqual(summary, {
    auditPurged: 0,
    signalsPurged: 1,
    warnings: ['remove a/state.json.bak.1 failed: remove boom'],
  })
})

test('session-start: an unlistable tracking root is reported', async () => {
  const fs = fakeFs({ [CONFIG]: '{}' }, { listDir: TRACKING })
  const summary = await serviceOn(fs).run()
  assert.deepEqual(summary, { auditPurged: 0, signalsPurged: 0, warnings: ['signal purge failed: listDir boom'] })
})

test('session-start: an undatable signal file is skipped silently', async () => {
  const fs = fakeFs({
    [CONFIG]: '{}',
    [`${TRACKING}/a/state.json.bak.1`]: { content: 'x', mtimeMs: nowMs - 100 * DAY },
  }, { stat: true })
  const summary = await serviceOn(fs).run()
  assert.deepEqual(summary, { auditPurged: 0, signalsPurged: 0, warnings: [] })
})
