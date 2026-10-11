import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
