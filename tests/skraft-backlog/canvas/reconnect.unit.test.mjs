// How the panel tries to reach its server again once the connection drops.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createReconnect } from '../../../plugins/skraft-backlog/prd-backlog/canvas/ui/reconnect.mjs'

/**
 * A panel whose connections each open then drop (`true`) or fail at once (`false`), as `outcomes`
 * says in order, then fail at once; the waits it schedules are recorded, and run at once.
 */
const panel = (outcomes = []) => {
  const waits = []
  let givenUp = 0
  const reconnect = createReconnect({
    open: ({ opened, failed }) => {
      if (outcomes.shift()) opened()
      failed()
    },
    schedule: (attempt, ms) => { waits.push(ms); attempt() },
    giveUp: () => { givenUp += 1 },
  })
  return { reconnect, waits, givenUp: () => givenUp }
}

test('a panel that cannot reach its server waits twice as long before each new attempt, then gives up', () => {
  const { reconnect, waits, givenUp } = panel()
  reconnect.start()
  assert.deepEqual(waits, [1500, 3000, 6000, 12000, 24000])
  assert.equal(givenUp(), 1)
})

test('a connection that opens starts the waits over from the shortest', () => {
  const { reconnect, waits, givenUp } = panel([true, false, false, true])
  reconnect.start()
  assert.deepEqual(waits, [1500, 3000, 6000, 1500, 3000, 6000, 12000, 24000])
  assert.equal(givenUp(), 1)
})
