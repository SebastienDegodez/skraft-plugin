import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, API, nominal, scripted, SLUG } from '../support/pipeline-host.mjs'

/** A component that describes its behaviour in Gherkin, which is what the scenarios of this folder are about. */
const GHERKIN = Object.freeze({ ...API, bdd: [{ features: 'docs/features', steps: 'tests/Steps' }] })

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
const runOf = (attempts, components = [GHERKIN]) => scripted({ components }, (it) => [...nominal(it).slice(0, 2), ...attempts.map((made) => made(it)), ...nominal(it).slice(3)])

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

test('an outline whose examples do not fill a placeholder it opens sends the designer back, whether its examples name another column, hold none at all, leave a row unclosed, or the outline is written as a template', async () => {
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
    '  Scenario Outline: A basket of <amount> is paid with <card>',
    '    Given a returning customer with a valid card',
    '    When a basket of <amount> cents is paid with <card>',
    '    Then the payment is accepted',
    '',
    '    Examples:',
    '      | amount | card',
    '      | 10000  | 4111',
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
      `${CARD}: outline "A basket of <amount> is paid with <card>" leaves <amount>, <card> out of its examples (#524)`,
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

test("the story is read from what its plan names: the .feature of another context under the same file name, a scenario, a step, an examples table and a row that are commented out, a step's own data table, an angle-bracketed value outside an outline and a stale copy of its plan and of its criteria are all left alone", async () => {
  const REFUNDS = 'docs/features/refunds/pay-by-card.feature'
  const other = 'Feature: Refund a card\n\n  Scenario: A card is refunded\n    Given a paid basket\n'
  const rich = [
    'Feature: Pay by card',
    '',
    '  Scenario: A returning customer pays a basket with a valid card',
    '    Given  a returning customer <ana@acme.test> with a valid card',
    '    When   a basket of 10000 cents is paid',
    '    Then   the payment is accepted for 10000 cents',
    '',
    '  Scenario Outline: A basket of <amount> is paid by <method>',
    '    # <fee> is decided by the pricing grid, not by this story',
    '    # Examples: of the fee grid live in the pricing story',
    '    Given  a returning customer with the cards:',
    '      | card | state |',
    '      | 4111 | valid |',
    '    When   a basket of <amount> cents is paid by <method>',
    '    Then   the payment is accepted for <amount>',
    '',
    '    Examples:',
    '      # | fee |',
    '      | amount | method |  ',
    '      | 10000  | card   |',
    '',
    '  # Scenario: A basket is paid in instalments',
    '  #   Given  a basket of <instalments> is paid',
    '',
  ].join('\n')
  const two = '# Acceptance criteria — checkout\n\n## AC-9 — A card is paid\n\n## AC-10 — A basket is deferred\n'
  const stale = `${two}\n## AC-11 — A card is refused\n\n## AC-12 — A refund is paid back\n`
  const host = runOf([designer({
    features: { 'docs/features/checkout/pay-by-card.feature': rich, [REFUNDS]: other, 'docs/features/checkout/pay-later.feature': PAY_LATER },
    cited: ['docs\\features\\checkout\\pay-by-card.feature', 'pay-later.feature'],
    criteria: two,
    tracked: { 'plans/2026-10-11/ac-draft-checkout.md.orig': stale, 'details/2026-10-11/test-plan-checkout.md.orig': `${matrix(['pay-by-cheque.feature'])}\n` },
  })])

  const outcome = await host.start()

  assert.deepEqual(distill(host), [[1, 'done', null, []]])
  assert.equal(outcome.status, 'done', outcome.reason)
})

test('a component that writes its tests without Gherkin is asked for no scenario: the plan may name a .feature nobody wrote and DISTILL closes', async () => {
  const attempt = () => designer({ cited: ['pay-by-card.feature'], drop: ['docs/features/.gitkeep'] })
  const unit = runOf([attempt()], [{ ...API, bdd: false }])
  const gherkin = runOf([attempt()])
  const both = runOf([attempt()], [{ ...API, bdd: false }, { ...GHERKIN, name: 'web', root: 'web' }])

  const outcome = await unit.start()

  assert.deepEqual(distill(unit), [[1, 'done', null, []]], 'nothing reads a .feature of a component that declines Gherkin')
  assert.equal(outcome.status, 'done', outcome.reason)
  assert.equal((await gherkin.start()).status, 'blocked', 'the same attempt, in a component that declares Gherkin, is sent back')
  assert.equal((await both.start()).status, 'blocked', 'one component writing Gherkin holds the story to its scenarios, whatever the others write')
})

test('the scenarios live where the component says: the folder of its pair, not a folder the engine picked', async () => {
  const inTests = { ...API, bdd: [{ features: 'tests/Features', steps: 'tests/Steps' }] }
  const named = runOf([designer({ features: { 'tests/Features/checkout/pay-by-card.feature': SCENARIO } })], [inTests])
  const elsewhere = runOf([designer({ features: { [CARD]: SCENARIO } })], [inTests])

  const outcome = await named.start()

  assert.deepEqual(distill(named), [[1, 'done', null, []]], 'the plan names it, the component declares the folder, and the designer wrote it there')
  assert.equal(outcome.status, 'done', outcome.reason)
  assert.equal((await elsewhere.start()).status, 'blocked', 'a .feature under docs/features is nowhere this component reads')
})

test('the folder a component declares is the one the engine creates and the one the designer may write in, wherever it sits', async () => {
  const apart = { ...API, bdd: [{ features: 'specs/features', steps: 'tests/Steps' }] }
  const host = runOf([designer({ features: { 'specs/features/checkout/pay-by-card.feature': SCENARIO } })], [apart])

  const outcome = await host.start()

  assert.deepEqual(distill(host), [[1, 'done', null, []]], 'a folder outside src and tests is still the one the component reads, so the commit is in scope')
  assert.equal(outcome.status, 'done', outcome.reason)
  assert.equal(host.workspace.files.get('specs/features/.gitkeep'), '', 'the engine creates it before the attempt, so an agent whose tools only write into existing folders can')
  assert.deepEqual(host.git.engineCommits.filter(({ message }) => message.startsWith('chore: create')).map(({ paths }) => paths), [['specs/features/.gitkeep']],
    'the engine commits the folders it creates, and creates only those the configuration names')
})

const FRENCH = [
  '# language: fr',
  'Fonctionnalité: Payer par carte',
  '',
  '  Scénario: Un client fidèle paie un panier avec une carte valide',
  '    Soit un client fidèle avec une carte valide',
  '    Quand un panier de 10000 centimes est payé',
  '    Alors le paiement est accepté pour 10000 centimes',
  '',
].join('\n')

test('skraft reads Gherkin in English, and says so instead of reporting a file it cannot read as empty', async () => {
  const foreign = runOf([designer({ features: { [CARD]: FRENCH } })])
  const keywords = runOf([designer({ features: { [CARD]: FRENCH.replace('# language: fr\n', '') } })])

  const outcome = await foreign.start()

  const language = `${CARD} declares # language: fr; skraft reads Gherkin in English (Scenario:, Given/When/Then) (#541)`
  assert.ok(distill(foreign).length > 0)
  for (const [attempt, result, code, failures] of distill(foreign)) {
    assert.deepEqual([result, code, failures], ['failed', 'gherkin-records', [language]],
      `attempt ${attempt}: the language is the only reason given, since a file skraft cannot read says nothing about the story's coverage`)
  }
  assert.equal(outcome.status, 'blocked', outcome.reason)
  await keywords.start()
  assert.deepEqual(distill(keywords)[0][3], [`${CARD} opens no scenario; skraft reads Gherkin in English (Scenario:, Given/When/Then) (#541)`],
    'without the header, the keywords are what skraft cannot read')

  const declared = runOf([designer({ features: { [CARD]: `# language: en\n${SCENARIO}` } })])
  await declared.start()
  assert.deepEqual(distill(declared), [[1, 'done', null, []]], 'a file that declares the language skraft reads is read')
})

test('a story spanning two components is checked against the folders of both, each where its own component reads', async () => {
  const web = { ...API, name: 'web', root: 'web', bdd: [{ features: 'features', steps: 'tests/Steps' }] }
  const SHIP = 'web/features/checkout/ship.feature'
  const shipping = SCENARIO.replace('Pay by card', 'Ship the basket').replace('pays a basket with a valid card', 'ships a paid basket')
  const both = runOf([designer({ cited: ['pay-by-card.feature', 'ship.feature'], features: { [CARD]: SCENARIO, [SHIP]: shipping } })], [GHERKIN, web])
  const half = runOf([designer({ cited: ['pay-by-card.feature', 'ship.feature'], features: { [CARD]: SCENARIO } })], [GHERKIN, web])

  const outcome = await both.start()

  assert.deepEqual(distill(both), [[1, 'done', null, []]], 'each .feature sits under the folder its own component names')
  assert.equal(outcome.status, 'done', outcome.reason)
  await half.start()
  assert.deepEqual(distill(half)[0][3], [`${PLAN} names ship.feature, which is no .feature of the working copy (#524)`],
    'the folder of the second component is read too, so what it does not hold is missing')
})
