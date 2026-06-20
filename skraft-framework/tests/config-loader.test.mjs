import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadConfig } from '../application/config-loader.mjs'
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
