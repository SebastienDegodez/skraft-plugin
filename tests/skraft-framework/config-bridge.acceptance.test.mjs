/**
 * Acceptance tests — Repo-wide Config Bridge (S7)
 *
 * These tests call cli/config.mjs as a subprocess — exactly as the orchestrator and
 * the skraft-config skill would. SKRAFT_CONFIG_ROOT points at an isolated tmpdir so
 * the repo-wide skraft-config.json is written there, never in the working tree.
 *
 * Iron Rule: NEVER modify these tests to make them pass — fix the implementation.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const CLI = fileURLToPath(new URL('../../plugins/skraft-framework/src/cli/config.mjs', import.meta.url))

async function configCli(args, { basePath }) {
  const env = { ...process.env, SKRAFT_CONFIG_ROOT: basePath }
  try {
    const { stdout, stderr } = await execFileAsync('node', [CLI, ...args], { env })
    return { exitCode: 0, stdout, stderr }
  } catch (err) {
    return { exitCode: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' }
  }
}

const withTmp = async (fn) => {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-cfg-cli-'))
  try { await fn(dir) } finally { await rm(dir, { recursive: true, force: true }) }
}

const readCfg = async (dir) => JSON.parse(await readFile(join(dir, 'skraft-config.json'), 'utf8'))

test('config init: creates skraft-config.json with the namespaced default', async () => {
  await withTmp(async (dir) => {
    const r = await configCli(['init'], { basePath: dir })
    assert.equal(r.exitCode, 0)
    assert.match(r.stdout, /"created":true/)
    assert.equal((await readCfg(dir)).trackingLayout, 'namespaced')
  })
})

test('config init: idempotent — second init reports created=false', async () => {
  await withTmp(async (dir) => {
    await configCli(['init'], { basePath: dir })
    const r = await configCli(['init'], { basePath: dir })
    assert.equal(r.exitCode, 0)
    assert.match(r.stdout, /"created":false/)
  })
})

test('config get --key trackingLayout: prints the raw scalar', async () => {
  await withTmp(async (dir) => {
    await configCli(['set', '--key', 'trackingLayout', '--value', 'bare'], { basePath: dir })
    const r = await configCli(['get', '--key', 'trackingLayout'], { basePath: dir })
    assert.equal(r.exitCode, 0)
    assert.equal(r.stdout.trim(), 'bare')
  })
})

test('config get (no key): prints the whole config as JSON', async () => {
  await withTmp(async (dir) => {
    await configCli(['init'], { basePath: dir })
    const r = await configCli(['get'], { basePath: dir })
    assert.equal(r.exitCode, 0)
    assert.match(r.stdout, /"trackingLayout":"namespaced"/)
  })
})

test('config get on missing file: returns the default without writing', async () => {
  await withTmp(async (dir) => {
    const r = await configCli(['get', '--key', 'trackingLayout'], { basePath: dir })
    assert.equal(r.exitCode, 0)
    assert.equal(r.stdout.trim(), 'namespaced')
    await assert.rejects(() => readCfg(dir))
  })
})

test('config set trackingLayout: persists a valid layout', async () => {
  await withTmp(async (dir) => {
    const r = await configCli(['set', '--key', 'trackingLayout', '--value', 'bare'], { basePath: dir })
    assert.equal(r.exitCode, 0)
    assert.equal((await readCfg(dir)).trackingLayout, 'bare')
  })
})

test('config set trackingLayout: rejects an invalid layout with exit 3', async () => {
  await withTmp(async (dir) => {
    const r = await configCli(['set', '--key', 'trackingLayout', '--value', 'sideways'], { basePath: dir })
    assert.equal(r.exitCode, 3)
    assert.match(r.stderr, /INVALID_VALUE/)
  })
})

test('config set: rejects an unknown key with exit 3', async () => {
  await withTmp(async (dir) => {
    const r = await configCli(['set', '--key', 'bogus', '--value', 'x'], { basePath: dir })
    assert.equal(r.exitCode, 3)
    assert.match(r.stderr, /UNKNOWN_KEY/)
  })
})

test('config set: preserves human-authored extra fields', async () => {
  await withTmp(async (dir) => {
    await writeFile(join(dir, 'skraft-config.json'), JSON.stringify({ trackingLayout: 'namespaced', teamOwner: 'platform' }), 'utf8')
    await configCli(['set', '--key', 'trackingLayout', '--value', 'bare'], { basePath: dir })
    const cfg = await readCfg(dir)
    assert.equal(cfg.trackingLayout, 'bare')
    assert.equal(cfg.teamOwner, 'platform')
  })
})

test('config: unknown subcommand exits 1', async () => {
  await withTmp(async (dir) => {
    const r = await configCli(['frobnicate'], { basePath: dir })
    assert.equal(r.exitCode, 1)
    assert.match(r.stderr, /UNKNOWN_SUBCOMMAND/)
  })
})
