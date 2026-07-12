/**
 * Acceptance test — observability CLIs (US12): health-check + housekeeping.
 *
 * Exercises both CLIs boundary-to-boundary against a real temp filesystem, driving
 * paths through the SKRAFT_* env vars the composition roots read.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, mkdir, readFile, utimes, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const HEALTH_CLI = fileURLToPath(new URL('../../plugins/src/cli/health-check.mjs', import.meta.url))
const HOUSEKEEP_CLI = fileURLToPath(new URL('../../plugins/src/cli/housekeeping.mjs', import.meta.url))
const PLUGIN_ROOT = fileURLToPath(new URL('../../plugins', import.meta.url))

const runCli = async (cli, { cwd, env, input }) => {
  try {
    const child = execFileAsync('node', [cli], { cwd, env: { ...process.env, ...env } })
    if (input !== undefined) { child.child.stdin.end(input) }
    const { stdout, stderr } = await child
    return { exitCode: 0, stdout, stderr }
  } catch (err) {
    return { exitCode: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' }
  }
}

const setup = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-obs-'))
  const tracking = join(dir, '.copilot-tracking', 'skraft-plans')
  const auditLog = join(dir, 'logs', 'skill-audit.jsonl')
  await mkdir(tracking, { recursive: true })
  await mkdir(join(dir, 'logs'), { recursive: true })
  const env = {
    SKRAFT_CONFIG_ROOT: dir,
    SKRAFT_TRACKING_ROOT: tracking,
    SKRAFT_AUDIT_LOG: auditLog,
    CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
  }
  return { dir, tracking, auditLog, env }
}

test('health-check: exit 0 and reports version/manifests/config for a healthy repo', async () => {
  const { dir, env } = await setup()
  try {
    const res = await runCli(HEALTH_CLI, { cwd: dir, env })
    assert.equal(res.exitCode, 0)
    const report = JSON.parse(res.stdout)
    assert.equal(report.status, 'ok')
    assert.equal(report.version, '1.1.0', 'reads the real packaged plugin.json version')
    assert.equal(report.manifests.claudeHooks.present, true)
    assert.equal(report.manifests.frameworkConfig.present, true)
    assert.ok(report.config.observability.stalePhaseHours > 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('health-check: exit 1 and status warn when a phase is IN_PROGRESS too long', async () => {
  const { dir, tracking, env } = await setup()
  try {
    await writeFile(join(dir, 'skraft-config.json'), JSON.stringify({ observability: { stalePhaseHours: 1 } }))
    const projDir = join(tracking, 'proj')
    await mkdir(projDir, { recursive: true })
    const statePath = join(projDir, 'state.json')
    await writeFile(statePath, JSON.stringify({ currentPhase: 'DELIVER' }))
    // Backdate mtime by 3 hours (> 1h threshold).
    const old = Date.now() / 1000 - 3 * 3600
    await utimes(statePath, old, old)

    const res = await runCli(HEALTH_CLI, { cwd: dir, env })
    assert.equal(res.exitCode, 1)
    const report = JSON.parse(res.stdout)
    assert.equal(report.status, 'warn')
    const phase = report.phases.find((p) => p.project === 'proj')
    assert.equal(phase.level, 'warn')
    assert.match(phase.message, /DELIVER/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('housekeeping: trims old audit lines and purges stale signals, always exit 0', async () => {
  const { dir, tracking, auditLog, env } = await setup()
  try {
    await writeFile(join(dir, 'skraft-config.json'), JSON.stringify({
      observability: { auditRetentionDays: 30, signalRetentionDays: 14 },
    }))
    const now = Date.now()
    const day = 24 * 3600 * 1000
    await writeFile(auditLog,
      JSON.stringify({ event: 'old', timestamp: new Date(now - 90 * day).toISOString() }) + '\n' +
      JSON.stringify({ event: 'fresh', timestamp: new Date(now - 1 * day).toISOString() }) + '\n')

    const projDir = join(tracking, 'proj')
    await mkdir(projDir, { recursive: true })
    const bakPath = join(projDir, 'state.json.bak.111')
    await writeFile(bakPath, 'x')
    const oldSec = now / 1000 - 20 * 24 * 3600
    await utimes(bakPath, oldSec, oldSec)

    const res = await runCli(HOUSEKEEP_CLI, { cwd: dir, env, input: '{"hookType":"SessionStart"}' })
    assert.equal(res.exitCode, 0, 'housekeeping is fail-open — always exit 0')
    const summary = JSON.parse(res.stdout).skraftHousekeeping
    assert.equal(summary.auditPurged, 1)
    assert.equal(summary.signalsPurged, 1)

    const rewritten = await readFile(auditLog, 'utf8')
    assert.equal(rewritten.includes('old'), false)
    assert.equal(rewritten.includes('fresh'), true)
    const remaining = await readdir(projDir)
    assert.equal(remaining.includes('state.json.bak.111'), false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('housekeeping: no config / empty repo → exit 0 with zero counters', async () => {
  const { dir, env } = await setup()
  try {
    const res = await runCli(HOUSEKEEP_CLI, { cwd: dir, env, input: '' })
    assert.equal(res.exitCode, 0)
    const summary = JSON.parse(res.stdout).skraftHousekeeping
    assert.equal(summary.auditPurged, 0)
    assert.equal(summary.signalsPurged, 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
