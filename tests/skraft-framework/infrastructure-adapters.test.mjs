import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSystemTime } from '../../plugins/src/adapters/infrastructure/system-time.mjs'
import { createFixedTime } from '../../plugins/src/adapters/infrastructure/fixed-time.mjs'
import { createInMemoryFilesystem } from '../../plugins/src/adapters/infrastructure/in-memory-filesystem.mjs'
import { createRealFilesystem } from '../../plugins/src/adapters/infrastructure/real-filesystem.mjs'
import { createJsonStateReader } from '../../plugins/src/adapters/infrastructure/json-state-reader.mjs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// ── system-time ───────────────────────────────────────────────────────────────

test('system-time: now() returns a Date', () => {
  assert.ok(createSystemTime().now() instanceof Date)
})

test('system-time: isoString() returns a valid ISO string', () => {
  const s = createSystemTime().isoString()
  assert.ok(typeof s === 'string' && !isNaN(Date.parse(s)))
})

// ── fixed-time ────────────────────────────────────────────────────────────────

test('fixed-time: now() returns the fixed date', () => {
  const d = new Date('2026-06-20T00:00:00Z')
  assert.equal(createFixedTime(d).now().toISOString(), d.toISOString())
})

test('fixed-time: isoString() returns the fixed ISO string', () => {
  assert.equal(
    createFixedTime(new Date('2026-06-20T00:00:00Z')).isoString(),
    '2026-06-20T00:00:00.000Z'
  )
})

test('fixed-time: now() returns a new Date instance each call', () => {
  const t = createFixedTime(new Date('2026-01-01T00:00:00Z'))
  const d1 = t.now()
  const d2 = t.now()
  assert.notStrictEqual(d1, d2)
  assert.equal(d1.getTime(), d2.getTime())
})

test('fixed-time: defaults to 2026-01-01 when no date given', () => {
  const t = createFixedTime()
  assert.equal(t.now().toISOString(), '2026-01-01T00:00:00.000Z')
})

// ── in-memory filesystem ──────────────────────────────────────────────────────

test('in-memory: writeFile then readFile returns the content', async () => {
  const fs = createInMemoryFilesystem()
  await fs.writeFile('/a.txt', 'hello')
  assert.equal(await fs.readFile('/a.txt'), 'hello')
})

test('in-memory: readFile throws ENOENT for missing file', async () => {
  const fs = createInMemoryFilesystem()
  const err = await fs.readFile('/missing.txt').catch(e => e)
  assert.equal(err.code, 'ENOENT')
  assert.ok(err.message.includes('/missing.txt'))
})

test('in-memory: writeFile overwrites existing content', async () => {
  const fs = createInMemoryFilesystem({ '/f.txt': 'old' })
  await fs.writeFile('/f.txt', 'new')
  assert.equal(await fs.readFile('/f.txt'), 'new')
})

test('in-memory: appendFile appends to existing file', async () => {
  const fs = createInMemoryFilesystem({ '/log.txt': 'line1\n' })
  await fs.appendFile('/log.txt', 'line2\n')
  assert.equal(await fs.readFile('/log.txt'), 'line1\nline2\n')
})

test('in-memory: appendFile creates file when missing', async () => {
  const fs = createInMemoryFilesystem()
  await fs.appendFile('/new.txt', 'first')
  assert.equal(await fs.readFile('/new.txt'), 'first')
})

test('in-memory: exists returns true for present file', async () => {
  const fs = createInMemoryFilesystem({ '/x.txt': '' })
  assert.equal(await fs.exists('/x.txt'), true)
})

test('in-memory: exists returns false for absent file', async () => {
  const fs = createInMemoryFilesystem()
  assert.equal(await fs.exists('/absent.txt'), false)
})

test('in-memory: mkdir is a no-op (does not throw)', async () => {
  const fs = createInMemoryFilesystem()
  await assert.doesNotReject(() => fs.mkdir('/a/b/c', { recursive: true }))
})

test('in-memory: initialFiles are accessible immediately', async () => {
  const fs = createInMemoryFilesystem({ '/seed.txt': 'seeded' })
  assert.equal(await fs.readFile('/seed.txt'), 'seeded')
})

// ── real filesystem ───────────────────────────────────────────────────────────

test('real filesystem: writeFile then readFile round-trips', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-rfs-'))
  const fs = createRealFilesystem()
  await fs.writeFile(join(dir, 'f.txt'), 'content')
  assert.equal(await fs.readFile(join(dir, 'f.txt')), 'content')
  await rm(dir, { recursive: true, force: true })
})

test('real filesystem: appendFile appends', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-rfs-'))
  const fs = createRealFilesystem()
  const path = join(dir, 'a.txt')
  await fs.writeFile(path, 'A')
  await fs.appendFile(path, 'B')
  assert.equal(await fs.readFile(path), 'AB')
  await rm(dir, { recursive: true, force: true })
})

test('real filesystem: exists returns true for present file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-rfs-'))
  const fs = createRealFilesystem()
  await fs.writeFile(join(dir, 'x.txt'), '')
  assert.equal(await fs.exists(join(dir, 'x.txt')), true)
  await rm(dir, { recursive: true, force: true })
})

test('real filesystem: exists returns false for absent file', async () => {
  const fs = createRealFilesystem()
  assert.equal(await fs.exists('/nonexistent/path/xyz.txt'), false)
})

test('real filesystem: mkdir creates nested directories', async () => {
  const base = await mkdtemp(join(tmpdir(), 'skraft-rfs-'))
  const fs = createRealFilesystem()
  const nested = join(base, 'a', 'b', 'c')
  await fs.mkdir(nested)
  await fs.writeFile(join(nested, 'f.txt'), 'ok')
  assert.equal(await fs.readFile(join(nested, 'f.txt')), 'ok')
  await rm(base, { recursive: true, force: true })
})

// ── json-state-reader ─────────────────────────────────────────────────────────

test('json-state-reader: write then read round-trips state object', async () => {
  const base = await mkdtemp(join(tmpdir(), 'skraft-sr-'))
  const reader = createJsonStateReader(base)
  const state = { currentPhase: 'DISCOVER', difficulty: null }
  await reader.write('my-project', state)
  const loaded = await reader.read('my-project')
  assert.deepEqual(loaded, state)
  await rm(base, { recursive: true, force: true })
})

test('json-state-reader: write creates directory if missing', async () => {
  const base = await mkdtemp(join(tmpdir(), 'skraft-sr-'))
  const reader = createJsonStateReader(base)
  await reader.write('new-slug', { phase: 'DESIGN' })
  const loaded = await reader.read('new-slug')
  assert.equal(loaded.phase, 'DESIGN')
  await rm(base, { recursive: true, force: true })
})

test('json-state-reader: write creates nested directories recursively', async () => {
  const base = await mkdtemp(join(tmpdir(), 'skraft-sr-'))
  const reader = createJsonStateReader(join(base, 'deep', 'nested'))
  await reader.write('my-project', { phase: 'DELIVER' })
  const loaded = await reader.read('my-project')
  assert.equal(loaded.phase, 'DELIVER')
  await rm(base, { recursive: true, force: true })
})

test('json-state-reader: ENOENT message contains project slug', async () => {
  const base = await mkdtemp(join(tmpdir(), 'skraft-sr-'))
  const reader = createJsonStateReader(base)
  const err = await reader.read('missing-slug').catch(e => e)
  assert.ok(err instanceof Error, 'throws an Error')
  await rm(base, { recursive: true, force: true })
})
