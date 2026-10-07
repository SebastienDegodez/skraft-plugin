import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises'
import { writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJsonStateWriter } from '../../../plugins/skraft-framework/src/adapters/infrastructure/state/json-state-writer.mjs'
import { createJsonConfigWriter } from '../../../plugins/skraft-framework/src/adapters/infrastructure/config/json-config-writer.mjs'
import { createJsonExecutionLogWriter } from '../../../plugins/skraft-framework/src/adapters/infrastructure/execution-log/json-execution-log-writer.mjs'

// The three atomic JSON writers share one protocol (tmp → backup → rotate → rename).
// Each case runs against all three. `dir(base)` is the directory holding the
// document; `write(base, doc)` invokes the writer.
const WRITERS = [
  {
    name: 'json-state-writer',
    file: 'state.json',
    dir: (base) => join(base, 'proj'),
    write: (base, doc) => createJsonStateWriter(base).write('proj', doc),
  },
  {
    name: 'json-config-writer',
    file: 'skraft-config.json',
    dir: (base) => base,
    write: (base, doc) => createJsonConfigWriter(base).write(doc),
  },
  {
    name: 'json-execution-log-writer',
    file: 'execution-log.json',
    dir: (base) => join(base, 'slug'),
    write: (base, doc) => createJsonExecutionLogWriter(base).write('slug', doc),
  },
]

const withBase = async (fn) => {
  const base = await mkdtemp(join(tmpdir(), 'skraft-atomic-writer-'))
  try { return await fn(base) } finally { await rm(base, { recursive: true, force: true }) }
}

// A document whose serialization runs a hook. JSON.stringify happens after the
// writer captured its Date.now() timestamp and before any file is written, so the
// hook can bracket that timestamp between `from` and its own Date.now().
const hookedDocument = (hook) => {
  const from = Date.now()
  return { toJSON: () => hook(from, Date.now()) }
}

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

for (const w of WRITERS) {
  const bakPattern = new RegExp(`^${w.file.replace(/\./g, '\\.')}\\.bak\\.\\d+$`)

  test(`${w.name}: a serialization failure returns IO_ERROR with the error message`, () => withBase(async (base) => {
    const doc = { toJSON: () => { throw Object.assign(new Error('boom'), { code: 'EBOOM' }) } }
    const result = await w.write(base, doc)
    assert.equal(result.ok, false)
    assert.deepEqual(result.error, { code: 'IO_ERROR', reason: 'boom' })
  }))

  test(`${w.name}: a cross-device failure returns the dedicated EXDEV reason`, () => withBase(async (base) => {
    const doc = { toJSON: () => { throw Object.assign(new Error('exdev raw'), { code: 'EXDEV' }) } }
    const result = await w.write(base, doc)
    assert.equal(result.ok, false)
    assert.deepEqual(result.error, {
      code: 'IO_ERROR',
      reason: 'cross-device rename not supported; ensure basePath is on a single filesystem',
    })
  }))

  test(`${w.name}: a failure before the temp file is written never deletes a file at the temp path`, () => withBase(async (base) => {
    const dir = w.dir(base)
    await mkdir(dir, { recursive: true })
    let seeded = []
    const doc = hookedDocument((from, to) => {
      seeded = range(from, to).map((ts) => `${w.file}.tmp.${ts}`)
      for (const name of seeded) writeFileSync(join(dir, name), 'pre-existing')
      throw new Error('serialization failed')
    })
    const result = await w.write(base, doc)
    assert.equal(result.ok, false)
    assert.equal(result.error.reason, 'serialization failed')
    const files = await readdir(dir)
    for (const name of seeded) assert.ok(files.includes(name), `${name} must survive`)
  }))

  test(`${w.name}: a failed backup aborts the write, keeps the live file and cleans the temp file`, () => withBase(async (base) => {
    const dir = w.dir(base)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, w.file), JSON.stringify({ v: 'live' }))
    const doc = hookedDocument((from, to) => {
      // Occupy every candidate backup path with a directory: copyFile then fails (EISDIR).
      for (const ts of range(from, to)) mkdirSync(join(dir, `${w.file}.bak.${ts}`))
      return { v: 'next' }
    })
    const result = await w.write(base, doc)
    assert.equal(result.ok, false)
    assert.equal(result.error.code, 'IO_ERROR')
    assert.notEqual(result.error.reason, 'cross-device rename not supported; ensure basePath is on a single filesystem')
    assert.ok(result.error.reason.length > 0)
    assert.deepEqual(JSON.parse(await readFile(join(dir, w.file), 'utf8')), { v: 'live' })
    const files = await readdir(dir)
    assert.deepEqual(files.filter((f) => f.includes('.tmp.')), [], 'temp file removed')
  }))

  test(`${w.name}: rotation prunes numerically oldest backups and ignores look-alike files`, () => withBase(async (base) => {
    const dir = w.dir(base)
    await mkdir(dir, { recursive: true })
    // Creation order deliberately differs from both numeric and lexical order.
    for (const ts of [30, 200, 1000, 5]) await writeFile(join(dir, `${w.file}.bak.${ts}`), `bak ${ts}`)
    const decoys = [`${w.file}.bak.1.old`, `old-${w.file}.bak.2`, `${w.file}.bak.x`]
    for (const decoy of decoys) await writeFile(join(dir, decoy), 'decoy')
    await writeFile(join(dir, w.file), JSON.stringify({ v: 1 }))

    const result = await w.write(base, { v: 2, text: 'é' })
    assert.equal(result.ok, true)
    assert.equal(result.value, undefined)
    assert.equal(await readFile(join(dir, w.file), 'utf8'), JSON.stringify({ v: 2, text: 'é' }, null, 2))

    const files = await readdir(dir)
    const baks = files.filter((f) => bakPattern.test(f))
    const stamps = baks.map((f) => Number(f.split('.').pop())).sort((a, b) => a - b)
    assert.equal(stamps.length, 3, `kept ${baks.join(', ')}`)
    assert.deepEqual(stamps.slice(0, 2), [200, 1000])
    assert.ok(stamps[2] > 1000)
    for (const decoy of decoys) assert.ok(files.includes(decoy), `${decoy} must be ignored by rotation`)
    assert.deepEqual(files.filter((f) => f.includes('.tmp.')), [])
    // The newest backup holds the previous live document.
    assert.deepEqual(JSON.parse(await readFile(join(dir, `${w.file}.bak.${stamps[2]}`), 'utf8')), { v: 1 })
  }))

  test(`${w.name}: rotation by exactly one keeps the three newest`, () => withBase(async (base) => {
    const dir = w.dir(base)
    await mkdir(dir, { recursive: true })
    for (const ts of [9, 100, 10]) await writeFile(join(dir, `${w.file}.bak.${ts}`), `bak ${ts}`)
    await writeFile(join(dir, w.file), '{}')
    assert.equal((await w.write(base, { v: 3 })).ok, true)
    const stamps = (await readdir(dir)).filter((f) => bakPattern.test(f))
      .map((f) => Number(f.split('.').pop())).sort((a, b) => a - b)
    assert.equal(stamps.length, 3)
    assert.deepEqual(stamps.slice(0, 2), [10, 100])
  }))
}
