import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ARTIFACTS, validate, renderArtifact } from '../../scripts/lib/artifact.mjs'

const fullAdr = () => ({
  adr: 8,
  adrLabel: '008',
  title: 'Result type for domain errors',
  status: 'Accepted',
  chosen: 'Result<T,E> over thrown exceptions',
  decisionSummary: 'We return a Result union so callers handle failure explicitly.',
  date: '2026-07-01',
  deciders: 'Solution Architect',
  context: 'Domain layer threw exceptions callers did not catch.',
  decision: 'Every domain function returns Result<T,E>.',
  consequences: '- **Positive**: Failure explicit at the call site',
})

test('validate: full adr payload passes with no missing fields', () => {
  const result = validate('adr', fullAdr())
  assert.equal(result.ok, true)
  assert.equal(result.unknownType, false)
  assert.deepEqual(result.missing, [])
})

test('validate: reports each absent required field', () => {
  const data = fullAdr()
  delete data.context
  delete data.decision
  delete data.consequences
  const result = validate('adr', data)
  assert.equal(result.ok, false)
  assert.deepEqual(result.missing, ['context', 'decision', 'consequences'])
})

test('validate: null and empty-string required fields count as missing', () => {
  const data = fullAdr()
  data.title = ''
  data.deciders = null
  const result = validate('adr', data)
  assert.equal(result.ok, false)
  assert.deepEqual(result.missing.sort(), ['deciders', 'title'])
})

test('validate: empty array required field counts as missing', () => {
  const spec = ARTIFACTS.adr
  // consequences may be authored as a list; an empty one is not usable.
  const data = { ...fullAdr(), consequences: [] }
  const result = validate('adr', data)
  assert.equal(result.ok, false)
  assert.ok(result.missing.includes('consequences'))
  assert.ok(spec.required.includes('consequences'))
})

test('validate: optional fields absent do not fail validation', () => {
  const data = fullAdr()
  // no supersedes / supersedesLink / alternatives / ratifiedBy
  const result = validate('adr', data)
  assert.equal(result.ok, true)
})

test('validate: unknown artifact type is flagged, not thrown', () => {
  const result = validate('frobnicate', {})
  assert.equal(result.ok, false)
  assert.equal(result.unknownType, true)
})

test('renderArtifact: renders the adr template from validated data', () => {
  const output = renderArtifact('adr', fullAdr())
  assert.match(output, /# ADR-008 — Result type for domain errors/)
  assert.match(output, /## Consequences/)
  assert.match(output, /\*\*Positive\*\*/)
})

test('renderArtifact: throws on unknown artifact type', () => {
  assert.throws(() => renderArtifact('frobnicate', {}), /unknown artifact type/)
})

const fullVerdict = () => ({
  verdict: 'APPROVED',
  confidence: 'high',
  lenses: {
    completeness: { status: 'pass', findings: [] },
  },
  synthesis: {
    questions: {
      completeness: { answered_by: ['completeness'], weight: 0.3, contribution: 0.3 },
    },
    blocking_findings: [],
    recommendations: [],
    dissent: 'No lens disagreement.',
  },
})

test('validate: full review-verdict payload passes', () => {
  const result = validate('review-verdict', fullVerdict())
  assert.equal(result.ok, true)
  assert.deepEqual(result.missing, [])
})

test('validate: review-verdict reports missing top-level keys', () => {
  const data = fullVerdict()
  delete data.lenses
  delete data.synthesis
  const result = validate('review-verdict', data)
  assert.equal(result.ok, false)
  assert.deepEqual(result.missing, ['lenses|lens_results', 'synthesis|summary'])
})

test('validate: review-verdict empty lenses list counts as missing', () => {
  const result = validate('review-verdict', { ...fullVerdict(), lenses: [] })
  assert.equal(result.ok, false)
  assert.ok(result.missing.includes('lenses|lens_results'))
})

test('validate: delivery review-verdict semantic YAML shape passes', () => {
  const result = validate('review-verdict', {
    status: 'APPROVED',
    lens_results: [{ lens: 'quality-gates', verdict: 'pass', defects: [] }],
    dissent_analysis: 'No dissent.',
    summary: 'Quality gates pass.',
  })
  assert.equal(result.ok, true)
  assert.deepEqual(result.missing, [])
})

test('renderArtifact: renders the semantic review-verdict payload as YAML', () => {
  const output = renderArtifact('review-verdict', fullVerdict())
  assert.match(output, /# Review verdict/)
  assert.match(output, /verdict: "APPROVED"/)
  assert.match(output, /completeness:/)
  assert.match(output, /weight: 0\.3/)
  assert.match(output, /contribution: 0\.3/)
  assert.match(output, /dissent: "No lens disagreement\."/)
  assert.doesNotMatch(output, /lensCount|lensScore|score:|index:/)
})

const fullComment = () => ({
  phase: 'DISCUSS',
  icon: '✅',
  status: 'APPROVED',
  artefacts: ['`plans/2026-07-01/stories-demo.md` — 3 stories, DoR 8/8'],
  verdictLabel: 'APPROVED (attempt 1)',
  nextPhase: 'DESIGN → dispatch `solution-architect`',
})

test('validate: full review-comment payload passes without optional blocks', () => {
  const result = validate('review-comment', fullComment())
  assert.equal(result.ok, true)
  assert.deepEqual(result.missing, [])
})

test('validate: review-comment reports missing required keys', () => {
  const data = fullComment()
  delete data.verdictLabel
  delete data.nextPhase
  const result = validate('review-comment', data)
  assert.equal(result.ok, false)
  assert.deepEqual(result.missing, ['verdictLabel', 'nextPhase'])
})

test('renderArtifact: review-comment skips the optional evidence block', () => {
  const output = renderArtifact('review-comment', fullComment())
  assert.match(output, /## Phase DISCUSS ✅ APPROVED/)
  assert.match(output, /\*\*Reviewer verdict:\*\* APPROVED \(attempt 1\)/)
  assert.doesNotMatch(output, /Evidence:/)
})
