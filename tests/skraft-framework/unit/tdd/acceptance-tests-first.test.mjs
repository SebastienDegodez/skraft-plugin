import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUILT_IN_WORKFLOW, InMemoryGit, ScriptedMachine } from '../support/in-memory-host.mjs'
import { openJournal } from '../../../../plugins/skraft-framework/engine/application/journal/run-journal.mjs'
import { API, REFS_42, SLUG, TRACKING, agent, scripted, tddCycle } from '../support/pipeline-host.mjs'
import { waitingOnEnvironment } from '../support/decisions.mjs'

const unavailable = () => ({ ok: false, unavailable: true, text: '' })
const research = (it) => [agent()(it), agent()(it)]
const recorded = (host, step) => host.events().filter((event) => event.type === 'step.recorded' && event.step === step)
const checked = (host, step) => host.events().filter((event) => event.type === 'commits.checked' && event.step === step)
const labels = (host) => host.agentRunner.dispatches.map(({ label }) => label)
const promptOf = (host, label) => host.agentRunner.dispatches.find((dispatch) => dispatch.label === label).prompt
const THREE = [['Customer pays by card'], ['Customer is refused an expired card', 'api', '@error-case'], ['Customer gets a receipt', 'api', '@happy-path']]
const WEB = { name: 'web', root: 'web', stack: 'react', bdd: false, paths: { src: ['src'], tests: ['tests'] }, commands: { test: 'npx vitest run', mutation: 'npx stryker run' } }
const PLAN = 'details/2026-10-11/test-plan-checkout.md'
const IMPL_PLAN = 'details/2026-10-11/impl-plan-checkout.md'
/** The one red of the plan's pass: the walking skeleton and the acceptance test of each scenario given, as the acceptance designer commits them. */
const reds = (count = 1, files = ['tests/Integration/WalkingSkeletonTests.cs', ...Array.from({ length: count }, (_, at) => `tests/Acceptance/S${at + 1}AcceptanceTests.cs`)], body = '') => ({ git }) => git.commit(`test(${SLUG}): acceptance tests S1–S${count}`, files, body)
/** The implementation plan's groups, each its scenarios' cell, written beside the test plan. @param {string[]} cells */
const grouped = (...cells) => ({ tracking }) => tracking.write(SLUG, IMPL_PLAN, `# Implementation plan\n\n| Group | Scenarios | Rule |\n|---|---|---|\n${cells.map((cell, at) => `| ${at + 1} | ${cell} | rule ${at + 1} |`).join('\n')}\n`)
/** The designer's pass: the red of `count` scenarios, then the groups given. */
const designing = (count, ...cells) => async (host) => { reds(count)(host); if (cells.length > 0) await grouped(...cells)(host) }
/** The green of a group, as the software engineer commits it: its subject starts with the group's scenarios. @param {string} label @param {string[]} [files] @param {string} [body] */
const greenOf = (label, files = [`src/${label.replace(/\W+/g, '')}.cs`, `tests/Unit/${label.replace(/\W+/g, '')}Tests.cs`], body = '') => ({ git }) => git.commit(`feat(${SLUG}): ${label} rule`, files, body)

test('a story of three scenarios in two groups is delivered in one dispatch after one red holding every acceptance test: one green for every group, once all of them pass', async () => {
  const host = scripted({}, (it) => [...research(it), agent({ plan: THREE, work: designing(3, 'S1, S2', 'S3') })(it), agent()(it)])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(labels(host).filter((label) => /distill|deliver/.test(label)), [`skraft ${SLUG} · distill · attempt 1`, `skraft ${SLUG} · deliver · attempt 1`])
  assert.deepEqual([...checked(host, 'distill'), ...checked(host, 'deliver')].map((event) => event.commits.map(({ subject, kind, verdict }) => [subject, kind, verdict])), [
    [['test(checkout): acceptance tests S1–S3', 'red', 'ok']],
    [['feat(checkout): S1, S2, S3 delivered', 'green', 'ok']],
  ])
  assert.deepEqual(recorded(host, 'distill').map(({ group, next, groups }) => [group, next, groups]), [[undefined, 'distill_review', [{ index: 1, scenarios: [1, 2] }, { index: 2, scenarios: [3] }]]], 'the plan leaves by its edge to the review')
  assert.deepEqual(host.events().filter((event) => event.type === 'phase.closed').map(({ phase }) => phase), ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER', 'PUBLISH'])
  assert.deepEqual(recorded(host, 'deliver').map(({ group, green, next }) => [group, green, next]), [[undefined, { group: 2 }, 'deliver_review']])
  assert.deepEqual(host.events().filter((event) => event.type === 'step.started' && event.step === 'deliver').map(({ group, groups }) => [group, groups]), [[undefined, undefined]])
})

test('an implementation plan with no group table delivers every scenario in the one dispatch, in one green', async () => {
  const host = scripted({}, (it) => [...research(it), agent({ plan: THREE.slice(0, 2), work: designing(2) })(it), agent()(it)])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(labels(host).filter((label) => /deliver/.test(label)), [`skraft ${SLUG} · deliver · attempt 1`])
  assert.deepEqual(checked(host, 'deliver')[0].commits.map(({ subject, verdict }) => [subject, verdict]), [['feat(checkout): S1, S2 delivered', 'ok']])
})

test('a group table that misses a scenario, names one twice, one the test plan does not list, or leaves S1 out of the first group sends the designer back', async () => {
  const host = scripted({}, (it) => [...research(it), agent({ plan: THREE, work: designing(3, 'S2', 'S2–S4') })(it), unavailable])

  await host.start()

  assert.deepEqual(recorded(host, 'distill').map(({ code, failures }) => [code, failures]), [['scenarios', [
    `${IMPL_PLAN}: S1 is in no group`,
    `${IMPL_PLAN}: S2 is in more than one group`,
    `${IMPL_PLAN}: S4 is no scenario of the test plan`,
    `${IMPL_PLAN}: S1 is in the first group, the one the walking skeleton walks`,
  ]]])
})

test('the engineer is told every group, the acceptance tests it never changes, the walking skeleton and the one exact green of the story; the designer the exact red and where to send its run', async () => {
  const host = scripted({}, (it) => [...research(it), agent({ plan: THREE, work: async (h) => { reds(3, undefined, REFS_42)(h); await grouped('S1, S2', 'S3')(h) } })(it), agent({ work: greenOf('S1, S2, S3', undefined, REFS_42) })(it)])

  await host.start({ story: { issue: 42, title: 'Pay by card' } })

  const deliver = promptOf(host, `skraft ${SLUG} · deliver · attempt 1`)
  assert.ok(deliver.includes([
    '- Groups, in the order you work them; their code and their unit tests go in one green commit (a group whose acceptance tests already pass needs no code: name the scenario whose code makes them pass on the change-log line):',
    '- 1 of 2 — S1 "Customer pays by card" (component api, tags @walking-skeleton); S2 "Customer is refused an expired card" (component api, tags @error-case)',
    '- 2 of 2 — S3 "Customer gets a receipt" (component api, tags @happy-path)',
    '- Acceptance tests DISTILL committed, which you never change (a wrong one, or one failing on a build or setup error: stop blocked, naming it):',
    '- root-1 "test(checkout): acceptance tests S1–S3": tests/Integration/WalkingSkeletonTests.cs, tests/Acceptance/S1AcceptanceTests.cs, tests/Acceptance/S2AcceptanceTests.cs, tests/Acceptance/S3AcceptanceTests.cs',
    '- The walking skeleton passes in that commit, with every acceptance test and the whole suite.',
    "- Deliver every group in this one pass, in this order, with outside-in TDD, unit tests included, and commit nothing until every acceptance test and the whole suite pass; change another component than the groups' own only where a group needs it, in the same commit. The pass ends when that one commit is made, or on a blocker.",
    '- Commit once, in bash (never PowerShell), naming each file you changed:',
    '  dotnet test && git add <each file you changed> && git commit -s -m "feat(checkout): S1–S3 <the rules of the story, as your implementation plan names them>" -m "Refs: #42"',
  ].join('\n')), deliver)
  assert.doesNotMatch(deliver, /Commit each TDD cycle|walking skeleton root-/)
  const plan = promptOf(host, `skraft ${SLUG} · distill · attempt 1`)
  assert.ok(plan.includes(`- Run the acceptance tests once through \`skraft_repl\`, as \`gate('test', <the component\'s test command>, { cwd, label: 'red' })\`, and read its output: every acceptance test and the walking skeleton fail, each on its assertion. Then commit them, the skeleton they call and the scenarios in one commit, exactly:`), plan)
  assert.match(plan, /\n {2}git commit -s -m "test\(checkout\): acceptance tests S1–S<n>, n the last scenario of your test plan" -m "Refs: #42"\n/)
  const policy = [
    '- How the tests of each component treat what the code depends on, in the scenarios\' acceptance tests (targeted) and in the walking skeleton:',
    '- api (dotnet) entry point: in-process (targeted), real (walking skeleton) — WebApplicationFactory; source plugin',
  ].join('\n')
  assert.ok(plan.includes(policy), plan)
  assert.ok(!deliver.includes(policy.split('\n')[0]))
})

test('a component that overrides its infrastructure policy in skraft-config.json has the designer told the override, with its source', async () => {
  const OVERRIDING = { ...API, infrastructure: { internalGateway: { targeted: 'testcontainers' } } }
  const host = scripted({ components: [OVERRIDING] }, (it) => [...research(it), agent()(it), unavailable])

  await host.start()

  assert.match(promptOf(host, `skraft ${SLUG} · distill · attempt 1`), /\n- api \(dotnet\) internal gateway: testcontainers \(targeted\), testcontainers \(walking skeleton\)[^\n]*; source skraft-config.json\n/)
})

test('the red commits once, the acceptance tests of every scenario in the components the test plan names, and no behaviour; a red that commits no test is refused', async () => {
  const COMPONENTS = [API, WEB]
  const cases = [
    [(h) => { reds()(h); h.git.commit('test(checkout): more acceptance', ['tests/Acceptance/S1MoreTests.cs']) }, 'commit root-2 "test(checkout): more acceptance" is a second test commit; commit the acceptance tests of every scenario, the walking skeleton and the skeleton they call in one test commit'],
    [reds(1, ['tests/Acceptance/S1AcceptanceTests.cs', 'web/tests/pay.test.tsx']), 'commit root-1 "test(checkout): acceptance tests S1–S1" changes a component no scenario names: each acceptance test lives in the component the test plan names for its scenario'],
    [(h) => { reds()(h); h.git.commit('feat(checkout): pay early', ['src/Pay.cs']) }, 'commit root-2 "feat(checkout): pay early" is no test commit: the acceptance tests of the scenarios and the skeleton they call go in one test commit, and no behaviour'],
    [reds(1, ['src/PayOrder.cs']), 'commit root-1 "test(checkout): acceptance tests S1–S1" commits no test of its component: the acceptance tests of the scenarios go in its test paths, with the skeleton they call'],
    [() => {}, 'the story has no failing acceptance tests committed: write the acceptance test of every scenario, with the walking skeleton and the skeleton they call, and commit them as one test commit'],
  ]
  for (const [work, why] of cases) {
    const host = scripted({ components: COMPONENTS }, (it) => [...research(it), agent({ work })(it), unavailable])
    await host.start()
    assert.deepEqual(recorded(host, 'distill').map(({ outcome, code, failures }) => [outcome, code, failures]), [['failed', 'tdd', [why]]], why)
  }
})

test('a green that changes an acceptance test or the walking skeleton, commits its inner tests apart, or splits the delivery in two greens is refused', async () => {
  const touched = 'changes the acceptance tests, which DISTILL owns; undo that change, and if a test is wrong, stop blocked naming it'
  const cases = [
    [[API, WEB], reds(), greenOf('S1', ['src/Group1.cs', 'tests/Acceptance/S1AcceptanceTests.cs']), `commit root-2 "feat(checkout): S1 rule" ${touched}`],
    [[API, WEB], reds(), greenOf('S1', ['src/Group1.cs', 'tests/Integration/WalkingSkeletonTests.cs']), `commit root-2 "feat(checkout): S1 rule" ${touched}`],
    [[API, WEB], reds(), (h) => { h.git.commit('test(checkout): unit of the payment', ['tests/Unit/PaymentTests.cs']); greenOf('S1')(h) }, 'commit root-2 "test(checkout): unit of the payment" commits a test on its own: the tests of the inner loop go in the one feat or fix commit that makes the story pass'],
    [[API, WEB], reds(), (h) => { greenOf('S1')(h); h.git.commit('feat(checkout): S1 receipt', ['src/Receipt.cs']) }, 'commit root-3 "feat(checkout): S1 receipt" is a second feat or fix commit: the story takes one, with the code, the unit tests and the fixes of every group; squash it into the first'],
    [[API, WEB], reds(), (h) => { greenOf('S1')(h); h.git.commit('refactor(checkout): name the payment', ['src/S1.cs']) }, 'commit root-3 "refactor(checkout): name the payment" commits a change under green on its own: the story takes one feat or fix commit, refactoring included'],
    [[API, WEB], reds(), () => {}, 'the story has no feat or fix commit: make every group pass, in one commit'],
  ]
  for (const [COMPONENTS, work, deliverWork, why] of cases) {
    const host = scripted({ components: COMPONENTS }, (it) => [...research(it), agent({ work })(it), agent({ work: deliverWork })(it), unavailable])
    await host.start()
    assert.deepEqual(recorded(host, 'deliver').map(({ outcome, code, failures }) => [outcome, code, failures]), [['failed', 'tdd', [why]]], why)
  }

  const THREE_GROUPS = (deliverWork) => scripted({}, (it) => [...research(it), agent({ plan: THREE, work: designing(3, 'S1, S2', 'S3') })(it), agent({ work: deliverWork })(it), unavailable])
  const covered = THREE_GROUPS(greenOf('S1, S2'))
  assert.equal((await covered.start()).status, 'done', 'the one green names the scenarios it likes: the engine judges its place, not its subject')
  assert.deepEqual(recorded(covered, 'deliver').map(({ outcome, green }) => [outcome, green]), [['done', { group: 2 }]])
})

test('a component whose source path is its whole root keeps its acceptance tests immutable, and its documents outside TDD', async () => {
  const WHOLE = { ...API, paths: { src: ['.'], tests: ['tests'] } }
  const touched = scripted({ components: [WHOLE] }, (it) => [...research(it), agent({ work: reds() })(it), agent({ work: greenOf('S1', ['Group1.cs', 'tests/Acceptance/S1AcceptanceTests.cs']) })(it), unavailable])
  await touched.start()
  assert.deepEqual(recorded(touched, 'deliver')[0].failures, ['commit root-2 "feat(checkout): S1 rule" changes the acceptance tests, which DISTILL owns; undo that change, and if a test is wrong, stop blocked naming it'])

  const documented = scripted({ components: [WHOLE] }, (it) => [...research(it), agent({ work: (h) => { h.git.commit('docs(checkout): how to pay', ['README.md']); reds()(h) } })(it), unavailable])
  await documented.start()
  assert.deepEqual(recorded(documented, 'distill').map(({ outcome, failures }) => [outcome, failures]), [['done', []]])
})

test('two components sharing a root each own the files of their own paths: one green delivers both', async () => {
  const SHARED = [API, { ...WEB, root: '.', paths: { src: ['web/src'], tests: ['web/tests'] } }]
  const host = scripted({ components: SHARED }, (it) => [
    ...research(it), agent({ plan: [['Customer pays by card'], ['Customer sees the receipt', 'web', '@happy-path']], work: reds(2, ['tests/Integration/WalkingSkeletonTests.cs', 'tests/Acceptance/S1AcceptanceTests.cs', 'web/tests/receipt.test.tsx']) })(it),
    agent({ work: greenOf('S1, S2', ['src/Group1.cs', 'tests/Unit/Group1Tests.cs', 'web/src/Receipt.tsx', 'web/tests/unit/receipt-total.test.ts']) })(it),
  ])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(checked(host, 'deliver')[0].commits.map(({ subject, verdict }) => [subject, verdict]), [['feat(checkout): S1, S2 rule', 'ok']])
})

test('a docs or chore commit that changes a component\'s source or tests is refused, wherever it is made', async () => {
  const host = scripted({}, (it) => [...research(it), agent({ work: (h) => { h.git.commit('docs(contract): payment API', ['.copilot-tracking/skraft-plans/checkout/contract.yaml', 'src/PaymentController.cs']); reds()(h) } })(it), unavailable])

  await host.start()

  assert.deepEqual(recorded(host, 'distill')[0].failures, ['commit root-1 "docs(contract): payment API" changes a component\'s source or tests outside TDD; a docs, chore, build, ci or revert commit changes neither: put that change in the test, feat or fix commit it belongs to'])

  const tests = scripted({}, (it) => [...research(it), agent()(it), agent({ work: (h) => { h.git.commit('chore(checkout): tidy the steps', ['tests/Acceptance/PaymentSteps.cs']); greenOf('S1')(h) } })(it), unavailable])
  await tests.start()
  assert.deepEqual(recorded(tests, 'deliver')[0].failures, ['commit root-2 "chore(checkout): tidy the steps" changes a component\'s source or tests outside TDD; a docs, chore, build, ci or revert commit changes neither: put that change in the test, feat or fix commit it belongs to'])

  const documented = scripted({}, (it) => [...research(it), agent()(it), agent({ work: (h) => { h.git.commit('docs(checkout): the payment flow', ['src/README.md']); greenOf('S1')(h) } })(it), unavailable])
  await documented.start()
  assert.deepEqual(recorded(documented, 'deliver').map(({ outcome, failures }) => [outcome, failures]), [['done', []]])
})

test('the scenarios of every component are Gherkin, not code: they go with the red, or in a docs commit, whatever folder holds them', async () => {
  const COMPONENTS = [API, { ...WEB, bdd: [{ features: 'tests/features' }] }]
  const together = scripted({ components: COMPONENTS }, (it) => [...research(it), agent({ work: reds(1, ['tests/Integration/WalkingSkeletonTests.cs', 'web/tests/features/checkout/pay.feature']) })(it), unavailable])
  await together.start()
  assert.deepEqual(recorded(together, 'distill').map(({ outcome, failures }) => [outcome, failures]), [['done', []]])

  const apart = scripted({ components: COMPONENTS }, (it) => [...research(it), agent({ work: (h) => { h.git.commit('docs(checkout): the scenarios of the web front end', ['web/tests/features/checkout/pay.feature']); reds()(h) } })(it), unavailable])
  await apart.start()
  assert.deepEqual(recorded(apart, 'distill').map(({ outcome, failures }) => [outcome, failures]), [['done', []]])
})

test('the test plan lists the scenarios, S1 the walking skeleton in a back-end component, or declares why the story has none', async () => {
  const COMPONENTS = [API, WEB]
  const cases = [
    [{ plan: [['Customer pays by card', 'api', '@happy-path']] }, [`${PLAN}: tag S1, and S1 only, @walking-skeleton, or declare "Walking skeleton exemption: library | refactoring | docs-only"`]],
    [{ plan: [['Customer sees the price', 'web', '@walking-skeleton']] }, [`${PLAN}: the walking skeleton S1 runs in a back-end component; web is a react front end`]],
    [{ plan: [['Customer pays by card', 'billing']] }, [`${PLAN}: S1 names component "billing", which is none of api, web`]],
    [{ plan: [['Customer pays by card', 'api', '@walking-skeleton'], ['Customer sees the receipt', 'web', '@walking-skeleton']] }, [`${PLAN}: tag S1, and S1 only, @walking-skeleton, or declare "Walking skeleton exemption: library | refactoring | docs-only"`]],
  ]
  const plan = (rows, after = '') => ({ work: (h) => { reds()(h); h.tracking.write(SLUG, PLAN, `## Scenarios\n\n| # | Scenario | Component | Tags |\n|---|---|---|---|\n${rows.join('\n')}\n${after}`) }, fill: false })
  cases.push(
    [plan(['| S2 | Customer pays by card | api | @walking-skeleton |', '| S1 | Customer gets a receipt | api | |']), [`${PLAN}: row 1 is not S1; number the scenarios S1, S2, … in the order DELIVER builds them`, `${PLAN}: row 2 is not S2; number the scenarios S1, S2, … in the order DELIVER builds them`, `${PLAN}: tag S1, and S1 only, @walking-skeleton, or declare "Walking skeleton exemption: library | refactoring | docs-only"`]],
    [plan(['| S1 | Customer pays by card | api | @walking-skeleton |', '| S2 |  | api |', '| S3 | Customer pays by card | api |']), [`${PLAN}: S2 has no title`, `${PLAN}: two scenarios are titled "Customer pays by card"`]],
    [plan(['| S1 | Customer pays by card | api | @walking-skeleton |', '| S2 | Customer gets a receipt |']), [`${PLAN}: S2 names component "", which is none of api, web`]],
    [plan(['| S1 | Customer pays by card | api | @walking-skeleton |'], 'Walking skeleton exemption: someday\n'), [`${PLAN}: walking skeleton exemption "someday" must be none, library, refactoring, docs-only`]],
    [plan(['| S1 | Reader finds the API documented | api | @walking-skeleton |'], 'Walking skeleton exemption: library\n'), [`${PLAN}: the story declares its walking skeleton exempt (library), and S1 carries @walking-skeleton`]],
    [{ work: (h) => { reds()(h); h.tracking.write(SLUG, PLAN, '## Scenarios\n\nNone yet.\n') }, fill: false }, [`${PLAN} lists no scenario: write a "## Scenarios" heading followed by the table | # | Scenario | Component | Tags |, one row per scenario`]],
    [{ work: (h) => { reds()(h); h.tracking.write(SLUG, PLAN, '# Test plan\n') }, fill: false }, [`${PLAN} lists no scenario: write a "## Scenarios" heading followed by the table | # | Scenario | Component | Tags |, one row per scenario`]],
  )
  for (const [behaviour, failures] of cases) {
    const host = scripted({ components: COMPONENTS }, (it) => [...research(it), agent(behaviour)(it), unavailable])
    await host.start()
    assert.deepEqual(recorded(host, 'distill').map(({ code, failures: found }) => [code, found]), [['scenarios', failures]], JSON.stringify(behaviour))
  }
})

test('a repository whose only component is a front end has its walking skeleton there', async () => {
  const host = scripted({ components: [{ ...WEB, root: '.' }] }, (it) => [...research(it), agent({ plan: [['Customer sees the price', 'web', '@walking-skeleton']], work: reds(1, ['tests/price.test.tsx']) })(it), unavailable])

  await host.start()

  assert.deepEqual(recorded(host, 'distill').map(({ outcome, failures, skeleton }) => [outcome, failures, skeleton.component]), [['done', [], 'web']])
})

test('a story declared exempt of a walking skeleton as docs only, whose commits change source, is refused', async () => {
  const host = scripted({}, (it) => [...research(it), agent({
    plan: [['Reader finds the API documented', 'api', '@happy-path']],
    exemption: 'docs-only',
    work: reds(1, ['tests/Acceptance/S1AcceptanceTests.cs', 'src/Skeleton.cs']),
  })(it), unavailable])

  await host.start()

  assert.deepEqual(recorded(host, 'distill').map(({ code, failures }) => [code, failures]), [['scenarios', ['the story declares its walking skeleton exempt as docs only, and commit root-1 "test(checkout): acceptance tests S1–S1" changes src/Skeleton.cs, source of api; remove the exemption and tag S1 @walking-skeleton']]])
})

test('a story exempt of a walking skeleton still commits the red of its acceptance tests, and its green names no walking skeleton', async () => {
  const host = scripted({ scenarioReviews: [{ answer: 'APPROVED' }] }, (it) => [...research(it), agent({ plan: [['Reader finds the API documented', 'api', '@happy-path']], exemption: 'library' })(it), agent()(it), unavailable])

  await host.start()

  assert.deepEqual(recorded(host, 'distill').map(({ outcome, exemption, skeleton, oracles }) => [outcome, exemption, skeleton, oracles.map(({ sha }) => sha)]), [['done', 'library', null, ['root-1']]])
  assert.match(host.human.questions.find(({ kind }) => kind === 'scenario-review').text, /\. The story has no walking skeleton \(exemption: library\)\. The acceptance tests of every scenario are commit root-1 "test\(checkout\): acceptance tests": tests\/Acceptance\/AcceptanceTests.cs\. /)
  const deliver = promptOf(host, `skraft ${SLUG} · deliver · attempt 1`)
  assert.match(deliver, /: tests\/Acceptance\/AcceptanceTests\.cs\n- Deliver every group/)
  assert.doesNotMatch(deliver, /walking skeleton/i)
})

test('a human reads the scenarios, their groups, the red and the designer\'s run before DELIVER builds them; REVISE sends DISTILL back with the corrections', async () => {
  const host = scripted({ scenarioReviews: [{ answer: 'REVISE', reason: 'S2 is a refused card, not an expired one' }, { answer: 'APPROVED' }] }, (it) => [
    ...research(it), agent({ plan: THREE.slice(0, 2), work: designing(2, 'S1, S2') })(it), agent({ plan: THREE.slice(0, 2), work: grouped('S1, S2') })(it), agent()(it),
  ])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  const [first, second] = host.human.questions.filter(({ kind }) => kind === 'scenario-review')
  const read = (visit) => `Read the 2 scenarios of the story before DELIVER builds them: S1 "Customer pays by card" (api; @walking-skeleton); S2 "Customer is refused an expired card" (api; @error-case). DELIVER makes them pass in one pass and one commit, working the groups in this order: 1. S1, S2. The acceptance tests of every scenario, the walking skeleton and the skeleton of its chain are commit root-1 "test(checkout): acceptance tests S1–S2": tests/Integration/WalkingSkeletonTests.cs, tests/Acceptance/S1AcceptanceTests.cs, tests/Acceptance/S2AcceptanceTests.cs. skraft does not run them: check that each fails on its own assertion; the designer's traced run is in ${TRACKING}/logs/runs/distill-${visit}-1/1.log. APPROVED delivers them; REVISE sends DISTILL back with your corrections (edit the .feature or the test yourself first if you like, and say so).`
  assert.equal(first.text, read(1))
  assert.equal(second.text, read(2), 'the pass REVISE sent back committed nothing new: the red stands, the designer\'s run is the one of the new pass')
  assert.equal(second.key, 'scenario_review-2')
  assert.match(promptOf(host, `skraft ${SLUG} · distill · pass 2 · attempt 1`), /A human refused the work of pass 1:\n- A human read the scenarios and the walking skeleton and asks for these corrections: S2 is a refused card, not an expired one/)
  assert.deepEqual(recorded(host, 'distill').map(({ visit, outcome: done, skeleton }) => [visit, done, skeleton?.sha]), [[1, 'done', 'root-1'], [2, 'done', 'root-1']], 'the plan sent back keeps the red it had')

  const named = scripted({}, (it) => [...research(it), agent({ work: (h) => { reds(1, ['tests/Acceptance/S1AcceptanceTests.cs', 'tests/features/checkout/pay.feature'])(h); h.tracking.write(SLUG, PLAN, `${h.tracking.files.get(`${SLUG}/${PLAN}`)}\n| coverage | tests/features/checkout/pay.feature |\n`) } })(it), unavailable])
  await named.start()
  assert.match(named.human.questions.find(({ kind }) => kind === 'scenario-review').text, /before DELIVER builds them, as tests\/features\/checkout\/pay.feature writes them: S1 /)
})

test('the acceptance tests of every red DISTILL committed stay immutable, the red a REVISE replaced included', async () => {
  const host = scripted({ scenarioReviews: [{ answer: 'REVISE', reason: 'rewrite the tests' }, { answer: 'APPROVED' }] }, (it) => [
    ...research(it), agent({ work: reds(1, ['tests/Integration/WalkingSkeletonTests.cs', 'tests/Acceptance/S1AcceptanceTests.cs']) })(it),
    agent({ work: reds(1, ['tests/Integration/WalkingSkeletonTests.cs', 'tests/Acceptance/S1Again.cs']) })(it),
    agent({ work: greenOf('S1', ['src/Group1.cs', 'tests/Acceptance/S1AcceptanceTests.cs']) })(it), unavailable,
  ])

  await host.start()

  assert.deepEqual(recorded(host, 'deliver')[0].failures, ['commit root-3 "feat(checkout): S1 rule" changes the acceptance tests, which DISTILL owns; undo that change, and if a test is wrong, stop blocked naming it'])
  const told = promptOf(host, `skraft ${SLUG} · deliver · attempt 1`)
  assert.ok(told.includes('- root-1 "test(checkout): acceptance tests S1–S1": tests/Integration/WalkingSkeletonTests.cs, tests/Acceptance/S1AcceptanceTests.cs\n- root-2 "test(checkout): acceptance tests S1–S1": tests/Integration/WalkingSkeletonTests.cs, tests/Acceptance/S1Again.cs\n'), told)
})

test('a run stopped in the middle of the delivery resumes the same dispatch', async () => {
  const host = scripted({}, (it) => [...research(it), agent({ plan: THREE.slice(0, 2), work: designing(2) })(it), unavailable])
  assert.equal((await host.start()).code, 'agent-unavailable')

  host.agentRunner.behaviours.push(agent()(host))
  const outcome = await host.run()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(labels(host).filter((label) => /distill|deliver/.test(label)), [`skraft ${SLUG} · distill · attempt 1`, `skraft ${SLUG} · deliver · attempt 1`, `skraft ${SLUG} · deliver · attempt 1`])
})
test('the exact green of the story names its scenarios and runs the whole test command, no filter', async () => {
  const LONG = 'Customer   pays "$5" by `card` with a \\ voucher that the shop accepts only on weekdays before noon'
  const host = scripted({}, (it) => [...research(it), agent({ plan: [[LONG, 'api', '@walking-skeleton @happy-path'], ['Customer gets a receipt', 'api', '']], work: designing(2) })(it), unavailable])

  await host.start()

  const deliver = promptOf(host, `skraft ${SLUG} · deliver · attempt 1`)
  assert.ok(deliver.includes(`\n- 1 of 2 — S1 "${LONG}" (component api, tags @walking-skeleton @happy-path)\n- 2 of 2 — S2 "Customer gets a receipt" (component api)\n`), deliver)
  assert.ok(deliver.includes('\n  dotnet test && git add <each file you changed> && git commit -s -m "feat(checkout): S1–S2 <the rules of the story, as your implementation plan names them>"\n'), deliver)
  assert.ok(!deliver.includes('filter'), deliver)
})

test('the engineer is told the acceptance-test files of the red by its short sha, a red of a neighbour repository too', async () => {
  const NEIGHBOUR = { ...WEB, root: '../web' }
  const git = new InMemoryGit({ repositories: { '.': { mergeBases: { main: 'root-0' } }, '../web': { mergeBases: { main: 'up-web-0' } } } })
  const host = scripted({ components: [NEIGHBOUR], git }, (it) => [
    ...research(it), agent({ plan: [['Customer sees the receipt', 'web', '@walking-skeleton']], work: reds(1, ['../web/tests/receipt.test.tsx', '../web/tests/receipt-steps.ts']) })(it), unavailable,
  ])

  await host.start()

  assert.ok(promptOf(host, `skraft ${SLUG} · deliver · attempt 1`).includes('\n- up-web- "test(checkout): acceptance tests S1–S1": ../web/tests/receipt.test.tsx, ../web/tests/receipt-steps.ts\n'))
})

test('an engineer that stops blocked before its commit is told by a human how to go on: the next pass delivers every group again, in one green', async () => {
  const blocked = { status: 'blocked', summary: 'the expired card rule is undecided' }
  const host = scripted({ answers: [{ answer: 'Refuse a card that expired before today' }] }, (it) => [
    ...research(it), agent({ plan: THREE, work: designing(3, 'S1, S2', 'S3') })(it),
    agent({ result: blocked, work: () => {} })(it), agent({ work: greenOf('S1, S2, S3') })(it),
  ])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(labels(host).filter((label) => /deliver/.test(label)), [`skraft ${SLUG} · deliver · attempt 1`, `skraft ${SLUG} · deliver · pass 2 · attempt 1`])
  assert.deepEqual(checked(host, 'deliver').at(-1).commits.map(({ subject, verdict }) => [subject, verdict]), [['feat(checkout): S1, S2, S3 rule', 'ok']])
  const reopened = promptOf(host, `skraft ${SLUG} · deliver · pass 2 · attempt 1`)
  assert.ok(reopened.includes('\n- 2 of 2 — S3 "Customer gets a receipt" (component api, tags @happy-path)\n'), reopened)
  assert.ok(reopened.includes('\n  dotnet test && git add'), reopened)
})

test('a commit a person makes while a delivery waits on a block is never judged as the engineer\'s on the reopened pass', async () => {
  const blocked = { status: 'blocked', summary: 'the expired card rule is undecided' }
  let host
  const person = () => {
    host.git.commit('test(checkout): the expired card, by hand', ['tests/Unit/ByHandTests.cs'])
    host.git.commit('fix(checkout): the acceptance step, by hand', ['tests/Acceptance/S1AcceptanceTests.cs'])
    return { answer: 'Refuse a card that expired before today' }
  }
  host = scripted({ answers: [person] }, (it) => [
    ...research(it), agent({ plan: THREE, work: designing(3, 'S1, S2', 'S3') })(it),
    agent({ result: blocked, work: () => {} })(it), agent({ work: greenOf('S1, S2, S3') })(it),
  ])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(checked(host, 'deliver').at(-1).commits.map(({ subject, verdict }) => [subject, verdict]), [['feat(checkout): S1, S2, S3 rule', 'ok']])
})

test('a run journaled by the engine that delivered one group per pass is refused at its resume, never judged green by green', async () => {
  const host = scripted({}, (it) => [...research(it), agent({ plan: THREE, work: designing(3, 'S1, S2', 'S3') })(it), unavailable])
  assert.equal((await host.start()).code, 'agent-unavailable')
  const { journal } = await openJournal(host.deps, SLUG)
  await journal.append('step.recorded', { step: 'deliver', visit: 1, attempt: 0, outcome: 'done', next: 'gates', failures: [], missing: [], green: { group: 1 } })

  const outcome = await host.run()

  assert.deepEqual([outcome.status, outcome.code, outcome.reason], ['blocked', 'delivery-shape', 'this run was started by an engine that delivered one group per pass; start the story again'])
})

test('a scenario review a workflow asks before the scenarios are written waits on the machine, saying where it belongs', async () => {
  const early = BUILT_IN_WORKFLOW
    .replace('adr -> distill   [label="RATIFIED"]', 'adr -> scenario_review   [label="RATIFIED"]')
    .replace('  distill_review -> scenario_review [label="APPROVED"]\n  scenario_review -> deliver [label="APPROVED"]\n  scenario_review -> distill [label="REVISE", max_visits=2]', '  distill_review -> deliver [label="APPROVED"]\n  scenario_review -> distill [label="APPROVED"]\n  scenario_review -> design [label="REVISE", max_visits=1]')
  const host = scripted({ files: { '.skraft/pipeline.skraft.dot': early } }, (it) => [...research(it), unavailable])

  const outcome = await host.start()

  assert.equal(outcome.status, 'waiting')
  assert.ok(outcome.reason.startsWith(waitingOnEnvironment('scenario_review', 'the run recorded no scenario of the story to show yet; put the scenario review after the node that writes them').split('\nThe run so far')[0]))
})

test('a red an earlier attempt committed stays the red of the story when the pass is tried again', async () => {
  const host = scripted({}, (it) => [...research(it), agent({ work: (h) => { reds()(h); h.tracking.write(SLUG, PLAN, '# Test plan\n') }, fill: false })(it), agent({ work: () => {} })(it), agent()(it)])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(recorded(host, 'distill').map(({ attempt, outcome: done, skeleton }) => [attempt, done, skeleton?.sha]), [[1, 'failed', undefined], [2, 'done', 'root-1']])
  assert.deepEqual(recorded(host, 'deliver').map(({ outcome: done, failures }) => [done, failures]), [['done', []]])
})

test('a green that also changes another component the story\'s groups need is accepted, and the run journals that component', async () => {
  const host = scripted({ components: [API, WEB] }, (it) => [...research(it), agent()(it), agent({ work: greenOf('S1', ['src/Group1.cs', 'web/src/Pay.tsx']) })(it), unavailable])

  await host.start()

  const [delivered] = recorded(host, 'deliver')
  assert.deepEqual([delivered.outcome, delivered.failures, delivered.green], ['done', [], { group: 1, others: ['web'] }])
})
