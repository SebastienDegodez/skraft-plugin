import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Boundary test for `state.mjs migrate` (P4 layout back-compat). Drives the real CLI in a
// temp workspace so the namespaced → bare state relocation is exercised end-to-end.
const STATE_CLI = resolve(fileURLToPath(import.meta.url), '../../../plugins/src/cli/state.mjs')

const withWorkspace = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'skraft-migrate-'))
  try { return fn(dir) } finally { rmSync(dir, { recursive: true, force: true }) }
}

const runMigrate = (cwd, args) => {
  try {
    const stdout = execFileSync('node', [STATE_CLI, 'migrate', ...args], { cwd, encoding: 'utf8' })
    return { code: 0, stdout }
  } catch (err) {
    return { code: err.status ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' }
  }
}

const seedNamespaced = (cwd, slug, state) => {
  const dir = join(cwd, '.copilot-tracking', 'skraft-plans', slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'state.json'), JSON.stringify(state), 'utf8')
  return dir
}

const SLUG = 'demo-proj'
const STATE = { projectSlug: SLUG, currentPhase: 'DESIGN' }

test('migrate: dry-run reports the planned move and writes nothing', () => {
  withWorkspace((cwd) => {
    seedNamespaced(cwd, SLUG, STATE)
    const { code, stdout } = runMigrate(cwd, ['--slug', SLUG])
    assert.equal(code, 0)
    const out = JSON.parse(stdout)
    assert.equal(out.dryRun, true)
    assert.ok(out.to.includes(join('.copilot-tracking', 'skraft', SLUG)))
    assert.equal(existsSync(join(cwd, '.copilot-tracking', 'skraft', SLUG, 'state.json')), false, 'dry-run must not move')
    assert.equal(existsSync(join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, 'state.json')), true, 'source untouched')
  })
})

test('migrate --apply: relocates state.json to the bare control dir', () => {
  withWorkspace((cwd) => {
    seedNamespaced(cwd, SLUG, STATE)
    const { code, stdout } = runMigrate(cwd, ['--slug', SLUG, '--apply'])
    assert.equal(code, 0)
    const out = JSON.parse(stdout)
    assert.equal(out.applied, true)
    assert.ok(out.moved.includes('state.json'))
    assert.equal(existsSync(join(cwd, '.copilot-tracking', 'skraft', SLUG, 'state.json')), true, 'state moved to bare')
    assert.equal(existsSync(join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, 'state.json')), false, 'source removed')
  })
})

test('migrate: refuses when a bare state already exists (no overwrite)', () => {
  withWorkspace((cwd) => {
    seedNamespaced(cwd, SLUG, STATE)
    const bareDir = join(cwd, '.copilot-tracking', 'skraft', SLUG)
    mkdirSync(bareDir, { recursive: true })
    writeFileSync(join(bareDir, 'state.json'), JSON.stringify({ projectSlug: SLUG, currentPhase: 'DONE' }), 'utf8')
    const { code, stderr } = runMigrate(cwd, ['--slug', SLUG, '--apply'])
    assert.equal(code, 3)
    assert.match(stderr, /TARGET_EXISTS/)
  })
})

test('migrate: errors when there is no namespaced state to migrate', () => {
  withWorkspace((cwd) => {
    const { code, stderr } = runMigrate(cwd, ['--slug', SLUG])
    assert.equal(code, 1)
    assert.match(stderr, /NOT_FOUND/)
  })
})

test('migrate: requires --slug', () => {
  withWorkspace((cwd) => {
    const { code, stderr } = runMigrate(cwd, [])
    assert.equal(code, 1)
    assert.match(stderr, /INVALID_ARGUMENT/)
  })
})
