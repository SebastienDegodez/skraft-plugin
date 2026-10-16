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

test('commits since a sha come oldest first, with their subject and the files they changed under the folder', async (t) => {
  const { root, base, sourceControl } = repository(t)
  const red = commit(root, 'test(payment): refund "full" (red) : fails', { 'services/api/src/Refund Test.cs': 'class RefundTest {}\n' })
  const web = commit(root, 'feat(web): banner', { 'services/web/App.tsx': 'export const App = 1\n' })
  const green = commit(root, 'feat(payment): refund', {
    'services/api/src/Refund.cs': 'class Refund {}\n',
    'services/api/src/Payment.cs': 'class Payment { }\n',
  })

  assert.deepEqual(await sourceControl.commits('services/api', base), [
    { sha: red, subject: 'test(payment): refund "full" (red) : fails', files: ['src/Refund Test.cs'] },
    { sha: web, subject: 'feat(web): banner', files: [] },
    { sha: green, subject: 'feat(payment): refund', files: ['src/Payment.cs', 'src/Refund.cs'] },
  ])
  assert.deepEqual((await sourceControl.commits('.', red)).map((entry) => entry.files), [['services/web/App.tsx'], ['services/api/src/Payment.cs', 'services/api/src/Refund.cs']])
  assert.deepEqual(await sourceControl.commits('.', green), [])
})

test('commits since a sha the repository does not know cannot be told', async (t) => {
  const { sourceControl } = repository(t)

  assert.equal(await sourceControl.commits('.', 'f'.repeat(40)), null)
  assert.equal(await sourceControl.commits('.', 'no-such-ref'), null)
})
