import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nominal, REFS_42, scripted, SLUG } from '../support/pipeline-host.mjs'
import { opening, section } from '../support/description.mjs'
import { layerCounts } from '../../../../plugins/skraft-framework/engine/domain/reporting/test-plan-layers.mjs'

const CONSENTED = { publish: { pullRequest: true, questionVersions: { pullRequest: 2 } } }
const STORY = { story: { issue: 42, title: 'Pay by card' } }
const TEST_PLAN = `details/2026-10-11/test-plan-${SLUG}.md`
const PRUNE_LINE = 'To find the tests that kill no mutant on their own, the developer runs `/skraft:prune-tests` on a component; it proposes, the developer decides each test.'
const HEADING = 'More Domain tests than acceptance tests'

/**
 * A test plan whose rows sit on the layers given, one row each; a layer written `Layer:priority`
 * gives that row its Priority, P1 otherwise. @param {string[]} layers
 */
const planOf = (layers) => [
  '# Test plan — checkout',
  '',
  '| Scenario | Use Case Boundary | Layer | Double Type | Walking Skeleton | Extraction Reason | Priority |',
  '|---|---|---|---|---|---|---|',
  ...layers.map((spec, n) => {
    const [layer, priority = 'P1'] = spec.split(':')
    return `| Scenario ${n + 1} | PayByCard | ${layer} | none | — | — | ${priority} |`
  }),
].join('\n')

/** The body of the pull request a run publishes once its test plan says what the layers give. @param {string | null} plan */
const publishedWith = async (plan) => {
  const host = scripted({ config: CONSENTED }, (it) => nominal(it, REFS_42))
  await host.start(STORY)
  if (plan !== null) {
    await host.tracking.write(SLUG, TEST_PLAN, plan)
    await host.publish()
  }
  return host.tracking.read(SLUG, 'pull-request-body.md')
}

test('the folded run summary ends on a fixed line that suggests the command which prunes the tests', async () => {
  const body = await publishedWith(null)

  assert.ok(section(body, 'Run summary').endsWith(`\n\n${PRUNE_LINE}`), section(body, 'Run summary'))
  assert.equal(opening(body, 'Run summary'), '<details><summary>Run summary</summary>')
  assert.equal(opening(body, HEADING), undefined)
})

test('a test plan with more Domain rows than Application and E2E rows shows the suggestion in the clear, with both counts', async () => {
  const body = await publishedWith(planOf(['Application', 'Domain', 'Domain', 'Infrastructure', 'domain ']))

  assert.equal(opening(body, HEADING), `## ${HEADING}`)
  assert.equal(section(body, HEADING), `The test plans count 3 Domain rows against 1 acceptance row (Application and E2E). ${PRUNE_LINE}`)
  assert.ok(body.indexOf(`## ${HEADING}`) < body.indexOf('## Out of scope and limitations'), body)
  assert.ok(!section(body, 'Run summary').includes(PRUNE_LINE), 'the suggestion leaves the folded run summary')
})

test('Application and E2E rows both count as acceptance rows: as many Domain rows as acceptance rows keep the suggestion folded', async () => {
  for (const layers of [['Application', 'E2E', 'Domain', 'Domain'], ['E2E', 'Domain'], ['Infrastructure', 'API']]) {
    const body = await publishedWith(planOf(layers))

    assert.equal(opening(body, HEADING), undefined, layers.join(', '))
  }
})

test('a Domain row an existing test already covers plans no new Domain test: it leaves the count, and the suggestion stays folded', async () => {
  const body = await publishedWith(planOf(['Application', 'Domain:P2', 'Domain:existing', 'Domain: Existing ', 'E2E:existing']))

  assert.equal(opening(body, HEADING), undefined, body)
  assert.ok(section(body, 'Run summary').endsWith(`\n\n${PRUNE_LINE}`), section(body, 'Run summary'))
})

test('only the rows of a table with a Layer column count: prose, other tables and the totals table say nothing', async () => {
  const plan = [
    'Domain rules first, then the use case.',
    '',
    '| Domain | Note |',
    '|---|---|',
    '| Domain | Domain |',
    '| Domain | Domain |',
    '',
    planOf(['Application', 'Application', 'Domain']),
    '',
    '## Totals',
    '',
    '| Layer | Count | Priority |',
    '|---|---|---|',
    '| Domain | 9 | P2 |',
    '| Domain | 9 | P2 |',
  ].join('\n')

  const body = await publishedWith(plan)

  assert.equal(opening(body, HEADING), undefined, body)
})

test('the rows of every test plan of the run add up', () => {
  const counts = layerCounts([{ path: 'a.md', text: planOf(['Application', 'Domain']) }, { path: 'b.md', text: planOf(['Domain', 'E2E', 'Domain']) }])

  assert.deepEqual(counts, { domain: 3, acceptance: 2 })
})

test('a test plan table counts wherever its Layer column sits and however far it is indented, and it ends on its first line that is not a row', () => {
  const plan = [
    '4. **Test plan.**',
    '',
    '   | Layer | Scenario |',
    '   |---|---|',
    '   | Domain | rule sweep |',
    '',
    '| Scenario | Use Case Boundary | Layer |',
    '|---|---|---|',
    '',
    '| Scenario | Layer |',
    '',
    '| pays | Domain | Domain |',
    '| refunds | Domain | Domain |',
  ].join('\n')

  assert.deepEqual(layerCounts([{ path: 'plan.md', text: plan }]), { domain: 1, acceptance: 0 })
})

test('a table without a Scenario column is no test plan, whatever its Layer column says', () => {
  const totals = ['| Layer | Count |', '|---|---|', '| Domain | 4 |', '| Application | 1 |'].join('\n')

  assert.deepEqual(layerCounts([{ path: 'plan.md', text: totals }]), { domain: 0, acceptance: 0 })
})
