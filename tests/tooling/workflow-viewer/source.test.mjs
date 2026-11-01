import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readWorkflow } from '../../../plugins/skraft-framework/engine/domain/workflow/workflow.mjs'
import { chooseSource, fetchLive, liveUrl, LIVE_LIMIT_BYTES } from '../../../docs/website/src/components/WorkflowViewer/source.mjs'

const PIPELINE = readFileSync(new URL('../../../plugins/skraft-framework/workflows/pipeline.skraft.dot', import.meta.url), 'utf8')
const NEWER = PIPELINE.replace('goal_gate=true, locked=true, phase="DELIVER"', 'goal_gate=true, locked=true, phase="DELIVER", shiny="yes"')
const BUNDLED = PIPELINE.replace('goal="Deliver the story"', 'goal="Bundled copy"')
const read = (text) => readWorkflow(text)

const response = (status, text, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: new Headers(headers), text: async () => text })

describe('where the viewer reads a workflow from', () => {
  test('the live copy is fetched from raw GitHub at the version ref', () => {
    assert.equal(liveUrl('integration/v2-next', 'pipeline'), 'https://raw.githubusercontent.com/SebastienDegodez/skraft-plugin/integration/v2-next/plugins/skraft-framework/workflows/pipeline.skraft.dot')
  })

  test('the live copy wins when the engine reads it', () => {
    const source = chooseSource({ live: { ok: true, text: PIPELINE }, bundled: BUNDLED, read })
    assert.equal(source.origin, 'live')
    assert.equal(source.reason, null)
    assert.equal(source.workflow.goal, 'Deliver the story')
  })

  test('a live copy the engine refuses falls back to the bundled copy', () => {
    const source = chooseSource({ live: { ok: true, text: NEWER }, bundled: BUNDLED, read })
    assert.deepEqual([source.origin, source.reason, source.workflow.goal], ['bundled', 'refused', 'Bundled copy'])
  })

  test('a failed fetch falls back to the bundled copy and keeps its fixed reason', () => {
    const source = chooseSource({ live: { ok: false, code: 'timeout' }, bundled: BUNDLED, read })
    assert.deepEqual([source.origin, source.reason, source.workflow.goal], ['bundled', 'timeout', 'Bundled copy'])
  })

  test('with neither copy readable nothing is drawn', () => {
    const source = chooseSource({ live: { ok: false, code: 'network' }, bundled: null, read })
    assert.deepEqual([source.origin, source.reason, source.workflow], ['none', 'network', null])
  })
})

describe('the live fetch', () => {
  test('returns the text of a 200 response', async () => {
    const live = await fetchLive('u', { fetch: async () => response(200, PIPELINE) })
    assert.deepEqual(live, { ok: true, text: PIPELINE })
  })

  test('refuses another status', async () => {
    assert.deepEqual(await fetchLive('u', { fetch: async () => response(404, 'nope') }), { ok: false, code: 'http-status' })
  })

  test('refuses a body over the limit, announced or not', async () => {
    const big = 'x'.repeat(LIVE_LIMIT_BYTES + 1)
    assert.deepEqual(await fetchLive('u', { fetch: async () => response(200, big) }), { ok: false, code: 'too-large' })
    assert.deepEqual(await fetchLive('u', { fetch: async () => response(200, '', { 'content-length': String(LIVE_LIMIT_BYTES + 1) }) }), { ok: false, code: 'too-large' })
    assert.equal(LIVE_LIMIT_BYTES, 256 * 1024)
  })

  test('turns a network error into a fixed code, never its message', async () => {
    const live = await fetchLive('u', { fetch: async () => { throw new TypeError('secret detail') } })
    assert.deepEqual(live, { ok: false, code: 'network' })
  })

  test('gives up after the timeout', async () => {
    const hang = (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)))
    const started = Date.now()
    assert.deepEqual(await fetchLive('u', { fetch: hang, timeoutMs: 30 }), { ok: false, code: 'timeout' })
    assert.ok(Date.now() - started < 2000)
  })
})
