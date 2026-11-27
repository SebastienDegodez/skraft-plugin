import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { runStandalone } from '../../../../plugins/skraft-deliver/engine/drivers/cli/standalone-run.mjs'

test('an error before a run opens leaves a private diagnostic without exposing the error in the result', async (t) => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'skraft deliver diagnostic ')))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  const messages = []
  const services = { cwd, pluginFolder: () => resolve('plugins/skraft-deliver') }
  const exit = await runStandalone(['start', '{private-input'], services, { out: (message) => messages.push(message) })

  assert.equal(exit, 1)
  const result = JSON.parse(messages.join(''))
  assert.equal(result.code, 'unexpected-error')
  assert.doesNotMatch(messages.join(''), /private-input|SyntaxError/)
  const log = join(cwd, '.copilot-tracking', 'skraft-deliver-diagnostics', 'logs', 'unexpected.log')
  assert.equal(existsSync(log), true, 'the private diagnostic is saved even without an active run')
  assert.match(readFileSync(log, 'utf8'), /SyntaxError/)
})
