// Unit — the git SourceControl adapter (evidence verification, structural scan, commit
// scan, RunPipeline), against a real repository: a root
// commit, a nested file, a side branch merged back, and a tag whose name ends in hex.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createNodeSourceControl } from '../../../plugins/skraft-framework/src/adapters/infrastructure/git/node-source-control.mjs'

let root
let repo
const sha = {}

before(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'skraft-git-repository-')))
  const git = (...args) => execFileSync('git', ['-c', 'user.email=e@x', '-c', 'user.name=E', ...args], { cwd: root, encoding: 'utf8' }).trim()
  const commit = (path, content, ...message) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
    git('add', '.')
    git('commit', '-q', ...message.flatMap((paragraph) => ['-m', paragraph]))
    return git('rev-parse', 'HEAD')
  }
  git('init', '-q', '-b', 'main')
  sha.root = commit('README.md', 'base\n', 'chore(orders): base')
  sha.nested = commit('src/Orders/Discount.cs', 'class Discount {}\n', 'feat(orders): add discounts', 'Gold customers get ten percent.')
  git('tag', 'release-1234567')
  git('checkout', '-q', '-b', 'side')
  sha.side = commit('side.txt', 'side\n', 'test(orders): side work')
  git('checkout', '-q', 'main')
  sha.main = commit('README.md', 'base\nmore\n', 'docs(orders): more')
  git('merge', '-q', '--no-ff', '-m', 'merge side', 'side')
  sha.merge = git('rev-parse', 'HEAD')
  sha.tree = git('rev-parse', `${sha.nested}^{tree}`)
  repo = createNodeSourceControl({ cwd: root })
})

after(() => rmSync(root, { recursive: true, force: true }))

test('head: the full SHA of HEAD, null outside a repository', async () => {
  assert.equal(await repo.head(), sha.merge)
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'skraft-no-git-')))
  try {
    assert.equal(await createNodeSourceControl({ cwd: outside }).head(), null)
  } finally {
    rmSync(outside, { recursive: true, force: true })
  }
})

test('parentOf: the first parent, null for a root commit or anything that is not a hex SHA', async () => {
  assert.equal(await repo.parentOf(sha.nested), sha.root)
  assert.equal(await repo.parentOf(sha.merge), sha.main)
  assert.equal(await repo.parentOf(sha.nested.slice(0, 7).toUpperCase()), sha.root, 'abbreviated, any case')
  assert.equal(await repo.parentOf(sha.root), null)
  assert.equal(await repo.parentOf(`${sha.merge}~1`), null, 'a revision expression is not a SHA')
  assert.equal(await repo.parentOf('HEAD'), null)
  assert.equal(await repo.parentOf(undefined), null)
})

test('filesOf: every path a commit changes, the root commit and nested paths included', async () => {
  assert.deepEqual(await repo.filesOf(sha.root), ['README.md'])
  assert.deepEqual(await repo.filesOf(sha.nested), ['src/Orders/Discount.cs'])
  assert.deepEqual(await repo.filesOf(sha.nested.slice(0, 7)), ['src/Orders/Discount.cs'], 'seven hex digits are enough')
  assert.deepEqual(await repo.filesOf(sha.nested.slice(0, 6)), [], 'six are not')
  assert.deepEqual(await repo.filesOf('deadbeefdeadbeef'), [], 'well formed, absent')
  assert.deepEqual(await repo.filesOf('release-1234567'), [], 'a ref ending in hex is not a SHA')
  assert.deepEqual(await repo.filesOf(null), [])
})

test('commit: subject, full message and files of a commit; exists: false for anything else', async () => {
  assert.deepEqual(await repo.commit(sha.nested), {
    exists: true,
    subject: 'feat(orders): add discounts',
    message: 'feat(orders): add discounts\n\nGold customers get ten percent.\n\n',
    files: ['src/Orders/Discount.cs'],
  })
  assert.deepEqual(await repo.commit('deadbeefdeadbeef'), { exists: false }, 'well formed, absent')
  assert.deepEqual(await repo.commit(sha.tree), { exists: false }, 'a tree is not a commit')
  assert.deepEqual(await repo.commit('release-1234567'), { exists: false })
  assert.deepEqual(await repo.commit('--all'), { exists: false })
})

test('range: the non-merge commits reachable from rev and not from base', async () => {
  assert.deepEqual((await repo.range(sha.root, sha.merge)).sort(), [sha.nested, sha.side, sha.main].sort())
  assert.deepEqual(await repo.range(sha.merge, sha.merge), [])
  assert.deepEqual(await repo.range('deadbeefdeadbeef', sha.merge), [], 'an absent base')
  assert.deepEqual(await repo.range('release-1234567', sha.merge), [], 'base must be a SHA')
  assert.deepEqual(await repo.range(sha.root, 'release-1234567'), [], 'rev must be a SHA')
})

test('a SHA-256 repository: its 64-digit commit ids are SHAs too', async () => {
  const sha256Root = realpathSync(mkdtempSync(join(tmpdir(), 'skraft-git-sha256-')))
  try {
    const git = (...args) => execFileSync('git', ['-c', 'user.email=e@x', '-c', 'user.name=E', ...args], { cwd: sha256Root, encoding: 'utf8' }).trim()
    git('init', '-q', '--object-format=sha256')
    writeFileSync(join(sha256Root, 'README.md'), 'base\n')
    git('add', '.')
    git('commit', '-q', '-m', 'chore(orders): base')
    const head = git('rev-parse', 'HEAD')
    assert.match(head, /^[0-9a-f]{64}$/)

    const sha256Repo = createNodeSourceControl({ cwd: sha256Root })
    assert.deepEqual(await sha256Repo.commit(head), { exists: true, subject: 'chore(orders): base', message: 'chore(orders): base\n\n', files: ['README.md'] })
    assert.equal(await sha256Repo.show(head, 'README.md'), 'base\n')
    assert.deepEqual(await sha256Repo.commit(`${head}0`), { exists: false }, 'no id is longer than 64 digits')
  } finally {
    rmSync(sha256Root, { recursive: true, force: true })
  }
})

test('show: a file as a commit holds it, null when absent or unaddressable', async () => {
  assert.equal(await repo.show(sha.nested, 'src/Orders/Discount.cs'), 'class Discount {}\n')
  assert.equal(await repo.show(sha.root, 'side.txt'), null)
  assert.equal(await repo.show(sha.nested, ''), null, 'an empty path would list the tree')
  assert.equal(await repo.show(sha.nested, ['src/Orders/Discount.cs']), null, 'a path must be a string, not something that prints as one')
  assert.equal(await repo.show('release-1234567', 'README.md'), null)
})

test('listRecent: newest-first { sha, subject } pairs, bounded by count, empty outside a repository', async () => {
  const recent = await repo.listRecent(2)
  assert.deepEqual(recent, [{ sha: sha.merge, subject: 'merge side' }, { sha: sha.main, subject: 'docs(orders): more' }])
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'skraft-no-git-')))
  try {
    assert.deepEqual(await createNodeSourceControl({ cwd: outside }).listRecent(10), [])
  } finally {
    rmSync(outside, { recursive: true, force: true })
  }
})

test('headSha: the same as head, the vocabulary RunPipeline and the structural scan use', async () => {
  assert.equal(await repo.headSha(), sha.merge)
})

test('currentBranch and remoteUrl: the checked-out branch and origin, null when detached or absent', async () => {
  assert.equal(await repo.currentBranch(), 'main')
  assert.equal(await repo.remoteUrl(), null)
  execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/acme/shop.git'], { cwd: root })
  assert.equal(await repo.remoteUrl(), 'https://github.com/acme/shop.git')
  execFileSync('git', ['checkout', '-q', '--detach'], { cwd: root })
  assert.equal(await repo.currentBranch(), null)
  execFileSync('git', ['checkout', '-q', 'main'], { cwd: root })
})
