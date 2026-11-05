import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, nominal, scripted, SLUG } from '../support/pipeline-host.mjs'

const CARD = 'docs/features/checkout/pay-by-card.feature'
const LATER = 'docs/features/pay-later.feature'

const SCENARIO = [
  'Feature: Pay by card',
  '',
  '  Scenario: A returning customer pays a basket with a valid card',
  '    Given a returning customer with a valid card',
  '    When a basket of 10000 cents is paid',
  '    Then the payment is accepted for 10000 cents',
  '',
].join('\n')

const PAY_LATER = [
  'Feature: Pay later',
  '',
  '  Scenario: A returning customer defers a basket',
  '    Given a returning customer with an open credit',
  '    When a basket of 10000 cents is deferred',
  '    Then the basket is held for 30 days',
  '',
].join('\n')

const PLAN = 'details/2026-10-11/test-plan-checkout.md'
const CRITERIA = 'plans/2026-10-11/ac-draft-checkout.md'
const ONE_CRITERION = '# Acceptance criteria — checkout\n\n## AC-1 — A card is paid\n'

/** A coverage matrix naming one `.feature` per row, as `test-design-mandates` lays it out. @param {string[]} cited */
const matrix = (cited) => ['| # | Scenario | Feature File |', ...cited.map((name, index) => `| ${index + 1} | A card is paid | \`${name}\` |`)].join('\n')

/**
 * An acceptance designer that writes its test plan, its acceptance criteria and the Gherkin files
 * given, drops the working copy files named, and commits the lot beside its acceptance test.
 * @param {{ features?: Record<string, string>, cited?: string[], criteria?: string, tracked?: Record<string, string>, drop?: string[] }} [attempt]
 */
const designer = ({ features = {}, cited = ['pay-by-card.feature'], criteria = ONE_CRITERION, tracked = {}, drop = [] } = {}) => agent({
  fill: false,
  work: ({ git, workspace, tracking }) => {
    tracking.write(SLUG, PLAN, `${matrix(cited)}\n`)
    tracking.write(SLUG, CRITERIA, criteria)
    for (const [path, text] of Object.entries(tracked)) tracking.write(SLUG, path, text)
    for (const path of drop) workspace.files.delete(path)
    for (const [path, text] of Object.entries(features)) workspace.files.set(path, text)
    git.commit('test(checkout): acceptance of the card payment', ['tests/Acceptance/CheckoutAcceptanceTests.cs', ...Object.keys(features)])
  },
})

/** The attempts of DISTILL: what each one was told, in order. @param {{ events: () => Array<Record<string, any>> }} host */
const distill = (host) => host.events()
  .filter((event) => event.type === 'step.recorded' && event.step === 'distill')
  .map(({ attempt, outcome, code, failures }) => [attempt, outcome, code, failures])

/** A run whose DISTILL step is the designers given, one per attempt. @param {Array<(host: any) => () => Promise<any>>} attempts */
const runOf = (attempts) => scripted({}, (it) => [...nominal(it).slice(0, 2), ...attempts.map((made) => made(it)), ...nominal(it).slice(3)])

test('a test plan that names a .feature the working copy does not hold sends the designer back, for a features folder it has not got and for a file no context holds, and goes on once each is written where the plan says', async () => {
  const host = runOf([
    designer({ cited: ['pay-by-card.feature', 'pay-later.feature'], drop: ['docs/features/.gitkeep'] }),
    designer({ cited: ['pay-by-card.feature', 'pay-later.feature'], features: { [CARD]: SCENARIO } }),
    designer({ cited: ['pay-by-card.feature', 'pay-later.feature'], features: { [CARD]: SCENARIO, [LATER]: PAY_LATER } }),
  ])

  const outcome = await host.start()

  assert.deepEqual(distill(host), [
    [1, 'failed', 'gherkin-records', [
      `${PLAN} names pay-by-card.feature, which is no .feature of the working copy (#524)`,
      `${PLAN} names pay-later.feature, which is no .feature of the working copy (#524)`,
      `${CRITERIA} declares 1 acceptance criterion, and 0 scenarios are written for it (#524)`,
    ]],
    [2, 'failed', 'gherkin-records', [`${PLAN} names pay-later.feature, which is no .feature of the working copy (#524)`]],
    [3, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done', outcome.reason)
})

test('a test plan that names no .feature is asked for none: the designer goes on with its acceptance test alone', async () => {
  const plain = agent({ work: ({ git }) => git.commit('test(checkout): acceptance of the card payment', ['tests/Acceptance/CheckoutAcceptanceTests.cs']) })
  const host = runOf([plain])

  const outcome = await host.start()

  assert.deepEqual(distill(host), [[1, 'done', null, []]])
  assert.equal(outcome.status, 'done', outcome.reason)
})

test('a scenario that does not say Given, When and Then sends the designer back, one line per keyword it leaves unsaid, an outline named as one', async () => {
  const unsaid = [
    'Feature: Pay by card',
    '',
    '  Scenario: A card is paid',
    '    Given a returning customer with a valid card',
    '    When a basket of 10000 cents is paid',
    '',
    '  Scenario: A card is refused',
    '',
    '  Scenario Outline: A basket of <amount> is paid',
    '    Given a returning customer with a valid card',
    '    When a basket of <amount> cents is paid',
    '',
    '    Examples:',
    '      | amount |',
    '      | 10000  |',
    '',
  ].join('\n')
  const host = runOf([designer({ features: { [CARD]: unsaid } }), designer({ features: { [CARD]: SCENARIO } })])

  const outcome = await host.start()

  assert.deepEqual(distill(host), [
    [1, 'failed', 'gherkin-records', [
      `${CARD}: scenario "A card is paid" says no Then (#524)`,
      `${CARD}: scenario "A card is refused" says no Given (#524)`,
      `${CARD}: scenario "A card is refused" says no When (#524)`,
      `${CARD}: scenario "A card is refused" says no Then (#524)`,
      `${CARD}: outline "A basket of <amount> is paid" says no Then (#524)`,
    ]],
    [2, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done', outcome.reason)
})

test('an outline whose examples do not fill a placeholder it opens sends the designer back, whether its examples name another column, hold none at all, or the outline is written as a template', async () => {
  const outlines = [
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
    '  Scenario Outline: A basket of <amount> is refused',
    '    Given a card the bank refuses',
    '    When a basket of <amount> cents is paid',
    '    Then the payment is refused',
    '',
    '  Scenario Template: A basket of <amount> is deferred by <method>',
    '    Given a returning customer with an open credit',
    '    When a basket of <amount> cents is deferred',
    '    Then the basket is held for 30 days',
    '',
    '    Examples:',
    '      | amount |',
    '      | 10000  |',
    '',
  ].join('\n')
  const host = runOf([designer({ features: { [CARD]: outlines } }), designer({ features: { [CARD]: SCENARIO } })])

  const outcome = await host.start()

  assert.deepEqual(distill(host), [
    [1, 'failed', 'gherkin-records', [
      `${CARD}: outline "A basket of <amount> is paid with <method>" leaves <method>, <total> out of its examples (#524)`,
      `${CARD}: outline "A basket of <amount> is refused" leaves <amount> out of its examples (#524)`,
      `${CARD}: outline "A basket of <amount> is deferred by <method>" leaves <method> out of its examples (#524)`,
    ]],
    [2, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done', outcome.reason)
})

test('two scenarios of a file under the same title send the designer back, the title named once', async () => {
  const twice = [SCENARIO, SCENARIO.split('\n').slice(2).join('\n')].join('\n')
  const host = runOf([designer({ features: { [CARD]: twice } }), designer({ features: { [CARD]: SCENARIO } })])

  const outcome = await host.start()

  assert.deepEqual(distill(host), [
    [1, 'failed', 'gherkin-records', [
      `${CARD}: two scenarios are titled "A returning customer pays a basket with a valid card" (#524)`,
    ]],
    [2, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done', outcome.reason)
})

test('a story whose criteria outnumber its scenarios sends the designer back, and goes on once each has one', async () => {
  const two = '# Acceptance criteria — checkout\n\n## AC-1 — A card is paid\n\n## AC-2 — A card is refused\n'
  const second = [SCENARIO, '  Scenario: A card is refused', '    Given a card the bank refuses',
    '    When a basket of 10000 cents is paid', '    Then the payment is refused', ''].join('\n')
  const host = runOf([
    designer({ features: { [CARD]: SCENARIO }, criteria: two }),
    designer({ features: { [CARD]: second }, criteria: two }),
  ])

  const outcome = await host.start()

  assert.deepEqual(distill(host), [
    [1, 'failed', 'gherkin-records', [`${CRITERIA} declares 2 acceptance criteria, and 1 scenario is written for them (#524)`]],
    [2, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done', outcome.reason)
})

test("the story is read from what its plan names: the .feature of another context under the same file name, a comment, a step's data table, an angle-bracketed value outside an outline and a stale copy of the criteria are all left alone", async () => {
  const REFUNDS = 'docs/features/refunds/pay-by-card.feature'
  const other = 'Feature: Refund a card\n\n  Scenario: A card is refunded\n    Given a paid basket\n'
  const rich = [
    'Feature: Pay by card',
    '',
    '  Scenario: A returning customer pays a basket with a valid card',
    '    Given a returning customer <ana@acme.test> with a valid card',
    '    When a basket of 10000 cents is paid',
    '    Then the payment is accepted for 10000 cents',
    '',
    '  Scenario Outline: A basket of <amount> is paid by <method>',
    '    # <fee> is decided by the pricing grid, not by this story',
    '    Given a returning customer with the cards:',
    '      | card | state |',
    '      | 4111 | valid |',
    '    When a basket of <amount> cents is paid by <method>',
    '    Then the payment is accepted for <amount>',
    '',
    '    Examples:',
    '      | amount | method |',
    '      | 10000  | card   |',
    '',
  ].join('\n')
  const two = '# Acceptance criteria — checkout\n\n## AC-9 — A card is paid\n\n## AC-10 — A basket is deferred\n'
  const stale = `${two}\n## AC-11 — A card is refused\n\n## AC-12 — A refund is paid back\n`
  const host = runOf([designer({
    features: { 'docs/features/checkout/pay-by-card.feature': rich, [REFUNDS]: other, 'docs/features/checkout/pay-later.feature': PAY_LATER },
    cited: ['docs\\features\\checkout\\pay-by-card.feature', 'pay-later.feature'],
    criteria: two,
    tracked: { 'plans/2026-10-11/ac-draft-checkout.md.orig': stale },
  })])

  const outcome = await host.start()

  assert.deepEqual(distill(host), [[1, 'done', null, []]])
  assert.equal(outcome.status, 'done', outcome.reason)
})
