import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { createGitSourceControl } from '../../../../plugins/skraft-framework/engine/infrastructure/source-control/git-source-control.mjs'
import { createNodeCommandRunner } from '../../../../plugins/skraft-framework/engine/infrastructure/process/node-processes.mjs'
import { commitAll, git, tempFolder } from '../support/workspace.mjs'

/** A repository with docs/adr/adr-001 on main, its own Git identity, and a service folder. */
const repository = (t) => {
  const root = tempFolder(t)
  mkdirSync(join(root, 'docs', 'adr'), { recursive: true })
  mkdirSync(join(root, 'services', 'api'), { recursive: true })
  writeFileSync(join(root, 'docs', 'adr', 'adr-001-payment.md'), 'status: Accepted\n')
  writeFileSync(join(root, 'services', 'api', 'Payment.cs'), 'class Payment {}\n')
  const base = commitAll(root)
  for (const [key, value] of [['user.name', 'skraft'], ['user.email', 'skraft@example.invalid'], ['commit.gpgsign', 'false']]) git(root, 'config', key, value)
  return { root, base, sourceControl: createGitSourceControl({ commandRunner: createNodeCommandRunner({ root }) }) }
}

test('existsAt tells whether a commit holds a file, from the working copy or a folder of it', async (t) => {
  const { root, base, sourceControl } = repository(t)
  writeFileSync(join(root, 'docs', 'adr', 'adr-002-tokens.md'), 'status: Proposed\n')

  assert.equal(await sourceControl.existsAt('.', base, 'docs/adr/adr-001-payment.md'), true)
  assert.equal(await sourceControl.existsAt('.', base, 'docs/adr/adr-002-tokens.md'), false)
  assert.equal(await sourceControl.existsAt('services/api', base, 'Payment.cs'), true)
  assert.equal(await sourceControl.existsAt('.', 'no-such-ref', 'docs/adr/adr-001-payment.md'), false)
})

test('commitFiles commits those files alone, new ones included, and nothing when they did not change', async (t) => {
  const { root, base, sourceControl } = repository(t)
  writeFileSync(join(root, 'docs', 'adr', 'adr-002-tokens.md'), 'status: Accepted\n')
  writeFileSync(join(root, 'services', 'api', 'Payment.cs'), 'class Payment { }\n')

  assert.deepEqual(await sourceControl.commitFiles('.', ['docs/adr/adr-002-tokens.md'], 'docs(adr): ratify ADR-002\n\nRefs: #42'), { ok: true })

  assert.deepEqual((await sourceControl.commits('.', base)).map(({ subject, body }) => [subject, body]), [['docs(adr): ratify ADR-002', 'Refs: #42']])
  assert.equal(git(root, 'show', '--name-only', '--format=', 'HEAD'), 'docs/adr/adr-002-tokens.md')
  assert.equal(git(root, 'status', '--porcelain'), 'M services/api/Payment.cs')
  const head = git(root, 'rev-parse', 'HEAD')
  assert.deepEqual(await sourceControl.commitFiles('.', ['docs/adr/adr-002-tokens.md'], 'docs(adr): again'), { ok: true })
  assert.equal(git(root, 'rev-parse', 'HEAD'), head)
  assert.notEqual(head, base)
})

test('commitCopies copies each file byte for byte where it is kept, ignored or not, and commits the copies alone', async (t) => {
  const { root, base, sourceControl } = repository(t)
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0x0a, 0x0d])
  mkdirSync(join(root, 'web', 'skraft-visuals'), { recursive: true })
  writeFileSync(join(root, 'web', 'skraft-visuals', 'checkout-light.png'), png)
  writeFileSync(join(root, 'web', 'skraft-visuals', 'checkout-dark.png'), Buffer.from([...png].reverse()))
  writeFileSync(join(root, '.gitignore'), 'skraft-visuals/\n.copilot-tracking/\n')
  writeFileSync(join(root, 'services', 'api', 'Payment.cs'), 'class Payment { }\n')
  const kept = '.copilot-tracking/skraft-plans/checkout/evidence/checkout/web'

  assert.deepEqual(await sourceControl.commitCopies('.', [
    { from: 'web/skraft-visuals/checkout-light.png', to: `${kept}/light-1.png` },
    { from: 'web/skraft-visuals/checkout-dark.png', to: `${kept}/dark-1.png` },
  ], 'docs(evidence): screenshots of web\n\nRefs: #42'), { ok: true })

  assert.deepEqual((await sourceControl.commits('.', base)).map(({ subject, body, files }) => [subject, body, files]), [['docs(evidence): screenshots of web', 'Refs: #42', [`${kept}/dark-1.png`, `${kept}/light-1.png`]]])
  assert.deepEqual(readFileSync(join(root, ...kept.split('/'), 'light-1.png')), png)
  assert.deepEqual(execFileSync('git', ['cat-file', 'blob', `HEAD:${kept}/dark-1.png`], { cwd: root }), Buffer.from([...png].reverse()))
  assert.equal(git(root, 'status', '--porcelain'), 'M services/api/Payment.cs\n?? .gitignore')
  assert.deepEqual(await sourceControl.commitCopies('.', [{ from: 'web/skraft-visuals/none.png', to: `${kept}/light-2.png` }], 'docs(evidence): none'), { ok: false, error: 'git could not copy web/skraft-visuals/none.png' })
})

test('commitFiles says why Git refused the commit', async (t) => {
  const { root, sourceControl } = repository(t)
  writeFileSync(join(root, 'docs', 'adr', 'adr-001-payment.md'), 'status: Superseded\n')
  mkdirSync(join(root, '.git', 'hooks'), { recursive: true })
  writeFileSync(join(root, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho "no commits today" >&2\nexit 1\n', { mode: 0o755 })

  const outcome = await sourceControl.commitFiles('.', ['docs/adr/adr-001-payment.md'], 'docs(adr): ratify ADR-001')

  assert.equal(outcome.ok, false)
  // Git for Windows may warn about line endings before the hook speaks.
  assert.match(outcome.error, /^git commit failed: (?:[^\n]*\n)*no commits today$/)
})

test('existsAt reads a path relative to a working copy that is a folder of its repository', async (t) => {
  const { root, base } = repository(t)
  const inFolder = createGitSourceControl({ commandRunner: createNodeCommandRunner({ root: join(root, 'services', 'api') }) })

  assert.equal(await inFolder.existsAt('.', base, 'Payment.cs'), true)
  assert.equal(await inFolder.existsAt('.', base, 'docs/adr/adr-001-payment.md'), false)
})
