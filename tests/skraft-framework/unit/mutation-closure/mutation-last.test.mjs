import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ScriptedMachine } from '../support/in-memory-host.mjs'
import { agent, lenses, scripted, says, finding, SLUG } from '../support/pipeline-host.mjs'

const DELIVER = ['deliver', 'gates', 'deliver_review', 'mutation']
const delivering = (it) => agent({
  work: ({ git }) => {
    git.commit(`test(${SLUG}): checkout pays by card`, ['tests/CheckoutTests.cs'])
    git.commit(`feat(${SLUG}): checkout pays by card`, ['src/Checkout.cs'])
  },
})(it)
const renaming = (it) => agent({ work: ({ git }) => git.commit(`refactor(${SLUG}): name the card payment`, ['src/Checkout.cs']) })(it)

test('mutation runs once, last, on the code the DELIVER review approved: a review rework goes back through deliver and the gates only', async () => {
  const host = scripted({ machine: new ScriptedMachine() }, (it) => [agent()(it), agent()(it), agent()(it), delivering(it), renaming(it)])
  host.agentRunner.review = lenses({ 'cold-reader': [says('cold-reader', 'fail', [finding('CR1', 'high', 'Checkout reads as a payment')])] })

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  const steps = host.events().filter((event) => event.type === 'step.recorded' && DELIVER.includes(event.step))
  assert.deepEqual(steps.map(({ step, visit, outcome: result, next }) => [step, visit, result, next]), [
    ['deliver', 1, 'done', 'gates'],
    ['gates', 1, 'pass', 'deliver_review'],
    ['deliver_review', 1, 'needs-rework', 'deliver'],
    ['deliver', 2, 'done', 'gates'],
    ['gates', 2, 'pass', 'deliver_review'],
    ['deliver_review', 2, 'approved', 'mutation'],
    ['mutation', 1, 'pass', 'visuals'],
  ])
  assert.deepEqual(host.events().filter((event) => event.type === 'gate.ran' && event.gate === 'mutation').map(({ status }) => status), ['pass'])
})
