import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createGitCommitVerifier } from '../../plugins/src/adapters/infrastructure/git-commit-verifier.mjs'

const execFileAsync = promisify(execFile)

async function initRepo(cwd) {
  await execFileAsync('git', ['init', '-q'], { cwd })
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd })
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd })
}

test('git-commit-verifier: clean true and a headSha after a commit with no pending changes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-git-'))
  try {
    await initRepo(dir)
    await writeFile(join(dir, 'file.txt'), 'hello\n', 'utf8')
    await execFileAsync('git', ['add', '.'], { cwd: dir })
    await execFileAsync('git', ['commit', '-q', '-m', 'feat: initial commit'], { cwd: dir })

    const verifier = createGitCommitVerifier({ cwd: dir })
    const result = await verifier.verify()

    assert.equal(result.clean, true)
    assert.match(result.headSha, /^[0-9a-f]{40}$|^[0-9a-f]{64}$/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('git-commit-verifier: clean false when the working tree has uncommitted changes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-git-'))
  try {
    await initRepo(dir)
    await writeFile(join(dir, 'file.txt'), 'hello\n', 'utf8')
    await execFileAsync('git', ['add', '.'], { cwd: dir })
    await execFileAsync('git', ['commit', '-q', '-m', 'feat: initial commit'], { cwd: dir })
    await writeFile(join(dir, 'file.txt'), 'uncommitted change\n', 'utf8')

    const verifier = createGitCommitVerifier({ cwd: dir })
    const result = await verifier.verify()

    assert.equal(result.clean, false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('git-commit-verifier: clean false and headSha null when cwd is not a git repository', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-nogit-'))
  try {
    const verifier = createGitCommitVerifier({ cwd: dir })
    const result = await verifier.verify()

    assert.equal(result.clean, false)
    assert.equal(result.headSha, null)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
