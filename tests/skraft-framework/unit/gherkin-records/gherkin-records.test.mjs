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
const CRITERIA = 'plans/2026-10-11/ac-draft-checkout.md'

/**
 * An acceptance designer whose test plan names `pay-by-card.feature`, writing the Gherkin files
 * given beside its acceptance test.
 * @param {Record<string, string>} features
 */
const designer = (features, criteria = '# Acceptance criteria — checkout\n\n## AC-1 — A card is paid\n') => agent({
  fill: false,
  work: ({ git, workspace, tracking }) => {
    tracking.write(SLUG, PLAN, '| # | Scenario | Feature File |\n| 1 | A card is paid | `pay-by-card.feature` |\n')
    tracking.write(SLUG, CRITERIA, criteria)
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
    [1, 'failed', 'gherkin-records', [
      `${PLAN} names pay-by-card.feature, which is no .feature of the working copy (#524)`,
      `${CRITERIA} declares 1 acceptance criterion, and 0 scenarios are written for it (#524)`,
    ]],
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

test('a scenario that does not say Given, When and Then sends the designer back, one line per scenario', async () => {
  const noThen = [
    'Feature: Pay by card',
    '',
    '  Scenario: A card is paid',
    '    Given a returning customer with a valid card',
    '    When a basket of 10000 cents is paid',
    '',
    '  Scenario: A card is refused',
    '    When a basket of 10000 cents is paid',
    '    Then the payment is refused',
    '',
  ].join('\n')
  const host = scripted({}, (it) => [
    ...nominal(it).slice(0, 2),
    designer({ [FEATURE]: noThen })(it),
    designer({ [FEATURE]: SCENARIO })(it),
    ...nominal(it).slice(3),
  ])

  const outcome = await host.start()

  assert.deepEqual(distill(host), [
    [1, 'failed', 'gherkin-records', [
      `${FEATURE}: scenario "A card is paid" says no Then (#524)`,
      `${FEATURE}: scenario "A card is refused" says no Given (#524)`,
    ]],
    [2, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done', outcome.reason)
})

test('a scenario outline whose placeholder its examples do not fill sends the designer back', async () => {
  const outline = [
    'Feature: Pay by card',
    '',
    '  Scenario Outline: A basket of <amount> is paid with <method>',
    '    Given a returning customer with a valid card',
    '    When a basket of <amount> cents is paid',
    '    Then the payment is accepted for <total>',
    '',
    '    Examples:',
    '      | amount |',
    '      | 10000  |',
    '',
  ].join('\n')
  const host = scripted({}, (it) => [
    ...nominal(it).slice(0, 2),
    designer({ [FEATURE]: outline })(it),
    designer({ [FEATURE]: SCENARIO })(it),
    ...nominal(it).slice(3),
  ])

  const outcome = await host.start()

  assert.deepEqual(distill(host), [
    [1, 'failed', 'gherkin-records', [
      `${FEATURE}: outline "A basket of <amount> is paid with <method>" leaves <method>, <total> out of its examples (#524)`,
    ]],
    [2, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done', outcome.reason)
})

test('two scenarios of a file under the same title send the designer back, the title named once', async () => {
  const twice = [SCENARIO, SCENARIO.split('\n').slice(2).join('\n')].join('\n')
  const host = scripted({}, (it) => [
    ...nominal(it).slice(0, 2),
    designer({ [FEATURE]: twice })(it),
    designer({ [FEATURE]: SCENARIO })(it),
    ...nominal(it).slice(3),
  ])

  const outcome = await host.start()

  assert.deepEqual(distill(host), [
    [1, 'failed', 'gherkin-records', [
      `${FEATURE}: two scenarios are titled "A returning customer pays a basket with a valid card" (#524)`,
    ]],
    [2, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done', outcome.reason)
})

test('a story whose criteria outnumber its scenarios sends the designer back, and goes on once each has one', async () => {
  const two = '# Acceptance criteria — checkout\n\n## AC-1 — A card is paid\n\n## AC-2 — A card is refused\n'
  const second = [SCENARIO, '  Scenario: A card is refused', '    Given a card the bank refuses',
    '    When a basket of 10000 cents is paid', '    Then the payment is refused', ''].join('\n')
  const host = scripted({}, (it) => [
    ...nominal(it).slice(0, 2),
    designer({ [FEATURE]: SCENARIO }, two)(it),
    designer({ [FEATURE]: second }, two)(it),
    ...nominal(it).slice(3),
  ])

  const outcome = await host.start()

  assert.deepEqual(distill(host), [
    [1, 'failed', 'gherkin-records', [`${CRITERIA} declares 2 acceptance criteria, and 1 scenario is written for them (#524)`]],
    [2, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done', outcome.reason)
})

test("a .feature of another story is left alone: only the files this story's plan names are read", async () => {
  const OTHER = 'docs/features/refunds/refund-a-card.feature'
  const broken = 'Feature: Refund a card\n\n  Scenario: A card is refunded\n    Given a paid basket\n'
  const host = scripted({}, (it) => [...nominal(it).slice(0, 2), designer({ [FEATURE]: SCENARIO, [OTHER]: broken })(it), ...nominal(it).slice(3)])

  const outcome = await host.start()

  assert.deepEqual(distill(host), [[1, 'done', null, []]])
  assert.equal(outcome.status, 'done', outcome.reason)
})
