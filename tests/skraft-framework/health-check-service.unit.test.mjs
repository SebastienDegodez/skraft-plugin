import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHealthCheckService } from '../../plugins/skraft-framework/src/application/health-check-service.mjs'
import { createInMemoryFilesystem } from '../../plugins/skraft-framework/src/adapters/infrastructure/in-memory-filesystem.mjs'
import { createFixedTime } from '../../plugins/skraft-framework/src/adapters/infrastructure/fixed-time.mjs'
import { DAY_MS, DEFAULT_OBSERVABILITY } from '../../plugins/skraft-framework/src/domain/observability-policy.mjs'

const NOW = new Date('2026-01-01T00:00:00Z')
const nowMs = NOW.getTime()

const VERSION = '/plugin/.claude-plugin/plugin.json'
const CLAUDE = '/plugin/com.anthropic.claude-code/hooks/hooks.json'
const COPILOT = '/repo/.github/hooks/skraft-framework.json'
const FRAMEWORK = '/plugin/skraft-framework.config.json'
const AUDIT = '/plugin/logs/skill-audit.jsonl'
const CONFIG = '/repo/skraft-config.json'
const TRACKING = '/repo/.copilot-tracking/skraft-plans'

const makeService = (files) => createHealthCheckService({
  filesystem: createInMemoryFilesystem(files),
  clock: createFixedTime(NOW),
  versionPath: VERSION,
  manifestPaths: { claudeHooks: CLAUDE, copilotHooks: COPILOT, frameworkConfig: FRAMEWORK },
  auditLogPath: AUDIT,
  configPath: CONFIG,
  trackingRoot: TRACKING,
})

test('health-check: reports version from plugin manifest', async () => {
  const report = await makeService({ [VERSION]: JSON.stringify({ version: '1.1.0' }) }).run()
  assert.equal(report.version, '1.1.0')
})

test('health-check: missing version manifest → null (fail-open)', async () => {
  const report = await makeService({}).run()
  assert.equal(report.version, null)
})

test('health-check: reports manifest presence per path', async () => {
  const report = await makeService({ [CLAUDE]: '{}', [FRAMEWORK]: '{}' }).run()
  assert.equal(report.manifests.claudeHooks.present, true)
  assert.equal(report.manifests.frameworkConfig.present, true)
  assert.equal(report.manifests.copilotHooks.present, false)
})

test('health-check: reports audit log presence and entry count', async () => {
  const report = await makeService({
    [AUDIT]: 'a\nb\n\nc\n',
  }).run()
  assert.equal(report.logs.present, true)
  assert.equal(report.logs.entries, 3, 'blank lines are not counted')
})

test('health-check: absent audit log → present false, 0 entries', async () => {
  const report = await makeService({}).run()
  assert.equal(report.logs.present, false)
  assert.equal(report.logs.entries, 0)
})

test('health-check: reports the resolved observability from config', async () => {
  const report = await makeService({
    [CONFIG]: JSON.stringify({ observability: { stalePhaseHours: 12 } }),
  }).run()
  assert.equal(report.config.present, true)
  assert.equal(report.config.observability.stalePhaseHours, 12)
})

test('health-check: absent config → defaults, present false', async () => {
  const report = await makeService({}).run()
  assert.equal(report.config.present, false)
  assert.deepEqual(report.config.observability, DEFAULT_OBSERVABILITY)
})

test('health-check: fresh phase → status ok', async () => {
  const report = await makeService({
    [CONFIG]: JSON.stringify({ observability: { stalePhaseHours: 24 } }),
    [`${TRACKING}/proj/state.json`]: { content: JSON.stringify({ currentPhase: 'DESIGN' }), mtimeMs: nowMs - 1 * DAY_MS },
  }).run()
  assert.equal(report.status, 'ok')
  const phase = report.phases.find((p) => p.project === 'proj')
  assert.equal(phase.level, 'ok')
  assert.equal(phase.phase, 'DESIGN')
})

test('health-check: phase past threshold → status warn (AC: IN_PROGRESS too long flagged)', async () => {
  const report = await makeService({
    [CONFIG]: JSON.stringify({ observability: { stalePhaseHours: 24 } }),
    [`${TRACKING}/proj/state.json`]: { content: JSON.stringify({ currentPhase: 'DELIVER' }), mtimeMs: nowMs - 40 * DAY_MS },
  }).run()
  assert.equal(report.status, 'warn')
  const phase = report.phases.find((p) => p.project === 'proj')
  assert.equal(phase.level, 'warn')
  assert.match(phase.message, /DELIVER/)
})

test('health-check: multiple projects — one warn flips overall status', async () => {
  const report = await makeService({
    [CONFIG]: JSON.stringify({ observability: { stalePhaseHours: 24 } }),
    [`${TRACKING}/a/state.json`]: { content: JSON.stringify({ currentPhase: 'DESIGN' }), mtimeMs: nowMs - 1 * DAY_MS },
    [`${TRACKING}/b/state.json`]: { content: JSON.stringify({ currentPhase: 'DISTILL' }), mtimeMs: nowMs - 10 * DAY_MS },
  }).run()
  assert.equal(report.phases.length, 2)
  assert.equal(report.status, 'warn')
})

test('health-check: non-project directories (no state.json) are skipped', async () => {
  const report = await makeService({
    [`${TRACKING}/notaproject/readme.md`]: 'hi',
  }).run()
  assert.equal(report.phases.length, 0)
  assert.equal(report.status, 'ok')
})

test('health-check: empty tracking root → no phases, status ok', async () => {
  const report = await makeService({}).run()
  assert.deepEqual(report.phases, [])
  assert.equal(report.status, 'ok')
})
