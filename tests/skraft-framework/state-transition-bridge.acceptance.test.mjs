/**
 * Acceptance tests — State Transition Bridge (S7)
 * Issue #60 · outside-in TDD · Wishful Thinking phase
 *
 * These tests call cli/state.mjs as a subprocess — exactly as the orchestrator would.
 * They are RED because cli/state.mjs does not exist yet. Each test fails naturally
 * with ENOENT / ERR_MODULE_NOT_FOUND until DELIVER creates the implementation.
 *
 * Iron Rule: NEVER modify these tests to make them pass — fix the implementation.
 * Programming by wishful thinking: the test is written as if the API already exists.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// Path to the CLI entry point — does not exist yet (RED)
const CLI = fileURLToPath(new URL('../../plugins/skraft-framework/src/cli/state.mjs', import.meta.url))

// ─── CLI runner ───────────────────────────────────────────────────────────────
// Spawns cli/state.mjs with SKRAFT_TRACKING_ROOT pointing to the isolated tmpdir.
// Returns { exitCode, stdout, stderr } — never throws.
async function stateCli(args, { basePath }) {
  const env = { ...process.env, SKRAFT_TRACKING_ROOT: basePath }
  try {
    const { stdout, stderr } = await execFileAsync('node', [CLI, ...args], { env })
    return { exitCode: 0, stdout, stderr }
  } catch (err) {
    return { exitCode: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' }
  }
}

// ─── Fixture helpers ──────────────────────────────────────────────────────────
async function writeState(basePath, slug, state) {
  const dir = join(basePath, slug)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'state.json'), JSON.stringify(state, null, 2), 'utf8')
}

async function readState(basePath, slug) {
  const raw = await readFile(join(basePath, slug, 'state.json'), 'utf8')
  return JSON.parse(raw)
}

const baseState = (overrides = {}) => ({
  currentPhase: 'DISCOVER',
  phasesCompleted: [],
  verdicts: {},
  retryCount: {},
  phaseArtifacts: {},
  reviewArtifacts: [],
  difficulty: null,
  userPreferences: { maxRetriesPerPhase: 2 },
  ...overrides
})

// ─────────────────────────────────────────────────────────────────────────────
// AC1 — Legal phase transition (DISCOVER → DISCUSS)
// ─────────────────────────────────────────────────────────────────────────────
test('AC1: state CLI advances phase to DISCUSS when DISCOVER verdict is APPROVED', async () => {
  const basePath = await mkdtemp(join(tmpdir(), 'skraft-ac1-'))
  try {
    await writeState(basePath, 'us5', baseState({ verdicts: { DISCOVER: 'APPROVED' } }))

    const result = await stateCli(
      ['transition', '--to', 'DISCUSS', '--slug', 'us5'],
      { basePath }
    )

    assert.equal(result.exitCode, 0, `expected exit 0\nstderr: ${result.stderr}`)
    const state = await readState(basePath, 'us5')
    assert.equal(state.currentPhase, 'DISCUSS')
    assert.ok(state.phasesCompleted.includes('DISCOVER'))
    const out = JSON.parse(result.stdout)
    assert.ok('currentPhase' in out, 'stdout must contain modified fields JSON')
    const files = await readdir(join(basePath, 'us5'))
    assert.ok(!files.some(f => f.endsWith('.tmp')), 'no residual .tmp files')
  } finally {
    await rm(basePath, { recursive: true, force: true })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// AC2a — ILLEGAL_PHASE_SKIP (DISCOVER → DESIGN skips DISCUSS)
// ─────────────────────────────────────────────────────────────────────────────
test('AC2a: state CLI rejects phase skip with ILLEGAL_PHASE_SKIP', async () => {
  const basePath = await mkdtemp(join(tmpdir(), 'skraft-ac2a-'))
  try {
    await writeState(basePath, 'us5', baseState({ verdicts: { DISCOVER: 'APPROVED' } }))
    const before = await readState(basePath, 'us5')

    const result = await stateCli(
      ['transition', '--to', 'DESIGN', '--slug', 'us5'],
      { basePath }
    )

    assert.equal(result.exitCode, 1)
    assert.ok(result.stderr.includes('ILLEGAL_PHASE_SKIP'), `stderr: ${result.stderr}`)
    assert.ok(
      result.stderr.includes('expected DISCUSS') && result.stderr.includes('got DESIGN'),
      `stderr must contain "expected DISCUSS, got DESIGN"\n${result.stderr}`
    )
    const after = await readState(basePath, 'us5')
    assert.equal(after.currentPhase, before.currentPhase, 'state.json must be unchanged')
    const files = await readdir(join(basePath, 'us5'))
    assert.ok(!files.some(f => f.includes('.bak')), 'no backup on failure')
  } finally {
    await rm(basePath, { recursive: true, force: true })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// AC2b — VERDICT_NOT_APPROVED
// ─────────────────────────────────────────────────────────────────────────────
test('AC2b: state CLI rejects advance when DISCOVER verdict is REJECTED', async () => {
  const basePath = await mkdtemp(join(tmpdir(), 'skraft-ac2b-'))
  try {
    await writeState(basePath, 'us5', baseState({ verdicts: { DISCOVER: 'REJECTED' } }))
    const before = await readState(basePath, 'us5')

    const result = await stateCli(
      ['transition', '--to', 'DISCUSS', '--slug', 'us5'],
      { basePath }
    )

    assert.equal(result.exitCode, 1)
    assert.ok(result.stderr.includes('VERDICT_NOT_APPROVED'), `stderr: ${result.stderr}`)
    const after = await readState(basePath, 'us5')
    assert.equal(after.currentPhase, before.currentPhase)
  } finally {
    await rm(basePath, { recursive: true, force: true })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// AC3a — Init creates state.json when file is absent
// ─────────────────────────────────────────────────────────────────────────────
test('AC3a: state init creates state.json with defaults when file is absent', async () => {
  const basePath = await mkdtemp(join(tmpdir(), 'skraft-ac3a-'))
  try {
    const result = await stateCli(['init', '--slug', 'skraft-demo'], { basePath })

    assert.equal(result.exitCode, 0, `expected exit 0\nstderr: ${result.stderr}`)
    const state = await readState(basePath, 'skraft-demo')
    assert.equal(state.currentPhase, 'DISCOVER')
    assert.deepEqual(state.retryCount, {})
    assert.deepEqual(state.phasesCompleted, [])
    assert.equal(state.difficulty, null)
    const out = JSON.parse(result.stdout)
    assert.equal(out.created, true, 'stdout.created must be true on first init')
    assert.equal(out.currentPhase, 'DISCOVER')
  } finally {
    await rm(basePath, { recursive: true, force: true })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// AC3b — Init is a no-op when file already exists (exit 0)
// ─────────────────────────────────────────────────────────────────────────────
test('AC3b: state init is no-op (exit 0) when state.json already exists', async () => {
  const basePath = await mkdtemp(join(tmpdir(), 'skraft-ac3b-'))
  try {
    const initial = baseState({ currentPhase: 'DISCUSS', phasesCompleted: ['DISCOVER'], difficulty: 'medium-hard' })
    await writeState(basePath, 'us5', initial)
    const before = await readState(basePath, 'us5')

    const result = await stateCli(['init', '--slug', 'us5'], { basePath })

    assert.equal(result.exitCode, 0)
    const after = await readState(basePath, 'us5')
    assert.deepEqual(after, before, 'state.json must be unchanged')
    const out = JSON.parse(result.stdout)
    assert.equal(out.created, false, 'stdout.created must be false on no-op init')
    assert.equal(out.currentPhase, 'DISCUSS')
  } finally {
    await rm(basePath, { recursive: true, force: true })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// AC4 — Atomic write: backup rotation ≤ 3, no residual tmp
// ─────────────────────────────────────────────────────────────────────────────
test('AC4: write rotates backups keeping ≤3, oldest deleted, no residual tmp', async () => {
  const basePath = await mkdtemp(join(tmpdir(), 'skraft-ac4-'))
  try {
    await writeState(basePath, 'us5', baseState())
    const dir = join(basePath, 'us5')
    // Seed 3 existing backups
    await writeFile(join(dir, 'state.json.bak.100'), '{}', 'utf8')
    await writeFile(join(dir, 'state.json.bak.200'), '{}', 'utf8')
    await writeFile(join(dir, 'state.json.bak.300'), '{}', 'utf8')

    await stateCli(
      ['record-verdict', '--phase', 'DISCOVER', '--verdict', 'APPROVED', '--slug', 'us5'],
      { basePath }
    )

    const files = await readdir(dir)
    const baks = files.filter(f => /state\.json\.bak\.\d+/.test(f))
    const tmps = files.filter(f => f.endsWith('.tmp'))
    assert.equal(tmps.length, 0, 'no residual .tmp files')
    assert.ok(baks.length <= 3, `must keep ≤3 backups, got ${baks.length}`)
    assert.ok(!baks.includes('state.json.bak.100'), 'oldest backup must be pruned')
  } finally {
    await rm(basePath, { recursive: true, force: true })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// AC4b — Corrupted state.json is snapshotted, write aborted (exit 2)
// ─────────────────────────────────────────────────────────────────────────────
test('AC4b: corrupted state.json is snapshotted and CLI exits 2 with CORRUPTED_STATE', async () => {
  const basePath = await mkdtemp(join(tmpdir(), 'skraft-ac4b-'))
  try {
    const dir = join(basePath, 'skraft-demo')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'state.json'), '{ invalid json :::}', 'utf8')

    const result = await stateCli(
      ['transition', '--to', 'DISCUSS', '--slug', 'skraft-demo'],
      { basePath }
    )

    assert.equal(result.exitCode, 2, `expected exit 2\nstderr: ${result.stderr}`)
    assert.ok(result.stderr.includes('CORRUPTED_STATE'), `stderr: ${result.stderr}`)
    const files = await readdir(dir)
    assert.ok(files.some(f => f.startsWith('state.json.corrupted.')), 'corrupt snapshot must exist')
  } finally {
    await rm(basePath, { recursive: true, force: true })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// AC5 — record-verdict stores verdict without advancing phase
// ─────────────────────────────────────────────────────────────────────────────
test('AC5: record-verdict stores APPROVED for DISCUSS without advancing currentPhase', async () => {
  const basePath = await mkdtemp(join(tmpdir(), 'skraft-ac5-'))
  try {
    await writeState(basePath, 'us5', baseState({ currentPhase: 'DISCUSS', phasesCompleted: ['DISCOVER'] }))

    const result = await stateCli(
      ['record-verdict', '--phase', 'DISCUSS', '--verdict', 'APPROVED', '--slug', 'us5'],
      { basePath }
    )

    assert.equal(result.exitCode, 0)
    const state = await readState(basePath, 'us5')
    assert.equal(state.verdicts['DISCUSS'], 'APPROVED')
    assert.equal(state.currentPhase, 'DISCUSS', 'record-verdict must NOT advance phase')
  } finally {
    await rm(basePath, { recursive: true, force: true })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// AC6 — record-artifact appends without losing existing entries
// ─────────────────────────────────────────────────────────────────────────────
test('AC6: record-artifact appends path to phaseArtifacts (append-only)', async () => {
  const basePath = await mkdtemp(join(tmpdir(), 'skraft-ac6-'))
  try {
    await writeState(basePath, 'us5', baseState({
      currentPhase: 'DISCUSS',
      phasesCompleted: ['DISCOVER'],
      phaseArtifacts: { DISCUSS: ['plans/2026-07-01/stories.md'] }
    }))

    const result = await stateCli(
      ['record-artifact', '--phase', 'DISCUSS', '--path', 'plans/2026-07-01/ac-draft.md', '--slug', 'us5'],
      { basePath }
    )

    assert.equal(result.exitCode, 0)
    const state = await readState(basePath, 'us5')
    assert.deepEqual(state.phaseArtifacts.DISCUSS, [
      'plans/2026-07-01/stories.md',
      'plans/2026-07-01/ac-draft.md'
    ])
  } finally {
    await rm(basePath, { recursive: true, force: true })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// AC7 — set-difficulty: write-once, IMMUTABLE_FIELD on second set
// ─────────────────────────────────────────────────────────────────────────────
test('AC7: set-difficulty succeeds once then rejects with IMMUTABLE_FIELD', async () => {
  const basePath = await mkdtemp(join(tmpdir(), 'skraft-ac7-'))
  try {
    await writeState(basePath, 'us5', baseState())

    const first = await stateCli(
      ['set-difficulty', '--value', 'medium-hard', '--slug', 'us5'],
      { basePath }
    )
    assert.equal(first.exitCode, 0, `first set failed\nstderr: ${first.stderr}`)
    assert.equal((await readState(basePath, 'us5')).difficulty, 'medium-hard')

    const second = await stateCli(
      ['set-difficulty', '--value', 'easy', '--slug', 'us5'],
      { basePath }
    )
    assert.equal(second.exitCode, 1)
    assert.ok(second.stderr.includes('IMMUTABLE_FIELD'), `stderr: ${second.stderr}`)
    assert.equal((await readState(basePath, 'us5')).difficulty, 'medium-hard')
  } finally {
    await rm(basePath, { recursive: true, force: true })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// AC8 — get returns scalar value without modifying state or creating backups
// ─────────────────────────────────────────────────────────────────────────────
test('AC8: get --field currentPhase returns scalar without modifying state', async () => {
  const basePath = await mkdtemp(join(tmpdir(), 'skraft-ac8-'))
  try {
    await writeState(basePath, 'us5', baseState({
      currentPhase: 'DESIGN',
      phasesCompleted: ['DISCOVER', 'DISCUSS'],
      difficulty: 'medium-hard'
    }))
    const before = await readState(basePath, 'us5')

    const result = await stateCli(
      ['get', '--field', 'currentPhase', '--slug', 'us5'],
      { basePath }
    )

    assert.equal(result.exitCode, 0)
    assert.equal(result.stdout.trim(), 'DESIGN', 'stdout must be raw scalar only')
    assert.deepEqual(await readState(basePath, 'us5'), before, 'state.json must be unchanged')
    const files = await readdir(join(basePath, 'us5'))
    assert.ok(!files.some(f => f.includes('.bak')), 'get must not create backup')
  } finally {
    await rm(basePath, { recursive: true, force: true })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// AC9 — incr-retry: RETRY_EXHAUSTED at ceiling, success below
// ─────────────────────────────────────────────────────────────────────────────
test('AC9a: incr-retry rejects with RETRY_EXHAUSTED when retryCount equals maxRetriesPerPhase', async () => {
  const basePath = await mkdtemp(join(tmpdir(), 'skraft-ac9a-'))
  try {
    await writeState(basePath, 'us5', baseState({
      currentPhase: 'DISCUSS',
      phasesCompleted: ['DISCOVER'],
      retryCount: { DISCUSS: 2 }
    }))

    const result = await stateCli(
      ['incr-retry', '--phase', 'DISCUSS', '--slug', 'us5'],
      { basePath }
    )

    assert.equal(result.exitCode, 1)
    assert.ok(result.stderr.includes('RETRY_EXHAUSTED'), `stderr: ${result.stderr}`)
    assert.equal((await readState(basePath, 'us5')).retryCount.DISCUSS, 2)
  } finally {
    await rm(basePath, { recursive: true, force: true })
  }
})

test('AC9b: incr-retry increments retryCount when below maxRetriesPerPhase', async () => {
  const basePath = await mkdtemp(join(tmpdir(), 'skraft-ac9b-'))
  try {
    await writeState(basePath, 'us5', baseState({
      currentPhase: 'DISCUSS',
      phasesCompleted: ['DISCOVER'],
      retryCount: { DISCUSS: 1 }
    }))

    const result = await stateCli(
      ['incr-retry', '--phase', 'DISCUSS', '--slug', 'us5'],
      { basePath }
    )

    assert.equal(result.exitCode, 0)
    assert.equal((await readState(basePath, 'us5')).retryCount.DISCUSS, 2)
  } finally {
    await rm(basePath, { recursive: true, force: true })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// AC10 — TERMINAL_STATE: all mutations rejected after DONE
// ─────────────────────────────────────────────────────────────────────────────
test('AC10a: transition is rejected with TERMINAL_STATE when currentPhase is DONE', async () => {
  const basePath = await mkdtemp(join(tmpdir(), 'skraft-ac10a-'))
  try {
    await writeState(basePath, 'us5', baseState({
      currentPhase: 'DONE',
      phasesCompleted: ['DISCOVER', 'DISCUSS', 'DESIGN', 'DISTILL', 'DELIVER']
    }))

    const result = await stateCli(
      ['transition', '--to', 'DISCOVER', '--slug', 'us5'],
      { basePath }
    )

    assert.equal(result.exitCode, 1)
    assert.ok(result.stderr.includes('TERMINAL_STATE'), `stderr: ${result.stderr}`)
    assert.equal((await readState(basePath, 'us5')).currentPhase, 'DONE')
  } finally {
    await rm(basePath, { recursive: true, force: true })
  }
})

test('AC10b: record-verdict is rejected with TERMINAL_STATE when currentPhase is DONE', async () => {
  const basePath = await mkdtemp(join(tmpdir(), 'skraft-ac10b-'))
  try {
    await writeState(basePath, 'us5', baseState({
      currentPhase: 'DONE',
      phasesCompleted: ['DISCOVER', 'DISCUSS', 'DESIGN', 'DISTILL', 'DELIVER']
    }))

    const result = await stateCli(
      ['record-verdict', '--phase', 'DONE', '--verdict', 'APPROVED', '--slug', 'us5'],
      { basePath }
    )

    assert.equal(result.exitCode, 1)
    assert.ok(result.stderr.includes('TERMINAL_STATE'), `stderr: ${result.stderr}`)
  } finally {
    await rm(basePath, { recursive: true, force: true })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// AC11a + AC11b — append-only invariants (domain-only unit tests)
// Entered via applyTransition() directly — not reachable through CLI subcommands
// RED: will fail with ERR_MODULE_NOT_FOUND until domain/state-machine.mjs exists
// ─────────────────────────────────────────────────────────────────────────────
const { applyTransition } = await import('../../plugins/skraft-framework/src/domain/state-machine.mjs')
  .catch(() => ({ applyTransition: null }))

const frozenState = (overrides = {}) => Object.freeze({
  currentPhase: 'DISCUSS',
  phasesCompleted: Object.freeze(['DISCOVER', 'DISCUSS']),
  verdicts: Object.freeze({}),
  retryCount: Object.freeze({}),
  phaseArtifacts: Object.freeze({ DISCUSS: Object.freeze(['plans/stories.md', 'plans/ac-draft.md']) }),
  reviewArtifacts: Object.freeze({ DISCOVER: Object.freeze(['reviews/2026-07-01/discover-review-1.md']) }),
  difficulty: null,
  userPreferences: Object.freeze({ maxRetriesPerPhase: 2 }),
  ...overrides
})

test('AC11a [domain]: state machine rejects event that reduces phasesCompleted (APPEND_ONLY_VIOLATION)', () => {
  assert.ok(applyTransition !== null, 'domain/state-machine.mjs must export applyTransition')
  // frozenState has phasesCompleted: ['DISCOVER', 'DISCUSS'] (2 entries)
  // An ADVANCE with APPROVED verdict would APPEND 'DESIGN' (correct: grows to 3)
  // We test the guard by attempting a RECORD_ARTIFACT that signals replacement with fewer phasesCompleted
  const state = frozenState()
  const result = applyTransition(state, {
    type: 'RECORD_ARTIFACT',
    phase: 'DISCUSS',
    path: 'plans/new.md',
    _testForcePhasesCompleted: ['DISCOVER'] // smaller than current ['DISCOVER', 'DISCUSS'] — machine must reject
  })
  assert.equal(result.ok, false, `expected Err, got Ok: ${JSON.stringify(result)}`)
  assert.equal(result.error?.code, 'APPEND_ONLY_VIOLATION',
    `expected APPEND_ONLY_VIOLATION, got: ${result.error?.code}`)
})

test('AC11b [domain]: state machine rejects RECORD_REVIEW_ARTIFACT event that shortens reviewArtifacts', () => {
  assert.ok(applyTransition !== null, 'domain/state-machine.mjs must export applyTransition')
  // frozenState has reviewArtifacts: { DISCOVER: ['reviews/2026-07-01/discover-review-1.md'] } (1 entry)
  // Attempt to replace reviewArtifacts.DISCOVER with [] (0 entries) → APPEND_ONLY_VIOLATION
  const state = frozenState()
  const result = applyTransition(state, {
    type: 'RECORD_REVIEW_ARTIFACT',
    phase: 'DISCOVER',
    path: null,
    _testForceReviewArtifacts: [] // empty — smaller than current 1-entry array — machine must reject
  })
  assert.equal(result.ok, false, `expected Err, got Ok: ${JSON.stringify(result)}`)
  assert.equal(result.error?.code, 'APPEND_ONLY_VIOLATION',
    `expected APPEND_ONLY_VIOLATION, got: ${result.error?.code}`)
})

// ─────────────────────────────────────────────────────────────────────────────
// AC12 — Coercion of pre-existing state.json (backward compatibility)
// ─────────────────────────────────────────────────────────────────────────────
test('AC12: pre-existing state.json without retryCount/phasesCompleted is coerced on applyEvent', async () => {
  const basePath = await mkdtemp(join(tmpdir(), 'skraft-ac12-'))
  try {
    // Legacy state.json (before issue #60) — missing retryCount and phasesCompleted
    await writeState(basePath, 'us5-legacy', {
      currentPhase: 'DISCOVER',
      verdicts: {},
      difficulty: null,
      userPreferences: { maxRetriesPerPhase: 2 }
      // intentionally missing: retryCount, phasesCompleted, phaseArtifacts, reviewArtifacts
    })

    const result = await stateCli(
      ['record-verdict', '--phase', 'DISCOVER', '--verdict', 'APPROVED', '--slug', 'us5-legacy'],
      { basePath }
    )

    assert.equal(result.exitCode, 0, `expected exit 0\nstderr: ${result.stderr}`)
    const state = await readState(basePath, 'us5-legacy')
    assert.ok('retryCount' in state, 'retryCount must be coerced into state')
    assert.deepEqual(state.retryCount, {}, 'retryCount must be coerced to {}')
    assert.ok('phasesCompleted' in state, 'phasesCompleted must be coerced into state')
    assert.deepEqual(state.phasesCompleted, [], 'phasesCompleted must be coerced to []')
    assert.equal(state.verdicts['DISCOVER'], 'APPROVED')
  } finally {
    await rm(basePath, { recursive: true, force: true })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// AC13 — close-phase composite: verdict + review artifact + advance in one call
// ─────────────────────────────────────────────────────────────────────────────
test('AC13a: close-phase records verdict, appends review artifact, and advances currentPhase', async () => {
  const basePath = await mkdtemp(join(tmpdir(), 'skraft-ac13a-'))
  try {
    await writeState(basePath, 'us5', baseState({ currentPhase: 'DELIVER', phasesCompleted: ['DISCOVER', 'DISCUSS', 'DESIGN', 'DISTILL'] }))

    const result = await stateCli(
      ['close-phase', '--phase', 'DELIVER', '--verdict', 'APPROVED', '--artifact', 'reviews/2026-07-12/manual-close.md', '--slug', 'us5'],
      { basePath }
    )

    assert.equal(result.exitCode, 0, `expected exit 0\nstderr: ${result.stderr}`)
    const state = await readState(basePath, 'us5')
    assert.equal(state.verdicts['DELIVER'], 'APPROVED')
    assert.deepEqual(state.reviewArtifacts['DELIVER'], ['reviews/2026-07-12/manual-close.md'])
    assert.equal(state.currentPhase, 'DONE')
    assert.ok(state.phasesCompleted.includes('DELIVER'))
  } finally {
    await rm(basePath, { recursive: true, force: true })
  }
})

test('AC13b: close-phase rejects with PHASE_MISMATCH when --phase differs from currentPhase', async () => {
  const basePath = await mkdtemp(join(tmpdir(), 'skraft-ac13b-'))
  try {
    await writeState(basePath, 'us5', baseState({ currentPhase: 'DISCUSS', phasesCompleted: ['DISCOVER'] }))
    const before = await readState(basePath, 'us5')

    const result = await stateCli(
      ['close-phase', '--phase', 'DESIGN', '--verdict', 'APPROVED', '--artifact', 'reviews/manual-close.md', '--slug', 'us5'],
      { basePath }
    )

    assert.equal(result.exitCode, 1)
    assert.ok(result.stderr.includes('PHASE_MISMATCH'), `stderr: ${result.stderr}`)
    const after = await readState(basePath, 'us5')
    assert.deepEqual(after, before, 'state.json must be unchanged on rejection')
  } finally {
    await rm(basePath, { recursive: true, force: true })
  }
})

test('AC13c: close-phase rejects with VERDICT_NOT_APPROVED when verdict is CHANGES_REQUESTED', async () => {
  const basePath = await mkdtemp(join(tmpdir(), 'skraft-ac13c-'))
  try {
    await writeState(basePath, 'us5', baseState({ currentPhase: 'DISCUSS', phasesCompleted: ['DISCOVER'] }))
    const before = await readState(basePath, 'us5')

    const result = await stateCli(
      ['close-phase', '--phase', 'DISCUSS', '--verdict', 'CHANGES_REQUESTED', '--artifact', 'reviews/manual-close.md', '--slug', 'us5'],
      { basePath }
    )

    assert.equal(result.exitCode, 1)
    assert.ok(result.stderr.includes('VERDICT_NOT_APPROVED'), `stderr: ${result.stderr}`)
    const after = await readState(basePath, 'us5')
    assert.deepEqual(after, before, 'state.json must be unchanged on rejection')
  } finally {
    await rm(basePath, { recursive: true, force: true })
  }
})

