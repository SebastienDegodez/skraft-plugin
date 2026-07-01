import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createJsonStateWriter } from '../../plugins/src/adapters/infrastructure/state/json-state-writer.mjs'

const mkBase = () => mkdtemp(join(tmpdir(), 'skraft-writer-'))

const readState = async (base, slug) =>
  JSON.parse(await readFile(join(base, slug, 'state.json'), 'utf8'))

const DEFAULT = {
  currentPhase: 'DISCOVER',
  phasesCompleted: [],
  verdicts: {},
  retryCount: {},
  phaseArtifacts: {},
  reviewArtifacts: {},
  difficulty: null,
  userPreferences: { maxRetriesPerPhase: 2 },
}

// ─── Happy path ───────────────────────────────────────────────────────────────
test('json-state-writer: creates directory and writes state.json atomically', async () => {
  const base = await mkBase()
  try {
    const writer = createJsonStateWriter(base)
    const r = await writer.write('proj', DEFAULT)
    assert.equal(r.ok, true)
    const saved = await readState(base, 'proj')
    assert.equal(saved.currentPhase, 'DISCOVER')
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test('json-state-writer: leaves no residual .tmp files after success', async () => {
  const base = await mkBase()
  try {
    await mkdir(join(base, 'proj'), { recursive: true })
    const writer = createJsonStateWriter(base)
    await writer.write('proj', DEFAULT)
    const files = await readdir(join(base, 'proj'))
    assert.ok(!files.some(f => f.endsWith('.tmp')), 'no residual .tmp files')
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test('json-state-writer: creates backup on second write', async () => {
  const base = await mkBase()
  try {
    const writer = createJsonStateWriter(base)
    await writer.write('proj', DEFAULT)
    await writer.write('proj', { ...DEFAULT, currentPhase: 'DISCUSS' })
    const files = await readdir(join(base, 'proj'))
    const baks = files.filter(f => /^state\.json\.bak\.\d+$/.test(f))
    assert.equal(baks.length, 1, 'exactly one backup after second write')
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test('json-state-writer: rotates backups keeping ≤3 when 3 already exist', async () => {
  const base = await mkBase()
  try {
    const dir = join(base, 'proj')
    await mkdir(dir, { recursive: true })
    // Seed 3 existing backups with ascending timestamps
    await writeFile(join(dir, 'state.json.bak.100'), '{}', 'utf8')
    await writeFile(join(dir, 'state.json.bak.200'), '{}', 'utf8')
    await writeFile(join(dir, 'state.json.bak.300'), '{}', 'utf8')
    await writeFile(join(dir, 'state.json'), JSON.stringify(DEFAULT), 'utf8')

    const writer = createJsonStateWriter(base)
    await writer.write('proj', { ...DEFAULT, currentPhase: 'DISCUSS' })

    const files = await readdir(dir)
    const baks = files.filter(f => /^state\.json\.bak\.\d+$/.test(f))
    assert.equal(baks.length, 3, `must keep exactly 3 backups, got ${baks.length}`)
    assert.ok(!baks.includes('state.json.bak.100'), 'oldest backup must be pruned')
    assert.ok(!files.some(f => f.endsWith('.tmp')), 'no residual .tmp files')
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test('json-state-writer: rotates by timestamp — deletes smallest timestamp, not last-created', async () => {
  const base = await mkBase()
  try {
    const dir = join(base, 'proj')
    await mkdir(dir, { recursive: true })
    // Seed backups in REVERSE order (300 first, 100 last) to test sort correctness
    // Without proper ascending sort, shift() would delete bak.300 (wrong, newest)
    await writeFile(join(dir, 'state.json.bak.300'), '{}', 'utf8')
    await writeFile(join(dir, 'state.json.bak.200'), '{}', 'utf8')
    await writeFile(join(dir, 'state.json.bak.100'), '{}', 'utf8')
    await writeFile(join(dir, 'state.json'), JSON.stringify(DEFAULT), 'utf8')

    const writer = createJsonStateWriter(base)
    await writer.write('proj', { ...DEFAULT, currentPhase: 'DISCUSS' })

    const files = await readdir(dir)
    const baks = files.filter(f => /^state\.json\.bak\.\d+$/.test(f))
    assert.ok(!baks.includes('state.json.bak.100'), 'must delete OLDEST (smallest ts), not insertion-order first')
    assert.ok(baks.includes('state.json.bak.300'), 'bak.300 must survive (not oldest)')
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test('json-state-writer: state.json is NOT deleted during backup rotation', async () => {
  const base = await mkBase()
  try {
    const dir = join(base, 'proj')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'state.json.bak.100'), '{}', 'utf8')
    await writeFile(join(dir, 'state.json.bak.200'), '{}', 'utf8')
    await writeFile(join(dir, 'state.json.bak.300'), '{}', 'utf8')
    await writeFile(join(dir, 'state.json'), JSON.stringify(DEFAULT), 'utf8')

    const writer = createJsonStateWriter(base)
    await writer.write('proj', { ...DEFAULT, currentPhase: 'DISCUSS' })

    const files = await readdir(dir)
    assert.ok(files.includes('state.json'), 'state.json must survive rotation')
    const saved = await readState(base, 'proj')
    assert.equal(saved.currentPhase, 'DISCUSS')
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test('json-state-writer: does not create backup on first write (no existing state.json)', async () => {
  const base = await mkBase()
  try {
    const writer = createJsonStateWriter(base)
    await writer.write('proj', DEFAULT)
    const files = await readdir(join(base, 'proj'))
    const baks = files.filter(f => /^state\.json\.bak\.\d+$/.test(f))
    assert.equal(baks.length, 0, 'no backup on first write')
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test('json-state-writer: overwrites existing state.json with new content', async () => {
  const base = await mkBase()
  try {
    const writer = createJsonStateWriter(base)
    await writer.write('proj', DEFAULT)
    await writer.write('proj', { ...DEFAULT, currentPhase: 'DISCUSS' })
    const saved = await readState(base, 'proj')
    assert.equal(saved.currentPhase, 'DISCUSS')
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test('json-state-writer: Ok(undefined) on success', async () => {
  const base = await mkBase()
  try {
    const writer = createJsonStateWriter(base)
    const r = await writer.write('proj', DEFAULT)
    assert.equal(r.ok, true)
    assert.equal(r.value, undefined)
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test('json-state-writer: multiple slugs are independent', async () => {
  const base = await mkBase()
  try {
    const writer = createJsonStateWriter(base)
    await writer.write('alpha', { ...DEFAULT, currentPhase: 'DISCOVER' })
    await writer.write('beta', { ...DEFAULT, currentPhase: 'DISCUSS' })
    assert.equal((await readState(base, 'alpha')).currentPhase, 'DISCOVER')
    assert.equal((await readState(base, 'beta')).currentPhase, 'DISCUSS')
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})
