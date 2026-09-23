import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evidenceReferences, onlyAdditions, verifyEvidence } from '../../../plugins/skraft-framework/src/domain/evidence-verification-policy.mjs'

// A v4 log whose every claim checks out against `facts`; each test breaks one claim.
const file = (content, sha256 = `sha-${content}`) => ({ content, sha256 })
const passing = (id, label, extra = {}) => ({
  id, label, status: 'pass', stdout_ref: `ev/${label}.out`, stdout_sha256: `sha-${label} ok`, stdout_tail: 'ok', exit_code_ref: `ev/${label}.exit`, ...extra,
})
const baseLog = () => ({
  $schema: 'quality-gates-evidence/v4', story: 's', produced_at: 't', tech_adapter: 'quality-gates-dotnet', repo_root_rev: 'aaaaaaa',
  commits_covered: [{ sha: 'aaaaaaa', subject: 'feat(s): x', files_changed: ['src/a.cs'] }],
  gates: [
    passing('G1', 'g1'), passing('G2', 'g2'), passing('G3', 'g3'), passing('G4', 'g4'), passing('G5', 'g5'),
    passing('G6', 'core', { scope: 'core' }), passing('G6', 'boundary', { scope: 'boundary' }),
    { id: 'G7', label: 'mocks', status: 'pass', stdout_ref: 'ev/mocks.out', stdout_sha256: 'sha-' },
    { id: 'G8', label: 'c', status: 'pass' }, { id: 'G9', label: 'c', status: 'pass' }, { id: 'G10', label: 'c', status: 'pass' },
    passing('G11', 'g11'),
  ],
  test_integrity: { cycles: [{ cycle: 1, test_files: ['t.cs'], red_commit: 'bbbbbbb', green_commit: 'aaaaaaa', red_snapshot_ref: 'ev/r.cs', green_snapshot_ref: 'ev/g.cs', red_stdout_ref: 'ev/red.out', red_stdout_sha256: 'sha-boom', red_exit_code_ref: 'ev/red.exit' }] },
})
const baseFacts = () => {
  const files = new Map([
    ['ev/mocks.out', file('')], ['ev/r.cs', file('a\n')], ['ev/g.cs', file('a\nb\n')], ['ev/red.out', file('boom')], ['ev/red.exit', file('1\n')],
  ])
  for (const label of ['g1', 'g2', 'g3', 'g4', 'g5', 'core', 'boundary', 'g11']) {
    files.set(`ev/${label}.out`, file(`${label} ok`))
    files.set(`ev/${label}.exit`, file('0\n'))
  }
  return {
    files,
    evidenceDir: 'tracking/evidence/d/s',
    git: {
      head: 'aaaaaaa', headParent: 'bbbbbbb', headFiles: ['src/a.cs'],
      commits: new Map([['aaaaaaa', { exists: true, subject: 'feat(s): x', message: 'feat(s): x\n\nSigned-off-by: E <e@x>\n', files: ['src/a.cs'] }]]),
      shows: new Map([['bbbbbbb:t.cs', 'a\n'], ['aaaaaaa:t.cs', 'a\nb\n']]),
    },
  }
}
const run = (breakLog = () => {}, breakFacts = () => {}) => {
  const log = baseLog(); const facts = baseFacts()
  breakLog(log); breakFacts(facts)
  return verifyEvidence(log, facts)
}
const codes = (result) => result.findings.map((f) => f.code)

test('the reference log passes', () => {
  assert.deepEqual(run(), { verdict: 'pass', findings: [] })
})

test('schema, fields and gate set', () => {
  assert.deepEqual(codes(run((l) => { l.$schema = 'quality-gates-evidence/v9' })), ['SCHEMA_UNSUPPORTED'])
  assert.deepEqual(codes(run((l) => { delete l.$schema })), ['SCHEMA_UNSUPPORTED'])
  assert.equal(run((l) => { delete l.story; l.gates = {} }).findings[0].detail, 'missing or malformed: story, gates')
  assert.equal(run((l) => { delete l.test_integrity }).findings[0].detail, 'missing or malformed: test_integrity.cycles')
  assert.equal(run((l) => { l.commits_covered = null }).findings[0].detail, 'missing or malformed: commits_covered')
  assert.deepEqual(codes(run((l) => { l.gates = l.gates.filter((g) => g.id !== 'G4') })), ['GATE_MISSING'])
  assert.deepEqual(codes(run((l) => { l.gates.push(passing('G3', 'g3')) })), ['GATE_DUPLICATED'])
  assert.deepEqual(codes(run((l) => { l.gates = l.gates.filter((g) => g.scope !== 'core') })), ['GATE_MISSING'])
})

test('older schemas require only their own gates and scopes', () => {
  const v2 = run((l) => { l.$schema = 'quality-gates-evidence/v2'; l.gates = l.gates.filter((g) => g.id !== 'G11' && g.scope !== 'boundary') })
  assert.deepEqual(v2, { verdict: 'pass', findings: [] })
  const v1 = run((l) => { l.$schema = 'quality-gates-evidence/v1'; l.gates = l.gates.filter((g) => !['G10', 'G11'].includes(g.id) && g.scope !== 'boundary') }, (f) => { f.files.delete('ev/red.exit') })
  assert.deepEqual(v1, { verdict: 'pass', findings: [] })
  assert.deepEqual(codes(run((l) => { l.$schema = 'quality-gates-evidence/v2'; l.gates = l.gates.filter((g) => g.id !== 'G10' && g.scope !== 'boundary') })), ['GATE_MISSING'])
  assert.deepEqual(codes(run((l) => { l.$schema = 'quality-gates-evidence/v3' })), ['GATE_DUPLICATED'])
})

test('gate statuses', () => {
  assert.deepEqual(codes(run((l) => { l.gates[0].status = 'fail' })), ['GATE_FAILED'])
  assert.deepEqual(codes(run((l) => { l.gates[3] = { id: 'G4', label: 'x', status: 'not_applicable' } })), ['RATIONALE_MISSING'])
  assert.deepEqual(run((l) => { l.gates[3] = { id: 'G4', label: 'x', status: 'not_applicable', rationale: 'no analyzer for this stack' } }).verdict, 'pass')
  assert.deepEqual(codes(run((l) => { l.gates[0].status = 'green' })), ['STATUS_INVALID'])
  assert.deepEqual(codes(run((l) => { l.gates[1].metrics = { tests_failed: 2 } })), ['TESTS_FAILED_WHILE_PASS'])
})

test('captured outputs', () => {
  assert.deepEqual(codes(run(() => {}, (f) => { f.files.delete('ev/g1.out') })), ['STDOUT_MISSING'])
  assert.deepEqual(codes(run((l) => { delete l.gates[0].stdout_ref })), ['STDOUT_MISSING'])
  assert.deepEqual(codes(run((l) => { l.gates[0].stdout_tail = 'nope' })), ['STDOUT_TAIL_MISMATCH'])
  assert.deepEqual(run((l) => { delete l.gates[0].stdout_tail }).verdict, 'pass')
  assert.deepEqual(codes(run(() => {}, (f) => { f.files.delete('ev/g2.exit') })), ['EXIT_MISSING'])
  assert.deepEqual(codes(run(() => {}, (f) => { f.files.set('ev/g2.exit', file('zero')) })), ['EXIT_MALFORMED'])
  assert.deepEqual(codes(run(() => {}, (f) => { f.files.set('ev/core.exit', file('1')) })), ['EXIT_CONTRADICTS_STATUS'])
  assert.deepEqual(run((l) => { l.gates[5].status = 'fail' }, (f) => { f.files.set('ev/core.exit', file('1')) }).findings.map((x) => x.gate), ['G6/core'])
})

test('G7 attests an empty grep output', () => {
  assert.deepEqual(codes(run(() => {}, (f) => { f.files.set('ev/mocks.out', file('using Moq;', 'sha-')) })), ['MOCKS_FOUND'])
  assert.equal(run((l) => { l.gates[7].status = 'fail' }, (f) => { f.files.set('ev/mocks.out', file('using Moq;', 'sha-')) }).verdict, 'fail')
})

test('revision', () => {
  assert.deepEqual(codes(run(() => {}, (f) => { f.git.commits.set('aaaaaaa', { exists: false }) })), ['REVISION_UNRESOLVED', 'COMMIT_UNRESOLVED'])
  assert.deepEqual(codes(run(() => {}, (f) => { f.git.head = 'ccccccc' })), ['REVISION_STALE'])
  const evidenceOnlyHead = (f) => { f.git.head = 'ccccccc'; f.git.headParent = 'aaaaaaa'; f.git.headFiles = ['tracking/evidence/d/s/qg-s.json'] }
  assert.equal(run(() => {}, evidenceOnlyHead).verdict, 'pass')
  assert.deepEqual(codes(run(() => {}, (f) => { evidenceOnlyHead(f); f.git.headFiles.push('src/b.cs') })), ['REVISION_STALE'])
  assert.deepEqual(codes(run(() => {}, (f) => { evidenceOnlyHead(f); f.git.headFiles = [] })), ['REVISION_STALE'])
  assert.deepEqual(codes(run(() => {}, (f) => { evidenceOnlyHead(f); f.evidenceDir = undefined })), ['REVISION_STALE'])
  assert.deepEqual(codes(run(() => {}, (f) => { evidenceOnlyHead(f); f.git.headFiles = ['tracking/evidence/d/s2/qg.json'] })), ['REVISION_STALE'])
})

test('covered commits', () => {
  assert.deepEqual(codes(run((l) => { l.commits_covered[0].subject = 'feat(s): y' })), ['COMMIT_SUBJECT_MISMATCH'])
  assert.deepEqual(codes(run((l) => { l.commits_covered[0].files_changed.push('src/z.cs') })), ['COMMIT_FILES_MISMATCH'])
  assert.deepEqual(run((l) => { delete l.commits_covered[0].files_changed }).verdict, 'pass')
  const actual = (patch) => (f) => { f.git.commits.set('aaaaaaa', { ...f.git.commits.get('aaaaaaa'), ...patch }) }
  assert.deepEqual(codes(run((l) => { l.commits_covered[0].subject = 'wip' }, actual({ subject: 'wip' }))), ['COMMIT_NOT_CONVENTIONAL'])
  assert.deepEqual(codes(run(() => {}, actual({ message: 'feat(s): x\n' }))), ['COMMIT_UNSIGNED'])
  assert.deepEqual(codes(run(() => {}, (f) => { f.git.range = ['aaaaaaa', 'ddddddd'] })), ['COMMITS_INCOMPLETE'])
  assert.equal(run(() => {}, (f) => { f.git.range = ['aaaaaaa'] }).verdict, 'pass')
})

test('test integrity cycles', () => {
  assert.deepEqual(codes(run(() => {}, (f) => { f.files.delete('ev/g.cs') })), ['SNAPSHOT_MISSING'])
  assert.deepEqual(codes(run(() => {}, (f) => { f.git.shows.set('aaaaaaa:t.cs', 'other') })), ['SNAPSHOT_MISMATCH'])
  const tampered = (f) => { f.files.set('ev/g.cs', file('b\n')); f.git.shows.set('aaaaaaa:t.cs', 'b\n') }
  assert.deepEqual(codes(run(() => {}, tampered)), ['TEST_TAMPERED'])
  assert.deepEqual(codes(run(() => {}, (f) => { f.files.delete('ev/red.out') })), ['RED_EVIDENCE_MISSING'])
  assert.deepEqual(codes(run(() => {}, (f) => { f.files.set('ev/red.exit', file('x')) })), ['RED_EVIDENCE_MISSING'])
  assert.deepEqual(codes(run((l) => { l.test_integrity.cycles[0].red_stdout_sha256 = 'other' })), ['RED_HASH_MISMATCH'])
  assert.deepEqual(codes(run(() => {}, (f) => { f.files.set('ev/red.exit', file('0')) })), ['RED_NEVER_FAILED'])
})

test('a fail outweighs an inconclusive', () => {
  assert.equal(run((l) => { l.gates[0].status = 'fail'; l.gates[1].stdout_tail = 'nope' }).verdict, 'fail')
})

test('onlyAdditions: RED lines must survive in order', () => {
  assert.equal(onlyAdditions('a\nb', 'a\nx\nb\ny'), true)
  assert.equal(onlyAdditions('a\nb', 'b\na'), false)
  assert.equal(onlyAdditions('a\nb', 'a'), false)
  assert.equal(onlyAdditions('', 'anything'), true)
})

test('evidenceReferences: every file the log cites, once', () => {
  assert.deepEqual(evidenceReferences(baseLog()).length, 21)
  assert.deepEqual(evidenceReferences({}), [])
  assert.deepEqual(evidenceReferences({ gates: [{ stdout_ref: 'a' }, { stdout_ref: 'a', exit_code_ref: '' }] }), ['a'])
})

// ─── exact findings: severity, message and gate ────────────────────────────────

const only = (result) => { assert.equal(result.findings.length, 1, JSON.stringify(result.findings)); return result.findings[0] }

test('each finding carries its severity, gate and a message naming the evidence', () => {
  assert.deepEqual(only(run((l) => { l.$schema = 'x' })), { severity: 'inconclusive', code: 'SCHEMA_UNSUPPORTED', detail: '$schema x is not a supported evidence schema' })
  assert.equal(only(run((l) => { delete l.$schema })).detail, '$schema (none) is not a supported evidence schema')
  assert.equal(only(run((l) => { l.$schema = 'quality-gates-evidence/v4-rc' })).code, 'SCHEMA_UNSUPPORTED')
  assert.equal(only(run((l) => { l.$schema = 'prefix quality-gates-evidence/v4' })).code, 'SCHEMA_UNSUPPORTED')
  assert.deepEqual(only(run((l) => { l.gates[0].status = 'fail' })), { severity: 'fail', code: 'GATE_FAILED', detail: 'G1 records status fail', gate: 'G1' })
  assert.deepEqual(only(run((l) => { l.gates[3] = { id: 'G4', label: 'x', status: 'not_applicable' } })), { severity: 'inconclusive', code: 'RATIONALE_MISSING', detail: 'G4 is not_applicable without a rationale', gate: 'G4' })
  assert.equal(only(run((l) => { l.gates[0].status = 'green' })).detail, 'G1 status green is not pass, fail or not_applicable')
  assert.deepEqual(only(run((l) => { l.gates[1].metrics = { tests_failed: 2 } })), { severity: 'fail', code: 'TESTS_FAILED_WHILE_PASS', detail: 'G2 passes with 2 failed test(s)', gate: 'G2' })
  assert.deepEqual(only(run((l) => { l.gates[0].stdout_sha256 = 'other' })), { severity: 'inconclusive', code: 'STDOUT_HASH_MISMATCH', detail: 'G1 stdout sha256 differs from ev/g1.out', gate: 'G1' })
  assert.equal(only(run(() => {}, (f) => { f.files.delete('ev/g1.out') })).detail, 'G1 stdout ev/g1.out is not on disk')
  assert.equal(only(run((l) => { delete l.gates[0].stdout_ref })).detail, 'G1 stdout (none) is not on disk')
  assert.equal(only(run((l) => { l.gates[0].stdout_tail = 'nope' })).detail, 'G1 stdout_tail is not the end of ev/g1.out')
  assert.equal(only(run(() => {}, (f) => { f.files.delete('ev/g2.exit') })).detail, 'G2 exit code ev/g2.exit is not on disk')
  assert.equal(only(run((l) => { delete l.gates[1].exit_code_ref })).detail, 'G2 exit code (none) is not on disk')
  assert.equal(only(run(() => {}, (f) => { f.files.set('ev/g2.exit', file('zero')) })).detail, 'G2 exit code file holds no integer')
  assert.deepEqual(only(run(() => {}, (f) => { f.files.set('ev/core.exit', file('12\n')) })), { severity: 'fail', code: 'EXIT_CONTRADICTS_STATUS', detail: 'G6/core passes but its runner exited 12', gate: 'G6/core' })
  assert.equal(only(run(() => {}, (f) => { f.files.set('ev/g2.exit', file('1x')) })).code, 'EXIT_MALFORMED')
  assert.equal(only(run(() => {}, (f) => { f.files.set('ev/g2.exit', file('x1')) })).code, 'EXIT_MALFORMED')
  assert.equal(only(run(() => {}, (f) => { f.files.set('ev/g2.exit', file('-1')) })).code, 'EXIT_CONTRADICTS_STATUS')
  assert.deepEqual(only(run(() => {}, (f) => { f.files.set('ev/mocks.out', file('using Moq;', 'sha-')) })), { severity: 'fail', code: 'MOCKS_FOUND', detail: 'G7 passes but ev/mocks.out lists mocking symbols', gate: 'G7' })
  assert.equal(only(run((l) => { l.gates.push(passing('G3', 'g3')) })).detail, 'G3 appears more than once')
  assert.deepEqual(only(run((l) => { l.gates = l.gates.filter((g) => g.id !== 'G4') })), { severity: 'inconclusive', code: 'GATE_MISSING', detail: 'G4 is absent from the log', gate: 'G4' })
  assert.deepEqual(only(run((l) => { l.gates = l.gates.filter((g) => g.scope !== 'boundary') })), { severity: 'inconclusive', code: 'GATE_MISSING', detail: 'G6 has no boundary scope entry', gate: 'G6/boundary' })
})

test('pass-only rules do not fire on a failed gate, and a zero failure count is fine', () => {
  assert.deepEqual(codes(run((l) => { l.gates[1].status = 'fail'; l.gates[1].metrics = { tests_failed: 2 } })), ['GATE_FAILED'])
  assert.equal(run((l) => { l.gates[1].metrics = { tests_failed: 0 } }).verdict, 'pass')
  assert.deepEqual(codes(run((l) => { l.gates[7].status = 'fail' }, (f) => { f.files.set('ev/mocks.out', file('using Moq;', 'sha-')) })), ['GATE_FAILED'])
  assert.deepEqual(codes(run(() => {}, (f) => { f.files.delete('ev/mocks.out') })), ['STDOUT_MISSING'])
  assert.deepEqual(codes(run((l) => { l.gates[1].status = 'fail' }, (f) => { f.files.set('ev/g2.exit', file('1')) })), ['GATE_FAILED'])
})

test('each schema requires its full gate set', () => {
  assert.deepEqual(codes(run((l) => { l.$schema = 'quality-gates-evidence/v1'; l.gates = l.gates.filter((g) => !['G1', 'G10', 'G11'].includes(g.id) && g.scope !== 'boundary') }, (f) => { f.files.delete('ev/red.exit') })), ['GATE_MISSING'])
  assert.deepEqual(codes(run((l) => { l.$schema = 'quality-gates-evidence/v3'; l.gates = l.gates.filter((g) => g.id !== 'G11' && g.scope !== 'boundary') })), ['GATE_MISSING'])
})

test('revision, commit and cycle findings name what they found', () => {
  assert.deepEqual(run(() => {}, (f) => { f.git.commits.set('aaaaaaa', { exists: false }) }).findings[0], { severity: 'fail', code: 'REVISION_UNRESOLVED', detail: 'repo_root_rev aaaaaaa does not resolve' })
  assert.deepEqual(only(run(() => {}, (f) => { f.git.head = 'ccccccc' })), { severity: 'inconclusive', code: 'REVISION_STALE', detail: 'repo_root_rev aaaaaaa is neither HEAD nor the parent of an evidence-only HEAD' })
  assert.equal(only(run((l) => { l.commits_covered.push({ sha: 'fffffff', subject: 's' }) })).detail, 'covered commit fffffff does not resolve')
  assert.deepEqual(only(run((l) => { l.commits_covered[0].subject = 'feat(s): y' })), { severity: 'fail', code: 'COMMIT_SUBJECT_MISMATCH', detail: 'aaaaaaa subject is "feat(s): x", not "feat(s): y"', gate: 'G8' })
  assert.equal(only(run((l) => { l.commits_covered[0].files_changed.push('src/z.cs', 'src/y.cs') })).detail, 'aaaaaaa does not change src/z.cs, src/y.cs')
  assert.equal(only(run(() => {}, (f) => { f.git.commits.set('aaaaaaa', { ...f.git.commits.get('aaaaaaa'), message: 'feat(s): x\n' }) })).detail, 'aaaaaaa carries no Signed-off-by trailer')
  assert.equal(only(run(() => {}, (f) => { f.git.commits.set('aaaaaaa', { ...f.git.commits.get('aaaaaaa'), message: 'feat(s): x\nSigned-off-by:\n' }) })).code, 'COMMIT_UNSIGNED')
  assert.equal(only(run(() => {}, (f) => { f.git.range = ['aaaaaaa', 'ddddddd', 'eeeeeee'] })).detail, 'commits_covered omits ddddddd, eeeeeee made since the phase base')
  assert.equal(only(run(() => {}, (f) => { f.files.delete('ev/g.cs') })).detail, 'cycle 1 snapshot missing')
  assert.equal(only(run((l) => { delete l.test_integrity.cycles[0].cycle }, (f) => { f.files.delete('ev/g.cs') })).detail, 'cycle ? snapshot missing')
  assert.equal(only(run(() => {}, (f) => { f.git.shows.set('aaaaaaa:t.cs', 'other') })).detail, 'cycle 1 snapshots differ from t.cs at its RED/GREEN commits')
  assert.equal(only(run(() => {}, (f) => { f.git.shows.set('bbbbbbb:t.cs', 'other') })).code, 'SNAPSHOT_MISMATCH')
  assert.deepEqual(only(run(() => {}, (f) => { f.files.set('ev/g.cs', file('b\n')); f.git.shows.set('aaaaaaa:t.cs', 'b\n') })), { severity: 'fail', code: 'TEST_TAMPERED', detail: 'cycle 1 removed or changed a line of t.cs between RED and GREEN', gate: 'G9' })
  assert.equal(only(run(() => {}, (f) => { f.files.delete('ev/red.out') })).detail, 'cycle 1 RED stdout or exit code missing')
  assert.equal(only(run((l) => { l.test_integrity.cycles[0].red_stdout_sha256 = 'x' })).detail, 'cycle 1 RED stdout sha256 differs')
  assert.deepEqual(only(run(() => {}, (f) => { f.files.set('ev/red.exit', file('0')) })), { severity: 'fail', code: 'RED_NEVER_FAILED', detail: 'cycle 1 RED run exited 0: the test never failed', gate: 'G10' })
})

test('malformed entries are skipped, not trusted', () => {
  assert.deepEqual(codes(run((l) => { l.gates.push(null, 'x') })), [])
  assert.deepEqual(codes(run((l) => { l.test_integrity.cycles.push(null) })), ['SNAPSHOT_MISSING', 'RED_EVIDENCE_MISSING'])
  assert.equal(run((l) => { l.gates[0].stdout_tail = 7 }).verdict, 'pass', 'a non-string tail is not a claim')
  assert.deepEqual(evidenceReferences({ gates: [null], test_integrity: { cycles: [null, { red_stdout_ref: 'r' }] } }), ['r'])
  assert.deepEqual(evidenceReferences({ gates: 'x', test_integrity: { cycles: 'y' } }), [])
})
