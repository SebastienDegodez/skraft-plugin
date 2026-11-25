import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evidenceReferences, frontendProbes, frontendSignals, integrityChanges, isTestPath, onlyAdditions, verifyEvidence } from '../../../plugins/skraft-framework/src/domain/evidence-verification-policy.mjs'

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

// v5: G6 is one global entry; mutation is the developer's responsibility and may be not_run.
const v5 = (l) => {
  l.$schema = 'quality-gates-evidence/v5'
  l.gates = l.gates.filter((g) => g.scope !== 'boundary')
  delete l.gates.find((g) => g.id === 'G6').scope
}
const notRun = (rationale) => ({ id: 'G6', label: 'Mutation', status: 'not_run', ...(rationale ? { rationale } : {}) })

test('v5 records one global G6 entry', () => {
  assert.deepEqual(run(v5), { verdict: 'pass', findings: [] })
  assert.deepEqual(codes(run((l) => { v5(l); l.gates.push(passing('G6', 'boundary')) })), ['GATE_DUPLICATED'])
  assert.deepEqual(codes(run((l) => { v5(l); l.gates = l.gates.filter((g) => g.id !== 'G6') })), ['GATE_MISSING'])
})

test('v5 G6 not_run passes with its rationale, and is reported as a notice', () => {
  const result = run((l) => { v5(l); l.gates[5] = notRun('no component declares commands.mutation in skraft-config.json') })
  assert.equal(result.verdict, 'pass')
  assert.deepEqual(result.findings, [{ severity: 'notice', code: 'G6_NOT_RUN', detail: 'G6 not run: no component declares commands.mutation in skraft-config.json', gate: 'G6' }])
  assert.deepEqual(codes(run((l) => { v5(l); l.gates[5] = notRun() })), ['RATIONALE_MISSING'])
})

test('not_run is only for G6, and only from v5', () => {
  assert.deepEqual(codes(run((l) => { v5(l); l.gates[1] = { id: 'G2', label: 'u', status: 'not_run', rationale: 'x' } })), ['STATUS_INVALID'])
  assert.deepEqual(codes(run((l) => { l.gates[5] = { ...notRun('x'), scope: 'core' } })), ['STATUS_INVALID'])
})

// v6: no G10 — the acceptance RED commit is the proof; cycles carry no captured RED run.
const v6 = (l) => {
  v5(l)
  l.$schema = 'quality-gates-evidence/v6'
  l.gates = l.gates.filter((g) => g.id !== 'G10')
  const cycle = l.test_integrity.cycles[0]
  delete cycle.red_stdout_ref; delete cycle.red_stdout_sha256; delete cycle.red_exit_code_ref
}

test('v6 needs no G10 and no captured RED run', () => {
  assert.deepEqual(run(v6, (f) => { f.files.delete('ev/red.out'); f.files.delete('ev/red.exit') }), { verdict: 'pass', findings: [] })
  assert.deepEqual(codes(run((l) => { v6(l); l.gates = l.gates.filter((g) => g.id !== 'G9') })), ['GATE_MISSING'])
  assert.deepEqual(codes(run(v6, (f) => { f.files.delete('ev/g.cs') })), ['SNAPSHOT_MISSING'])
})

test('v6 G6 may be not_run, like v5', () => {
  const result = run((l) => { v6(l); l.gates[5] = notRun('no component declares commands.mutation') })
  assert.equal(result.verdict, 'pass')
  assert.deepEqual(codes(result), ['G6_NOT_RUN'])
  assert.equal(only(run((l) => { v6(l); l.gates[1] = { id: 'G2', label: 'u', status: 'not_run' } })).detail, 'G2 status not_run is not pass, fail or not_applicable')
  assert.equal(only(run((l) => { v6(l); l.gates[5] = { id: 'G6', label: 'm', status: 'skipped' } })).detail, 'G6 status skipped is not pass, fail or not_applicable (or not_run)')
})

// v7: `type.description` ids, verdicts only (no stdout, exit or hash), evidence kept out of Git;
// commit.convention and test.integrity derived from the DELIVER range.
const gate7 = (id, extra = {}) => ({ id, label: id, status: 'pass', summary: 'ok', tree: 'ttttttt', ...extra })
const v7Log = () => ({
  $schema: 'quality-gates-evidence/v7', story: 's', produced_at: 't', tech_adapter: 'quality-gates-dotnet', repo_root_rev: 'aaaaaaa',
  gates: ['test.acceptance', 'test.unit', 'build.compile', 'build.lint', 'test.no-mocks-core'].map((id) => gate7(id)),
})
const signed = (subject) => ({ exists: true, subject, message: `${subject}\n\nSigned-off-by: E <e@x>\n`, files: ['src/a.cs', 't.cs'] })
const shot = { ref: 'ev/shots/home.png', sha256: 'png-sha' }
const screenshots = (list = [shot]) => ({ id: 'evidence.screenshots', label: 'Screenshots', status: 'pass', screenshots: list })
const v7Facts = () => ({
  files: new Map(),
  screenshots: new Map([[shot.ref, { sha256: shot.sha256 }]]),
  frontend: [],
  evidenceDir: 'tracking/evidence/d/s',
  git: {
    head: 'aaaaaaa', headParent: 'bbbbbbb', headFiles: ['src/a.cs'], trackedEvidence: [],
    commits: new Map([['aaaaaaa', signed('feat(s): x')]]),
    range: ['aaaaaaa'],
    tree: 'ttttttt',
    shows: new Map(),
    integrity: { guarded: ['t.cs'], changes: [{ sha: 'aaaaaaa', file: 't.cs', before: 'a\n', after: 'a\nb\n' }] },
  },
})
const runV7 = (breakLog = () => {}, breakFacts = () => {}) => {
  const log = v7Log(); const facts = v7Facts()
  breakLog(log); breakFacts(facts)
  return verifyEvidence(log, facts)
}

test('a v7 log of verdicts only passes: no stdout, no commit list, no cycle', () => {
  assert.deepEqual(runV7(), { verdict: 'pass', findings: [] })
})

test('v7 refuses committed evidence and an evidence commit on top of the log', () => {
  assert.deepEqual(only(runV7(() => {}, (f) => { f.git.trackedEvidence = ['tracking/evidence/d/s/qg-s.json'] })), { severity: 'fail', code: 'EVIDENCE_COMMITTED', detail: 'evidence is tracked by Git: tracking/evidence/d/s/qg-s.json' })
  const evidenceOnlyHead = (f) => { f.git.head = 'ccccccc'; f.git.headParent = 'aaaaaaa'; f.git.headFiles = ['tracking/evidence/d/s/qg-s.json'] }
  assert.deepEqual(only(runV7(() => {}, evidenceOnlyHead)), { severity: 'inconclusive', code: 'REVISION_STALE', detail: 'repo_root_rev aaaaaaa is not HEAD' })
})

test('v7 gate set: retired, legacy and derived ids are not recorded gates', () => {
  assert.deepEqual(only(runV7((l) => { l.gates = l.gates.filter((g) => g.id !== 'build.lint') })), { severity: 'inconclusive', code: 'GATE_MISSING', detail: 'build.lint is absent from the log', gate: 'build.lint' })
  for (const id of ['ci.coverage', 'ci.mutation', 'arch.boundaries', 'G5']) {
    assert.deepEqual(only(runV7((l) => { l.gates.push(gate7(id)) })), { severity: 'inconclusive', code: 'GATE_UNKNOWN', detail: `${id} is not a v7 gate`, gate: id })
  }
  for (const id of ['commit.convention', 'test.integrity']) {
    assert.deepEqual(only(runV7((l) => { l.gates.push(gate7(id)) })), { severity: 'inconclusive', code: 'GATE_DERIVED', detail: `${id} is derived from Git by qg-verify, never recorded in the log`, gate: id })
  }
  assert.deepEqual(codes(runV7((l) => { l.gates[1] = { id: 'test.unit', label: 'u', status: 'not_run', rationale: 'x' } })), ['STATUS_INVALID'])
})

test('v7 statuses come from the log alone: a fail fails, no file is read', () => {
  assert.deepEqual(only(runV7((l) => { l.gates[1].status = 'fail' })), { severity: 'fail', code: 'GATE_FAILED', detail: 'test.unit records status fail', gate: 'test.unit' })
  assert.equal(only(runV7((l) => { l.gates[0].metrics = { tests_failed: 2 } })).code, 'TESTS_FAILED_WHILE_PASS')
  assert.equal(only(runV7((l) => { l.gates[4] = { id: 'test.no-mocks-core', label: 'm', status: 'not_applicable' } })).code, 'RATIONALE_MISSING')
  assert.equal(runV7((l) => { l.gates[4] = { id: 'test.no-mocks-core', label: 'm', status: 'not_applicable', rationale: 'no core' } }).verdict, 'pass')
})

test('v7: a verdict recorded on another tree than repo_root_rev is stale', () => {
  assert.deepEqual(only(runV7((l) => { l.gates[2].tree = 'ooooooo' })), { severity: 'inconclusive', code: 'GATE_STALE', detail: 'build.compile ran on another tree than repo_root_rev: run it again', gate: 'build.compile' })
  assert.equal(only(runV7((l) => { delete l.gates[0].tree })).code, 'GATE_STALE')
  assert.equal(runV7((l) => { l.gates[4] = { id: 'test.no-mocks-core', label: 'm', status: 'not_applicable', rationale: 'no core' } }, (f) => { f.git.tree = 'ttttttt' }).verdict, 'pass')
})

test('v7 commit.convention reads every commit of the DELIVER range from Git', () => {
  assert.deepEqual(only(runV7(() => {}, (f) => { f.git.commits.set('aaaaaaa', { ...signed('wip'), subject: 'wip' }) })), { severity: 'fail', code: 'COMMIT_NOT_CONVENTIONAL', detail: 'aaaaaaa subject "wip" is not type(feature): subject', gate: 'commit.convention' })
  assert.equal(only(runV7(() => {}, (f) => { f.git.commits.set('aaaaaaa', { ...signed('feat(s): x'), message: 'feat(s): x\n' }) })).code, 'COMMIT_UNSIGNED')
  assert.equal(only(runV7(() => {}, (f) => { f.git.range = undefined })).code, 'BASE_UNKNOWN')
  assert.equal(only(runV7(() => {}, (f) => { f.git.range = [] })).code, 'RANGE_EMPTY')
  assert.equal(only(runV7(() => {}, (f) => { f.git.range = ['ddddddd'] })).code, 'COMMIT_UNREADABLE')
})

test('v7 test.integrity: a RED test only grows, unless the commit records a PLAN_DEVIATION', () => {
  const change = (before, after, sha = 'aaaaaaa') => (f) => { f.git.integrity.changes = [{ sha, file: 't.cs', before, after }] }
  assert.deepEqual(only(runV7(() => {}, change('a\n', 'b\n'))), { severity: 'fail', code: 'TEST_TAMPERED', detail: 'aaaaaaa removed or changed a line of t.cs', gate: 'test.integrity' })
  assert.equal(only(runV7(() => {}, change('a\n', null))).code, 'TEST_TAMPERED')
  const deviation = (f) => { change('a\n', 'b\n')(f); f.git.commits.set('aaaaaaa', { ...signed('test(s): stricter'), message: 'test(s): stricter\n\nPLAN_DEVIATION: a → b\nSigned-off-by: E <e@x>\n' }) }
  assert.deepEqual(runV7(() => {}, deviation), { verdict: 'pass', findings: [{ severity: 'notice', code: 'PLAN_DEVIATION', detail: 'aaaaaaa rewrites t.cs under a PLAN_DEVIATION', gate: 'test.integrity' }] })
  assert.equal(only(runV7(() => {}, (f) => { f.git.integrity = undefined })).code, 'RED_BASE_UNKNOWN')
  assert.equal(only(runV7(() => {}, (f) => { f.git.integrity = { guarded: [], changes: [] } })).code, 'RED_TESTS_MISSING')
  const noAcceptance = (l) => { l.gates[0] = { id: 'test.acceptance', label: 'a', status: 'not_applicable', rationale: 'docs only' } }
  assert.equal(runV7(noAcceptance, (f) => { f.git.integrity = { guarded: [], changes: [] } }).verdict, 'pass')
})

test('integrityChanges guards the test files of every test commit, never the stubs', () => {
  const red = [{ sha: 'r1', subject: 'test(s): acceptance tests S1–S2', files: ['tests/A.Tests.cs', 'src/Stub.cs', 'features/a.feature'] }]
  const delivered = [
    { sha: 'g1', subject: 'feat(s): S1', files: ['src/Stub.cs', 'tests/A.Tests.cs'] },
    { sha: 't2', subject: 'test(s): stronger', files: ['tests/B.test.ts'] },
    { sha: 'g2', subject: 'fix(s): S2', files: ['tests/B.test.ts', 'features/a.feature'] },
  ]
  assert.deepEqual(integrityChanges(red, delivered), {
    guarded: ['tests/A.Tests.cs', 'features/a.feature'],
    changes: [{ sha: 'g1', file: 'tests/A.Tests.cs' }, { sha: 'g2', file: 'tests/B.test.ts' }, { sha: 'g2', file: 'features/a.feature' }],
  })
  assert.deepEqual(['tests/x.cs', 'src/A.Tests.cs', 'web/a.spec.tsx', 'pkg/test_a.py', 'pkg/a_test.py', 'f.feature', 'e2e/x.ts'].filter(isTestPath).length, 7)
  assert.deepEqual(['src/a.cs', 'src/latest.py', 'contest/a.ts'].filter(isTestPath), [])
})

test('v7 frontend story without screenshot fails', () => {
  const frontend = (f) => { f.frontend = ['tests/e2e/home.spec.ts'] }
  assert.deepEqual(only(runV7(() => {}, frontend)), { severity: 'fail', code: 'SCREENSHOTS_MISSING', detail: 'frontend story (tests/e2e/home.spec.ts) records no screenshot', gate: 'evidence.screenshots' })
  assert.equal(only(runV7((l) => { l.gates.push({ id: 'evidence.screenshots', label: 's', status: 'not_applicable', rationale: 'no UI' }) }, frontend)).code, 'SCREENSHOTS_MISSING')
  assert.equal(only(runV7((l) => { l.gates.push(screenshots([])) }, frontend)).code, 'SCREENSHOTS_MISSING')
  assert.deepEqual(runV7((l) => { l.gates.push(screenshots()) }, frontend), { verdict: 'pass', findings: [] })
})

test('v7 screenshots are checked byte for byte', () => {
  assert.deepEqual(only(runV7((l) => { l.gates.push(screenshots([{ ...shot, sha256: 'other' }])) })), { severity: 'inconclusive', code: 'SCREENSHOT_HASH_MISMATCH', detail: 'screenshot sha256 differs from ev/shots/home.png', gate: 'evidence.screenshots' })
  assert.equal(only(runV7((l) => { l.gates.push(screenshots([{ ref: 'ev/shots/none.png', sha256: 'x' }])) })).code, 'SCREENSHOT_MISSING')
  assert.equal(only(runV7((l) => { l.gates.push(screenshots([])) })).code, 'SCREENSHOTS_EMPTY')
  assert.equal(runV7((l) => { l.gates.push({ id: 'evidence.screenshots', label: 's', status: 'not_applicable', rationale: 'no UI' }) }).verdict, 'pass')
})

test('a v6 log still verifies with its G* gates and snapshots', () => {
  assert.deepEqual(run((l) => { v6(l); l.gates[5] = notRun('mutation runs outside the pipeline') }).verdict, 'pass')
})

test('frontendSignals: e2e tests, Playwright config, React manifests and @visual scenarios', () => {
  const contents = {
    'web/package.json': '{"dependencies":{"react":"^19"}}', 'api/package.json': '{"dependencies":{"express":"^5"}}',
    'broken/package.json': '{ "react": "19", ', 'features/home.feature': '@visual\nFeature: Home', 'features/api.feature': '@visualize\nFeature: x',
  }
  const paths = ['tests/e2e/a.spec.ts', 'web/playwright.config.ts', 'web/package.json', 'api/package.json', 'broken/package.json', 'features/home.feature', 'features/api.feature', 'src/a.cs', 'deleted/package.json']
  assert.deepEqual(frontendSignals(paths, (path) => contents[path]), ['tests/e2e/a.spec.ts', 'web/playwright.config.ts', 'web/package.json', 'broken/package.json', 'features/home.feature'])
  assert.deepEqual(frontendProbes(paths), ['web/package.json', 'api/package.json', 'broken/package.json', 'features/home.feature', 'features/api.feature', 'deleted/package.json'])
})
