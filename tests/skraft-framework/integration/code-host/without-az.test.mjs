import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { assertNoAz, withoutAz } from '../support/without-az.mjs'
import { envWithPath, tempFolder } from '../support/workspace.mjs'

/** A folder holding an az that would answer. */
const folderWithAz = (t) => {
  const dir = tempFolder(t, 'skraft-az-folder-')
  const name = process.platform === 'win32' ? 'az.cmd' : 'az'
  writeFileSync(join(dir, name), process.platform === 'win32' ? '@exit /b 0\r\n' : '#!/bin/sh\nexit 0\n')
  chmodSync(join(dir, name), 0o755)
  return dir
}

test('a PATH holding an az is refused, whichever folder holds it', async (t) => {
  const dir = folderWithAz(t)
  await assert.rejects(assertNoAz(envWithPath([dir]), dir), /az resolves to .*az.* real Azure DevOps organization/)
  await assertNoAz(envWithPath([tempFolder(t)]), dir)
})

test('the PATH of a test without az holds a node shim, never the folder node lives in, which may hold az', async (t) => {
  const nodeFolder = folderWithAz(t)
  const node = join(nodeFolder, 'node')
  writeFileSync(node, '')
  const before = process.env.PATH

  await withoutAz(t, { execPath: node })

  assert.notEqual(process.env.PATH, before)
  assert.equal(process.env.PATH.includes(nodeFolder), false)
  assert.equal(process.env.PATH.split(delimiter).length, 1)
})

test('the PATH is restored once the test ends', async (t) => {
  const before = process.env.PATH
  await t.test('inside', async (inner) => { await withoutAz(inner) })
  assert.equal(process.env.PATH, before)
})
