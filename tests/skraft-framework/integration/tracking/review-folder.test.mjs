import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createReviewFolder } from '../../../../plugins/skraft-framework/engine/infrastructure/tracking/review-folder.mjs'
import { lockCommand, NOT_DONE } from '../../../../plugins/skraft-framework/engine/infrastructure/tracking/lock-file-command.mjs'
import { createModReviewFolder } from '../../../../plugins/skraft-framework/engine/drivers/claude-mod/mod-run-lock.mjs'
import { PLUGIN_ROOT } from '../support/workspace.mjs'
import { createNodeFiles } from '../../../../plugins/skraft-framework/engine/infrastructure/files/node-files.mjs'

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

/** `$.process.run` as the mod gets it, on a real node. @type {import('../../../../plugins/skraft-framework/engine/drivers/claude-mod/mod-processes.mjs').ModRun} */
const run = async ([program, ...args], init = {}) => {
  const ran = spawnSync(program === 'node' ? process.execPath : program, args, { encoding: 'utf8', timeout: init.timeoutMs })
  return { exitCode: ran.status ?? -1, stdout: ran.stdout, stderr: ran.stderr }
}

/** What the Node host and the mod both answer of these tracked paths. @param {string} root @param {string[]} paths */
const held = async (root, paths) => [
  await createReviewFolder({ root }).holdsTracked(paths),
  await createModReviewFolder({ files: createNodeFiles(), run, pluginRoot: PLUGIN_ROOT, root }).holdsTracked(paths),
]

/** Writes a file and the folders it sits in. @param {string} root @param {string} path */
const written = (root, path) => {
  mkdirSync(join(root, path, '..'), { recursive: true })
  writeFileSync(join(root, path), 'x\n')
}

test('tracked files of the code and of the pipeline\'s tracking folder are no review state; nor is any file where no tracking folder exists', async (t) => {
  const { root } = folders(t)
  written(root, 'src/Discount.cs')
  assert.deepEqual(await held(root, ['src/Discount.cs', '.copilot-tracking/skraft-reviews/pr-12/events.jsonl']), [false, false])
  written(root, '.copilot-tracking/skraft-plans/checkout/events.jsonl')

  assert.deepEqual(await held(root, ['src/Discount.cs', '.copilot-tracking/skraft-plans/checkout/events.jsonl']), [false, false])
})

test('a tracked path the file system opens as the review folder under another spelling is review state: \u017fkraft-reviews where names fold', async (t) => {
  const { root } = folders(t)
  const spelled = '.copilot-tracking/\u017fkraft-reviews/pr-12/events.jsonl'
  written(root, spelled)
  if (!existsSync(join(root, '.copilot-tracking', 'skraft-reviews'))) {
    t.skip('this file system tells \u017f from s')
    return
  }

  assert.deepEqual(await held(root, ['src/Discount.cs', spelled]), [true, true])
  assert.deepEqual(await held(root, ['.Copilot-Tracking']), [true, true])
})

test('a working copy with more top-level names than a command line holds is asked through a file in the review folder, removed once read', async (t) => {
  const { root } = folders(t)
  written(root, '.copilot-tracking/skraft-plans/checkout/events.jsonl')
  const many = Array.from({ length: 6000 }, (_, index) => `${'n'.repeat(200)}-${index}/file.cs`)

  assert.deepEqual(await held(root, [...many, '.copilot-tracking/skraft-plans/checkout/events.jsonl']), [false, false])
  assert.deepEqual(readdirSync(join(root, '.copilot-tracking')), ['skraft-plans', 'skraft-reviews'])
  assert.deepEqual(readdirSync(join(root, '.copilot-tracking', 'skraft-reviews')), [])
})
