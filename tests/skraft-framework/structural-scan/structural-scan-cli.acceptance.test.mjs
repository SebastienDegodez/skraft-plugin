// Acceptance — the structural scan reads a real Git work tree and writes the same JSON
// report the architect and the DESIGN reviewer both judge.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CLI = fileURLToPath(new URL('../../../plugins/skraft-framework/src/cli/structural-scan.mjs', import.meta.url))

const withRepo = (fn) => {
  const repo = mkdtempSync(join(tmpdir(), 'skraft-scan-'))
  const git = (...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' })
  try {
    git('init', '-q')
    mkdirSync(join(repo, 'src', 'Orders'), { recursive: true })
    mkdirSync(join(repo, 'src', 'Orders', 'obj'), { recursive: true })
    writeFileSync(join(repo, 'src', 'Orders', 'PlaceOrder.cs'), 'public class PlaceOrder(ICommandBus bus) {}\n')
    writeFileSync(join(repo, 'src', 'Orders', 'obj', 'Generated.cs'), 'class ShippingSaga {}\n')
    writeFileSync(join(repo, 'README.md'), 'We might use a Saga one day.\n')
    git('add', '.')
    git('commit', '-q', '-m', 'chore: base')
    fn({ repo, revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim() })
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
}

test('the scan writes the report under --out and prints its path', () => {
  withRepo(({ repo, revision }) => {
    const printed = execFileSync('node', [CLI, '--root', repo, '--out', 'scan/structural-scan.json'], { encoding: 'utf8' })

    assert.equal(printed.trim(), 'scan/structural-scan.json')
    const report = JSON.parse(readFileSync(join(repo, 'scan', 'structural-scan.json'), 'utf8'))
    assert.equal(report.revision, revision)
    assert.equal(report.scannedFiles, 1, 'only the committed source outside obj/ is scanned')
    const detected = Object.fromEntries(report.commitments.map((c) => [c.commitment, c.detected]))
    assert.deepEqual(detected, { 'cqrs-bus': true, 'event-sourcing': false, saga: false })
    assert.deepEqual(report.commitments[0].hits, [{ path: 'src/Orders/PlaceOrder.cs', line: 1, text: 'public class PlaceOrder(ICommandBus bus) {}' }])
  })
})

test('without --out the report goes to stdout', () => {
  withRepo(({ repo }) => {
    const report = JSON.parse(execFileSync('node', [CLI, '--root', repo], { encoding: 'utf8' }))
    assert.ok(Array.isArray(report.manualReview))
    assert.equal(typeof report.generatedAt, 'string')
  })
})

test('an unknown option is a usage error', () => {
  assert.throws(() => execFileSync('node', [CLI, '--bogus'], { stdio: 'pipe' }), (error) => error.status === 3)
})
