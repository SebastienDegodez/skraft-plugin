import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStateService } from '../../../plugins/skraft-framework/src/application/state-service.mjs'
import { Ok, Err } from '../../../plugins/skraft-framework/src/domain/result.mjs'

// ─── Test doubles ─────────────────────────────────────────────────────────────
const readerOk = (state) => ({ read: async () => state })
const readerEnoent = () => ({
  read: async () => { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e },
})
const readerCorrupted = () => ({
  read: async () => { const e = new Error('Corrupted state.json: syntax error'); e.code = 'CORRUPTED_STATE'; throw e },
})
const readerIoError = () => ({
  read: async () => { const e = new Error('disk failure'); e.code = 'EIO'; throw e },
})

const writerOk = () => {
  const written = {}
  return {
    write: async (slug, state) => { written[slug] = state; return Ok(undefined) },
    _written: written,
  }
}
const writerFail = () => ({ write: async () => Err({ code: 'IO_ERROR', reason: 'disk full' }) })

const DEFAULT_PIPELINE = {
  currentPhase: 'RESEARCH',
  phasesCompleted: [],
  verdicts: {},
  retryCount: {},
  phaseArtifacts: {},
  reviewArtifacts: {},
  userPreferences: { maxRetriesPerPhase: 2 },
}

// ─── init ─────────────────────────────────────────────────────────────────────
test('state-service init: creates default state on ENOENT, returns created=true', async () => {
  const writer = writerOk()
  const svc = createStateService({ stateReader: readerEnoent(), stateWriter: writer })
  const r = await svc.init('my-slug')
  assert.equal(r.ok, true)
  assert.equal(r.value.created, true)
  assert.equal(r.value.currentPhase, 'RESEARCH')
  assert.deepEqual(r.value.phasesCompleted, [], 'default phasesCompleted must be []')
  assert.equal(r.value.userPreferences.maxRetriesPerPhase, 2, 'default maxRetriesPerPhase must be 2')
  assert.equal(writer._written['my-slug'].currentPhase, 'RESEARCH')
})

test('state-service init: fresh default carries the full documented field set', async () => {
  const writer = writerOk()
  const svc = createStateService({ stateReader: readerEnoent(), stateWriter: writer })
  const r = await svc.init('slug')
  assert.equal(r.ok, true)
  const w = writer._written['slug']
  assert.equal(w.projectSlug, 'slug')
  // scalars orchestrator populates later — present (null/empty) so no reader guesses
  assert.equal('entryPoint' in w, false, 'upstream entry routing is retired')
  assert.deepEqual(w.adrRatification, { checkpointStatus: 'none', pending: [], ratified: [] })
  assert.deepEqual(w.phaseHistory, {})
})

test('state-service init: returns created=false when state exists', async () => {
  const existing = { ...DEFAULT_PIPELINE, currentPhase: 'DESIGN', phasesCompleted: ['RESEARCH'] }
  const svc = createStateService({ stateReader: readerOk(existing), stateWriter: writerOk() })
  const r = await svc.init('slug')
  assert.equal(r.ok, true)
  assert.equal(r.value.created, false)
  assert.equal(r.value.currentPhase, 'DESIGN')
})

test('state-service init: propagates CORRUPTED_STATE from reader', async () => {
  const svc = createStateService({ stateReader: readerCorrupted(), stateWriter: writerOk() })
  const r = await svc.init('slug')
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'CORRUPTED_STATE')
})

test('state-service init: propagates IO_ERROR from reader', async () => {
  const svc = createStateService({ stateReader: readerIoError(), stateWriter: writerOk() })
  const r = await svc.init('slug')
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'IO_ERROR')
})

test('state-service init: propagates write failure when ENOENT and writer fails', async () => {
  const svc = createStateService({ stateReader: readerEnoent(), stateWriter: writerFail() })
  const r = await svc.init('slug')
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'IO_ERROR')
})

test('state-service init: returns CORRUPTED_STATE when state fails validatePipelineState', async () => {
  const svc = createStateService({ stateReader: readerOk(null), stateWriter: writerOk() })
  const r = await svc.init('slug')
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'CORRUPTED_STATE')
})

// ─── applyEvent ───────────────────────────────────────────────────────────────
test('state-service applyEvent: applies RECORD_VERDICT and writes result', async () => {
  const writer = writerOk()
  const state = { ...DEFAULT_PIPELINE, currentPhase: 'RESEARCH' }
  const svc = createStateService({ stateReader: readerOk(state), stateWriter: writer })
  const r = await svc.applyEvent('slug', { type: 'RECORD_VERDICT', phase: 'RESEARCH', verdict: 'APPROVED' })
  assert.equal(r.ok, true)
  assert.equal(r.value.verdicts.RESEARCH, 'APPROVED')
  assert.equal(writer._written['slug'].verdicts.RESEARCH, 'APPROVED')
})

test('state-service applyEvent: auto-init on ENOENT then replays event', async () => {
  let readCount = 0
  const reader = {
    read: async () => {
      readCount++
      const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e
    },
  }
  const writer = writerOk()
  const svc = createStateService({ stateReader: reader, stateWriter: writer })
  const r = await svc.applyEvent('slug', { type: 'RECORD_VERDICT', phase: 'RESEARCH', verdict: 'APPROVED' })
  assert.equal(r.ok, true)
  assert.equal(r.value.verdicts.RESEARCH, 'APPROVED')
})

test('state-service applyEvent: propagates CORRUPTED_STATE from reader', async () => {
  const svc = createStateService({ stateReader: readerCorrupted(), stateWriter: writerOk() })
  const r = await svc.applyEvent('slug', { type: 'RECORD_VERDICT', phase: 'X', verdict: 'APPROVED' })
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'CORRUPTED_STATE')
})

test('state-service applyEvent: propagates IO_ERROR from reader', async () => {
  const svc = createStateService({ stateReader: readerIoError(), stateWriter: writerOk() })
  const r = await svc.applyEvent('slug', { type: 'RECORD_VERDICT', phase: 'X', verdict: 'APPROVED' })
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'IO_ERROR')
})

test('state-service applyEvent: propagates domain error (VERDICT_NOT_APPROVED) without writing', async () => {
  const writer = writerOk()
  const state = { ...DEFAULT_PIPELINE, currentPhase: 'RESEARCH', verdicts: {} }
  const svc = createStateService({ stateReader: readerOk(state), stateWriter: writer })
  const r = await svc.applyEvent('slug', { type: 'ADVANCE', targetPhase: 'DESIGN' })
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'VERDICT_NOT_APPROVED')
  assert.equal(writer._written['slug'], undefined, 'must not write on domain error')
})

test('state-service applyEvent: propagates write failure after successful transition', async () => {
  const state = { ...DEFAULT_PIPELINE, currentPhase: 'RESEARCH', verdicts: { RESEARCH: 'APPROVED' } }
  const svc = createStateService({ stateReader: readerOk(state), stateWriter: writerFail() })
  const r = await svc.applyEvent('slug', { type: 'ADVANCE', targetPhase: 'DESIGN' })
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'IO_ERROR')
})

test('state-service applyEvent: ENOENT auto-init propagates write failure', async () => {
  const svc = createStateService({ stateReader: readerEnoent(), stateWriter: writerFail() })
  const r = await svc.applyEvent('slug', { type: 'RECORD_VERDICT', phase: 'X', verdict: 'APPROVED' })
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'IO_ERROR')
})

test('state-service applyEvent: ENOENT auto-init write failure returns early (does not proceed to apply)', async () => {
  // Writer fails on first call, succeeds on second. Without early-return guard,
  // the service would proceed past the failed init-write and attempt a second write.
  let callCount = 0
  const written = {}
  const firstFailWriter = {
    write: async (slug, state) => {
      callCount++
      if (callCount === 1) return Err({ code: 'IO_ERROR', reason: 'init write fails' })
      written[slug] = state
      return Ok(undefined)
    },
    _written: written,
  }
  const svc = createStateService({ stateReader: readerEnoent(), stateWriter: firstFailWriter })
  const r = await svc.applyEvent('slug', { type: 'RECORD_VERDICT', phase: 'RESEARCH', verdict: 'APPROVED' })
  assert.equal(r.ok, false, 'must return Err when init write fails')
  assert.equal(firstFailWriter._written['slug'], undefined, 'must not attempt event write when init write fails')
})

test('state-service applyEvent: returns INVALID_STATE when read state fails validation', async () => {
  const svc = createStateService({ stateReader: readerOk(null), stateWriter: writerOk() })
  const r = await svc.applyEvent('slug', { type: 'RECORD_VERDICT', phase: 'X', verdict: 'APPROVED' })
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'INVALID_STATE')
})

// ─── get ──────────────────────────────────────────────────────────────────────
test('state-service get: returns full state when field is undefined', async () => {
  const state = { ...DEFAULT_PIPELINE, currentPhase: 'DESIGN' }
  const svc = createStateService({ stateReader: readerOk(state), stateWriter: writerOk() })
  const r = await svc.get('slug', undefined)
  assert.equal(r.ok, true)
  assert.equal(r.value.currentPhase, 'DESIGN')
})

test('state-service get: returns scalar when field is specified', async () => {
  const state = { ...DEFAULT_PIPELINE, currentPhase: 'DESIGN', retryCount: { DESIGN: 1 } }
  const svc = createStateService({ stateReader: readerOk(state), stateWriter: writerOk() })
  const r = await svc.get('slug', 'retryCount')
  assert.equal(r.ok, true)
  assert.deepEqual(r.value, { DESIGN: 1 })
})

test('state-service get: propagates IO_ERROR from reader', async () => {
  const svc = createStateService({ stateReader: readerIoError(), stateWriter: writerOk() })
  const r = await svc.get('slug', 'currentPhase')
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'IO_ERROR')
})

test('state-service get: propagates CORRUPTED_STATE from reader', async () => {
  const svc = createStateService({ stateReader: readerCorrupted(), stateWriter: writerOk() })
  const r = await svc.get('slug')
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'CORRUPTED_STATE')
})

test('state-service get: propagates ENOENT from reader', async () => {
  const svc = createStateService({ stateReader: readerEnoent(), stateWriter: writerOk() })
  const r = await svc.get('slug', 'currentPhase')
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'ENOENT')
})

test('state-service init: a fresh pipeline opens the first phase of the published order', async () => {
  const writer = writerOk()
  const svc = createStateService({ stateReader: readerEnoent(), stateWriter: writer, phaseOrder: ['ALPHA', 'OMEGA'] })
  const r = await svc.init('slug')
  assert.equal(r.value.currentPhase, 'ALPHA')
})

test('state-service applyEvent: transitions follow the published phase order', async () => {
  const state = { ...DEFAULT_PIPELINE, currentPhase: 'ALPHA', verdicts: { ALPHA: 'APPROVED' } }
  const writer = writerOk()
  const svc = createStateService({ stateReader: readerOk(state), stateWriter: writer, phaseOrder: ['ALPHA', 'OMEGA'] })
  const r = await svc.applyEvent('slug', { type: 'ADVANCE', targetPhase: 'OMEGA' })
  assert.equal(r.ok, true)
  assert.equal(r.value.currentPhase, 'OMEGA')
})

// ─── phase gate (G4/G5) ───────────────────────────────────────────────────────
const gateFinding = (...violations) => {
  const calls = []
  return { calls, check: async (...args) => { calls.push(args); return violations } }
}
const CLOSABLE = { ...DEFAULT_PIPELINE, currentPhase: 'ALPHA', verdicts: { ALPHA: 'APPROVED' } }
const CLOSURES = [
  { type: 'ADVANCE', targetPhase: 'OMEGA' },
  { type: 'CLOSE_PHASE', phase: 'ALPHA', verdict: 'APPROVED', path: 'alpha/review.md' },
]

test('state-service applyEvent: a closure the phase gate refuses fails with PHASE_GATE and writes nothing', async () => {
  for (const event of CLOSURES) {
    const writer = writerOk()
    const phaseGate = gateFinding(
      { code: 'ARTIFACT_MISSING', reason: 'alpha/findings.md is not on disk' },
      { code: 'VERDICT_MISMATCH', reason: 'the review says CHANGES_REQUESTED' },
    )
    const svc = createStateService({ stateReader: readerOk(CLOSABLE), stateWriter: writer, phaseOrder: ['ALPHA', 'OMEGA'], phaseGate })
    const r = await svc.applyEvent('slug', event)
    assert.equal(r.ok, false, event.type)
    assert.equal(r.error.code, 'PHASE_GATE')
    assert.equal(r.error.reason, 'ALPHA cannot close: ARTIFACT_MISSING — alpha/findings.md is not on disk; VERDICT_MISMATCH — the review says CHANGES_REQUESTED')
    assert.equal(r.error.violations.length, 2)
    assert.deepEqual(writer._written, {}, 'a refused closure leaves the state untouched')
  }
})

test('state-service applyEvent: the gate judges the open phase on the state before the closure', async () => {
  for (const event of CLOSURES) {
    const writer = writerOk()
    const phaseGate = gateFinding()
    const svc = createStateService({ stateReader: readerOk(CLOSABLE), stateWriter: writer, phaseOrder: ['ALPHA', 'OMEGA'], phaseGate })
    const r = await svc.applyEvent('slug', event)
    assert.equal(r.ok, true, event.type)
    assert.equal(writer._written.slug.currentPhase, 'OMEGA')
    const [[slug, state, phase, options]] = phaseGate.calls
    assert.equal(slug, 'slug')
    assert.equal(state.currentPhase, 'ALPHA')
    assert.equal(phase, 'ALPHA')
    assert.deepEqual(options, { closingArtifact: event.path }, 'close-phase hands over its closing review')
  }
})

test('state-service applyEvent: only a closure consults the phase gate', async () => {
  const phaseGate = gateFinding({ code: 'ARTIFACT_MISSING', reason: 'never asked' })
  const svc = createStateService({ stateReader: readerOk(CLOSABLE), stateWriter: writerOk(), phaseOrder: ['ALPHA', 'OMEGA'], phaseGate })
  const r = await svc.applyEvent('slug', { type: 'RECORD_VERDICT', phase: 'ALPHA', verdict: 'APPROVED' })
  assert.equal(r.ok, true)
  assert.deepEqual(phaseGate.calls, [])
})
