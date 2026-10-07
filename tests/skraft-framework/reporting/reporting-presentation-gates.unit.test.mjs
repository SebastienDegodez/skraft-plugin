import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildReportView } from '../../../plugins/skraft-framework/src/domain/reporting-presentation.mjs'

// Domain unit tests: the outcome gate evidence table built from parsed quality evidence
// and in-memory proofs ({ text, hash } per resolved reference). No hashing happens here.
const sha40 = 'e8b963a1f70c4d229e10b348a69f5c71d231809e'
const H = 'b'.repeat(64)
const R = 'c'.repeat(64)

function outcomeData(overrides = {}) {
  return {
    kind: 'outcome', story: 'checkout', title: 'Keep the basket', revision: sha40, language: 'en', maxMedia: 0,
    impact: { expected: 'Retry works.', actual: 'Retry worked.' },
    criteria: [], limitations: [], media: [],
    qualityEvidenceRef: 'p/evidence/q.json', reviewRef: 'p/review.md', changeLogRef: 'p/changes.md',
    ...overrides,
  }
}

const gate = (overrides = {}) => ({
  id: 'G1', label: 'Tests', status: 'pass', command_executed: 'npm test',
  stdout_ref: 'logs/g1.out', exit_code_ref: 'logs/g1.exit', stdout_sha256: H, stdout_tail: 'all done',
  ...overrides,
})
const quality = (gates, cycles = [], schema = 'quality-gates-evidence/v3') => ({
  $schema: schema, gates, test_integrity: { cycles },
})
const proofs = (entries = {}) => new Map(Object.entries({
  'logs/g1.out': { text: 'start\nall done', hash: H },
  'logs/g1.exit': { text: '0\n', hash: R },
  ...entries,
}))

function rows(view) {
  return view.gates.split('\n').filter((line) => line.startsWith('| ')).slice(2)
    .map((line) => line.slice(2, -2).split(' | '))
}
function row(view, id) {
  return rows(view).find((cells) => cells[0] === id)
}
// [status, evidence check] for one gate.
function check(gateOverrides = {}, proofEntries = {}, cycles = []) {
  const g = gate(gateOverrides)
  const view = buildReportView(outcomeData(), new Map(), { quality: quality([g], cycles) }, proofs(proofEntries))
  const cells = row(view, g.id)
  return [cells[2], cells[6]]
}
const unverified = (reason) => ['UNVERIFIED', reason]

test('a gate passes on matching hash, stdout tail and zero exit', () => {
  assert.deepEqual(check(), ['pass', 'exit=0'])
})

test('a nonzero multi-digit runner exit fails the gate', () => {
  assert.deepEqual(check({}, { 'logs/g1.exit': { text: '10', hash: R } }), ['fail', 'exit=10'])
  assert.deepEqual(check({}, { 'logs/g1.exit': { text: '-2' } }), ['fail', 'exit=-2'])
})

test('a runner exit that is not a plain safe integer is malformed', () => {
  for (const exit of ['abc', '+1', '0x10', '1x', '99999999999999999999']) {
    assert.deepEqual(check({}, { 'logs/g1.exit': { text: exit } }), unverified('Malformed runner exit'), exit)
  }
})

test('the declared hash must be exactly 64 lowercase hex characters and match stdout', () => {
  assert.deepEqual(check({ stdout_sha256: `${H}0` }, { 'logs/g1.out': { text: 'all done', hash: `${H}0` } }),
    unverified('SHA256 hash mismatch'))
  assert.deepEqual(check({ stdout_sha256: `0${H}` }, { 'logs/g1.out': { text: 'all done', hash: `0${H}` } }),
    unverified('SHA256 hash mismatch'))
  assert.deepEqual(check({ stdout_sha256: R }), unverified('SHA256 hash mismatch'))
})

test('missing stdout, exit or hash evidence is unverified', () => {
  const missing = unverified('Missing stdout, exit or hash evidence')
  assert.deepEqual(check({ stdout_ref: 'logs/none.out' }), missing)
  assert.deepEqual(check({ exit_code_ref: 'logs/none.exit' }), missing)
  assert.deepEqual(check({ stdout_sha256: ' ' }), missing)
})

test('the stdout tail must be declared and end the captured stdout', () => {
  assert.deepEqual(check({ stdout_tail: undefined }), unverified('Missing or altered stdout tail'))
  assert.deepEqual(check({ stdout_tail: 'start' }), unverified('Missing or altered stdout tail'))
})

test('gate status must be known; not_applicable needs a rationale', () => {
  assert.deepEqual(check({ status: 'skipped' }), unverified('Missing or unknown gate status'))
  assert.deepEqual(check({ status: 'not_applicable', rationale: 'No UI in this slice' }), ['not_applicable', 'No UI in this slice'])
  assert.deepEqual(check({ status: 'not_applicable' }), unverified('Missing rationale'))
})

test('reported metrics must be an object of finite non-negative numbers', () => {
  for (const metrics of ['x', [], { a: -1 }, { a: '1' }, { a: Infinity }, { a: 1, b: -1 }]) {
    assert.deepEqual(check({ metrics }), unverified('Malformed metrics'), JSON.stringify(metrics))
  }
  assert.deepEqual(check({ metrics: { tests_passed: 4, tests_failed: 0 } }), ['pass', 'exit=0'])
})

test('the metrics column shows only finite numeric metrics', () => {
  const g = gate({ metrics: { a: 1, b: 'x', c: Infinity, d: 2.5 } })
  const view = buildReportView(outcomeData(), new Map(), { quality: quality([g]) }, proofs())
  assert.equal(row(view, 'G1')[5], 'a: 1; d: 2.5')
  assert.equal(row(view, 'G1')[6], 'Malformed metrics')
})

test('G8 and G9 are left to the reviewer', () => {
  assert.deepEqual(check({ id: 'G8' }), unverified('Git tree verification belongs to the reviewer'))
  assert.deepEqual(check({ id: 'G9' }), unverified('Git tree verification belongs to the reviewer'))
})

test('a runner gate without a command is unverified', () => {
  assert.deepEqual(check({ command_executed: ' ' }), unverified('Missing runner command'))
})

test('a declared failure or failing test metric fails an otherwise verified gate', () => {
  assert.deepEqual(check({ status: 'fail' }), ['fail', 'Declared failure or failing test metrics'])
  assert.deepEqual(check({ metrics: { tests_failed: 2 } }), ['fail', 'Declared failure or failing test metrics'])
  assert.deepEqual(check({ status: 'fail', stdout_tail: 'nope' }), unverified('Missing or altered stdout tail'))
})

const cycle = (name, sha = H) => ({
  red_stdout_ref: `logs/${name}.out`, red_exit_code_ref: `logs/${name}.exit`, red_stdout_sha256: sha,
})
const redProofs = {
  'logs/red1.out': { text: 'AssertionError', hash: H }, 'logs/red1.exit': { text: '1' },
  'logs/red2.out': { text: 'AssertionError', hash: H }, 'logs/red2.exit': { text: '7' },
  'logs/green.out': { text: 'ok', hash: H }, 'logs/green.exit': { text: '0' },
}
const g10 = { id: 'G10', command_executed: undefined, stdout_tail: undefined }

test('G10 needs RED cycles', () => {
  assert.deepEqual(check(g10, redProofs, []), unverified('Missing RED cycles'))
})

test('G10 passes when every RED cycle exits nonzero with a matching hash', () => {
  assert.deepEqual(check(g10, redProofs, [cycle('red1'), cycle('red2')]), ['pass', 'Nonzero RED exits; hashes match'])
})

test('G10 fails on the first RED cycle that exited zero', () => {
  assert.deepEqual(check(g10, redProofs, [cycle('red1'), cycle('green')]), ['fail', 'exit=0'])
})

test('G10 reports an unverified RED cycle before a failing one', () => {
  assert.deepEqual(check(g10, redProofs, [cycle('green'), cycle('missing')]),
    unverified('Missing stdout, exit or hash evidence'))
  assert.deepEqual(check(g10, redProofs, [cycle('red1'), cycle('red2', R)]), unverified('SHA256 hash mismatch'))
})

test('G10 references list the RED cycle proofs', () => {
  const g = gate({ id: 'G10', label: 'Test integrity' })
  const view = buildReportView(outcomeData(), new Map(), { quality: quality([g], [cycle('red1'), cycle('red2')]) },
    proofs(redProofs))
  assert.equal(row(view, 'G10')[4], 'logs/red1.out; logs/red1.exit; logs/red2.out; logs/red2.exit')
})

test('row ids list each gate once, splitting G6 by scope only for v4 evidence', () => {
  const v3 = buildReportView(outcomeData(), new Map(), { quality: quality([gate()]) }, proofs())
  assert.deepEqual(rows(v3).map(([id]) => id), ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11'])
  const v4Quality = quality([gate(), gate({ id: 'G6', label: 'Mutation core', scope: 'core' })], [], 'quality-gates-evidence/v4')
  const v4 = buildReportView(outcomeData(), new Map(), { quality: v4Quality }, proofs({
    'logs/g1.out': { text: 'all done', hash: H },
  }))
  assert.deepEqual(rows(v4).map(([id]) => id),
    ['G1', 'G2', 'G3', 'G4', 'G5', 'G6/core', 'G6/boundary', 'G7', 'G8', 'G9', 'G10', 'G11'])
  assert.deepEqual(row(v4, 'G6/core').slice(1, 3), ['Mutation core', 'pass'])
  assert.deepEqual(row(v4, 'G6/boundary').slice(1), ['', 'UNVERIFIED', '', '', '', 'Missing gate evidence'])
})

test('missing gates carry the parse error, else a missing evidence reason', () => {
  const failed = buildReportView(outcomeData(), new Map(), { error: 'Malformed quality evidence JSON' }, new Map())
  assert.deepEqual(row(failed, 'G3'), ['G3', '', 'UNVERIFIED', '', '', '', 'Malformed quality evidence JSON'])
  const partial = buildReportView(outcomeData(), new Map(), { quality: quality([gate()]) }, proofs())
  assert.deepEqual(row(partial, 'G2'), ['G2', '', 'UNVERIFIED', '', '', '', 'Missing gate evidence'])
})

test('references are shown resolved against the quality evidence, or raw when unresolvable', () => {
  const g = gate({ stdout_ref: 'evidence/g1.out', exit_code_ref: '../g1.exit' })
  const view = buildReportView(outcomeData(), new Map(), { quality: quality([g]) }, proofs())
  assert.deepEqual(row(view, 'G1'), ['G1', 'Tests', 'UNVERIFIED', 'npm test', 'p/evidence/g1.out; ../g1.exit', '',
    'Missing stdout, exit or hash evidence'])
})

test('the gate table opens with the quality evidence reference', () => {
  const view = buildReportView(outcomeData(), new Map(), { quality: quality([gate()]) }, proofs())
  assert.equal(view.gates.split('\n')[0], 'p/evidence/q.json')
  assert.equal(view.gates.split('\n')[2], '| ID | Gate | Status | Command | References | Reported metrics | Evidence check |')
  const missing = buildReportView(outcomeData({ qualityEvidenceRef: undefined }), new Map(), { error: 'x' }, new Map())
  assert.equal(missing.gates.split('\n')[0], '(missing reference)')
})
