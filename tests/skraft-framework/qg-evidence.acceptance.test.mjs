import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import {
  assemble,
  render,
  SCHEMA_VERSION,
  ContradictionError,
} from '../../plugins/skills/quality-gates-evidence-contract/scripts/qg-evidence.mjs'

// Fixture: a real git repo with one RED commit (test file) and one GREEN
// commit (implementation), plus a captured evidence directory — the exact
// state the software-engineer leaves behind at the end of the COMMIT phase.

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

const buildFixture = () => {
  const repo = mkdtempSync(join(tmpdir(), 'qg-evidence-'))
  git(['init', '-q'], repo)
  git(['config', 'user.email', 'test@example.com'], repo)
  git(['config', 'user.name', 'Test'], repo)

  writeFileSync(join(repo, 'README.md'), '# fixture\n')
  git(['add', '.'], repo)
  git(['commit', '-q', '-m', 'chore(init): fixture baseline'], repo)
  const baseline = git(['rev-parse', 'HEAD'], repo)

  mkdirSync(join(repo, 'tests'), { recursive: true })
  writeFileSync(join(repo, 'tests/SomeTests.cs'), 'assert Eligible(15) == true;\n')
  git(['add', '.'], repo)
  git(['commit', '-q', '-m', 'test(quote): riders under 14 are rejected'], repo)
  const redCommit = git(['rev-parse', 'HEAD'], repo)

  writeFileSync(join(repo, 'Eligibility.cs'), 'bool Eligible(int age) => age >= 14;\n')
  git(['add', '.'], repo)
  git(['commit', '-q', '-m', 'feat(quote): eligibility rule'], repo)
  const greenCommit = git(['rev-parse', 'HEAD'], repo)

  const evidenceDir = join(repo, '.copilot-tracking/skraft-plans/demo/evidence/2026-07-05')
  mkdirSync(evidenceDir, { recursive: true })
  writeFileSync(join(evidenceDir, 'qg-tests.stdout'), 'Passed! - 12 tests\n')
  writeFileSync(join(evidenceDir, 'qg-tests.exit'), '0\n')
  writeFileSync(
    join(evidenceDir, 'qg-tests.trx'),
    '<TestRun><ResultSummary outcome="Completed"><Counters total="12" passed="12" failed="0" /></ResultSummary></TestRun>',
  )
  writeFileSync(join(evidenceDir, 'qg-mutation.stdout'), 'Stryker done\n')
  writeFileSync(join(evidenceDir, 'qg-mutation.exit'), '0\n')
  writeFileSync(join(evidenceDir, 'qg-mutation.json'), JSON.stringify({ mutationScore: 93.1 }))

  const manifest = {
    story: 'eligibilite-trottinette',
    projectSlug: 'demo',
    date: '2026-07-05',
    tech_adapter: 'quality-gates-dotnet',
    commit_range: `${baseline}..HEAD`,
    gates: [
      {
        id: 'G2',
        command_executed: 'dotnet test --nologo > qg-tests.stdout 2>&1',
        stdout: 'qg-tests.stdout',
        exit: 'qg-tests.exit',
        metrics_source: { type: 'trx', path: 'qg-tests.trx' },
      },
      {
        id: 'G6',
        command_executed: 'dotnet stryker > qg-mutation.stdout 2>&1',
        stdout: 'qg-mutation.stdout',
        exit: 'qg-mutation.exit',
        metrics_source: { type: 'stryker-json', path: 'qg-mutation.json' },
        threshold: 90,
      },
      { id: 'G5', status: 'not_applicable', rationale: 'no architecture tests project' },
    ],
    cycles: [
      {
        cycle: 1,
        behavior: 'rejects under-14 riders',
        test_files: ['tests/SomeTests.cs'],
        red_commit: redCommit,
        green_commit: greenCommit,
      },
    ],
  }
  const manifestPath = join(evidenceDir, 'qg-manifest.json')
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  return { repo, evidenceDir, manifestPath, redCommit, greenCommit }
}

test('assemble then render: produces contract-conformant JSON and derived markdown', (t) => {
  const { repo, evidenceDir, manifestPath, redCommit, greenCommit } = buildFixture()
  t.after(() => rmSync(repo, { recursive: true, force: true }))

  const result = assemble({ manifestPath, repoRoot: repo })
  assert.deepEqual(result.gates, { pass: 2, fail: 0, na: 1 })

  const evidence = JSON.parse(readFileSync(result.output, 'utf8'))
  assert.equal(evidence.$schema, SCHEMA_VERSION)
  assert.equal(evidence.story, 'eligibilite-trottinette')
  assert.equal(evidence.repo_root_rev, git(['rev-parse', 'HEAD'], repo))

  // facts are recomputed, never transcribed
  const stdoutContent = readFileSync(join(evidenceDir, 'qg-tests.stdout'))
  const expectedHash = createHash('sha256').update(stdoutContent).digest('hex')
  const g2 = evidence.gates.find((gate) => gate.id === 'G2')
  assert.equal(g2.stdout_sha256, expectedHash)
  assert.equal(g2.status, 'pass')
  assert.deepEqual(g2.metrics, { tests_total: 12, tests_passed: 12, tests_failed: 0 })
  assert.ok(stdoutContent.toString('utf8').endsWith(g2.stdout_tail) || g2.stdout_tail.length > 0)

  const g6 = evidence.gates.find((gate) => gate.id === 'G6')
  assert.equal(g6.status, 'pass')
  assert.equal(g6.metrics.mutation_score, 93.1)

  // commits collected from git, not from the manifest
  assert.deepEqual(
    evidence.commits_covered.map((commit) => commit.subject),
    ['feat(quote): eligibility rule', 'test(quote): riders under 14 are rejected'],
  )

  // snapshots regenerated deterministically via git show
  const cycle = evidence.test_integrity.cycles[0]
  assert.equal(cycle.red_commit, redCommit)
  assert.equal(cycle.green_commit, greenCommit)
  const redSnapshot = readFileSync(join(evidenceDir, 'snapshots/red-1-SomeTests.cs'), 'utf8')
  assert.equal(redSnapshot, 'assert Eligible(15) == true;\n')

  const rendered = render({ inputPath: result.output })
  assert.ok(existsSync(rendered.output))
  const markdown = readFileSync(rendered.output, 'utf8')
  assert.equal(markdown.split('\n')[0], '<!-- markdownlint-disable-file -->')
  assert.match(markdown, /\| G6 \| Mutation score meets threshold \| PASS \| score 93\.10 \(threshold 90\) \|/)
})

test('assemble: a failing gate still yields a valid log (fail is evidence, not an error)', (t) => {
  const { repo, evidenceDir, manifestPath } = buildFixture()
  t.after(() => rmSync(repo, { recursive: true, force: true }))
  writeFileSync(join(evidenceDir, 'qg-tests.exit'), '1\n')

  const result = assemble({ manifestPath, repoRoot: repo })
  assert.deepEqual(result.gates, { pass: 1, fail: 1, na: 1 })
  const evidence = JSON.parse(readFileSync(result.output, 'utf8'))
  assert.equal(evidence.gates.find((gate) => gate.id === 'G2').status, 'fail')
})

test('assemble: missing stdout file is a contradiction — no JSON is written', (t) => {
  const { repo, evidenceDir, manifestPath } = buildFixture()
  t.after(() => rmSync(repo, { recursive: true, force: true }))
  rmSync(join(evidenceDir, 'qg-tests.stdout'))

  assert.throws(() => assemble({ manifestPath, repoRoot: repo }), ContradictionError)
  assert.equal(existsSync(join(evidenceDir, 'qg-eligibilite-trottinette.json')), false)
})

test('assemble: unknown gate id is a contradiction', (t) => {
  const { repo, evidenceDir, manifestPath } = buildFixture()
  t.after(() => rmSync(repo, { recursive: true, force: true }))
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.gates.push({ id: 'G42', command_executed: 'x', stdout: 'qg-tests.stdout', exit: 'qg-tests.exit' })
  writeFileSync(manifestPath, JSON.stringify(manifest))

  assert.throws(() => assemble({ manifestPath, repoRoot: repo }), /unknown gate id: G42/)
})

test('assemble: not_applicable without rationale is a contradiction', (t) => {
  const { repo, manifestPath } = buildFixture()
  t.after(() => rmSync(repo, { recursive: true, force: true }))
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.gates = manifest.gates.map((gate) =>
    gate.id === 'G5' ? { id: 'G5', status: 'not_applicable' } : gate,
  )
  writeFileSync(manifestPath, JSON.stringify(manifest))

  assert.throws(() => assemble({ manifestPath, repoRoot: repo }), /requires a rationale/)
})

test('cli: --help prints the contract and exits 0; bad usage exits 2', () => {
  const script = new URL(
    '../../plugins/skills/quality-gates-evidence-contract/scripts/qg-evidence.mjs',
    import.meta.url,
  ).pathname
  const help = execFileSync('node', [script, '--help'], { encoding: 'utf8' })
  assert.match(help, /assemble --manifest/)
  assert.match(help, /render --input/)

  assert.throws(
    () => execFileSync('node', [script, 'frobnicate'], { encoding: 'utf8' }),
    (error) => error.status === 2,
  )
})
