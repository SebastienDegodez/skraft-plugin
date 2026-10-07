import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHealthCheckService } from '../../../plugins/skraft-framework/src/application/health-check-service.mjs'

const NOW = new Date('2026-01-01T00:00:00Z')
const VERSION = '/plugin/plugin.json'
const HOOKS = '/plugin/hooks.json'
const AUDIT = '/plugin/audit.jsonl'
const CONFIG = '/repo/config.json'
const TRACKING = '/repo/tracking'

// Hand-written filesystem double: files in a map; `broken` paths throw on every access.
const fakeFs = (files, broken = new Set()) => {
  const guard = (path) => { if (broken.has(path)) throw new Error(`broken ${path}`) }
  return {
    exists: async (path) => { guard(path); return Object.hasOwn(files, path) },
    readFile: async (path) => {
      if (broken.has(`read:${path}`)) throw new Error(`unreadable ${path}`)
      guard(path)
      if (!Object.hasOwn(files, path)) throw new Error(`ENOENT ${path}`)
      return files[path]
    },
    listDir: async () => [],
    stat: async () => ({ mtimeMs: NOW.getTime() }),
  }
}

const run = (fs) => createHealthCheckService({
  filesystem: fs,
  clock: { now: () => NOW },
  versionPath: VERSION,
  manifestPaths: { hooks: HOOKS },
  auditLogPath: AUDIT,
  configPath: CONFIG,
  trackingRoot: TRACKING,
}).run()

test('health-check: a non-string version is reported as null', async () => {
  const report = await run(fakeFs({ [VERSION]: JSON.stringify({ version: 42 }) }))
  assert.equal(report.version, null)
})

test('health-check: a manifest whose existence check fails is absent', async () => {
  const report = await run(fakeFs({}, new Set([HOOKS])))
  assert.deepEqual(report.manifests, { hooks: { path: HOOKS, present: false } })
})

test('health-check: audit entries count non-blank lines, not characters', async () => {
  const report = await run(fakeFs({ [AUDIT]: '{"a":1}\n   \n\n{"b":2}\n' }))
  assert.deepEqual(report.logs, { path: AUDIT, present: true, entries: 2 })
})

test('health-check: an audit log that exists but cannot be read reports the error', async () => {
  const report = await run(fakeFs({ [AUDIT]: 'x' }, new Set([`read:${AUDIT}`])))
  assert.deepEqual(report.logs, { path: AUDIT, present: false, error: `unreadable ${AUDIT}` })
})
