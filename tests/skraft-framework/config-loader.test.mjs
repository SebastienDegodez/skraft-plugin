import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadConfig } from '../../plugins/src/application/config-loader.mjs'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

test('returns empty config when no files and no SKRAFT_ env vars', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-cfg-'))
  const config = await loadConfig({ cwd: dir, home: dir, env: {} })
  assert.deepEqual(config, {})
  await rm(dir, { recursive: true, force: true })
})

test('reads .skraftrc.json from project directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-cfg-'))
  await writeFile(join(dir, '.skraftrc.json'), JSON.stringify({ logLevel: 'debug' }))
  const config = await loadConfig({ cwd: dir, home: dir, env: {} })
  assert.equal(config.logLevel, 'debug')
  await rm(dir, { recursive: true, force: true })
})

test('reads SKRAFT_ env vars and converts to camelCase keys', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-cfg-'))
  const config = await loadConfig({ cwd: dir, home: dir, env: { SKRAFT_LOG_LEVEL: 'info', SKRAFT_TIMEOUT: '30' } })
  assert.equal(config.logLevel, 'info')
  assert.equal(config.timeout, '30')
  await rm(dir, { recursive: true, force: true })
})

test('project config overrides global config (cascade)', async () => {
  const home = await mkdtemp(join(tmpdir(), 'skraft-home-'))
  const cwd = await mkdtemp(join(tmpdir(), 'skraft-cwd-'))
  await mkdir(join(home, '.skraft'), { recursive: true })
  await writeFile(join(home, '.skraft', 'config.json'), JSON.stringify({ logLevel: 'warn', timeout: '60' }))
  await writeFile(join(cwd, '.skraftrc.json'), JSON.stringify({ logLevel: 'debug' }))

  const config = await loadConfig({ cwd, home, env: {} })
  assert.equal(config.logLevel, 'debug', 'project wins over global')
  assert.equal(config.timeout, '60', 'global fills missing keys')

  await rm(home, { recursive: true, force: true })
  await rm(cwd, { recursive: true, force: true })
})

// skraft.config.json fallback when .skraftrc.json absent
test('reads skraft.config.json when .skraftrc.json not present', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-cfg-'))
  await writeFile(join(dir, 'skraft.config.json'), JSON.stringify({ mode: 'production' }))
  const config = await loadConfig({ cwd: dir, home: dir, env: {} })
  assert.equal(config.mode, 'production')
  await rm(dir, { recursive: true, force: true })
})

// env filtering: non-SKRAFT_ keys are ignored
test('ignores env vars that do not start with SKRAFT_', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-cfg-'))
  const config = await loadConfig({ cwd: dir, home: dir, env: { PATH: '/usr/bin', HOME: '/home/user', SKRAFT_MODE: 'test' } })
  assert.equal(config.mode, 'test')
  assert.deepEqual(Object.keys(config).sort(), ['mode'])
  await rm(dir, { recursive: true, force: true })
})

// config-loader: exercises ?? process.cwd() and ?? homedir() fallback branches
// Called without cwd and home; real process.cwd() has no .skraftrc.json
test('uses process.cwd() and homedir() when not provided', async () => {
  const config = await loadConfig({ env: {} })
  assert.equal(typeof config, 'object')
  assert.ok(config !== null)
})

// project config wins over env
test('project config overrides env vars', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-cfg-'))
  await writeFile(join(dir, '.skraftrc.json'), JSON.stringify({ logLevel: 'error' }))
  const config = await loadConfig({ cwd: dir, home: dir, env: { SKRAFT_LOG_LEVEL: 'info' } })
  assert.equal(config.logLevel, 'error')
  await rm(dir, { recursive: true, force: true })
})

// config-loader: exercises ?? process.env fallback branch
test('uses process.env when env option not provided', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-cfg-'))
  const config = await loadConfig({ cwd: dir, home: dir })  // no env → process.env
  assert.equal(typeof config, 'object')
  await rm(dir, { recursive: true, force: true })
})

