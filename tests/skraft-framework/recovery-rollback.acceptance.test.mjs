/**
 * Acceptance tests — Recovery / rollback (US13, issue #59)
 *
 * Drives cli/state.mjs as a subprocess exactly as the orchestrator would, against an
 * isolated tmpdir. Covers the three acceptance criteria:
 *   AC1 — corrupted/incomplete state yields actionable WHY/HOW/ACTION guidance.
 *   AC2 — schema rollback restores a healthy version after repeated failures.
 *   AC3 — a stale execution can be resolved/relaunched.
 *
 * Iron Rule: NEVER modify these tests to make them pass — fix the implementation.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const CLI = fileURLToPath(new URL('../../plugins/src/cli/state.mjs', import.meta.url))

async function stateCli(args, { basePath }) {
  const env = { ...process.env, SKRAFT_TRACKING_ROOT: basePath }
  try {
    const { stdout, stderr } = await execFileAsync('node', [CLI, ...args], { env })
    return { exitCode: 0, stdout, stderr }
  } catch (err) {
    return { exitCode: err.exitCode ?? err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' }
  }
}

const baseState = (overrides = {}) => ({
  currentPhase: 'DISCOVER',
  phasesCompleted: [],
  verdicts: {},
  retryCount: {},
  phaseArtifacts: {},
  reviewArtifacts: {},
  difficulty: null,
  userPreferences: { maxRetriesPerPhase: 2 },
  ...overrides,
})

async function writeRaw(basePath, slug, name, content) {
  const dir = join(basePath, slug)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, name), content, 'utf8')
}

async function withTmp(fn) {
  const basePath = await mkdtemp(join(tmpdir(), 'skraft-recovery-'))
  try {
    await fn(basePath)
  } finally {
    await rm(basePath, { recursive: true, force: true })
  }
}

// ─── AC1: guidance ─────────────────────────────────────────────────────────────
test('diagnose: healthy state → HEALTHY guidance, exit 0', async () => {
  await withTmp(async (basePath) => {
    await writeRaw(basePath, 'demo', 'state.json', JSON.stringify(baseState()))
    const r = await stateCli(['diagnose', '--slug', 'demo'], { basePath })
    assert.equal(r.exitCode, 0)
    const g = JSON.parse(r.stdout)
    assert.equal(g.code, 'HEALTHY')
    assert.ok(g.why && Array.isArray(g.how) && g.action)
  })
})

test('diagnose: corrupted state → CORRUPTED_STATE guidance with WHY/HOW/ACTION', async () => {
  await withTmp(async (basePath) => {
    await writeRaw(basePath, 'demo', 'state.json', '{ this is not json')
    const r = await stateCli(['diagnose', '--slug', 'demo'], { basePath })
    assert.equal(r.exitCode, 0)
    const g = JSON.parse(r.stdout)
    assert.equal(g.code, 'CORRUPTED_STATE')
    assert.ok(g.why.length > 0)
    assert.ok(g.how.length > 0)
    assert.ok(g.action.length > 0)
  })
})

test('diagnose: corrupted state with a healthy backup → guidance points to rollback', async () => {
  await withTmp(async (basePath) => {
    await writeRaw(basePath, 'demo', 'state.json', '{ broken')
    await writeRaw(basePath, 'demo', 'state.json.bak.1000', JSON.stringify(baseState({ currentPhase: 'DESIGN' })))
    const r = await stateCli(['diagnose', '--slug', 'demo'], { basePath })
    const g = JSON.parse(r.stdout)
    assert.match(g.action, /rollback --slug demo/)
  })
})

test('diagnose: missing state → MISSING_STATE guidance', async () => {
  await withTmp(async (basePath) => {
    const r = await stateCli(['diagnose', '--slug', 'demo'], { basePath })
    const g = JSON.parse(r.stdout)
    assert.equal(g.code, 'MISSING_STATE')
  })
})

// ─── AC2: rollback ─────────────────────────────────────────────────────────────
test('rollback: restores the most recent healthy backup after corruption', async () => {
  await withTmp(async (basePath) => {
    await writeRaw(basePath, 'demo', 'state.json', '{ corrupted after repeated failures')
    await writeRaw(basePath, 'demo', 'state.json.bak.100', JSON.stringify(baseState({ currentPhase: 'DISCUSS' })))
    await writeRaw(basePath, 'demo', 'state.json.bak.300', JSON.stringify(baseState({ currentPhase: 'DESIGN' })))
    await writeRaw(basePath, 'demo', 'state.json.bak.200', JSON.stringify(baseState({ currentPhase: 'DISTILL' })))

    const r = await stateCli(['rollback', '--slug', 'demo'], { basePath })
    assert.equal(r.exitCode, 0)
    const out = JSON.parse(r.stdout)
    assert.equal(out.restoredFrom, 'state.json.bak.300')
    assert.equal(out.currentPhase, 'DESIGN')

    // state.json now parses and reflects the restored phase
    const get = await stateCli(['get', '--slug', 'demo', '--field', 'currentPhase'], { basePath })
    assert.equal(get.exitCode, 0)
    assert.equal(get.stdout.trim(), 'DESIGN')
  })
})

test('rollback: skips corrupt backups and restores newest healthy one', async () => {
  await withTmp(async (basePath) => {
    await writeRaw(basePath, 'demo', 'state.json', '{ broken')
    await writeRaw(basePath, 'demo', 'state.json.bak.400', 'not json either')
    await writeRaw(basePath, 'demo', 'state.json.bak.200', JSON.stringify(baseState({ currentPhase: 'DISTILL' })))
    const r = await stateCli(['rollback', '--slug', 'demo'], { basePath })
    const out = JSON.parse(r.stdout)
    assert.equal(out.restoredFrom, 'state.json.bak.200')
    assert.equal(out.currentPhase, 'DISTILL')
  })
})

test('rollback: no healthy backup → NO_BACKUP, exit non-zero', async () => {
  await withTmp(async (basePath) => {
    await writeRaw(basePath, 'demo', 'state.json', '{ broken')
    const r = await stateCli(['rollback', '--slug', 'demo'], { basePath })
    assert.notEqual(r.exitCode, 0)
    assert.match(r.stderr, /NO_BACKUP/)
  })
})

// ─── AC3: resolve stale ─────────────────────────────────────────────────────────
test('resolve-stale: resets a stuck phase retry budget so it can relaunch', async () => {
  await withTmp(async (basePath) => {
    await writeRaw(basePath, 'demo', 'state.json', JSON.stringify(baseState({
      currentPhase: 'DESIGN',
      retryCount: { DESIGN: 2 },
      verdicts: { DESIGN: 'CHANGES_REQUESTED' },
    })))
    const r = await stateCli(['resolve-stale', '--slug', 'demo'], { basePath })
    assert.equal(r.exitCode, 0)
    const out = JSON.parse(r.stdout)
    assert.equal(out.retryCount.DESIGN, 0)

    const persisted = JSON.parse(await readFile(join(basePath, 'demo', 'state.json'), 'utf8'))
    assert.equal(persisted.retryCount.DESIGN, 0)
  })
})

test('resolve-stale: rejects a non-stale phase, exit non-zero', async () => {
  await withTmp(async (basePath) => {
    await writeRaw(basePath, 'demo', 'state.json', JSON.stringify(baseState({
      currentPhase: 'DESIGN', retryCount: { DESIGN: 1 },
    })))
    const r = await stateCli(['resolve-stale', '--slug', 'demo'], { basePath })
    assert.notEqual(r.exitCode, 0)
    assert.match(r.stderr, /NOT_STALE/)
  })
})

test('diagnose: stale state → STALE guidance', async () => {
  await withTmp(async (basePath) => {
    await writeRaw(basePath, 'demo', 'state.json', JSON.stringify(baseState({
      currentPhase: 'DESIGN', retryCount: { DESIGN: 2 }, verdicts: { DESIGN: 'CHANGES_REQUESTED' },
    })))
    const r = await stateCli(['diagnose', '--slug', 'demo'], { basePath })
    const g = JSON.parse(r.stdout)
    assert.equal(g.code, 'STALE')
    assert.match(g.action, /resolve-stale --slug demo --phase DESIGN/)
  })
})
