import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir, writeFile, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRealFilesystem } from '../../../plugins/skraft-framework/src/adapters/infrastructure/real-filesystem.mjs'
import { createInMemoryFilesystem } from '../../../plugins/skraft-framework/src/adapters/infrastructure/in-memory-filesystem.mjs'

const withTemp = async (fn) => {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-fs-adapter-'))
  try { return await fn(dir) } finally { await rm(dir, { recursive: true, force: true }) }
}

// ─── real filesystem ─────────────────────────────────────────────────────────

test('real-filesystem: writeFile/appendFile/readFile round-trip UTF-8 text', () => withTemp(async (dir) => {
  const fs = createRealFilesystem()
  const path = join(dir, 'f.txt')
  await fs.writeFile(path, 'é')
  await fs.appendFile(path, 'ü')
  assert.equal(await fs.readFile(path), 'éü')
  assert.equal(await readFile(path, 'utf8'), 'éü')
  assert.equal(await fs.exists(path), true)
  assert.equal(await fs.exists(join(dir, 'missing')), false)
}))

test('real-filesystem: mkdir is recursive', () => withTemp(async (dir) => {
  const fs = createRealFilesystem()
  await fs.mkdir(join(dir, 'a', 'b', 'c'))
  assert.equal((await stat(join(dir, 'a', 'b', 'c'))).isDirectory(), true)
}))

test('real-filesystem: listDir lists entry names', () => withTemp(async (dir) => {
  const fs = createRealFilesystem()
  await writeFile(join(dir, 'one.json'), '1')
  await mkdir(join(dir, 'sub'))
  assert.deepEqual((await fs.listDir(dir)).sort(), ['one.json', 'sub'])
}))

test('real-filesystem: listDir is fail-open for a missing directory', () => withTemp(async (dir) => {
  const fs = createRealFilesystem()
  const result = await fs.listDir(join(dir, 'missing'))
  assert.deepEqual(result, [])
}))

test('real-filesystem: listDir is fail-open when the path is a file', () => withTemp(async (dir) => {
  const fs = createRealFilesystem()
  await writeFile(join(dir, 'file.txt'), 'x')
  assert.deepEqual(await fs.listDir(join(dir, 'file.txt')), [])
}))

test('real-filesystem: listDir rethrows any other failure', async () => {
  const fs = createRealFilesystem()
  await assert.rejects(fs.listDir(42), (error) => {
    assert.ok(error.code && error.code !== 'ENOENT' && error.code !== 'ENOTDIR', error.code)
    return true
  })
  await withTemp(async (dir) => {
    await assert.rejects(fs.listDir(join(dir, 'x'.repeat(5000))), (error) => {
      assert.notEqual(error.code, 'ENOENT')
      return true
    })
  })
})

test('real-filesystem: stat exposes mtimeMs, size and isFile only', () => withTemp(async (dir) => {
  const fs = createRealFilesystem()
  const path = join(dir, 'f.txt')
  await writeFile(path, 'hello')
  const real = await stat(path)
  assert.deepEqual(await fs.stat(path), { mtimeMs: real.mtimeMs, size: 5, isFile: true })
  const dirStat = await fs.stat(dir)
  assert.equal(dirStat.isFile, false)
  await assert.rejects(fs.stat(join(dir, 'missing')), { code: 'ENOENT' })
}))

test('real-filesystem: remove deletes a file and ignores a missing one', () => withTemp(async (dir) => {
  const fs = createRealFilesystem()
  const path = join(dir, 'f.txt')
  await writeFile(path, 'x')
  assert.equal(await fs.remove(path), undefined)
  assert.equal(await fs.exists(path), false)
  assert.equal(await fs.remove(path), undefined)
}))

test('real-filesystem: remove rethrows failures other than ENOENT', () => withTemp(async (dir) => {
  const fs = createRealFilesystem()
  await mkdir(join(dir, 'sub'))
  await assert.rejects(fs.remove(join(dir, 'sub')), (error) => {
    assert.ok(error.code && error.code !== 'ENOENT', error.code)
    return true
  })
  assert.equal(await fs.exists(join(dir, 'sub')), true)
}))

// ─── in-memory filesystem ────────────────────────────────────────────────────

test('in-memory-filesystem: a null initial value is stored as content, not as an entry object', async () => {
  const fs = createInMemoryFilesystem({ 'n.txt': null, 's.txt': 'plain' })
  assert.equal(await fs.readFile('n.txt'), null)
  assert.equal(await fs.readFile('s.txt'), 'plain')
  assert.deepEqual(await fs.stat('s.txt'), { mtimeMs: 0, size: 5, isFile: true })
})

test('in-memory-filesystem: object entries default content to empty and mtimeMs to 0', async () => {
  const fs = createInMemoryFilesystem({ 'dated.txt': { mtimeMs: 42 }, 'undated.txt': { content: 'abc' } })
  assert.equal(await fs.readFile('dated.txt'), '')
  assert.deepEqual(await fs.stat('dated.txt'), { mtimeMs: 42, size: 0, isFile: true })
  assert.deepEqual(await fs.stat('undated.txt'), { mtimeMs: 0, size: 3, isFile: true })
})

test('in-memory-filesystem: writeFile and appendFile keep an existing mtimeMs', async () => {
  const fs = createInMemoryFilesystem({ 'a.txt': { content: 'x', mtimeMs: 7 }, 'b.txt': { content: 'y', mtimeMs: 9 } })
  await fs.writeFile('a.txt', 'new')
  await fs.appendFile('b.txt', 'z')
  assert.deepEqual(await fs.stat('a.txt'), { mtimeMs: 7, size: 3, isFile: true })
  assert.deepEqual(await fs.stat('b.txt'), { mtimeMs: 9, size: 2, isFile: true })
  await fs.appendFile('fresh.txt', 'q')
  assert.deepEqual(await fs.stat('fresh.txt'), { mtimeMs: 0, size: 1, isFile: true })
})

test('in-memory-filesystem: stat of a missing file rejects with ENOENT', async () => {
  const fs = createInMemoryFilesystem()
  await assert.rejects(fs.stat('dir/missing.txt'), (error) => {
    assert.equal(error.code, 'ENOENT')
    assert.equal(error.message, 'ENOENT: dir/missing.txt')
    return true
  })
})

test('in-memory-filesystem: listDir of the empty path lists top-level names', async () => {
  const fs = createInMemoryFilesystem({ '': 'root-file', 'a/b.txt': '1', 'a/c.txt': '2', 'top.txt': '3' })
  assert.deepEqual((await fs.listDir('')).sort(), ['a', 'top.txt'])
})

test('in-memory-filesystem: listDir lists only direct children of the directory', async () => {
  const fs = createInMemoryFilesystem({
    d: 'file named like the dir',
    'd/x.txt': '1',
    'd/sub/y.txt': '2',
    'dd/z.txt': '3',
    'other/w.txt': '4',
  })
  assert.deepEqual((await fs.listDir('d')).sort(), ['sub', 'x.txt'])
  assert.deepEqual(await fs.listDir('d\\sub'), ['y.txt'])
  assert.deepEqual(await fs.listDir('nothing'), [])
})
