import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createJsonExecutionLogWriter } from '../../plugins/skraft-framework/src/adapters/infrastructure/execution-log/json-execution-log-writer.mjs'

// The DELIVER execution log is the tamper-proof record verify-integrity reads back to
// decide whether a step walked RED → GREEN → REFACTOR → COMMIT. Its atomicity protocol —
// tmp write, backup copy, rotation to at most 3, then an atomic rename — was never
// exercised by a test, so a broken rotation or a swallowed backup error would have shipped
// silently. These tests drive the real filesystem, like the three CLI bridges do.

const mkBase = () => mkdtemp(join(tmpdir(), 'skraft-exec-log-'))

const readLog = async (base, slug) =>
  JSON.parse(await readFile(join(base, slug, 'execution-log.json'), 'utf8'))

const backupsIn = (files) => files.filter((f) => /^execution-log\.json\.bak\.\d+$/.test(f))

const LOG = {
  slug: 'proj',
  createdAt: '2026-08-28T10:00:00.000Z',
  entries: [{ step: 'checkout-total', phase: 'RED', timestamp: '2026-08-28T10:00:01.000Z' }],
}

const withBase = async (body) => {
  const base = await mkBase()
  try {
    await body(base)
  } finally {
    await rm(base, { recursive: true, force: true })
  }
}

// ─── Happy path ───────────────────────────────────────────────────────────────

test('json-execution-log-writer: creates the slug directory and writes execution-log.json', async () => {
  await withBase(async (base) => {
    const writer = createJsonExecutionLogWriter(base)

    const result = await writer.write('proj', LOG)

    assert.equal(result.ok, true)
    assert.equal(result.value, undefined)
    assert.deepEqual(await readLog(base, 'proj'), LOG)
  })
})

test('json-execution-log-writer: leaves no residual .tmp file after a successful write', async () => {
  await withBase(async (base) => {
    const writer = createJsonExecutionLogWriter(base)

    await writer.write('proj', LOG)

    const files = await readdir(join(base, 'proj'))
    assert.deepEqual(files.filter((f) => f.includes('.tmp.')), [])
  })
})

test('json-execution-log-writer: writes into a directory that already exists', async () => {
  await withBase(async (base) => {
    await mkdir(join(base, 'proj'), { recursive: true })
    const writer = createJsonExecutionLogWriter(base)

    const result = await writer.write('proj', LOG)

    assert.equal(result.ok, true)
  })
})

test('json-execution-log-writer: overwrites the log with the newer document', async () => {
  await withBase(async (base) => {
    const writer = createJsonExecutionLogWriter(base)
    await writer.write('proj', LOG)

    const committed = { ...LOG, entries: [...LOG.entries, { step: 'checkout-total', phase: 'COMMIT', timestamp: '2026-08-28T10:05:00.000Z' }] }
    await writer.write('proj', committed)

    assert.deepEqual(await readLog(base, 'proj'), committed)
  })
})

test('json-execution-log-writer: keeps slugs independent', async () => {
  await withBase(async (base) => {
    const writer = createJsonExecutionLogWriter(base)

    await writer.write('alpha', { ...LOG, slug: 'alpha' })
    await writer.write('beta', { ...LOG, slug: 'beta' })

    assert.equal((await readLog(base, 'alpha')).slug, 'alpha')
    assert.equal((await readLog(base, 'beta')).slug, 'beta')
  })
})

// ─── Backup protocol ──────────────────────────────────────────────────────────

test('json-execution-log-writer: makes no backup on the first write', async () => {
  await withBase(async (base) => {
    const writer = createJsonExecutionLogWriter(base)

    await writer.write('proj', LOG)

    assert.deepEqual(backupsIn(await readdir(join(base, 'proj'))), [])
  })
})

test('json-execution-log-writer: backs up the previous log on the second write', async () => {
  await withBase(async (base) => {
    const writer = createJsonExecutionLogWriter(base)
    await writer.write('proj', LOG)

    await writer.write('proj', { ...LOG, createdAt: '2026-08-28T11:00:00.000Z' })

    const backups = backupsIn(await readdir(join(base, 'proj')))
    assert.equal(backups.length, 1)
    const backed = JSON.parse(await readFile(join(base, 'proj', backups[0]), 'utf8'))
    assert.equal(backed.createdAt, LOG.createdAt, 'the backup holds the PREVIOUS document')
  })
})

test('json-execution-log-writer: rotation keeps at most 3 backups', async () => {
  await withBase(async (base) => {
    const dir = join(base, 'proj')
    await mkdir(dir, { recursive: true })
    for (const ts of [100, 200, 300]) {
      await writeFile(join(dir, `execution-log.json.bak.${ts}`), '{}', 'utf8')
    }
    await writeFile(join(dir, 'execution-log.json'), JSON.stringify(LOG), 'utf8')
    const writer = createJsonExecutionLogWriter(base)

    await writer.write('proj', { ...LOG, createdAt: '2026-08-28T12:00:00.000Z' })

    const files = await readdir(dir)
    assert.equal(backupsIn(files).length, 3)
    assert.ok(files.includes('execution-log.json'), 'the live log survives rotation')
    assert.deepEqual(files.filter((f) => f.includes('.tmp.')), [])
  })
})

test('json-execution-log-writer: rotation prunes the oldest timestamp, not the first entry read', async () => {
  await withBase(async (base) => {
    const dir = join(base, 'proj')
    await mkdir(dir, { recursive: true })
    // Seeded newest-first so an unsorted `shift()` would delete bak.300 — the newest.
    // Numeric ordering also matters: lexicographic sort puts "100" before "99".
    for (const ts of [300, 200, 99]) {
      await writeFile(join(dir, `execution-log.json.bak.${ts}`), '{}', 'utf8')
    }
    await writeFile(join(dir, 'execution-log.json'), JSON.stringify(LOG), 'utf8')
    const writer = createJsonExecutionLogWriter(base)

    await writer.write('proj', { ...LOG, createdAt: '2026-08-28T12:00:00.000Z' })

    const backups = backupsIn(await readdir(dir))
    assert.ok(!backups.includes('execution-log.json.bak.99'), 'the oldest backup is pruned')
    assert.ok(backups.includes('execution-log.json.bak.300'), 'the newest backup survives')
  })
})

test('json-execution-log-writer: an unrelated file is never mistaken for a backup', async () => {
  await withBase(async (base) => {
    const dir = join(base, 'proj')
    await mkdir(dir, { recursive: true })
    for (const ts of [100, 200, 300]) {
      await writeFile(join(dir, `execution-log.json.bak.${ts}`), '{}', 'utf8')
    }
    await writeFile(join(dir, 'execution-log.json.bak.keep'), '{}', 'utf8')
    await writeFile(join(dir, 'notes.md'), 'scratch', 'utf8')
    await writeFile(join(dir, 'execution-log.json'), JSON.stringify(LOG), 'utf8')
    const writer = createJsonExecutionLogWriter(base)

    await writer.write('proj', { ...LOG, createdAt: '2026-08-28T12:00:00.000Z' })

    const files = await readdir(dir)
    assert.ok(files.includes('notes.md'), 'unrelated files are untouched')
    assert.ok(files.includes('execution-log.json.bak.keep'), 'a non-numeric suffix is not a backup')
  })
})

// ─── Failure paths ────────────────────────────────────────────────────────────

test('json-execution-log-writer: reports IO_ERROR with the underlying message when the directory cannot be created', async () => {
  await withBase(async (base) => {
    // `proj` is a FILE, so mkdir of the slug directory fails with ENOTDIR/EEXIST.
    await writeFile(join(base, 'proj'), 'not a directory', 'utf8')
    const writer = createJsonExecutionLogWriter(base)

    const result = await writer.write('proj', LOG)

    assert.equal(result.ok, false)
    assert.equal(result.error.code, 'IO_ERROR')
    assert.ok(result.error.reason.length > 0, 'the underlying error message is surfaced')
    assert.ok(
      !result.error.reason.includes('cross-device'),
      'a non-EXDEV failure must not be reported as a cross-device rename',
    )
  })
})

test('json-execution-log-writer: a failing rotation surfaces as IO_ERROR instead of being swallowed', async () => {
  await withBase(async (base) => {
    const dir = join(base, 'proj')
    await mkdir(dir, { recursive: true })
    // The oldest backup is a DIRECTORY, so the rotation `unlink` fails with a code that
    // is not ENOENT. Only ENOENT means "there was nothing to back up"; anything else is a
    // real filesystem failure and must reach the caller.
    await mkdir(join(dir, 'execution-log.json.bak.100'), { recursive: true })
    for (const ts of [200, 300, 400]) {
      await writeFile(join(dir, `execution-log.json.bak.${ts}`), '{}', 'utf8')
    }
    await writeFile(join(dir, 'execution-log.json'), JSON.stringify(LOG), 'utf8')
    const writer = createJsonExecutionLogWriter(base)

    const result = await writer.write('proj', { ...LOG, createdAt: '2026-08-28T12:00:00.000Z' })

    assert.equal(result.ok, false)
    assert.equal(result.error.code, 'IO_ERROR')
  })
})

test('json-execution-log-writer: a failed write leaves no residual .tmp file behind', async () => {
  await withBase(async (base) => {
    const dir = join(base, 'proj')
    await mkdir(dir, { recursive: true })
    await mkdir(join(dir, 'execution-log.json.bak.100'), { recursive: true })
    for (const ts of [200, 300, 400]) {
      await writeFile(join(dir, `execution-log.json.bak.${ts}`), '{}', 'utf8')
    }
    await writeFile(join(dir, 'execution-log.json'), JSON.stringify(LOG), 'utf8')
    const writer = createJsonExecutionLogWriter(base)

    const result = await writer.write('proj', { ...LOG, createdAt: '2026-08-28T12:00:00.000Z' })

    assert.equal(result.ok, false)
    const files = await readdir(dir)
    assert.deepEqual(files.filter((f) => f.includes('.tmp.')), [], 'the temp file is cleaned up')
  })
})

test('json-execution-log-writer: a failed write leaves the previous log readable', async () => {
  await withBase(async (base) => {
    const dir = join(base, 'proj')
    await mkdir(dir, { recursive: true })
    await mkdir(join(dir, 'execution-log.json.bak.100'), { recursive: true })
    for (const ts of [200, 300, 400]) {
      await writeFile(join(dir, `execution-log.json.bak.${ts}`), '{}', 'utf8')
    }
    await writeFile(join(dir, 'execution-log.json'), JSON.stringify(LOG), 'utf8')
    const writer = createJsonExecutionLogWriter(base)

    await writer.write('proj', { ...LOG, createdAt: '2026-08-28T12:00:00.000Z' })

    assert.deepEqual(await readLog(base, 'proj'), LOG, 'verify-integrity still reads the last good log')
  })
})
