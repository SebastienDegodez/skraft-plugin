/**
 * Acceptance test — `scan-commits` subcommand of the state CLI (S7 bridge).
 *
 * Scans the N most recent commits on HEAD and flags subjects that do not follow
 * the `type(scope): subject` convention (G8) skraft's TDD workflow requires — a
 * utility for catching stray auto-commit-hook messages before a manual DELIVER
 * closure (SebastienDegodez/skraft-plugin#105 / #106).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const CLI = fileURLToPath(new URL('../../plugins/src/cli/state.mjs', import.meta.url))

async function stateCli(args, { cwd }) {
  try {
    const { stdout, stderr } = await execFileAsync('node', [CLI, ...args], { cwd })
    return { exitCode: 0, stdout, stderr }
  } catch (err) {
    return { exitCode: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' }
  }
}

async function initRepo(cwd) {
  await execFileAsync('git', ['init', '-q'], { cwd })
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd })
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd })
}

async function commit(cwd, filename, message) {
  await writeFile(join(cwd, filename), `${message}\n`, 'utf8')
  await execFileAsync('git', ['add', '.'], { cwd })
  await execFileAsync('git', ['commit', '-q', '-m', message], { cwd })
}

test('scan-commits: exit 0 and empty nonConventional when every recent commit is conventional', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-scan-commits-'))
  try {
    await initRepo(dir)
    await commit(dir, 'a.txt', 'feat(cli): add scan-commits subcommand')
    await commit(dir, 'b.txt', 'test(cli): assert scan-commits flags stray commits')

    const { exitCode, stdout } = await stateCli(['scan-commits', '--count', '10'], { cwd: dir })

    assert.equal(exitCode, 0)
    const result = JSON.parse(stdout)
    assert.equal(result.total, 2)
    assert.deepEqual(result.nonConventional, [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('scan-commits: exit 1 and lists non-conventional commits by sha+subject', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-scan-commits-'))
  try {
    await initRepo(dir)
    await commit(dir, 'a.txt', 'feat(cli): add scan-commits subcommand')
    await commit(dir, 'b.txt', 'Copilot CLI session abc123 changes')

    const { exitCode, stdout } = await stateCli(['scan-commits', '--count', '10'], { cwd: dir })

    assert.equal(exitCode, 1)
    const result = JSON.parse(stdout)
    assert.equal(result.total, 2)
    assert.equal(result.nonConventional.length, 1)
    assert.equal(result.nonConventional[0].subject, 'Copilot CLI session abc123 changes')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('scan-commits: rejects a non-positive-integer --count', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-scan-commits-'))
  try {
    await initRepo(dir)
    await commit(dir, 'a.txt', 'feat(cli): add scan-commits subcommand')

    const { exitCode, stderr } = await stateCli(['scan-commits', '--count', 'abc'], { cwd: dir })

    assert.equal(exitCode, 1)
    const err = JSON.parse(stderr)
    assert.equal(err.code, 'INVALID_ARGUMENT')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
