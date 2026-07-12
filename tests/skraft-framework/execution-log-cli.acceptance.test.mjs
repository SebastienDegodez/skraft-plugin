/**
 * Acceptance test — S7 execution-log CLI bridge (US9 / #55).
 *
 * Exercises the three deterministic CLIs the DELIVER agent uses to record its TDD
 * phases so progress is tamper-proof: init-log, log-phase (real UTC timestamp), and
 * verify-integrity. Asserts the AC exit-code contract: 0 success / 1 validation / 2 usage.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const CLI_DIR = fileURLToPath(new URL('../../plugins/src/cli/', import.meta.url))
const INIT_LOG = join(CLI_DIR, 'init-log.mjs')
const LOG_PHASE = join(CLI_DIR, 'log-phase.mjs')
const VERIFY = join(CLI_DIR, 'verify-integrity.mjs')

async function cli(script, args, root) {
  try {
    const { stdout, stderr } = await execFileAsync('node', [script, ...args], {
      env: { ...process.env, SKRAFT_TRACKING_ROOT: root },
    })
    return { exitCode: 0, stdout, stderr }
  } catch (err) {
    return { exitCode: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' }
  }
}

async function withRoot(fn) {
  const root = await mkdtemp(join(tmpdir(), 'skraft-exec-log-'))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const completeStep = async (root, step) => {
  for (const phase of ['RED', 'GREEN', 'REFACTOR', 'COMMIT']) {
    await cli(LOG_PHASE, ['--slug', 'us9', '--step', step, '--phase', phase], root)
  }
}

test('init-log: creates the execution log and exits 0', async () => {
  await withRoot(async (root) => {
    const r = await cli(INIT_LOG, ['--slug', 'us9'], root)
    assert.equal(r.exitCode, 0)
    assert.equal(JSON.parse(r.stdout).created, true)

    const raw = await readFile(join(root, 'us9', 'execution-log.json'), 'utf8')
    const log = JSON.parse(raw)
    assert.equal(log.slug, 'us9')
    assert.deepEqual(log.entries, [])
  })
})

test('init-log: idempotent — second run reports created=false, exit 0', async () => {
  await withRoot(async (root) => {
    await cli(INIT_LOG, ['--slug', 'us9'], root)
    const r = await cli(INIT_LOG, ['--slug', 'us9'], root)
    assert.equal(r.exitCode, 0)
    assert.equal(JSON.parse(r.stdout).created, false)
  })
})

test('init-log: missing --slug is a usage error, exit 2', async () => {
  await withRoot(async (root) => {
    const r = await cli(INIT_LOG, [], root)
    assert.equal(r.exitCode, 2)
    assert.equal(JSON.parse(r.stderr).code, 'MISSING_ARGUMENT')
  })
})

test('log-phase: writes a UTC-timestamped entry validated against the schema, exit 0', async () => {
  await withRoot(async (root) => {
    const r = await cli(LOG_PHASE, ['--slug', 'us9', '--step', '1', '--phase', 'RED', '--note', 'failing test'], root)
    assert.equal(r.exitCode, 0)
    const entry = JSON.parse(r.stdout)
    assert.equal(entry.step, '1')
    assert.equal(entry.phase, 'RED')
    assert.equal(entry.note, 'failing test')
    // Real UTC ISO-8601 timestamp with Z suffix and millisecond precision.
    assert.match(entry.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    assert.equal(new Date(entry.timestamp).toISOString(), entry.timestamp)
  })
})

test('log-phase: auto-inits the log on first use (no explicit init needed), exit 0', async () => {
  await withRoot(async (root) => {
    const r = await cli(LOG_PHASE, ['--slug', 'us9', '--step', '1', '--phase', 'RED'], root)
    assert.equal(r.exitCode, 0)
    const raw = await readFile(join(root, 'us9', 'execution-log.json'), 'utf8')
    assert.equal(JSON.parse(raw).entries.length, 1)
  })
})

test('log-phase: an unknown phase is a validation error, exit 1', async () => {
  await withRoot(async (root) => {
    const r = await cli(LOG_PHASE, ['--slug', 'us9', '--step', '1', '--phase', 'DEPLOY'], root)
    assert.equal(r.exitCode, 1)
    assert.equal(JSON.parse(r.stderr).code, 'INVALID_ENTRY')
  })
})

test('log-phase: a missing required flag is a usage error, exit 2', async () => {
  await withRoot(async (root) => {
    const r = await cli(LOG_PHASE, ['--slug', 'us9', '--step', '1'], root)
    assert.equal(r.exitCode, 2)
    assert.equal(JSON.parse(r.stderr).code, 'MISSING_ARGUMENT')
  })
})

test('verify-integrity: exit 1 when a step is missing TDD phases', async () => {
  await withRoot(async (root) => {
    await cli(LOG_PHASE, ['--slug', 'us9', '--step', '1', '--phase', 'RED'], root)
    const r = await cli(VERIFY, ['--slug', 'us9'], root)
    assert.equal(r.exitCode, 1)
    const err = JSON.parse(r.stderr)
    assert.equal(err.code, 'INCOMPLETE_LOG')
    assert.equal(err.incomplete[0].step, '1')
    assert.deepEqual(err.incomplete[0].missing, ['GREEN', 'REFACTOR', 'COMMIT'])
  })
})

test('verify-integrity: exit 0 when every step walked the full TDD cycle', async () => {
  await withRoot(async (root) => {
    await completeStep(root, '1')
    const r = await cli(VERIFY, ['--slug', 'us9'], root)
    assert.equal(r.exitCode, 0)
    const out = JSON.parse(r.stdout)
    assert.equal(out.complete, true)
    assert.equal(out.steps.length, 1)
  })
})

test('verify-integrity: exit 1 when no log exists yet', async () => {
  await withRoot(async (root) => {
    const r = await cli(VERIFY, ['--slug', 'us9'], root)
    assert.equal(r.exitCode, 1)
    assert.equal(JSON.parse(r.stderr).code, 'INCOMPLETE_LOG')
  })
})

test('verify-integrity: missing --slug is a usage error, exit 2', async () => {
  await withRoot(async (root) => {
    const r = await cli(VERIFY, [], root)
    assert.equal(r.exitCode, 2)
    assert.equal(JSON.parse(r.stderr).code, 'MISSING_ARGUMENT')
  })
})
