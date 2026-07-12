import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSessionStartService } from '../../plugins/src/application/session-start-service.mjs'
import { createInMemoryFilesystem } from '../../plugins/src/adapters/infrastructure/in-memory-filesystem.mjs'
import { createFixedTime } from '../../plugins/src/adapters/infrastructure/fixed-time.mjs'
import { DAY_MS } from '../../plugins/src/domain/observability-policy.mjs'

const NOW = new Date('2026-01-01T00:00:00Z')
const nowMs = NOW.getTime()
const iso = (ms) => new Date(ms).toISOString()

const CONFIG = '/repo/skraft-config.json'
const AUDIT = '/plugin/logs/skill-audit.jsonl'
const TRACKING = '/repo/.copilot-tracking/skraft-plans'

const makeService = (files) => createSessionStartService({
  filesystem: createInMemoryFilesystem(files),
  clock: createFixedTime(NOW),
  configPath: CONFIG,
  auditLogPath: AUDIT,
  trackingRoot: TRACKING,
})

test('session-start: trims audit log lines older than the configured retention', async () => {
  const auditContent =
    JSON.stringify({ event: 'old', timestamp: iso(nowMs - 40 * DAY_MS) }) + '\n' +
    JSON.stringify({ event: 'fresh', timestamp: iso(nowMs - 1 * DAY_MS) }) + '\n'
  const svc = makeService({
    [CONFIG]: JSON.stringify({ observability: { auditRetentionDays: 30 } }),
    [AUDIT]: auditContent,
  })
  const summary = await svc.run()
  assert.equal(summary.auditPurged, 1)
  assert.deepEqual(summary.warnings, [])
})

test('session-start: rewrites the audit file with only kept lines', async () => {
  const fs = createInMemoryFilesystem({
    [CONFIG]: JSON.stringify({ observability: { auditRetentionDays: 30 } }),
    [AUDIT]:
      JSON.stringify({ event: 'old', timestamp: iso(nowMs - 90 * DAY_MS) }) + '\n' +
      JSON.stringify({ event: 'fresh', timestamp: iso(nowMs - 2 * DAY_MS) }) + '\n',
  })
  const svc = createSessionStartService({
    filesystem: fs, clock: createFixedTime(NOW), configPath: CONFIG, auditLogPath: AUDIT, trackingRoot: TRACKING,
  })
  await svc.run()
  const rewritten = await fs.readFile(AUDIT)
  assert.equal(rewritten.includes('old'), false)
  assert.equal(rewritten.includes('fresh'), true)
  assert.equal(rewritten.endsWith('\n'), true)
})

test('session-start: missing audit log → auditPurged 0, no throw', async () => {
  const svc = makeService({ [CONFIG]: '{}' })
  const summary = await svc.run()
  assert.equal(summary.auditPurged, 0)
})

test('session-start: purges stale state backups/snapshots past retention', async () => {
  const svc = makeService({
    [CONFIG]: JSON.stringify({ observability: { signalRetentionDays: 14 } }),
    [`${TRACKING}/proj-a/state.json`]: { content: '{}', mtimeMs: nowMs },
    [`${TRACKING}/proj-a/state.json.bak.1`]: { content: 'x', mtimeMs: nowMs - 20 * DAY_MS },
    [`${TRACKING}/proj-a/state.json.bak.2`]: { content: 'x', mtimeMs: nowMs - 3 * DAY_MS },
    [`${TRACKING}/proj-a/state.json.corrupted.9`]: { content: 'x', mtimeMs: nowMs - 30 * DAY_MS },
  })
  const summary = await svc.run()
  assert.equal(summary.signalsPurged, 2, 'the 20d backup + 30d snapshot are purged; the 3d backup stays')
})

test('session-start: never removes the live state.json', async () => {
  const fs = createInMemoryFilesystem({
    [CONFIG]: JSON.stringify({ observability: { signalRetentionDays: 1 } }),
    [`${TRACKING}/proj-a/state.json`]: { content: '{}', mtimeMs: nowMs - 999 * DAY_MS },
    [`${TRACKING}/proj-a/state.json.bak.1`]: { content: 'x', mtimeMs: nowMs - 999 * DAY_MS },
  })
  const svc = createSessionStartService({
    filesystem: fs, clock: createFixedTime(NOW), configPath: CONFIG, auditLogPath: AUDIT, trackingRoot: TRACKING,
  })
  const summary = await svc.run()
  assert.equal(summary.signalsPurged, 1)
  assert.equal(await fs.exists(`${TRACKING}/proj-a/state.json`), true)
  assert.equal(await fs.exists(`${TRACKING}/proj-a/state.json.bak.1`), false)
})

test('session-start: missing config → uses default retention windows, no throw', async () => {
  const svc = makeService({
    [AUDIT]: JSON.stringify({ event: 'old', timestamp: iso(nowMs - 400 * DAY_MS) }) + '\n',
  })
  const summary = await svc.run()
  assert.equal(summary.auditPurged, 1) // default 30d window purges the 400d line
  assert.deepEqual(summary.warnings, [])
})

test('session-start: empty tracking root → signalsPurged 0', async () => {
  const svc = makeService({ [CONFIG]: '{}' })
  const summary = await svc.run()
  assert.equal(summary.signalsPurged, 0)
})
