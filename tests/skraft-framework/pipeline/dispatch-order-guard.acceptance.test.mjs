import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Outer-loop boundary for G1. The gate reads the state.json the state CLI writes and the
// published framework config — no hand-shaped runtime state, no copied config.
import { createPreToolUseService } from '../../../plugins/skraft-framework/src/application/pre-tool-use-service.mjs'
import { createJsonStateReader } from '../../../plugins/skraft-framework/src/adapters/infrastructure/json-state-reader.mjs'
import { CONFIG, closeAllPhases, gitRepo, producePhase, stateCli } from '../state/phase-closure-fixture.mjs'

const SLUG = 'pricing'
const FIXED_NOW = '2026-09-23T12:00:00.000Z'

const collectingAuditWriter = () => {
  const entries = []
  return { entries, write: async (entry) => { entries.push(entry) } }
}

// A tracking root driven only through the state CLI, as the orchestrator drives it.
const pipeline = async () => {
  const root = await mkdtemp(join(tmpdir(), 'skraft-g1-'))
  const repo = gitRepo(join(root, 'repo'))
  const run = stateCli({ root, cwd: join(root, 'repo') })
  const cli = async (...args) => run(...args, '--slug', SLUG)
  await cli('init')
  const audit = collectingAuditWriter()
  const gate = createPreToolUseService({
    stateReader: createJsonStateReader(root),
    auditWriter: audit,
    config: CONFIG,
    clock: { now: () => FIXED_NOW },
  })
  const dispatch = async (requestedAgent) => {
    const before = audit.entries.length
    const result = await gate.handle({ requestedAgent, projectSlug: SLUG })
    return { result, audit: audit.entries.slice(before) }
  }
  return { root, repo, run, cli, dispatch, cleanup: () => rm(root, { recursive: true, force: true }) }
}

const withPipeline = async (fn) => {
  const p = await pipeline()
  try { await fn(p) } finally { await p.cleanup() }
}

const toDesign = async ({ root, run, cli }) => {
  producePhase({ root, slug: SLUG, phase: 'RESEARCH', cli: run })
  await cli('close-phase', '--phase', 'RESEARCH', '--verdict', 'APPROVED')
}
const approveDesign = ({ root, run }) => producePhase({ root, slug: SLUG, phase: 'DESIGN', cli: run })

// ─── Conforming dispatches are allowed and audited once ────────────────────────

test('a fresh pipeline dispatches the research specialist', async () => {
  await withPipeline(async ({ dispatch }) => {
    const { result, audit } = await dispatch('skraft:solution-researcher')
    assert.equal(result.decision, 'allow')
    assert.equal(audit.length, 1)
    assert.equal(audit[0].event, 'DispatchEvaluated')
    assert.equal(audit[0].projectSlug, SLUG)
    assert.equal(audit[0].decision, 'ALLOW')
    assert.equal(audit[0].code, 'CONFORMING')
    assert.equal(audit[0].evaluatedAt, FIXED_NOW)
  })
})

test('the reviewer runs once its specialist recorded an artefact, and again after a retry', async () => {
  await withPipeline(async (p) => {
    const { cli, dispatch } = p
    await toDesign(p)
    await cli('record-artifact', '--phase', 'DESIGN', '--path', 'details/2026-09-23/contracts-loyalty.md')
    assert.equal((await dispatch('solution-architect-reviewer')).result.decision, 'allow')

    await cli('record-verdict', '--phase', 'DESIGN', '--verdict', 'CHANGES_REQUESTED')
    await cli('incr-retry', '--phase', 'DESIGN')
    assert.equal((await dispatch('Skraft - Solution Architect')).result.decision, 'allow')
    assert.equal((await dispatch('solution-architect-reviewer')).result.decision, 'allow')
  })
})

test('an approved DESIGN still accepts its architect for ADR ratification', async () => {
  await withPipeline(async (p) => {
    await toDesign(p)
    approveDesign(p)
    assert.equal((await p.dispatch('solution-architect')).result.decision, 'allow')
  })
})

// ─── Out-of-order dispatches are denied and name what must run first ───────────

test('a reviewer before its specialist is denied and names the specialist', async () => {
  await withPipeline(async (p) => {
    await toDesign(p)
    const { result, audit } = await p.dispatch('solution-architect-reviewer')
    assert.equal(result.decision, 'deny')
    assert.match(result.message, /Skraft - Solution Architect\b/)
    assert.equal(audit[0].decision, 'DENY')
    assert.equal(audit[0].code, 'OUT_OF_ORDER')
    assert.equal(audit[0].expectedAgent, 'Skraft - Solution Architect')
  })
})

test('the next phase waits for its transition, even after an approved verdict', async () => {
  await withPipeline(async (p) => {
    const { cli, dispatch } = p
    await toDesign(p)
    approveDesign(p)

    const { result, audit } = await dispatch('acceptance-designer')
    assert.equal(result.decision, 'deny')
    assert.match(result.message, /DESIGN/)
    assert.match(result.message, /transition/)
    assert.equal(audit[0].code, 'OUT_OF_ORDER')

    await cli('transition', '--to', 'DISTILL')
    assert.equal((await dispatch('acceptance-designer')).result.decision, 'allow')
  })
})

test('a phase skipped ahead is denied', async () => {
  await withPipeline(async ({ dispatch }) => {
    const { result } = await dispatch('software-engineer')
    assert.equal(result.decision, 'deny')
    assert.match(result.message, /Skraft - Solution Researcher/)
  })
})

test('a completed pipeline dispatches no phase agent', async () => {
  await withPipeline(async ({ root, repo, run, dispatch }) => {
    closeAllPhases({ root, slug: SLUG, cli: run, repo })
    const { result, audit } = await dispatch('software-engineer')
    assert.equal(result.decision, 'block')
    assert.equal(audit[0].code, 'PIPELINE_COMPLETE')
  })
})

// ─── Only pipeline agents are governed ─────────────────────────────────────────

test('workers and lenses are allowed without reading the state', async () => {
  const audit = collectingAuditWriter()
  const gate = createPreToolUseService({
    stateReader: { read: async () => { throw new Error('state must not be read for an ungoverned agent') } },
    auditWriter: audit,
    config: CONFIG,
    clock: { now: () => FIXED_NOW },
  })
  for (const agent of ['skraft:contract-testing-worker', 'cold-reader-lens', 'general-purpose']) {
    const result = await gate.handle({ requestedAgent: agent, projectSlug: SLUG })
    assert.equal(result.decision, 'allow', agent)
  }
  assert.deepEqual(audit.entries.map((e) => e.code), ['UNGOVERNED', 'UNGOVERNED', 'UNGOVERNED'])
})

// ─── Fail-closed for pipeline agents when the state cannot be trusted ─────────

test('a pipeline agent is blocked when the state is missing or unusable', async () => {
  const cases = [
    [{ read: async () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) } }, 'UNREADABLE_STATE'],
    [{ read: async () => ({ phasesCompleted: [] }) }, 'INVALID_STATE'],
    [{ read: async () => ({ currentPhase: 'DISCOVER' }) }, 'INVALID_STATE'],
  ]
  for (const [stateReader, code] of cases) {
    const audit = collectingAuditWriter()
    const gate = createPreToolUseService({ stateReader, auditWriter: audit, config: CONFIG, clock: { now: () => FIXED_NOW } })
    const result = await gate.handle({ requestedAgent: 'solution-researcher', projectSlug: SLUG })
    assert.equal(result.decision, 'block', code)
    assert.equal(audit.entries[0].code, code)
  }
})

test('a pipeline agent blocked by an invalid or unreadable state is pointed to state.mjs diagnose', async () => {
  const readers = [
    { read: async () => ({ currentPhase: 'RESEARCH', reviewerVerdicts: {} }) },
    { read: async () => { throw Object.assign(new Error('bad json'), { code: 'CORRUPTED_STATE' }) } },
  ]
  for (const stateReader of readers) {
    const gate = createPreToolUseService({ stateReader, auditWriter: collectingAuditWriter(), config: CONFIG, clock: { now: () => FIXED_NOW } })
    const result = await gate.handle({ requestedAgent: 'solution-researcher', projectSlug: SLUG })
    assert.equal(result.decision, 'block')
    assert.match(result.message, /run state\.mjs diagnose/)
  }
})
