import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pipelineHost, SLUG } from '../support/pipeline-host.mjs'

const NO_ACTIVE = 'no active pipeline in this working copy (.copilot-tracking/skraft-plans/.active-slug); start one with an explicit slug'

test('the journal of a working copy with no active pipeline, or of a slug with no journal yet, has no entry and says why', async () => {
  const host = pipelineHost()

  assert.deepEqual(await host.journal(), { slug: null, chain: { state: 'none', lines: 0, unverified: 0, reason: NO_ACTIVE }, entries: [], total: 0 })

  await host.tracking.activate(SLUG)
  assert.deepEqual(await host.journal(), { slug: SLUG, chain: { state: 'none', lines: 0, unverified: 0, reason: `${SLUG} has no journal (events.jsonl)` }, entries: [], total: 0 })
})
