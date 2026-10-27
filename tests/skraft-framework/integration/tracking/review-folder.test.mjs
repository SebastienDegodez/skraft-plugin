import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createReviewFolder } from '../../../../plugins/skraft-framework/engine/infrastructure/tracking/review-folder.mjs'
import { lockCommand, NOT_DONE } from '../../../../plugins/skraft-framework/engine/infrastructure/tracking/lock-file-command.mjs'

/** A working copy and a folder outside it, both removed after the test. */
const folders = (t) => {
  const base = mkdtempSync(join(tmpdir(), 'skraft-review-folder-'))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const root = join(base, 'shop')
  const outside = join(base, 'elsewhere')
  mkdirSync(root)
  mkdirSync(join(outside, 'skraft-reviews'), { recursive: true })
  return { root, outside }
}

/** What the Node host and the mod's node command both answer. @param {string} root */
const answers = async (root) => [await createReviewFolder({ root }).contained(), (await lockCommand(['contained', root])) === 0]

test('a review folder the working copy holds, or does not hold yet, is its own', async (t) => {
  const { root } = folders(t)
  assert.deepEqual(await answers(root), [true, true])
  mkdirSync(join(root, '.copilot-tracking'))
  assert.deepEqual(await answers(root), [true, true])
  mkdirSync(join(root, '.copilot-tracking', 'skraft-reviews', 'pr-12'), { recursive: true })
  assert.deepEqual(await answers(root), [true, true])
})

test('a link at the tracking folder or at the review folder, even to a folder, is not the working copy\'s own', async (t) => {
  const tracking = folders(t)
  symlinkSync(tracking.outside, join(tracking.root, '.copilot-tracking'), 'junction')
  const reviews = folders(t)
  mkdirSync(join(reviews.root, '.copilot-tracking'))
  symlinkSync(join(reviews.outside, 'skraft-reviews'), join(reviews.root, '.copilot-tracking', 'skraft-reviews'), 'junction')

  assert.deepEqual(await answers(tracking.root), [false, false])
  assert.deepEqual(await answers(reviews.root), [false, false])
})

test('a file in place of the tracking folder is not a review folder', async (t) => {
  const { root } = folders(t)
  writeFileSync(join(root, '.copilot-tracking'), 'not a folder\n')

  assert.deepEqual(await answers(root), [false, false])
  assert.equal(await lockCommand(['contained', root]), NOT_DONE)
})
