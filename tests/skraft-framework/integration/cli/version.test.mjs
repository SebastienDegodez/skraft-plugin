import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const pluginRoot = new URL('../../../../plugins/skraft-framework/', import.meta.url)
const cli = fileURLToPath(new URL('engine/drivers/cli/skraft.mjs', pluginRoot))
const pluginVersion = JSON.parse(readFileSync(new URL('plugin.json', pluginRoot), 'utf8')).version

const skraft = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })

test('skraft --version prints the plugin version', () => {
  const run = skraft('--version')
  assert.equal(run.stdout, `${pluginVersion}\n`)
  assert.equal(run.status, 0)
})

test('an unknown command prints a one-line usage on stderr and exits 2', () => {
  const run = skraft('frobnicate')
  assert.equal(run.stdout, '')
  assert.match(run.stderr, /^usage: skraft --version \| init <slug> \[--issue <number>\] \[--title <text>\] \| status \[--json\]\n$/)
  assert.equal(run.status, 2)
})
