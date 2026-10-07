import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isRootReference, validateReportData, resolveQualityReference, parseQualityEvidence, qualityProofs,
} from '../../../plugins/skraft-framework/src/domain/reporting-presentation.mjs'

// Domain unit tests: report data validation, reference resolution and quality evidence parsing.
const sha40 = 'e8b963a1f70c4d229e10b348a69f5c71d231809e'
const sha64 = 'a'.repeat(64)

function data(overrides = {}) {
  return {
    kind: 'outcome',
    story: 'checkout',
    title: 'Keep the basket',
    revision: sha40,
    language: 'en',
    maxMedia: 1,
    impact: { expected: 'Retry works.' },
    criteria: [{ id: 'AC-1', description: 'Basket kept', test: 'tests/a.test.mjs' }],
    limitations: [],
    media: [],
    ...overrides,
  }
}

const rejects = (value, field) => assert.throws(() => validateReportData(value),
  (error) => error instanceof TypeError && error.message === `Invalid report ${field}`)

test('validateReportData accepts complete data with optional identifiers and references', () => {
  assert.equal(validateReportData(data({
    runId: 'run-1', reportId: 'r.2', revision: sha64,
    impact: { expected: 'x', actual: 'y' },
    criteria: [{ id: 'AC-1', description: 'd', test: 't', evidence: 'e' }, { id: 'AC-2', description: 'd', test: 't' }],
    limitations: ['one'],
    media: [{ label: 'shot', url: 'https://e.com/a.png', path: 'a.png' }],
    testPlanRef: 'p/plan.md', qualityEvidenceRef: 'p/evidence/q.json', reviewRef: 'p/r.md', changeLogRef: 'p/c.md',
  })), undefined)
  assert.equal(validateReportData(data({ maxMedia: 0, revision: sha40.toUpperCase() })), undefined)
})

test('validateReportData names the data, kind and story fields', () => {
  rejects(null, 'data')
  rejects([], 'data')
  rejects(data({ kind: 'draft' }), 'kind')
  rejects(data({ story: 'ab c' }), 'story')
  rejects(data({ story: '-abc' }), 'story')
  rejects(data({ story: '   ' }), 'story')
})

test('validateReportData checks optional run and report identifiers', () => {
  rejects(data({ runId: 'bad id' }), 'runId')
  rejects(data({ reportId: '.hidden' }), 'reportId')
})

test('validateReportData requires a 40 or 64 hex character revision', () => {
  rejects(data({ revision: 'xyz' }), 'revision')
  rejects(data({ revision: 'a' }), 'revision')
  rejects(data({ revision: `z${sha40}` }), 'revision')
  rejects(data({ revision: `${sha40}z` }), 'revision')
  rejects(data({ revision: 1234 }), 'revision')
})

test('validateReportData names title, language and maxMedia', () => {
  rejects(data({ title: '   ' }), 'title')
  rejects(data({ language: 'de' }), 'language')
  rejects(data({ maxMedia: 1.5 }), 'maxMedia')
  rejects(data({ maxMedia: -1 }), 'maxMedia')
})

test('validateReportData checks the impact shape', () => {
  rejects(data({ impact: null }), 'impact')
  rejects(data({ impact: { expected: 5 } }), 'impact')
  rejects(data({ impact: { expected: 'x', actual: 5 } }), 'impact')
})

test('validateReportData checks each criterion', () => {
  rejects(data({ criteria: 'AC-1' }), 'criteria')
  rejects(data({ criteria: [null] }), 'criterion id')
  rejects(data({ criteria: [{ id: 'a b', description: 'd', test: 't' }] }), 'criterion id')
  rejects(data({ criteria: [{ id: 'A', description: 'd', test: 't' }, { id: 'A', description: 'd', test: 't' }] }), 'criterion id')
  rejects(data({ criteria: [{ id: 'A', description: ' ', test: 't' }] }), 'criterion text')
  rejects(data({ criteria: [{ id: 'A', description: 'd', test: '' }] }), 'criterion text')
  rejects(data({ criteria: [{ id: 'A', description: 'd', test: 't', evidence: 5 }] }), 'criterion evidence')
})

test('validateReportData checks limitations and media entries', () => {
  rejects(data({ limitations: 'none' }), 'limitations')
  rejects(data({ limitations: [1] }), 'limitations')
  rejects(data({ media: 'none' }), 'media')
  rejects(data({ media: [null] }), 'media')
  rejects(data({ media: [{ label: '' }] }), 'media')
  rejects(data({ media: [{ label: 'x', url: 5 }] }), 'media')
  rejects(data({ media: [{ label: 'x', path: 5 }] }), 'media')
})

test('validateReportData names each invalid root reference field', () => {
  rejects(data({ testPlanRef: '/abs/plan.md' }), 'testPlanRef')
  rejects(data({ qualityEvidenceRef: '../q.json' }), 'qualityEvidenceRef')
  rejects(data({ reviewRef: 'a/./b.md' }), 'reviewRef')
  rejects(data({ changeLogRef: 'a b.md' }), 'changeLogRef')
})

test('isRootReference rejects empty, dot and dot-dot segments', () => {
  assert.equal(isRootReference('a/b/c.md'), true)
  assert.equal(isRootReference('a//b'), false)
  assert.equal(isRootReference('a/./b'), false)
  assert.equal(isRootReference('a/../b'), false)
  assert.equal(isRootReference('/a'), false)
  assert.equal(isRootReference('a:b'), false)
  assert.equal(isRootReference('  '), false)
})

test('resolveQualityReference rebases evidence/ refs on the plan root of the quality document', () => {
  assert.equal(resolveQualityReference('evidence/g1.out', 'plan/evidence/2026/q.json'), 'plan/evidence/g1.out')
  assert.equal(resolveQualityReference('evidence/g1.out', 'a/evidence/b/evidence/q.json'), 'a/evidence/b/evidence/g1.out')
  assert.equal(resolveQualityReference('evidence/g1.out', '/evidence/q.json'), '/evidence/g1.out')
  assert.equal(resolveQualityReference('evidence/g1.out', 'evidence/2026/q.json'), 'evidence/g1.out')
  assert.equal(resolveQualityReference('evidence/g1.out', 'other/q.json'), undefined)
  assert.equal(resolveQualityReference('evidence/g1.out', undefined), undefined)
  assert.equal(resolveQualityReference('logs/evidence/g1.out', 'plan/evidence/q.json'), 'logs/evidence/g1.out')
  assert.equal(resolveQualityReference('../g1.out', 'plan/evidence/q.json'), undefined)
})

function quality(overrides = {}) {
  return {
    $schema: 'quality-gates-evidence/v3',
    repo_root_rev: sha40,
    story: 'checkout',
    produced_at: '2026-09-17T10:00:00Z',
    producer: 'engineer',
    tech_adapter: 'node',
    gates: [{ id: 'G1', label: 'Tests' }],
    commits_covered: [{ sha: sha40, subject: 'fix', files_changed: ['a.mjs'] }],
    test_integrity: { cycles: [] },
    ...overrides,
  }
}
const parse = (value, report = data()) => parseQualityEvidence(typeof value === 'string' ? value : JSON.stringify(value), report)
const fields = { error: 'Malformed quality evidence fields' }
const gateError = { error: 'Malformed or duplicate quality gate identifier/label' }

test('parseQualityEvidence reports missing, malformed and unknown documents', () => {
  assert.deepEqual(parseQualityEvidence(undefined, data()), { error: 'Missing quality evidence document' })
  assert.deepEqual(parse('{'), { error: 'Malformed quality evidence JSON' })
  assert.deepEqual(parse('null'), { error: 'Unknown or missing quality evidence schema' })
  assert.deepEqual(parse(quality({ $schema: 'bogus' })), { error: 'Unknown or missing quality evidence schema' })
  assert.deepEqual(parse(quality({ $schema: 'x-quality-gates-evidence/v1' })), { error: 'Unknown or missing quality evidence schema' })
  assert.deepEqual(parse(quality({ $schema: 'quality-gates-evidence/v12' })), { error: 'Unknown or missing quality evidence schema' })
})

test('parseQualityEvidence binds the document to the report revision and story', () => {
  const mismatch = { error: 'Quality evidence revision or story mismatch' }
  assert.deepEqual(parse(quality({ repo_root_rev: sha64 })), mismatch)
  assert.deepEqual(parse(quality({ story: 'other' })), mismatch)
})

test('parseQualityEvidence accepts each known schema version', () => {
  for (const version of ['v1', 'v2', 'v3', 'v4']) {
    const document = quality({ $schema: `quality-gates-evidence/${version}` })
    assert.deepEqual(parse(document), { quality: document })
  }
})

test('parseQualityEvidence rejects each malformed top-level field', () => {
  assert.deepEqual(parse(quality({ produced_at: undefined })), fields)
  assert.deepEqual(parse(quality({ produced_at: 'yesterday' })), fields)
  assert.deepEqual(parse(quality({ producer: ' ' })), fields)
  assert.deepEqual(parse(quality({ tech_adapter: undefined })), fields)
  assert.deepEqual(parse(quality({ gates: {} })), fields)
  assert.deepEqual(parse(quality({ commits_covered: {} })), fields)
  assert.deepEqual(parse(quality({ test_integrity: [] })), fields)
  assert.deepEqual(parse(quality({ test_integrity: null })), fields)
  assert.deepEqual(parse(quality({ test_integrity: { cycles: {} } })), fields)
  assert.deepEqual(parse(quality({ test_integrity: { cycles: [null] } })), fields)
})

test('parseQualityEvidence rejects each malformed commit', () => {
  const commit = { sha: sha40, subject: 'fix', files_changed: ['a.mjs'] }
  assert.deepEqual(parse(quality({ commits_covered: [null] })), fields)
  assert.deepEqual(parse(quality({ commits_covered: [{ ...commit, sha: 'abc' }] })), fields)
  assert.deepEqual(parse(quality({ commits_covered: [{ ...commit, subject: '' }] })), fields)
  assert.deepEqual(parse(quality({ commits_covered: [{ ...commit, files_changed: 'a.mjs' }] })), fields)
  assert.deepEqual(parse(quality({ commits_covered: [{ ...commit, files_changed: ['a.mjs', ' '] }] })), fields)
  const valid = quality({ commits_covered: [commit, { ...commit, sha: sha64, files_changed: [] }] })
  assert.deepEqual(parse(valid), { quality: valid })
})

test('parseQualityEvidence rejects unknown, unlabelled or duplicate gates', () => {
  assert.deepEqual(parse(quality({ gates: [null] })), gateError)
  assert.deepEqual(parse(quality({ gates: [{ id: 'G99', label: 'x' }] })), gateError)
  assert.deepEqual(parse(quality({ gates: [{ id: 'G1', label: ' ' }] })), gateError)
  assert.deepEqual(parse(quality({ gates: [{ id: 'G1', label: 'a' }, { id: 'G1', label: 'b' }] })), gateError)
  assert.deepEqual(parse(quality({ gates: [{ id: 'G6', label: 'a', scope: 'core' }, { id: 'G6', label: 'b', scope: 'boundary' }] })), gateError)
})

test('parseQualityEvidence keys v4 mutation gates by scope', () => {
  const scoped = quality({ $schema: 'quality-gates-evidence/v4',
    gates: [{ id: 'G6', label: 'a', scope: 'core' }, { id: 'G6', label: 'b', scope: 'boundary' }] })
  assert.deepEqual(parse(scoped), { quality: scoped })
  const duplicate = quality({ $schema: 'quality-gates-evidence/v4',
    gates: [{ id: 'G6', label: 'a', scope: 'core' }, { id: 'G6', label: 'b', scope: 'core' }] })
  assert.deepEqual(parse(duplicate), gateError)
})

test('qualityProofs lists resolved, distinct, defined proof references', () => {
  assert.deepEqual(qualityProofs(undefined, 'p/evidence/q.json'), [])
  const document = quality({
    gates: [
      { id: 'G1', label: 'a', stdout_ref: 'evidence/g1.out', exit_code_ref: 'evidence/g1.exit' },
      { id: 'G2', label: 'b', stdout_ref: 'evidence/g1.out' },
      { id: 'G3', label: 'c', stdout_ref: '../escape', exit_code_ref: 'logs/g3.exit' },
    ],
    test_integrity: { cycles: [{ red_stdout_ref: 'evidence/red.out', red_exit_code_ref: 'evidence/red.exit' }] },
  })
  assert.deepEqual(qualityProofs(document, 'p/evidence/q.json'), [
    'p/evidence/g1.out', 'p/evidence/g1.exit', 'logs/g3.exit', 'p/evidence/red.out', 'p/evidence/red.exit',
  ])
})
