import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryCodeHost } from '../support/in-memory-host.mjs'
import { SLUG, agent, scripted } from '../support/pipeline-host.mjs'
import { section } from '../support/description.mjs'

const research = (it) => [agent()(it), agent()(it), agent()(it)]
const CONSENTED = { publish: { pullRequest: true, questionVersions: { pullRequest: 2 } } }
const STORY = { story: { issue: 42, title: 'Pay by card' } }
const TWO = [['Customer pays by card', 'api', '@walking-skeleton @AC-1'], ['Customer is refused an expired card', 'api', '@error-case @AC-2 @AC-3']]
const IMPL_PLAN = 'details/2026-10-11/impl-plan-checkout.md'
const TEST_PLAN = 'details/2026-10-11/test-plan-checkout.md'
const designing = async ({ git, tracking }) => {
  git.commit(`test(${SLUG}): acceptance tests S1–S2`, ['tests/Integration/WalkingSkeletonTests.cs', 'tests/Acceptance/S1AcceptanceTests.cs', 'tests/Acceptance/S2AcceptanceTests.cs'], 'Refs: #42')
  await tracking.write(SLUG, IMPL_PLAN, '# Implementation plan\n\n| Group | Scenarios | Rule |\n|---|---|---|\n| 1 | S1, S2 | rule 1 |\n')
  await tracking.write(SLUG, TEST_PLAN, `${await tracking.read(SLUG, TEST_PLAN)}\n## Examples\n\n${PLAN_EXAMPLES}\n`)
}
/** What a real test plan holds beside its Scenarios table: enough examples to pass Azure DevOps' 4,000 characters. */
const PLAN_EXAMPLES = Array.from({ length: 40 }, (_, at) => `- card ending ${String(1000 + at)} expiring 0${(at % 9) + 1}/2${at % 10}: ${at % 3 === 0 ? 'refused, expired' : 'paid, receipt sent'}`).join('\n')
const SUITE_LOG = 'Passed CheckoutTests.S1_pays_by_card [12 ms]\nPassed CheckoutTests.refuses_expired_card [3 ms]\n'

/** A story of two scenarios through to its pull request, on the forge given, its suite's run as `edit` leaves it. */
const published = async ({ codeHost = new InMemoryCodeHost(), edit = (run) => run } = {}) => {
  const host = scripted({ config: CONSENTED, codeHost }, (it) => [
    ...research(it).slice(0, 2), agent({ plan: TWO, work: designing })(it),
    agent({ work: ({ git }) => git.commit(`feat(${SLUG}): S1, S2 rule`, ['src/Checkout.cs', 'tests/Unit/CheckoutTests.cs'], 'Refs: #42'), trace: { log: (run) => (run.gate === 'test' ? SUITE_LOG : ''), edit: (run) => (run.gate === 'test' ? edit({ ...run, durationMs: 45_400 }) : run) } })(it),
  ])
  const outcome = await host.start(STORY)
  assert.equal(outcome.status, 'done', outcome.reason)
  return host
}

const ROWS = [
  '| # | Scenario | AC | Component | RED | Green | Final run | Named in log | Screenshot |',
  '| ---: | --- | --- | --- | --- | --- | --- | --- | --- |',
  '| S1 | Customer pays by card | `@AC-1` | api | `root-1` | `root-2` | r4 on `root-2` | yes | — |',
  '| S2 | Customer is refused an expired card | `@AC-2` `@AC-3` | api | `root-1` | `root-2` | r4 on `root-2` | no | — |',
]

test('the pull request says in one visible line how many scenarios passed on the final commit and by which run, and folds the table that traces each one from its criteria to that run', async () => {
  const host = await published()
  const body = await host.tracking.read(SLUG, 'pull-request-body.md')

  assert.equal(section(body, 'QA'), [
    'QA: 2/2 scenarios passed on `root-2` (run r4, 45 s).',
    '',
    `Test plan: \`${TEST_PLAN}\` in the tracking folder, its whole text under Tests.`,
    '',
    'Delivered is not deployed: these runs prove the tests on the final commit, nothing about an environment.',
  ].join('\n'))
  assert.ok(body.includes('<details><summary>Scenario outcomes: 2/2</summary>'), body)
  assert.equal(section(body, 'Scenario outcomes'), ROWS.join('\n'))
  assert.ok(section(body, 'Tests').startsWith(`From \`${TEST_PLAN}\` in the tracking folder:`), 'the test plan stays whole under Tests')
})

test('a suite that failed on the final commit leaves every scenario not proven, and the visible line says none passed', async () => {
  const host = await published({ edit: (run) => ({ ...run, exitCode: 1 }) })
  const body = await host.tracking.read(SLUG, 'pull-request-body.md')

  assert.ok(section(body, 'QA').startsWith('QA: 0/2 scenarios passed on `root-2` (run r4, 45 s).'), section(body, 'QA'))
  assert.equal(section(body, 'Scenario outcomes').split('\n')[2], '| S1 | Customer pays by card | `@AC-1` | api | `root-1` | `root-2` | not proven: the whole test suite failed on the final commit | yes | — |')
})

test('on Azure DevOps, whose description takes 4,000 characters, the QA line stays in the description and the scenario table goes to a thread of the run details', async () => {
  const azure = new InMemoryCodeHost({ bodyLimit: 4_000, commentLimit: 140_000, attachesFiles: false, link: (issue, closes) => `${closes ? 'Fixes ' : ''}#${issue}`, takesRequestFile: true })
  const host = await published({ codeHost: azure })

  const body = host.codeHost.pullRequests[0].body
  assert.ok(body.length <= 4_000, `${body.length}`)
  assert.ok(body.includes('## QA\n\nQA: 2/2 scenarios passed on `root-2` (run r4, 45 s).'), body)
  assert.ok(!body.includes('<summary>Scenario outcomes'), body)
  const thread = host.codeHost.pullRequestComments.find((comment) => comment.body.includes('<summary>Scenario outcomes'))
  assert.ok(thread !== undefined, host.codeHost.pullRequestComments.map((comment) => comment.body.slice(0, 200)).join('\n---\n'))
  assert.equal(section(thread.body, 'Scenario outcomes'), ROWS.join('\n'))
})
