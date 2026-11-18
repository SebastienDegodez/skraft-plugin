import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runCli } from '../../../../plugins/skraft-framework/engine/drivers/cli/run-cli.mjs'
import { agent, scripted } from '../../unit/support/pipeline-host.mjs'
import { ADR_1, adrText, afterDesign, architect } from '../../unit/support/decisions.mjs'
import { InMemoryCodeHost } from '../../unit/support/in-memory-host.mjs'

const proposed = (it) => [agent()(it), architect({ [ADR_1]: adrText() })(it), ...afterDesign(it)]

const servicesOf = (host) => ({ adapters: () => host.deps, pluginVersion: () => '2.0.0-test', workingCopyName: () => '/work', command: () => 'node skraft.mjs', confirm: async () => true })

const consoleOf = () => {
  const out = [], err = []
  return { out, err, console: { out: (/** @type {string} */ line) => out.push(line), err: (/** @type {string} */ line) => err.push(line) } }
}

test('skraft forge run refuses without --issue or with a non-numeric one; the issue is not read and the code host is not touched', async () => {
  const host = scripted({}, proposed)
  const { console } = consoleOf()

  assert.equal(await runCli(['forge', 'run'], servicesOf(host), console), 2)
  assert.equal(await runCli(['forge', 'run', '--issue', 'nope'], servicesOf(host), console), 2)
  assert.deepEqual(host.codeHost.issuesRead, [])
  assert.equal(host.codeHost.comments.length, 0)
})

test('skraft forge run refuses when the issue is not readable, with a fixed reason and nothing initialised', async () => {
  const host = scripted({ codeHost: new InMemoryCodeHost({ issues: {} }) }, proposed)
  const { console, err } = consoleOf()

  const exit = await runCli(['forge', 'run', '--issue', '42'], servicesOf(host), console)

  assert.equal(exit, 1)
  assert.ok(err.some((line) => line.includes('issue #42 unreadable: missing')), err.join('\n'))
  assert.equal(host.codeHost.comments.length, 0)
})
