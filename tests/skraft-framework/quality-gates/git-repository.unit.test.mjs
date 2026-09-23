// Unit — the read-only Git adapter behind qg-verify, against a real repository: a root
// commit, a nested file, a side branch merged back, and a tag whose name ends in hex.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createGitRepository } from '../../../plugins/skraft-framework/src/adapters/infrastructure/git-repository.mjs'

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
  repo = createGitRepository({ cwd: root })
})

after(() => rmSync(root, { recursive: true, force: true }))

test('head: the full SHA of HEAD, null outside a repository', () => {
  assert.equal(repo.head(), sha.merge)
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'skraft-no-git-')))
  try {
    assert.equal(createGitRepository({ cwd: outside }).head(), null)
  } finally {
    rmSync(outside, { recursive: true, force: true })
  }
})

test('parentOf: the first parent, null for a root commit or anything that is not a hex SHA', () => {
  assert.equal(repo.parentOf(sha.nested), sha.root)
  assert.equal(repo.parentOf(sha.merge), sha.main)
  assert.equal(repo.parentOf(sha.nested.slice(0, 7).toUpperCase()), sha.root, 'abbreviated, any case')
  assert.equal(repo.parentOf(sha.root), null)
  assert.equal(repo.parentOf(`${sha.merge}~1`), null, 'a revision expression is not a SHA')
  assert.equal(repo.parentOf('HEAD'), null)
  assert.equal(repo.parentOf(undefined), null)
})

test('filesOf: every path a commit changes, the root commit and nested paths included', () => {
  assert.deepEqual(repo.filesOf(sha.root), ['README.md'])
  assert.deepEqual(repo.filesOf(sha.nested), ['src/Orders/Discount.cs'])
  assert.deepEqual(repo.filesOf(sha.nested.slice(0, 7)), ['src/Orders/Discount.cs'], 'seven hex digits are enough')
  assert.deepEqual(repo.filesOf(sha.nested.slice(0, 6)), [], 'six are not')
  assert.deepEqual(repo.filesOf('deadbeefdeadbeef'), [], 'well formed, absent')
  assert.deepEqual(repo.filesOf('release-1234567'), [], 'a ref ending in hex is not a SHA')
  assert.deepEqual(repo.filesOf(null), [])
})

test('commit: subject, full message and files of a commit; exists: false for anything else', () => {
  assert.deepEqual(repo.commit(sha.nested), {
    exists: true,
    subject: 'feat(orders): add discounts',
    message: 'feat(orders): add discounts\n\nGold customers get ten percent.\n\n',
    files: ['src/Orders/Discount.cs'],
  })
  assert.deepEqual(repo.commit('deadbeefdeadbeef'), { exists: false }, 'well formed, absent')
  assert.deepEqual(repo.commit(sha.tree), { exists: false }, 'a tree is not a commit')
  assert.deepEqual(repo.commit('release-1234567'), { exists: false })
  assert.deepEqual(repo.commit('--all'), { exists: false })
})

test('range: the non-merge commits reachable from rev and not from base', () => {
  assert.deepEqual(repo.range(sha.root, sha.merge).sort(), [sha.nested, sha.side, sha.main].sort())
  assert.deepEqual(repo.range(sha.merge, sha.merge), [])
  assert.deepEqual(repo.range('deadbeefdeadbeef', sha.merge), [], 'an absent base')
  assert.deepEqual(repo.range('release-1234567', sha.merge), [], 'base must be a SHA')
  assert.deepEqual(repo.range(sha.root, 'release-1234567'), [], 'rev must be a SHA')
})

test('show: a file as a commit holds it, null when absent or unaddressable', () => {
  assert.equal(repo.show(sha.nested, 'src/Orders/Discount.cs'), 'class Discount {}\n')
  assert.equal(repo.show(sha.root, 'side.txt'), null)
  assert.equal(repo.show(sha.nested, ''), null, 'an empty path would list the tree')
  assert.equal(repo.show(sha.nested, ['src/Orders/Discount.cs']), null, 'a path must be a string, not something that prints as one')
  assert.equal(repo.show('release-1234567', 'README.md'), null)
})
