import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createModFiles, folderEntries, joinPath } from '../../../../plugins/skraft-framework/engine/drivers/claude-mod/mod-files.mjs'
import { nodeModFs, nodeModRun } from './support/scripted-mod-host.mjs'
import { git } from '../support/workspace.mjs'

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

test('a folder of a repository lists its files at any depth through git, tracked or not, ignored included', inTemp(async (root) => {
  const files = createModFiles(nodeModFs, { run: nodeModRun })
  const folder = files.join(root, '.copilot-tracking', 'skraft-plans', 'checkout')
  await files.write(files.join(root, '.gitignore'), '.copilot-tracking/\n')
  await files.write(files.join(folder, 'research', 'tracked.md'), 't\n')
  git(root, 'init', '-q', '-b', 'main')
  git(root, 'add', '-f', '-A')
  git(root, 'commit', '-q', '-m', 'tracked')
  await files.write(files.join(folder, 'research', 'deep', 'untracked notes.md'), 'u\n')
  await files.write(files.join(folder, 'research', 'été.md'), 'e\n')
  await rm(join(folder, 'research', 'tracked.md'))
  await files.write(files.join(folder, 'research', 'kept.md'), 'k\n')
  git(root, 'add', '-f', join(folder, 'research', 'kept.md'))

  assert.deepEqual((await files.list(files.join(folder, 'research'))).sort(), ['deep/untracked notes.md', 'kept.md', 'été.md'])
  assert.equal(await files.list(files.join(folder, 'absent')), null)
}))

test('outside a repository, or without $.process.run, the mod cannot list a folder', inTemp(async (root) => {
  await writeFile(join(root, 'a.md'), 'a\n')

  assert.equal(await createModFiles(nodeModFs, { run: nodeModRun }).list(root), null)
  assert.equal(await createModFiles(nodeModFs).list(root), null)
}))

test('a workspace folder lists one level; a missing path or a file is no folder; a folder Git cannot list rejects with why', inTemp(async (root) => {
  const list = folderEntries(nodeModFs, nodeModRun)
  await writeFile(join(root, 'a.md'), 'a\n')

  assert.equal(await list(join(root, 'absent')), null)
  assert.equal(await list(join(root, 'a.md')), null)
  await assert.rejects(list(root), { message: 'git ls-files failed (exit 128)' })
  await assert.rejects(folderEntries(nodeModFs, () => Promise.reject(new Error('spawn git ENOENT')))(root), { message: 'git ls-files could not run' })
  await assert.rejects(folderEntries(nodeModFs, async () => ({ exitCode: 128, stdout: '', stderr: 'fatal: index file corrupt\n' }))(root), { message: 'git ls-files failed (exit 128)' })
  await assert.rejects(folderEntries(nodeModFs, async () => ({ exitCode: 7, stdout: '', stderr: '' }))(root), { message: 'git ls-files failed (exit 7)' })

  git(root, 'init', '-q', '-b', 'main')
  await nodeModFs.write(join(root, 'docs', 'adr', 'adr-001-x.md'), 'x\n')
  assert.deepEqual((await list(root)).sort((a, b) => a.name.localeCompare(b.name)), [{ name: 'a.md', kind: 'file' }, { name: 'docs', kind: 'dir' }])
}))

test('paths are joined with / whatever separator the root came with', () => {
  assert.equal(joinPath('/work', '.copilot-tracking', 'checkout'), '/work/.copilot-tracking/checkout')
  assert.equal(joinPath('/work/', '/assets/', 'templates'), '/work/assets/templates')
  assert.equal(joinPath('C:\\work\\', 'assets'), 'C:\\work/assets')
  assert.equal(joinPath('/', 'work'), '/work')
  assert.equal(joinPath('/work', '', 'a'), '/work/a')
  assert.equal(createModFiles(nodeModFs).join('/work', 'a'), '/work/a')
})
