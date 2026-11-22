import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, API, nominal, scenarioTable, scripted, SLUG } from '../support/pipeline-host.mjs'

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
const RED = 'test(checkout): acceptance of the card payment'

/**
 * An acceptance designer that writes its test plan and the Gherkin files given, and commits them
 * beside its acceptance test, in the one test commit of the story.
 * @param {Record<string, string>} features
 */
const designer = (features) => agent({
  fill: false,
  work: (host) => {
    host.tracking.write(SLUG, PLAN, `| # | Scenario | Feature File |\n| 1 | A card is paid | \`pay-by-card.feature\` |\n${scenarioTable(host, [['A card is paid', undefined, '@walking-skeleton @AC-1']])}`)
    for (const [path, text] of Object.entries(features)) host.workspace.files.set(path, text)
    host.git.commit(RED, ['tests/Acceptance/CheckoutAcceptanceTests.cs', ...Object.keys(features)])
  },
})

/** What each attempt of DISTILL's pass was told, in order. @param {{ events: () => Array<Record<string, any>> }} host */
const distill = (host) => host.events()
  .filter((event) => event.type === 'step.recorded' && event.step === 'distill' && event.group === undefined)
  .map(({ attempt, outcome, code, failures }) => [attempt, outcome, code, failures])

test('the folder a component declares is the one the engine creates and the one the designer may write in, wherever it sits', async () => {
  const apart = { ...API, bdd: [{ features: 'specs/features', steps: 'tests/Steps' }] }
  const host = scripted({ components: [apart] }, (it) => [...nominal(it).slice(0, 2), designer({ 'specs/features/checkout/pay-by-card.feature': SCENARIO })(it), ...nominal(it).slice(3)])

  const outcome = await host.start()

  assert.deepEqual(distill(host), [[1, 'done', null, []]], 'a folder outside src and tests is still the one the component reads, so the commit is in scope')
  assert.equal(outcome.status, 'done', outcome.reason)
  assert.equal(host.workspace.files.get('specs/features/.gitkeep'), '', 'the engine creates it before the attempt, so an agent whose tools only write into existing folders can')
  assert.deepEqual(host.git.engineCommits.filter(({ message }) => message.startsWith('chore: create')).map(({ paths }) => paths), [['specs/features/.gitkeep']],
    'the engine commits the folders it creates, and creates only those the configuration names')
})
