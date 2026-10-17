import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCli, USAGE } from '../../../../plugins/skraft-framework/engine/drivers/cli/run-cli.mjs'
import { createNodeAdapters } from '../../../../plugins/skraft-framework/engine/infrastructure/node-adapters.mjs'

const pluginRoot = fileURLToPath(new URL('../../../../plugins/skraft-framework/', import.meta.url))
const cli = join(pluginRoot, 'engine', 'drivers', 'cli', 'skraft.mjs')

const workingCopy = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'skraft-cli-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

const inProcess = async (cwd, args) => {
  const lines = { out: [], err: [] }
  const code = await runCli(args, {
    pluginVersion: () => '9.9.9',
    workingCopyName: () => 'shop',
    adapters: () => createNodeAdapters({ cwd, pluginRoot }),
  }, { out: (line) => lines.out.push(line), err: (line) => lines.err.push(line) })
  return { code, ...lines }
}

const tracking = (cwd, ...parts) => join(cwd, '.copilot-tracking', 'skraft-plans', ...parts)

test('skraft init makes the slug the active pipeline and opens its journal with the story it was given', async (t) => {
  const cwd = workingCopy(t)
  const started = (slug) => JSON.parse(readFileSync(tracking(cwd, slug, 'events.jsonl'), 'utf8').split('\n')[0])

  const run = await inProcess(cwd, ['init', 'checkout', '--issue', '7', '--title', 'Pay by card'])

  assert.deepEqual(run, { code: 0, out: ['checkout is the active pipeline'], err: [] })
  assert.equal(readFileSync(tracking(cwd, '.active-slug'), 'utf8'), 'checkout\n')
  const { type, slug, story, prev } = started('checkout')
  assert.deepEqual([type, slug, story, prev], ['run.started', 'checkout', { issue: 7, title: 'Pay by card' }, null])

  await inProcess(cwd, ['init', 'refund', '--title', 'Refund a card'])
  await inProcess(cwd, ['init', 'payout', '--issue', '120'])
  await inProcess(cwd, ['init', 'settle'])
  assert.deepEqual(['refund', 'payout', 'settle'].map((name) => started(name).story), [{ issue: null, title: 'Refund a card' }, { issue: 120, title: null }, null])
})

test('skraft init refuses a slug that is not kebab-case, or a malformed option, and changes nothing', async (t) => {
  const cwd = workingCopy(t)

  assert.deepEqual(await inProcess(cwd, ['init', 'Check Out']), { code: 1, out: [], err: ['slug must be kebab-case, got "Check Out"'] })
  for (const issue of ['x', 'a1', '1a', '0']) assert.deepEqual(await inProcess(cwd, ['init', 'checkout', '--issue', issue]), { code: 2, out: [], err: [USAGE] })
  assert.deepEqual(await inProcess(cwd, ['init', 'checkout', '--title', '--issue']), { code: 2, out: [], err: [USAGE] })
  assert.deepEqual(await inProcess(cwd, ['init', 'checkout', '--owner', 'me']), { code: 2, out: [], err: [USAGE] })
  assert.deepEqual(await inProcess(cwd, ['init', 'checkout', '--base']), { code: 2, out: [], err: [USAGE] })
  assert.deepEqual(await inProcess(cwd, ['init', 'checkout', '--title', 'a', '--title', 'b']), { code: 2, out: [], err: [USAGE] })
  assert.equal(existsSync(tracking(cwd)), false)
})

test('skraft init without a slug refuses an invalid skraft-config.json and leaves it as it was', async (t) => {
  const cwd = workingCopy(t)
  writeFileSync(join(cwd, 'skraft-config.json'), '{"components": {}}')

  assert.deepEqual(await inProcess(cwd, ['init']), { code: 1, out: [], err: ['skraft-config.json is invalid: components must be an array'] })
  assert.equal(readFileSync(join(cwd, 'skraft-config.json'), 'utf8'), '{"components": {}}')
})

test('skraft status prints the view of the active pipeline, as text or JSON', async (t) => {
  const cwd = workingCopy(t)
  assert.deepEqual(await inProcess(cwd, ['status']), {
    code: 0,
    out: ['skraft: idle', 'RESEARCH  pending', 'no active pipeline in this working copy (.copilot-tracking/skraft-plans/.active-slug); start one with an explicit slug'],
    err: [],
  })

  await inProcess(cwd, ['init', 'checkout'])
  const json = await inProcess(cwd, ['status', '--json'])
  assert.equal(json.code, 0)
  assert.deepEqual(JSON.parse(json.out.join('\n')), {
    slug: 'checkout', status: 'running', reason: '', phases: [{ phase: 'RESEARCH', state: 'pending' }], current: null, attempts: 0, costUsd: null,
  })
  assert.deepEqual((await inProcess(cwd, ['status'])).out, ['skraft checkout: running', 'RESEARCH  pending'])
})

test('skraft status says the journal is tampered and exits 1', async (t) => {
  const cwd = workingCopy(t)
  await inProcess(cwd, ['init', 'checkout'])
  const journal = tracking(cwd, 'checkout', 'events.jsonl')
  writeFileSync(journal, readFileSync(journal, 'utf8').replace('"prev":null', '"prev":"0"'))

  const run = await inProcess(cwd, ['status'])

  assert.equal(run.code, 1)
  assert.deepEqual(run.out.slice(0, 1), ['skraft checkout: tampered'])
  assert.equal(run.out.at(-1), 'journal tampered: events.jsonl line 1 does not open the chain; restore the file or start a new slug')
})

test('the skraft executable runs init and status from the working directory', (t) => {
  const cwd = workingCopy(t)
  const skraft = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' })

  const init = skraft('init', 'checkout')
  assert.equal(init.status, 0, init.stderr)
  assert.equal(init.stdout, 'checkout is the active pipeline\n')
  assert.equal(skraft('status').stdout, 'skraft checkout: running\nRESEARCH  pending\n')
})
