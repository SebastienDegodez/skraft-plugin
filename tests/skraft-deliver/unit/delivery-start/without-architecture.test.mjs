import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDeliveryStart } from '../../../../plugins/skraft-deliver/engine/application/delivery-start.mjs'

test('sans brief, la story démarre à DISTILL en signalant l’absence d’architecture', async () => {
  const starts = []
  const delivery = createDeliveryStart({
    architecture: { find: async () => null },
    pipeline: { start: async (request) => { starts.push(request); return { status: 'started' } } },
  })

  const outcome = await delivery.start({ issue: 42 })

  assert.equal(outcome.status, 'started')
  assert.match(outcome.notice, /architecture/i)
  assert.deepEqual(starts, [{ issue: 42, entry: 'distill', architecture: null }])
})
