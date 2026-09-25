// Acceptance — qg-verify judges an evidence log against the files it cites and the Git
// history it claims, in a real repository built as a DELIVER story leaves it: a signed
// RED commit, a signed GREEN commit, captured tool outputs, then an evidence-only commit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const QG_VERIFY = fileURLToPath(new URL('../../../plugins/skraft-framework/src/cli/qg-verify.mjs', import.meta.url))
const EV = '.copilot-tracking/skraft-plans/orders/evidence/2026-09-23/order-discount'
const REF = 'evidence/2026-09-23/order-discount'
const TEST_FILE = 'tests/Orders.UnitTests/DiscountTests.cs'
const RED_TEST = 'public class DiscountTests\n{\n    [Fact] public void Gold_gets_ten_percent() => Assert.Equal(90m, Discount.For("gold", 100m));\n}\n'
const GREEN_TEST = RED_TEST.replace('}\n', '    [Fact] public void Silver_gets_five_percent() => Assert.Equal(95m, Discount.For("silver", 100m));\n}\n')

const sha256 = (content) => createHash('sha256').update(content).digest('hex')

// Builds the repository and its log; `tweak` edits the story before the evidence commit.
const story = (tweak = {}) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'skraft-qg-verify-')))
  const git = (...args) => execFileSync('git', ['-c', 'user.email=e@x', '-c', 'user.name=E', ...args], { cwd: root, encoding: 'utf8' }).trim()
  const write = (path, content) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  git('init', '-q')
  git('commit', '-q', '--allow-empty', '-m', 'chore(orders): base')
  const base = git('rev-parse', 'HEAD')

  write(TEST_FILE, RED_TEST)
  git('add', '.')
  git('commit', '-q', ...(tweak.unsigned ? [] : ['-s']), '-m', 'test(order-discount): gold customers get ten percent')
  const red = git('rev-parse', 'HEAD')

  write('src/Orders.Domain/Discount.cs', 'public static class Discount { }\n')
  write(TEST_FILE, tweak.greenTest ?? GREEN_TEST)
  git('add', '.')
  git('commit', '-q', '-s', '-m', 'feat(order-discount): apply loyalty discounts')
  const green = git('rev-parse', 'HEAD')

  const out = (name, content) => { write(`${EV}/${name}`, content); return { ref: `${REF}/${name}`, sha: sha256(content) } }
  const gate = (id, label, stdoutText, exitCode, extra = {}) => {
    const stdout = out(`qg-${label}.stdout`, stdoutText)
    const exit = out(`qg-${label}.exit`, `${exitCode}\n`)
    return { id, label, status: 'pass', command_executed: `run ${label}`, stdout_ref: stdout.ref, stdout_sha256: stdout.sha, stdout_tail: stdoutText.slice(-20), exit_code_ref: exit.ref, ...extra }
  }
  const redStdout = out('qg-red-1.stdout', 'Failed Gold_gets_ten_percent\n')
  const redExit = out('qg-red-1.exit', `${tweak.redExit ?? 1}\n`)
  const redSnap = out('snapshots/red-1-DiscountTests.cs', RED_TEST)
  const greenSnap = out('snapshots/green-1-DiscountTests.cs', tweak.greenTest ?? GREEN_TEST)

  const log = {
    $schema: 'quality-gates-evidence/v4',
    story: 'order-discount',
    produced_at: '2026-09-23T10:00:00Z',
    producer: 'software-engineer',
    tech_adapter: 'quality-gates-dotnet',
    repo_root_rev: green,
    commits_covered: [
      { sha: red, subject: 'test(order-discount): gold customers get ten percent', files_changed: [TEST_FILE] },
      { sha: green, subject: 'feat(order-discount): apply loyalty discounts', files_changed: ['src/Orders.Domain/Discount.cs', TEST_FILE] },
    ],
    gates: [
      gate('G1', 'acceptance', 'Passed: 3\n', 0, { metrics: { tests_total: 3, tests_passed: 3, tests_failed: 0 } }),
      gate('G2', 'tests', 'Passed: 12\n', tweak.testsExit ?? 0, { metrics: { tests_total: 12, tests_passed: 12, tests_failed: 0 } }),
      gate('G3', 'build', 'Build succeeded\n', 0),
      gate('G4', 'analysis', '0 warnings\n', 0),
      gate('G5', 'arch', 'Passed: 4\n', 0),
      gate('G6', 'mutation', 'score 100%\n', 0, { scope: 'core' }),
      gate('G6', 'mutation-boundary', 'score 85%\n', 0, { scope: 'boundary' }),
      gate('G7', 'mocks', '', 1),
      { id: 'G8', label: 'Conventional commits', status: 'pass' },
      { id: 'G9', label: 'No test tampering', status: 'pass' },
      { id: 'G10', label: 'RED observed', status: 'pass' },
      gate('G11', 'coverage', 'Line coverage 100%\n', 0),
    ],
    test_integrity: {
      cycles: [{
        cycle: 1,
        behavior: 'gold discount',
        test_files: [TEST_FILE],
        red_commit: red,
        green_commit: green,
        red_snapshot_ref: redSnap.ref,
        green_snapshot_ref: greenSnap.ref,
        red_stdout_ref: redStdout.ref,
        red_stdout_sha256: redStdout.sha,
        red_exit_code_ref: redExit.ref,
      }],
    },
  }
  tweak.log?.(log, { out })
  write(`${EV}/qg-order-discount.json`, `${JSON.stringify(log, null, 2)}\n`)
  git('add', '.copilot-tracking')
  git('commit', '-q', '-s', '-m', 'chore(order-discount): record quality evidence')
  tweak.after?.({ git, write })
  return { root, base, red, green, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

const verify = (s, ...extra) => {
  const run = spawnSync('node', [QG_VERIFY, '--log', `${EV}/qg-order-discount.json`, '--root', s.root, ...extra], { encoding: 'utf8' })
  return { exit: run.status, ...JSON.parse(run.stdout) }
}
const codes = (result) => result.findings.map((f) => f.code)

test('an honest story passes, with its evidence committed on top of the work', () => {
  const s = story()
  try {
    const result = verify(s, '--base', s.base)
    assert.deepEqual(result.findings, [])
    assert.equal(result.verdict, 'pass')
    assert.equal(result.exit, 0)
  } finally { s.cleanup() }
})

test('a test line removed between RED and GREEN is tampering', () => {
  const s = story({ greenTest: RED_TEST.replace('Gold_gets_ten_percent', 'Gold_gets_something') })
  try {
    const result = verify(s)
    assert.equal(result.verdict, 'fail')
    assert.ok(codes(result).includes('TEST_TAMPERED'), JSON.stringify(result.findings))
  } finally { s.cleanup() }
})

test('a passing gate whose runner exited non-zero is a contradiction', () => {
  const s = story({ testsExit: 1 })
  try {
    const result = verify(s)
    assert.equal(result.verdict, 'fail')
    assert.deepEqual(codes(result), ['EXIT_CONTRADICTS_STATUS'])
    assert.equal(result.exit, 1)
  } finally { s.cleanup() }
})

test('a RED run that exited 0 proves the test never failed', () => {
  const s = story({ redExit: 0 })
  try {
    assert.deepEqual(codes(verify(s)), ['RED_NEVER_FAILED'])
  } finally { s.cleanup() }
})

test('an output altered after it was hashed makes the log inconclusive', () => {
  const s = story({ log: (log) => { log.gates[2].stdout_sha256 = '0'.repeat(64) } })
  try {
    const result = verify(s)
    assert.equal(result.verdict, 'inconclusive')
    assert.deepEqual(codes(result), ['STDOUT_HASH_MISMATCH'])
    assert.equal(result.exit, 2)
  } finally { s.cleanup() }
})

test('work committed after the evidence leaves the log stale', () => {
  const s = story({ after: ({ git, write }) => { write('src/Orders.Domain/Later.cs', '// later\n'); git('add', '.'); git('commit', '-q', '-s', '-m', 'feat(order-discount): later work') } })
  try {
    assert.deepEqual(codes(verify(s)), ['REVISION_STALE'])
  } finally { s.cleanup() }
})

test('a commit made since the phase base but left out of the log is caught', () => {
  const s = story({ log: (log) => { log.commits_covered = log.commits_covered.slice(1) } })
  try {
    const result = verify(s, '--base', s.base)
    assert.equal(result.verdict, 'fail')
    assert.deepEqual(codes(result), ['COMMITS_INCOMPLETE'])
  } finally { s.cleanup() }
})

test('an unsigned covered commit breaks the commit policy', () => {
  const s = story({ unsigned: true })
  try {
    assert.deepEqual(codes(verify(s)), ['COMMIT_UNSIGNED'])
  } finally { s.cleanup() }
})

test('both mutation scopes are required in a v4 log', () => {
  const s = story({ log: (log) => { log.gates = log.gates.filter((g) => g.scope !== 'boundary') } })
  try {
    const result = verify(s)
    assert.equal(result.verdict, 'inconclusive')
    assert.deepEqual(codes(result), ['GATE_MISSING'])
  } finally { s.cleanup() }
})

test('a missing or unreadable log is inconclusive, and usage errors exit 3', () => {
  const s = story()
  try {
    const run = spawnSync('node', [QG_VERIFY, '--log', `${EV}/absent.json`, '--root', s.root], { encoding: 'utf8' })
    assert.equal(run.status, 2)
    assert.equal(JSON.parse(run.stdout).findings[0].code, 'LOG_MISSING')
    assert.equal(spawnSync('node', [QG_VERIFY], { encoding: 'utf8' }).status, 3)
  } finally { s.cleanup() }
})
