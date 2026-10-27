import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, finding, lenses, nominal, reviews, says, scripted, SLUG, tddCycle } from '../support/pipeline-host.mjs'

test('NEEDS_REWORK returned by the call to review.dot sends the DELIVER agent back with the findings, as a review does', async () => {
  const host = scripted({}, (it) => [...nominal(it), agent({ work: tddCycle(SLUG, 'Refund') })(it)])
  host.agentRunner.review = lenses({
    'test-integrity': [says('test-integrity', 'fail', [finding('F1', 'blocker', 'the refund test asserts nothing', { gate: 'G7', location: 'tests/CheckoutTests.cs:9' })])],
  })

  assert.equal((await host.start()).status, 'done')

  assert.deepEqual(reviews(host).filter(([step]) => step === 'deliver_review'), [['deliver_review', 1, 'needs-rework', 'deliver'], ['deliver_review', 2, 'approved', 'visuals']])
  const started = host.events().filter((event) => event.type === 'step.started' && event.step === 'deliver')
  assert.deepEqual(started.map(({ visit, sentBy, feedback }) => [visit, sentBy, feedback]), [
    [1, undefined, []],
    [2, 'review', ['test-integrity F1 G7 blocker at tests/CheckoutTests.cs:9: the refund test asserts nothing']],
  ])
})
