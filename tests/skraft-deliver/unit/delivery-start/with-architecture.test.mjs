import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDeliveryStart } from '../../../../plugins/skraft-deliver/engine/application/delivery-start.mjs'

test('avec un brief valide, la story démarre à DISTILL en recevant son architecture', async () => {
  const starts = []
  const brief = { path: 'docs/architecture/stories/42-checkout.md', status: 'current' }
  const delivery = createDeliveryStart({
    architecture: { find: async () => brief },
    pipeline: { start: async (request) => { starts.push(request); return { status: 'started' } } },
  })

  const outcome = await delivery.start({ issue: 42 })

  assert.equal(outcome.status, 'started')
  assert.deepEqual(starts, [{ issue: 42, entry: 'distill', architecture: brief.path }])
})

test('un ADR remplacé refuse la livraison avec architecture-stale', async () => {
  const starts = []
  const delivery = createDeliveryStart({
    architecture: { find: async () => ({ path: 'docs/architecture/stories/42-checkout.md', status: 'stale' }) },
    pipeline: { start: async (request) => { starts.push(request); return { status: 'started' } } },
  })

  const outcome = await delivery.start({ issue: 42 })

  assert.equal(outcome.code, 'architecture-stale')
  assert.deepEqual(starts, [])
})
