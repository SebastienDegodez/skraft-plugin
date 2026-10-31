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

test('an unknown command or a malformed option prints the usage on stderr and exits 2, touching nothing', async () => {
  for (const args of [
    ['deploy'], ['status', '--verbose'], ['status', '--json', '--json'], ['gate', '--touched'], ['gate', '--all', '--all'],
    ['journal'], ['journal', 'adopt', '--force'], ['journal', 'rotate'],
    ['doctor', '--fix'], ['doctor', '--base'], ['doctor', '--base', 'main', '--base', 'develop'], ['init', '--add'], ['init', '--force'],
    ['review'], ['review', '--pr'], ['review', '--pr', '0'], ['review', '--pr', 'twelve'], ['review', '--pr', '12', '--force'],
  ]) {
    const { lines, console } = consoleOf()
    const code = await runCli(args, { pluginVersion: () => '0.0.0', adapters: unused }, console)

    assert.deepEqual({ args, code, out: lines.out, err: lines.err }, { args, code: 2, out: [], err: [USAGE] })
  }
  assert.deepEqual(USAGE.split('\n').map((line) => line.trim().split(/\s{2,}/)[0]), [
    'usage: skraft --version',
    'skraft install [--no-path]',
    'skraft init [--add <folder>]...',
    'skraft init <slug> [--issue <number>] [--title <text>] [--base <ref>] [--from-artifacts]',
    'skraft status [--json]',
    'skraft report [--json]',
    'skraft decide [<key>] <answer> [--reason <text>]',
    'skraft publish',
    'skraft journal adopt [--pr <number>]',
    'skraft migrate [--dry-run] [--json]',
    'skraft next [--json]',
    'skraft record [--json]',
    'skraft gate [--all] [--json]',
    'skraft doctor [--run] [--base <ref>] [--json]',
    'skraft review --pr <number> [--publish] [--record] [--json]',
    'skraft workflow eject [review]',
    'skraft workflow check [--json]',
    'skraft workflow diff [--json]',
  ])
})
