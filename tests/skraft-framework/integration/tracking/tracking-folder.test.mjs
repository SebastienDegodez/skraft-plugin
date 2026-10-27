import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createNodeAdapters } from '../../../../plugins/skraft-framework/engine/infrastructure/node-adapters.mjs'

const pluginRoot = fileURLToPath(new URL('../../../../plugins/skraft-framework/', import.meta.url))

const adaptersIn = (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'skraft-tracking-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  return { cwd, adapters: createNodeAdapters({ cwd, pluginRoot }), base: join(cwd, '.copilot-tracking', 'skraft-plans') }
}

test('the journal is appended line by line under the slug folder and read back without line endings', async (t) => {
  const { adapters, base } = adaptersIn(t)
  assert.deepEqual(await adapters.journal.lines('checkout'), [])

  await adapters.journal.append('checkout', '{"a":1}')
  await adapters.journal.append('checkout', '{"b":2}')

  assert.equal(readFileSync(join(base, 'checkout', 'events.jsonl'), 'utf8'), '{"a":1}\n{"b":2}\n')
  writeFileSync(join(base, 'checkout', 'events.jsonl'), '{"a":1}\r\n\r\n{"b":2}\r\n')
  assert.deepEqual(await adapters.journal.lines('checkout'), ['{"a":1}', '{"b":2}'])
})

test('.active-slug names the active pipeline only when it holds a kebab-case slug', async (t) => {
  const { adapters, base } = adaptersIn(t)
  assert.equal(await adapters.activePipeline.current(), null)

  await adapters.activePipeline.activate('checkout')
  assert.equal(readFileSync(join(base, '.active-slug'), 'utf8'), 'checkout\n')
  assert.equal(await adapters.activePipeline.current(), 'checkout')

  writeFileSync(join(base, '.active-slug'), '../escape\n')
  assert.equal(await adapters.activePipeline.current(), null)
})

test('tracking files live under the slug folder; the location is the absolute native path', async (t) => {
  const { adapters, base } = adaptersIn(t)
  assert.equal(await adapters.files.read('checkout', 'research/2026-10-11/checkout-research.md'), null)

  await adapters.files.write('checkout', 'research/2026-10-11/checkout-research.md', 'Findings.\n')

  const location = adapters.files.location('checkout', 'research/2026-10-11/checkout-research.md')
  assert.equal(location, join(base, 'checkout', 'research', '2026-10-11', 'checkout-research.md'))
  assert.equal(readFileSync(location, 'utf8'), 'Findings.\n')
  assert.equal(await adapters.files.read('checkout', 'research/2026-10-11/checkout-research.md'), 'Findings.\n')
})

test('the files under a tracking folder are listed at any depth, relative to the slug folder, sorted', async (t) => {
  const { adapters } = adaptersIn(t)
  assert.deepEqual(await adapters.files.list('checkout', 'research'), [])

  await adapters.files.write('checkout', 'research/2026-10-12/b notes.md', 'b\n')
  await adapters.files.write('checkout', 'research/2026-10-11/a.md', 'a\n')
  await adapters.files.write('checkout', 'research/top.md', 'top\n')
  await adapters.files.write('checkout', 'plan/plan.md', 'plan\n')

  assert.deepEqual(await adapters.files.list('checkout', 'research'), ['research/2026-10-11/a.md', 'research/2026-10-12/b notes.md', 'research/top.md'])
  assert.deepEqual(await adapters.files.list('checkout', 'research/2026-10-11/'), ['research/2026-10-11/a.md'])
  assert.deepEqual(await adapters.files.list('checkout', 'research/top.md'), [])
  assert.deepEqual(await adapters.files.list('other', 'research'), [])
})

test('a tracking path that cannot be read for another reason than absence fails loudly', async (t) => {
  const { adapters, base } = adaptersIn(t)
  mkdirSync(join(base, 'checkout', 'events.jsonl'), { recursive: true })

  await assert.rejects(adapters.journal.lines('checkout'), { code: 'EISDIR' })
})

test('templates come from the plugin; the hasher is SHA-256 hex; the clock is the system time', async (t) => {
  const { adapters } = adaptersIn(t)

  assert.equal(await adapters.templates.read('research.template.md'), readFileSync(join(pluginRoot, 'assets', 'templates', 'research.template.md'), 'utf8'))
  assert.equal(await adapters.templates.read('missing.template.md'), null)
  assert.equal(await adapters.hasher.sha256('événement'), createHash('sha256').update('événement', 'utf8').digest('hex'))
  const before = Date.now()
  const now = adapters.clock.now().getTime()
  assert.ok(now >= before && now <= Date.now())
})

test('a tracking path that climbs out of the slug folder is refused before any file is touched', async (t) => {
  const { adapters, cwd } = adaptersIn(t)

  await assert.rejects(async () => adapters.files.write('checkout', 'reviews/../../../escape-1/changes.patch', 'x'), /leaves the tracking folder/)
  assert.throws(() => adapters.files.location('checkout', '../other/events.jsonl'), /leaves the tracking folder/)
  await assert.rejects(async () => adapters.files.read('checkout', 'C:\\escape.md'), /leaves the tracking folder/)
  assert.deepEqual(readdirSync(cwd).filter((name) => name.startsWith('escape')), [])
})

test('a working-copy path that is no regular file is refused instead of read', async (t) => {
  const { adapters, cwd } = adaptersIn(t)
  mkdirSync(join(cwd, 'vendor', 'payments-sdk'), { recursive: true })

  await assert.rejects(adapters.workspace.read('vendor/payments-sdk'), /is not a regular file/)
  assert.equal(await adapters.workspace.read('vendor/missing.md'), null)
})

test('the pipelines of the tracking folder are its kebab-case slug folders that hold a file, sorted', async (t) => {
  const { adapters, base } = adaptersIn(t)
  assert.deepEqual(await adapters.files.pipelines(), [])

  for (const [folder, file] of [['refund', 'state.json'], ['checkout-flow', 'plans/2026-09-01/stories-m1.md'], ['Not_A_Slug', 'state.json'], ['empty', null]]) {
    mkdirSync(join(base, folder), { recursive: true })
    if (file !== null) {
      mkdirSync(join(base, folder, file, '..'), { recursive: true })
      writeFileSync(join(base, folder, file), '{}')
    }
  }
  writeFileSync(join(base, '.active-slug'), 'refund\n')
  writeFileSync(join(base, 'notes'), 'a file beside the slug folders\n')

  assert.deepEqual(await adapters.files.pipelines(), ['checkout-flow', 'refund'])
})
