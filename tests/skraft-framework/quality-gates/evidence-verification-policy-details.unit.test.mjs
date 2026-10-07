import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifyEvidence } from '../../../plugins/skraft-framework/src/domain/evidence-verification-policy.mjs'

// A v4 log whose every claim checks out against `facts`; each test breaks one claim and
// pins the whole finding (severity, code, detail, gate) plus the derived verdict.
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
const actual = (patch) => (f) => { f.git.commits.set('aaaaaaa', { ...f.git.commits.get('aaaaaaa'), ...patch }) }

test('a missing field yields the exact inconclusive FIELD_MISSING report', () => {
  assert.deepEqual(run((l) => { delete l.produced_at }), {
    verdict: 'inconclusive',
    findings: [{ severity: 'inconclusive', code: 'FIELD_MISSING', detail: 'missing or malformed: produced_at' }],
  })
})

test('an inconclusive-only finding set derives the inconclusive verdict', () => {
  const result = run((l) => { l.gates[3] = { id: 'G4', label: 'x', status: 'not_applicable' } })
  assert.equal(result.verdict, 'inconclusive')
  assert.equal(result.findings.length, 1)
})

test('G7 ignores a grep output made only of whitespace', () => {
  assert.deepEqual(run(() => {}, (f) => { f.files.set('ev/mocks.out', file('\n  \n', 'sha-')) }), { verdict: 'pass', findings: [] })
})

test('an unknown repo_root_rev is reported, not thrown', () => {
  const result = run((l) => { l.repo_root_rev = 'zzzzzzz' }, (f) => { f.git.head = 'zzzzzzz' })
  assert.deepEqual(result.findings, [{ severity: 'fail', code: 'REVISION_UNRESOLVED', detail: 'repo_root_rev zzzzzzz does not resolve' }])
})

test('an evidence-only HEAD must sit directly on repo_root_rev', () => {
  const result = run(() => {}, (f) => {
    f.git.head = 'ccccccc'
    f.git.headParent = 'ddddddd'
    f.git.headFiles = ['tracking/evidence/d/s/qg-s.json']
  })
  assert.deepEqual(result.findings.map((x) => x.code), ['REVISION_STALE'])
})

test('every commit finding is attributed to G8', () => {
  const unresolved = run((l) => { l.commits_covered.push({ sha: 'fffffff', subject: 's' }) })
  assert.deepEqual(unresolved.findings, [{ severity: 'fail', code: 'COMMIT_UNRESOLVED', detail: 'covered commit fffffff does not resolve', gate: 'G8' }])
  const files = run((l) => { l.commits_covered[0].files_changed.push('src/z.cs') })
  assert.deepEqual(files.findings, [{ severity: 'fail', code: 'COMMIT_FILES_MISMATCH', detail: 'aaaaaaa does not change src/z.cs', gate: 'G8' }])
  const conventional = run((l) => { l.commits_covered[0].subject = 'wip' }, actual({ subject: 'wip' }))
  assert.deepEqual(conventional.findings, [{ severity: 'fail', code: 'COMMIT_NOT_CONVENTIONAL', detail: 'aaaaaaa subject "wip" is not type(feature): subject', gate: 'G8' }])
  const unsigned = run(() => {}, actual({ message: 'feat(s): x\n' }))
  assert.deepEqual(unsigned.findings, [{ severity: 'fail', code: 'COMMIT_UNSIGNED', detail: 'aaaaaaa carries no Signed-off-by trailer', gate: 'G8' }])
  const incomplete = run(() => {}, (f) => { f.git.range = ['aaaaaaa', 'ddddddd'] })
  assert.deepEqual(incomplete.findings, [{ severity: 'fail', code: 'COMMITS_INCOMPLETE', detail: 'commits_covered omits ddddddd made since the phase base', gate: 'G8' }])
})

test('a Signed-off-by trailer must start its own line', () => {
  const result = run(() => {}, actual({ message: 'feat(s): x\n\nnot a Signed-off-by: E <e@x>\n' }))
  assert.deepEqual(result.findings.map((x) => x.code), ['COMMIT_UNSIGNED'])
})

test('cycle findings are attributed to G9 and G10', () => {
  assert.deepEqual(run(() => {}, (f) => { f.files.delete('ev/g.cs') }).findings,
    [{ severity: 'inconclusive', code: 'SNAPSHOT_MISSING', detail: 'cycle 1 snapshot missing', gate: 'G9' }])
  assert.deepEqual(run(() => {}, (f) => { f.git.shows.set('aaaaaaa:t.cs', 'other') }).findings,
    [{ severity: 'inconclusive', code: 'SNAPSHOT_MISMATCH', detail: 'cycle 1 snapshots differ from t.cs at its RED/GREEN commits', gate: 'G9' }])
  assert.deepEqual(run(() => {}, (f) => { f.files.delete('ev/red.out') }).findings,
    [{ severity: 'inconclusive', code: 'RED_EVIDENCE_MISSING', detail: 'cycle 1 RED stdout or exit code missing', gate: 'G10' }])
  assert.deepEqual(run((l) => { l.test_integrity.cycles[0].red_stdout_sha256 = 'x' }).findings,
    [{ severity: 'inconclusive', code: 'RED_HASH_MISMATCH', detail: 'cycle 1 RED stdout sha256 differs', gate: 'G10' }])
})

test('a missing RED snapshot alone is reported as SNAPSHOT_MISSING', () => {
  const result = run(() => {}, (f) => { f.files.delete('ev/r.cs') })
  assert.deepEqual(result.findings.map((x) => x.code), ['SNAPSHOT_MISSING'])
})

test('a cycle without test_files cannot match its snapshots and is not thrown on', () => {
  const result = run((l) => { delete l.test_integrity.cycles[0].test_files })
  assert.deepEqual(result.findings.map((x) => x.code), ['SNAPSHOT_MISMATCH'])
  assert.equal(result.findings[0].detail, 'cycle 1 snapshots differ from undefined at its RED/GREEN commits')
})
