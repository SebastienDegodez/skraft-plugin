import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SCHEMA_VERSION,
  GATE_LABELS,
  sha256,
  tail,
  parseTrx,
  parseStrykerJson,
  evaluateGateStatus,
  renderMarkdown,
  ContradictionError,
} from '../../plugins/skills/quality-gates-evidence-contract/scripts/qg-evidence.mjs'

// ------------------------------------------------------------- facts

test('sha256: computes the hex digest of a buffer', () => {
  assert.equal(
    sha256(Buffer.from('hello\n')),
    '5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03',
  )
})

test('tail: returns the last 40 lines by default', () => {
  const text = Array.from({ length: 100 }, (_, i) => `line-${i}`).join('\n')
  const result = tail(text)
  assert.equal(result.split('\n').length, 40)
  assert.ok(result.startsWith('line-60'))
  assert.ok(result.endsWith('line-99'))
})

test('tail: shorter input is returned whole', () => {
  assert.equal(tail('a\nb'), 'a\nb')
})

// ---------------------------------------------------------------- trx

test('parseTrx: extracts total/passed/failed from Counters', () => {
  const trx = '<TestRun><ResultSummary outcome="Completed"><Counters total="12" executed="12" passed="11" failed="1" /></ResultSummary></TestRun>'
  assert.deepEqual(parseTrx(trx), { tests_total: 12, tests_passed: 11, tests_failed: 1 })
})

test('parseTrx: missing Counters is a contradiction', () => {
  assert.throws(() => parseTrx('<TestRun></TestRun>'), ContradictionError)
})

// ------------------------------------------------------------ stryker

test('parseStrykerJson: uses top-level mutationScore when present', () => {
  assert.deepEqual(parseStrykerJson('{"mutationScore": 92.5}'), { mutation_score: 92.5 })
})

test('parseStrykerJson: computes score from mutant statuses otherwise', () => {
  const report = {
    files: {
      'a.cs': {
        mutants: [
          { status: 'Killed' },
          { status: 'Killed' },
          { status: 'Survived' },
          { status: 'Timeout' },
          { status: 'Ignored' },
        ],
      },
    },
  }
  assert.deepEqual(parseStrykerJson(JSON.stringify(report)), { mutation_score: 75 })
})

test('parseStrykerJson: invalid JSON is a contradiction', () => {
  assert.throws(() => parseStrykerJson('not json'), ContradictionError)
})

test('parseStrykerJson: report with zero detected mutants is a contradiction', () => {
  assert.throws(() => parseStrykerJson('{"files": {}}'), ContradictionError)
})

// ------------------------------------------------------------- status

test('evaluateGateStatus: exit 0 without metrics passes', () => {
  assert.equal(evaluateGateStatus({ exitCode: 0, metrics: null }), 'pass')
})

test('evaluateGateStatus: non-zero exit fails', () => {
  assert.equal(evaluateGateStatus({ exitCode: 1, metrics: null }), 'fail')
})

test('evaluateGateStatus: tests_failed > 0 fails even with exit 0', () => {
  assert.equal(
    evaluateGateStatus({
      exitCode: 0,
      metrics: { tests_total: 5, tests_passed: 4, tests_failed: 1 },
    }),
    'fail',
  )
})

test('evaluateGateStatus: mutation score below threshold fails', () => {
  assert.equal(
    evaluateGateStatus({ exitCode: 0, metrics: { mutation_score: 85 }, threshold: 90 }),
    'fail',
  )
})

test('evaluateGateStatus: mutation score at threshold passes', () => {
  assert.equal(
    evaluateGateStatus({ exitCode: 0, metrics: { mutation_score: 90 }, threshold: 90 }),
    'pass',
  )
})

test('evaluateGateStatus: threshold declared but no score fails', () => {
  assert.equal(evaluateGateStatus({ exitCode: 0, metrics: null, threshold: 90 }), 'fail')
})

// ------------------------------------------------------------- render

const evidenceFixture = () => ({
  $schema: SCHEMA_VERSION,
  story: 'eligibilite-trottinette',
  produced_at: '2026-07-05T10:00:00.000Z',
  producer: 'software-engineer',
  tech_adapter: 'quality-gates-dotnet',
  repo_root_rev: 'a'.repeat(40),
  commits_covered: [
    { sha: 'b'.repeat(40), subject: 'feat(quote): add eligibility rule', files_changed: ['a.cs', 'b.cs'] },
  ],
  gates: [
    {
      id: 'G2',
      label: GATE_LABELS.G2,
      status: 'pass',
      command_executed: 'dotnet test',
      exit_code_ref: 'evidence/2026-07-05/qg-tests.exit',
      stdout_ref: 'evidence/2026-07-05/qg-tests.stdout',
      stdout_sha256: 'c'.repeat(64),
      stdout_tail: 'Passed!',
      metrics: { tests_total: 12, tests_passed: 12, tests_failed: 0 },
    },
    { id: 'G5', label: GATE_LABELS.G5, status: 'not_applicable', rationale: 'no architecture tests project' },
  ],
  test_integrity: {
    cycles: [
      {
        cycle: 1,
        behavior: 'rejects under-14 riders',
        test_files: ['tests/SomeTests.cs'],
        red_commit: 'd'.repeat(40),
        green_commit: 'e'.repeat(40),
      },
    ],
  },
})

test('renderMarkdown: first line is the tracked-artifact header', () => {
  const markdown = renderMarkdown(evidenceFixture())
  assert.equal(markdown.split('\n')[0], '<!-- markdownlint-disable-file -->')
})

test('renderMarkdown: declares the JSON authoritative', () => {
  const markdown = renderMarkdown(evidenceFixture())
  assert.match(markdown, /JSON evidence log/)
  assert.match(markdown, /authoritative/)
})

test('renderMarkdown: renders one row per gate with status and metrics', () => {
  const markdown = renderMarkdown(evidenceFixture())
  assert.match(markdown, /\| G2 \| All unit tests pass \| PASS \| 12\/12 passed, 0 failed \|/)
  assert.match(markdown, /\| G5 \| .* \| NOT_APPLICABLE \| no architecture tests project \|/)
})

test('renderMarkdown: renders commits and cycles tables', () => {
  const markdown = renderMarkdown(evidenceFixture())
  assert.match(markdown, /\| `bbbbbbbbbbbb` \| feat\(quote\): add eligibility rule \| 2 \|/)
  assert.match(markdown, /\| 1 \| rejects under-14 riders \| `dddddddddddd` \| `eeeeeeeeeeee` \|/)
})

test('renderMarkdown: renders the evidence references with sha256', () => {
  const markdown = renderMarkdown(evidenceFixture())
  assert.match(markdown, /\| G2 \| `evidence\/2026-07-05\/qg-tests\.stdout` \| `c{64}` \|/)
})

test('renderMarkdown: refuses a foreign or missing $schema', () => {
  const wrong = { ...evidenceFixture(), $schema: 'something-else/v9' }
  assert.throws(() => renderMarkdown(wrong), ContradictionError)
  const absent = { ...evidenceFixture() }
  delete absent.$schema
  assert.throws(() => renderMarkdown(absent), ContradictionError)
})
