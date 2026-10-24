// The run never has more than MAX_CONCURRENT_AGENTS agents at work: past that the host drops
// sub-agents, and the story writers come back without their file. The others wait their turn.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { MAX_CONCURRENT_AGENTS, PRD_BACKLOG_META, slots } from '../../../plugins/skraft-backlog/prd-backlog/workflow.mjs'

const tick = () => new Promise((resolve) => setTimeout(resolve, 1))

test('at most 8 agents run at once, the others start in arrival order as slots free up', async () => {
  assert.equal(MAX_CONCURRENT_AGENTS, 8)
  assert.deepEqual(PRD_BACKLOG_META.limits, { maxConcurrentSubagents: 8 }, 'the host is told the same ceiling')
  const slot = slots(MAX_CONCURRENT_AGENTS)
  let active = 0
  let peak = 0
  const started = []
  const results = await Promise.all(Array.from({ length: 174 }, (_, index) => slot(async () => {
    started.push(index)
    active += 1
    peak = Math.max(peak, active)
    await tick()
    active -= 1
    return index
  })))
  assert.equal(peak, 8)
  assert.deepEqual(started, results, 'every piece ran, first come first served')
})

test('a piece that fails frees its slot: the ones waiting still run', async () => {
  const slot = slots(1)
  const failing = slot(async () => { await tick(); throw new Error('no answer') })
  const next = slot(async () => 'ran')
  await assert.rejects(failing, /no answer/)
  assert.equal(await next, 'ran')
})
