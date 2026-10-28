import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { PLUGIN_ROOT } from './simulated-host.mjs'

const ENTRY = join(PLUGIN_ROOT, 'com.github.copilot', 'extensions', 'skraft-pipeline', 'extension.mjs')
const CHILD = fileURLToPath(new URL('./import-entry-child.mjs', import.meta.url))
/**
 * Async resources that would be a socket, a connection, a name lookup, a server, a child process or
 * a timer started by the entry, during its import or after it resolved.
 */
const STARTED = /^(TCP|TCPCONNECTWRAP|GETADDRINFOREQWRAP|GETNAMEINFOREQWRAP|PIPE|UDP|PROCESS|TTY|Timeout|Immediate|HTTP|DNS|ZLIB|WORKER|SIGNALWRAP|FSEVENTWRAP|STATWATCHER)/i

test('importing the extension entry joins the session once with its canvas and starts nothing, then or later: no stdout, no socket, no server, no process, no timer', () => {
  const run = spawnSync(process.execPath, [CHILD, ENTRY], { encoding: 'utf8', timeout: 30_000 })

  assert.equal(run.status, 0, run.stderr)
  assert.equal(run.stdout, '')
  const report = JSON.parse(run.stderr.trim().split(/\r?\n/).at(-1))
  assert.deepEqual(report.joins, [{ workflows: ['skraft-pipeline', 'skraft-review'], tools: ['skraft_decide'], canvases: ['skraft-pipeline'] }])
  assert.deepEqual(report.created.filter((type) => STARTED.test(type)), [])
})
