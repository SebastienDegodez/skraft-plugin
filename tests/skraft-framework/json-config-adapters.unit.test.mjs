import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJsonConfigReader } from '../../plugins/src/adapters/infrastructure/config/json-config-reader.mjs'
import { createJsonConfigWriter } from '../../plugins/src/adapters/infrastructure/config/json-config-writer.mjs'

const withTmp = async (fn) => {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-cfg-'))
  try { await fn(dir) } finally { await rm(dir, { recursive: true, force: true }) }
}

test('json-config-writer: writes skraft-config.json at basePath root', async () => {
  await withTmp(async (dir) => {
    const writer = createJsonConfigWriter(dir)
    const r = await writer.write({ depthTier: 'standard' })
    assert.equal(r.ok, true)
    const parsed = JSON.parse(await readFile(join(dir, 'skraft-config.json'), 'utf8'))
    assert.equal(parsed.depthTier, 'standard')
  })
})

test('json-config-writer: backs up the previous file on overwrite', async () => {
  await withTmp(async (dir) => {
    const writer = createJsonConfigWriter(dir)
    await writer.write({ depthTier: 'comprehensive' })
    await writer.write({ depthTier: 'basic' })
    const baks = (await readdir(dir)).filter(f => /^skraft-config\.json\.bak\.\d+$/.test(f))
    assert.ok(baks.length >= 1, 'a backup was created')
  })
})

test('json-config-writer: leaves no residual .tmp files after success', async () => {
  await withTmp(async (dir) => {
    await createJsonConfigWriter(dir).write({ depthTier: 'standard' })
    const files = await readdir(dir)
    assert.ok(!files.some(f => f.includes('.tmp.')), 'no residual .tmp files')
  })
})

test('json-config-writer: no backup on first write (no existing file)', async () => {
  await withTmp(async (dir) => {
    await createJsonConfigWriter(dir).write({ depthTier: 'basic' })
    const baks = (await readdir(dir)).filter(f => /^skraft-config\.json\.bak\.\d+$/.test(f))
    assert.equal(baks.length, 0, 'first write creates no backup')
  })
})

test('json-config-writer: rotates backups keeping <=3', async () => {
  await withTmp(async (dir) => {
    // seed the live file + 3 pre-existing backups with known timestamps
    await writeFile(join(dir, 'skraft-config.json'), JSON.stringify({ depthTier: 'comprehensive' }), 'utf8')
    for (const ts of [1, 2, 3]) {
      await writeFile(join(dir, `skraft-config.json.bak.${ts}`), '{}', 'utf8')
    }
    await createJsonConfigWriter(dir).write({ depthTier: 'basic' })
    const baks = (await readdir(dir)).filter(f => /^skraft-config\.json\.bak\.\d+$/.test(f))
    assert.ok(baks.length <= 3, `kept <=3 backups, got ${baks.length}`)
  })
})

test('json-config-writer: rotation deletes the smallest timestamp first', async () => {
  await withTmp(async (dir) => {
    await writeFile(join(dir, 'skraft-config.json'), JSON.stringify({ depthTier: 'comprehensive' }), 'utf8')
    for (const ts of [10, 20, 30]) {
      await writeFile(join(dir, `skraft-config.json.bak.${ts}`), '{}', 'utf8')
    }
    await createJsonConfigWriter(dir).write({ depthTier: 'basic' })
    const files = await readdir(dir)
    assert.ok(!files.includes('skraft-config.json.bak.10'), 'oldest (ts=10) deleted')
    assert.ok(files.includes('skraft-config.json.bak.20'), 'ts=20 kept')
    assert.ok(files.includes('skraft-config.json.bak.30'), 'ts=30 kept')
  })
})

test('json-config-writer: live skraft-config.json survives rotation', async () => {
  await withTmp(async (dir) => {
    await writeFile(join(dir, 'skraft-config.json'), JSON.stringify({ depthTier: 'comprehensive' }), 'utf8')
    for (const ts of [1, 2, 3]) {
      await writeFile(join(dir, `skraft-config.json.bak.${ts}`), '{}', 'utf8')
    }
    await createJsonConfigWriter(dir).write({ depthTier: 'standard' })
    const cfg = JSON.parse(await readFile(join(dir, 'skraft-config.json'), 'utf8'))
    assert.equal(cfg.depthTier, 'standard')
  })
})

test('json-config-writer: returns Ok(undefined) on success', async () => {
  await withTmp(async (dir) => {
    const r = await createJsonConfigWriter(dir).write({ depthTier: 'basic' })
    assert.equal(r.ok, true)
    assert.equal(r.value, undefined)
  })
})

test('json-config-reader: reads back a written config', async () => {
  await withTmp(async (dir) => {
    await createJsonConfigWriter(dir).write({ depthTier: 'basic', teamOwner: 'platform' })
    const c = await createJsonConfigReader(dir).read()
    assert.equal(c.depthTier, 'basic')
    assert.equal(c.teamOwner, 'platform')
  })
})

test('json-config-reader: ENOENT propagates when no config file exists', async () => {
  await withTmp(async (dir) => {
    await assert.rejects(() => createJsonConfigReader(dir).read(), (e) => e.code === 'ENOENT')
  })
})

test('json-config-reader: corrupt JSON snapshots and throws CORRUPTED_CONFIG', async () => {
  await withTmp(async (dir) => {
    await writeFile(join(dir, 'skraft-config.json'), '{ not json', 'utf8')
    await assert.rejects(() => createJsonConfigReader(dir).read(), (e) => e.code === 'CORRUPTED_CONFIG')
    const snap = (await readdir(dir)).filter(f => /^skraft-config\.json\.corrupted\.\d+$/.test(f))
    assert.ok(snap.length === 1, 'corrupted snapshot written')
  })
})
