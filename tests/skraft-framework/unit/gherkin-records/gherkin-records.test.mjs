import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, API, nominal, scripted, SLUG } from '../support/pipeline-host.mjs'

const FEATURE = 'docs/features/checkout/pay-by-card.feature'

const SCENARIO = [
  'Feature: Pay by card',
  '',
  '  Scenario: A returning customer pays a basket with a valid card',
  '    Given a returning customer with a valid card',
  '    When a basket of 10000 cents is paid',
  '    Then the payment is accepted for 10000 cents',
  '',
].join('\n')

const PLAN = 'details/2026-10-11/test-plan-checkout.md'

/**
 * An acceptance designer whose test plan names `pay-by-card.feature`, writing the Gherkin files
 * given beside its acceptance test.
 * @param {Record<string, string>} features
 */
const designer = (features) => agent({
  fill: false,
  work: ({ git, workspace, tracking }) => {
    tracking.write(SLUG, PLAN, '| # | Scenario | Feature File |\n| 1 | A card is paid | `pay-by-card.feature` |\n')
    for (const [path, text] of Object.entries(features)) workspace.files.set(path, text)
    git.commit('test(checkout): acceptance of the card payment', ['tests/Acceptance/CheckoutAcceptanceTests.cs', ...Object.keys(features)])
  },
})

const distill = (host) => host.events()
  .filter((event) => event.type === 'step.recorded' && event.step === 'distill')
  .map(({ attempt, outcome, code, failures }) => [attempt, outcome, code, failures])

test('a test plan that names a .feature the working copy does not hold sends the designer back, and goes on once it does', async () => {
  const host = scripted({}, (it) => [
    ...nominal(it).slice(0, 2),
    designer({})(it),
    designer({ [FEATURE]: SCENARIO })(it),
    ...nominal(it).slice(3),
  ])

  const outcome = await host.start()

  assert.deepEqual(distill(host), [
    [1, 'failed', 'gherkin-records', [`${PLAN} names pay-by-card.feature, which is no .feature of the working copy (#524)`]],
    [2, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done', outcome.reason)
})

test('a test plan that names no .feature is asked for none: the designer goes on with its acceptance test alone', async () => {
  const plain = agent({ work: ({ git }) => git.commit('test(checkout): acceptance of the card payment', ['tests/Acceptance/CheckoutAcceptanceTests.cs']) })
  const host = scripted({}, (it) => [...nominal(it).slice(0, 2), plain(it), ...nominal(it).slice(3)])

  const outcome = await host.start()

  assert.deepEqual(distill(host), [[1, 'done', null, []]])
  assert.equal(outcome.status, 'done', outcome.reason)
})
