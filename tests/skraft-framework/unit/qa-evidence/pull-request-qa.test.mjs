import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryCodeHost } from '../support/in-memory-host.mjs'
import { SLUG, agent, scripted } from '../support/pipeline-host.mjs'
import { section } from '../support/description.mjs'
import { writeE2eTrace } from '../support/delivery-trace.mjs'

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

/** A React front end in web/, whose e2e command runs Playwright. */
const WEB = Object.freeze({
  name: 'web', root: 'web', stack: 'react', bdd: false, mocking: { strategy: 'inprocess' },
  paths: { src: ['src'], tests: ['tests'] }, commands: { build: 'npm run build', e2e: 'npx playwright test' },
})

test('the Screenshot column names the themes of each scenario\'s screenshots, light first: those its manifest entry gives to S<n>, else those whose title is the scenario\'s', async () => {
  const shots = [
    { title: 'Card form filled in', theme: 'dark', scenario: 'S1', path: 'skraft-visuals/s1-dark.png' },
    { title: 'Card form filled in', theme: 'light', scenario: 'S1', path: 'skraft-visuals/s1-light.png' },
    { title: 'Customer is refused an expired card', theme: 'dark', path: 'skraft-visuals/s2-dark.png' },
    { title: 'Customer pays by card', theme: 'light', scenario: 'S2', path: 'skraft-visuals/receipt.png' },
  ]
  const designingWeb = async ({ git, tracking }) => {
    git.commit(`test(${SLUG}): acceptance tests S1–S2`, ['web/tests/Integration/WalkingSkeleton.spec.ts', 'web/tests/Acceptance/S1.spec.ts', 'web/tests/Acceptance/S2.spec.ts'], 'Refs: #42')
    await tracking.write(SLUG, IMPL_PLAN, '# Implementation plan\n\n| Group | Scenarios | Rule |\n|---|---|---|\n| 1 | S1, S2 | rule 1 |\n')
  }
  const delivering = async (repos) => {
    for (const { path } of shots) host.workspace.files.set(`web/${path}`, 'PNG')
    host.workspace.files.set('web/skraft-visuals/manifest.json', JSON.stringify({ screenshots: shots }))
    await writeE2eTrace(host, { cwd: 'web', command: WEB.commands.e2e, exitCode: 0, folder: 'logs/runs/deliver-1-9' })
    repos.git.commit(`feat(${SLUG}): S1, S2 rule`, ['web/src/Checkout.tsx', 'web/tests/Checkout.test.tsx'], 'Refs: #42')
  }
  const host = scripted({ components: [WEB], config: { publish: { pullRequest: true, questionVersions: { pullRequest: 2, visuals: 2 }, visuals: true } } }, (it) => [
    ...research(it).slice(0, 2), agent({ plan: TWO.map(([title, , tags]) => [title, 'web', tags]), work: designingWeb })(it),
    agent({ work: delivering })(it),
  ])
  assert.equal((await host.start(STORY)).status, 'done')

  const rows = section(await host.tracking.read(SLUG, 'pull-request.md'), 'Scenario outcomes').split('\n').slice(2)
  assert.deepEqual(rows.map((row) => row.split(' | ').at(-1)), ['light, dark |', 'light, dark |'])
})
