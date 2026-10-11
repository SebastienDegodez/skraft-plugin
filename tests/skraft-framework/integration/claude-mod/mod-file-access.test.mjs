import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createModFiles, joinPath } from '../../../../plugins/skraft-framework/engine/drivers/claude-mod/mod-files.mjs'
import { nodeModFs } from './support/scripted-mod-host.mjs'

const inTemp = (body) => async () => {
  const root = await mkdtemp(join(tmpdir(), 'skraft-mod-files-'))
  try {
    await body(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('read answers null for a missing file, write creates its folders, append adds to the end', inTemp(async (root) => {
  const files = createModFiles(nodeModFs)
  const path = files.join(root, '.copilot-tracking', 'skraft-plans', 'checkout', 'events.jsonl')

  assert.equal(await files.read(path), null)
  await files.append(path, 'one\n')
  await files.append(path, 'two\n')
  assert.equal(await files.read(path), 'one\ntwo\n')
  await files.write(path, 'over\n')
  assert.equal(await readFile(path, 'utf8'), 'over\n')
}))

test('a read that fails on a file that exists is not taken for a missing file', inTemp(async (root) => {
  const folder = join(root, 'a-folder')
  await mkdir(folder)
  await assert.rejects(createModFiles(nodeModFs).read(folder))
}))

test('paths are joined with / whatever separator the root came with', () => {
  assert.equal(joinPath('/work', '.copilot-tracking', 'checkout'), '/work/.copilot-tracking/checkout')
  assert.equal(joinPath('/work/', '/assets/', 'templates'), '/work/assets/templates')
  assert.equal(joinPath('C:\\work\\', 'assets'), 'C:\\work/assets')
  assert.equal(joinPath('/', 'work'), '/work')
  assert.equal(joinPath('/work', '', 'a'), '/work/a')
  assert.equal(createModFiles(nodeModFs).join('/work', 'a'), '/work/a')
})
