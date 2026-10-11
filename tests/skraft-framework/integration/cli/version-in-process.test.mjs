import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runCli, USAGE } from '../../../../plugins/skraft-framework/engine/drivers/cli/run-cli.mjs'
import { readPluginVersion } from '../../../../plugins/skraft-framework/engine/infrastructure/plugin-manifest.mjs'

// Same behaviour as version.test.mjs, run in the test process so mutation testing sees it.
const PLUGIN_JSON = new URL('../../../../plugins/skraft-framework/plugin.json', import.meta.url)

const unused = () => { throw new Error('no adapter is needed') }

const consoleOf = () => {
  const lines = { out: [], err: [] }
  return { lines, console: { out: (line) => lines.out.push(line), err: (line) => lines.err.push(line) } }
}

test('--version answers the version recorded in plugin.json', async () => {
  const { lines, console } = consoleOf()
  const code = await runCli(['--version'], { pluginVersion: () => readPluginVersion(PLUGIN_JSON), adapters: unused }, console)

  assert.equal(code, 0)
  assert.deepEqual(lines.out, [JSON.parse(readFileSync(PLUGIN_JSON, 'utf8')).version])
  assert.deepEqual(lines.err, [])
})

test('an unknown command prints the usage on stderr and exits 2', async () => {
  const { lines, console } = consoleOf()
  const code = await runCli(['deploy'], { pluginVersion: () => '0.0.0', adapters: unused }, console)

  assert.equal(code, 2)
  assert.deepEqual(lines.out, [])
  assert.deepEqual(lines.err, [USAGE])
  assert.equal(USAGE, 'usage: skraft --version | init <slug> [--issue <number>] [--title <text>] | status [--json]')
})
