import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createGitCommitLogReader } from '../../plugins/skraft-framework/src/adapters/infrastructure/git-commit-log-reader.mjs'

const execFileAsync = promisify(execFile)

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

test('git-commit-log-reader: listRecent returns newest-first sha+subject pairs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-commit-log-'))
  try {
    await initRepo(dir)
    await commit(dir, 'a.txt', 'feat(cli): first commit')
    await commit(dir, 'b.txt', 'test(cli): second commit')

    const reader = createGitCommitLogReader({ cwd: dir })
    const commits = await reader.listRecent(10)

    assert.equal(commits.length, 2)
    assert.equal(commits[0].subject, 'test(cli): second commit')
    assert.equal(commits[1].subject, 'feat(cli): first commit')
    assert.match(commits[0].sha, /^[0-9a-f]{40}$|^[0-9a-f]{64}$/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('git-commit-log-reader: listRecent respects the count limit', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-commit-log-'))
  try {
    await initRepo(dir)
    await commit(dir, 'a.txt', 'feat(cli): first commit')
    await commit(dir, 'b.txt', 'test(cli): second commit')
    await commit(dir, 'c.txt', 'docs(cli): third commit')

    const reader = createGitCommitLogReader({ cwd: dir })
    const commits = await reader.listRecent(2)

    assert.equal(commits.length, 2)
    assert.equal(commits[0].subject, 'docs(cli): third commit')
    assert.equal(commits[1].subject, 'test(cli): second commit')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('git-commit-log-reader: listRecent returns empty array when cwd is not a git repository', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-nogit-'))
  try {
    const reader = createGitCommitLogReader({ cwd: dir })
    const commits = await reader.listRecent(10)

    assert.deepEqual(commits, [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
