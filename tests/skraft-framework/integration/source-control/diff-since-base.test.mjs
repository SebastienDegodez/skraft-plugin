import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createGitSourceControl } from '../../../../plugins/skraft-framework/engine/infrastructure/source-control/git-source-control.mjs'
import { createNodeCommandRunner } from '../../../../plugins/skraft-framework/engine/infrastructure/process/node-processes.mjs'
import { commitAll, git, tempFolder } from '../support/workspace.mjs'

/**
 * `work/` holds the API under services/api. Since its base: a commit changed Payment.cs, Refund.cs
 * is staged, README.md is changed but not staged, Notes.md is untracked.
 */
const changedSinceBase = (t) => {
  const work = join(tempFolder(t), 'work')
  mkdirSync(join(work, 'services', 'api', 'src'), { recursive: true })
  writeFileSync(join(work, 'services', 'api', 'src', 'Payment.cs'), 'class Payment {}\n')
  writeFileSync(join(work, 'README.md'), '# work\n')
  const base = commitAll(work)
  writeFileSync(join(work, 'services', 'api', 'src', 'Payment.cs'), 'class Payment { int Amount; }\n')
  git(work, 'commit', '-q', '-am', 'feat: amount')
  writeFileSync(join(work, 'services', 'api', 'src', 'Refund.cs'), 'class Refund {}\n')
  git(work, 'add', 'services/api/src/Refund.cs')
  writeFileSync(join(work, 'README.md'), '# work, changed\n')
  writeFileSync(join(work, 'services', 'api', 'Notes.md'), 'untracked\n')
  return { work, base, sourceControl: createGitSourceControl({ commandRunner: createNodeCommandRunner({ root: work }) }) }
}

/** The `diff --git` lines of a patch. @param {string | null} patch */
const sections = (patch) => (patch ?? '').split('\n').filter((line) => line.startsWith('diff --git '))

test('the diff since a base holds the committed, staged and unstaged changes of tracked files, paths relative to the folder', async (t) => {
  const { base, sourceControl } = changedSinceBase(t)

  const api = await sourceControl.diff('services/api', base)
  const all = await sourceControl.diff('.', base)

  assert.deepEqual(sections(api), ['diff --git a/src/Payment.cs b/src/Payment.cs', 'diff --git a/src/Refund.cs b/src/Refund.cs'])
  assert.match(api, /\n-class Payment \{\}\n\+class Payment \{ int Amount; \}\n/)
  assert.match(api, /\nnew file mode \d+\n[^]*\n\+class Refund \{\}\n/)
  assert.deepEqual(sections(all), [
    'diff --git a/README.md b/README.md',
    'diff --git a/services/api/src/Payment.cs b/services/api/src/Payment.cs',
    'diff --git a/services/api/src/Refund.cs b/services/api/src/Refund.cs',
  ])
  assert.match(all, /\n-# work\n\+# work, changed\n/)
  assert.equal(all.includes('Notes.md'), false)
})

test('the diff keeps the a/ and b/ prefixes and no color, whatever the repository configures', async (t) => {
  const { work, base, sourceControl } = changedSinceBase(t)
  git(work, 'config', 'diff.noprefix', 'true')
  git(work, 'config', 'color.diff', 'always')

  const api = await sourceControl.diff('services/api', base)

  assert.deepEqual(sections(api), ['diff --git a/src/Payment.cs b/src/Payment.cs', 'diff --git a/src/Refund.cs b/src/Refund.cs'])
  assert.equal(api.includes('\u001b['), false)
})

test('the diff shows every file\'s real text, whatever attributes or text conversion the repository sets', async (t) => {
  const { work, base, sourceControl } = changedSinceBase(t)
  writeFileSync(join(work, 'services', 'api', '.gitattributes'), '*.cs -diff\n')
  mkdirSync(join(work, '.git', 'info'), { recursive: true })
  writeFileSync(join(work, '.git', 'info', 'attributes'), 'Payment.cs diff=clean\n')
  git(work, 'config', 'diff.clean.textconv', 'sed s/Amount/Nothing/')
  git(work, 'config', 'diff.clean.binary', 'true')

  const api = await sourceControl.diff('services/api', base)

  assert.equal(api.includes('Binary files'), false)
  assert.match(api, /\n\+class Payment \{ int Amount; \}\n/)
  assert.match(api, /\n\+class Refund \{\}\n/)
})

test('the diff is null when the base is unknown, and empty when nothing changed under the folder', async (t) => {
  const { work, sourceControl } = changedSinceBase(t)
  git(work, 'add', '-A')
  git(work, 'commit', '-q', '-m', 'everything')
  const head = git(work, 'rev-parse', 'HEAD')

  assert.equal(await sourceControl.diff('.', '0123456789abcdef0123456789abcdef01234567'), null)
  assert.equal(await sourceControl.diff('.', 'no-such-ref'), null)
  assert.equal(await sourceControl.diff('services/api', head), '')
})
