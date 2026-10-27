import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createGitSourceControl } from '../../../../plugins/skraft-framework/engine/infrastructure/source-control/git-source-control.mjs'
import { createNodeCommandRunner } from '../../../../plugins/skraft-framework/engine/infrastructure/process/node-processes.mjs'
import { commitAll, git, tempFolder } from '../support/workspace.mjs'

/** `services/api` and `services/web` in one repository, one commit on main. */
const repository = (t) => {
  const root = tempFolder(t)
  mkdirSync(join(root, 'services', 'api', 'src'), { recursive: true })
  mkdirSync(join(root, 'services', 'web'), { recursive: true })
  writeFileSync(join(root, 'services', 'api', 'src', 'Payment.cs'), 'class Payment {}\n')
  writeFileSync(join(root, 'services', 'web', 'App.tsx'), 'export {}\n')
  const base = commitAll(root)
  return { root, base, sourceControl: createGitSourceControl({ commandRunner: createNodeCommandRunner({ root }) }) }
}

/** @param {string} root @param {string} message @param {Record<string, string>} files */
const commit = (root, message, files) => {
  for (const [path, text] of Object.entries(files)) writeFileSync(join(root, ...path.split('/')), text)
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', message)
  return git(root, 'rev-parse', 'HEAD')
}

test('head is the sha HEAD points at; a folder outside Git or a repository without commits has none', async (t) => {
  const { root, base, sourceControl } = repository(t)
  assert.equal(await sourceControl.head('services/api'), base)

  const second = commit(root, 'more', { 'services/api/src/Refund.cs': 'class Refund {}\n' })
  assert.equal(await sourceControl.head('.'), second)

  const outside = tempFolder(t)
  const runner = createGitSourceControl({ commandRunner: createNodeCommandRunner({ root: outside }) })
  assert.equal(await runner.head('.'), null)
  git(outside, 'init', '-q', '-b', 'main')
  assert.equal(await runner.head('.'), null)
})

test('commits since a sha come oldest first, with their parent, their subject, their body and the files they changed under the folder', async (t) => {
  const { root, base, sourceControl } = repository(t)
  const red = commit(root, 'test(payment): refund "full" (red) : fails\n\nRefs: #42', { 'services/api/src/Refund Test.cs': 'class RefundTest {}\n' })
  const web = commit(root, 'feat(web): banner', { 'services/web/App.tsx': 'export const App = 1\n' })
  const green = commit(root, 'feat(payment): refund\n\nPays the card back.\nSee #42: refund.\n\nRefs: #42\nSigned-off-by: Ann <ann@example.com>\n', {
    'services/api/src/Refund.cs': 'class Refund {}\n',
    'services/api/src/Payment.cs': 'class Payment { }\n',
  })

  assert.deepEqual(await sourceControl.commits('services/api', base), [
    { sha: red, parent: base, subject: 'test(payment): refund "full" (red) : fails', body: 'Refs: #42', files: ['src/Refund Test.cs'] },
    { sha: web, parent: red, subject: 'feat(web): banner', body: '', files: [] },
    { sha: green, parent: web, subject: 'feat(payment): refund', body: 'Pays the card back.\nSee #42: refund.\n\nRefs: #42\nSigned-off-by: Ann <ann@example.com>', files: ['src/Payment.cs', 'src/Refund.cs'] },
  ])
  assert.deepEqual((await sourceControl.commits('.', red)).map((entry) => entry.files), [['services/web/App.tsx'], ['services/api/src/Payment.cs', 'services/api/src/Refund.cs']])
  assert.deepEqual(await sourceControl.commits('.', green), [])
})

test('a merge commit\'s parent is its first parent, the branch it was merged into', async (t) => {
  const { root, base, sourceControl } = repository(t)
  git(root, 'checkout', '-q', '-b', 'side')
  const side = commit(root, 'feat(web): side', { 'services/web/Side.tsx': 'export {}\n' })
  git(root, 'checkout', '-q', 'main')
  const main = commit(root, 'feat(payment): main', { 'services/api/src/Main.cs': 'class Main {}\n' })
  git(root, 'merge', '-q', '--no-ff', '-m', 'chore: merge side', 'side')

  const listed = await sourceControl.commits('.', main)

  assert.deepEqual(listed.map(({ sha, subject, parent }) => [sha, subject, parent]), [
    [side, 'feat(web): side', base],
    [git(root, 'rev-parse', 'HEAD'), 'chore: merge side', main],
  ])
})

test('commits since a sha the repository does not know cannot be told', async (t) => {
  const { sourceControl } = repository(t)

  assert.equal(await sourceControl.commits('.', 'f'.repeat(40)), null)
  assert.equal(await sourceControl.commits('.', 'no-such-ref'), null)
})

test('a file moved to another folder shows as both paths, in the changes and in the commits', async (t) => {
  const { root, base, sourceControl } = repository(t)
  mkdirSync(join(root, 'docs', 'adr'), { recursive: true })
  git(root, 'mv', 'services/api/src/Payment.cs', 'docs/adr/Payment.cs')

  assert.deepEqual((await sourceControl.changedFiles('.', base)).sort(), ['docs/adr/Payment.cs', 'services/api/src/Payment.cs'])

  git(root, 'commit', '-q', '-m', 'docs(adr): move')
  assert.deepEqual((await sourceControl.commits('.', base)).map((entry) => entry.files.sort()), [['docs/adr/Payment.cs', 'services/api/src/Payment.cs']])
})
