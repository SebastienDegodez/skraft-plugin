import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { createGitSourceControl } from '../../../../plugins/skraft-framework/engine/infrastructure/source-control/git-source-control.mjs'
import { createNodeCommandRunner } from '../../../../plugins/skraft-framework/engine/infrastructure/process/node-processes.mjs'
import { commitAll, git, tempFolder } from '../support/workspace.mjs'

/** `work/` holds the API under services/api; `payment-web/` beside it is its own repository. */
const twoRepositories = (t) => {
  const root = tempFolder(t)
  const work = join(root, 'work')
  mkdirSync(join(work, 'services', 'api', 'src'), { recursive: true })
  writeFileSync(join(work, 'services', 'api', 'src', 'Payment.cs'), 'class Payment {}\n')
  writeFileSync(join(work, 'README.md'), '# work\n')
  const workBase = commitAll(work)
  const web = join(root, 'payment-web')
  mkdirSync(join(web, 'src'), { recursive: true })
  writeFileSync(join(web, 'src', 'App.tsx'), 'export const App = () => null\n')
  const webBase = commitAll(web)
  return { root, work, web, workBase, webBase, git: createGitSourceControl({ commandRunner: createNodeCommandRunner({ root: work }) }) }
}

test('each folder knows its repository, relative to the working copy; a folder outside Git has none', async (t) => {
  const { root, git: sourceControl } = twoRepositories(t)
  mkdirSync(join(root, 'plain'))

  assert.equal(await sourceControl.repository('.'), '.')
  assert.equal(await sourceControl.repository('services/api'), '.')
  assert.equal(await sourceControl.repository('../payment-web'), '../payment-web')
  assert.equal(await sourceControl.repository('../plain'), null)
})

test('the merge base is taken in the folder\'s own repository, and is null for a ref that does not exist', async (t) => {
  const { work, web, workBase, webBase, git: sourceControl } = twoRepositories(t)
  git(work, 'checkout', '-q', '-b', 'feature/pay')
  writeFileSync(join(work, 'README.md'), '# work, changed\n')
  git(work, 'commit', '-q', '-am', 'change')
  git(web, 'checkout', '-q', '-b', 'develop')

  assert.equal(await sourceControl.mergeBase('services/api', 'main'), workBase)
  assert.equal(await sourceControl.mergeBase('../payment-web', 'main'), webBase)
  assert.equal(await sourceControl.mergeBase('../payment-web', 'origin/main'), null)
  assert.equal(await sourceControl.mergeBase('.', 'no-such-branch'), null)
})

test('changed files cover commits, staged, unstaged and untracked files under the folder, relative to it', async (t) => {
  const { work, workBase, git: sourceControl } = twoRepositories(t)
  writeFileSync(join(work, 'services', 'api', 'src', 'Refund.cs'), 'class Refund {}\n')
  git(work, 'add', '-A')
  git(work, 'commit', '-q', '-m', 'refund')
  writeFileSync(join(work, 'services', 'api', 'src', 'Payment.cs'), 'class Payment { }\n')
  writeFileSync(join(work, 'services', 'api', 'src', 'Staged.cs'), 'class Staged {}\n')
  git(work, 'add', join('services', 'api', 'src', 'Staged.cs'))
  writeFileSync(join(work, 'services', 'api', 'Notes été.md'), 'untracked\n')
  writeFileSync(join(work, 'README.md'), '# outside the folder\n')

  assert.deepEqual((await sourceControl.changedFiles('services/api', workBase)).sort(), ['Notes été.md', 'src/Payment.cs', 'src/Refund.cs', 'src/Staged.cs'])
  assert.deepEqual(await sourceControl.changedFiles('../payment-web', workBase), null)
})

test('a deleted file is a change; nothing changed gives an empty list', async (t) => {
  const { web, webBase, git: sourceControl } = twoRepositories(t)

  assert.deepEqual(await sourceControl.changedFiles('../payment-web', webBase), [])
  unlinkSync(join(web, 'src', 'App.tsx'))
  assert.deepEqual(await sourceControl.changedFiles('../payment-web', webBase), ['src/App.tsx'])
})
