import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryGit, ScriptedMachine, ScriptedReplay, judgeAnswer } from '../support/in-memory-host.mjs'
import { API, CYCLE_WORKFLOW, REFS_42, SLUG, TRACKING, agent, scripted, tddCycle } from '../support/pipeline-host.mjs'
import { waitingOnEnvironment } from '../support/decisions.mjs'

const unavailable = () => ({ ok: false, unavailable: true, text: '' })
const research = (it) => [agent()(it), agent()(it)]
/** Where the engine keeps what the replay of a commit printed. */
const logOf = (sha, component = 'api', command = 'test') => `${TRACKING}/logs/replay-${sha}-${component}-${command}.log`
/** The judge answering from a queue, then accepting. @param {Array<string | object>} answers */
const judging = (...answers) => () => answers.shift() ?? judgeAnswer('accept')
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
/** The green of group k, as the software engineer commits it. */
const greenOf = (index, files = [`src/Group${index}.cs`, `tests/Unit/Group${index}Tests.cs`], body = '') => ({ git }) => git.commit(`feat(${SLUG}): group ${index}`, files, body)

test('a story of three scenarios in two groups is delivered after one red holding every acceptance test: one green per group, in the order of the implementation plan', async () => {
  const host = scripted({}, (it) => [...research(it), agent({ plan: THREE, work: designing(3, 'S1, S2', 'S3') })(it), agent()(it), agent()(it)])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(labels(host).filter((label) => /distill|deliver/.test(label)), [
    `skraft ${SLUG} · distill · attempt 1`,
    `skraft ${SLUG} · deliver · group 1 of 2 · attempt 1`,
    `skraft ${SLUG} · deliver · pass 2 · group 2 of 2 · attempt 1`,
  ])
  assert.deepEqual([...checked(host, 'distill'), ...checked(host, 'deliver')].map((event) => event.commits.map(({ subject, kind, verdict, replay }) => [subject, kind, verdict, replay?.judge.decision])), [
    [['test(checkout): acceptance tests S1–S3', 'red', 'ok', 'accept']],
    [['feat(checkout): scenario 1', 'green', 'ok', 'accept']],
    [['feat(checkout): scenario 2', 'green', 'ok', 'accept']],
  ])
  assert.deepEqual(recorded(host, 'distill').map(({ group, next, groups }) => [group, next, groups]), [[undefined, 'distill_review', [{ index: 1, scenarios: [1, 2] }, { index: 2, scenarios: [3] }]]], 'the plan leaves by its edge to the review')
  assert.deepEqual(host.events().filter((event) => event.type === 'phase.closed').map(({ phase }) => phase), ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER', 'PUBLISH'])
  assert.deepEqual(host.replay.lines(), ['root-1 ./. $ dotnet test', 'root-0 ./. $ dotnet test', 'root-2 ./. $ dotnet test', 'root-3 ./. $ dotnet test'])
  const [, first, second] = host.agentRunner.judged
  assert.ok(first.prompt.startsWith('Judge the green commit root-2 "feat(checkout): scenario 1", for S1 "Customer pays by card", S2 "Customer is refused an expired card".\n'), first.prompt)
  assert.ok(first.prompt.includes('\nEach acceptance test\'s name starts with its scenario\'s number (S1_…, test_s1_…). At this green the tests of S3 "Customer gets a receipt", still to deliver, fail; every other test passes.\n'), first.prompt)
  assert.ok(second.prompt.includes("(S1_…, test_s1_…). At this green every test passes.\n"), second.prompt)
  assert.deepEqual(recorded(host, 'deliver').map(({ green }) => green), [{ group: 1 }, { group: 2 }])
})

test('an implementation plan with no group table delivers one scenario per group', async () => {
  const host = scripted({}, (it) => [...research(it), agent({ plan: THREE.slice(0, 2), work: designing(2) })(it), agent()(it), agent()(it)])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(labels(host).filter((label) => /deliver/.test(label)), [`skraft ${SLUG} · deliver · group 1 of 2 · attempt 1`, `skraft ${SLUG} · deliver · pass 2 · group 2 of 2 · attempt 1`])
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

test('the engineer is told its group, the acceptance tests it never changes, the scenarios still failing at its commit and the exact green; the designer the exact red', async () => {
  const host = scripted({}, (it) => [...research(it), agent({ plan: THREE, work: async (h) => { reds(3, undefined, REFS_42)(h); await grouped('S1, S2', 'S3')(h) } })(it), agent({ work: greenOf(1, undefined, REFS_42) })(it), unavailable])

  await host.start({ story: { issue: 42, title: 'Pay by card' } })

  const deliver = promptOf(host, `skraft ${SLUG} · deliver · group 1 of 2 · attempt 1`)
  assert.ok(deliver.includes([
    '- Group: 1 of 2 — S1 "Customer pays by card" (component api, tags @walking-skeleton); S2 "Customer is refused an expired card" (component api, tags @error-case)',
    '- Acceptance tests DISTILL committed, which you never change (a wrong one: stop blocked, naming it):',
    '- root-1 "test(checkout): acceptance tests S1–S3": tests/Integration/WalkingSkeletonTests.cs, tests/Acceptance/S1AcceptanceTests.cs, tests/Acceptance/S2AcceptanceTests.cs, tests/Acceptance/S3AcceptanceTests.cs',
    '- At your commit only the tests of S3, later groups, still fail; every other test passes.',
    "- Make the group's scenarios pass with outside-in TDD, unit tests included, and commit nothing until they pass; change another component than api only where the group needs it, in the same commit.",
    '- Once they pass, commit once, in bash (never PowerShell), naming each file you changed, the test command leaving out the tests of S3 by its name filter (`outside-in-tdd`, Pending scenarios excluded):',
    '  dotnet test <the filter leaving out S3> && git add <each file you changed> && git commit -s -m "feat(checkout): S1, S2 <the rule of the group, as your implementation plan names it>" -m "Refs: #42"',
  ].join('\n')), deliver)
  assert.doesNotMatch(deliver, /Commit each TDD cycle|walking skeleton root-/)
  const plan = promptOf(host, `skraft ${SLUG} · distill · attempt 1`)
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

test('the red commits once, the acceptance tests of every scenario in the components the test plan names, and no behaviour; a red that commits no test is refused before any replay', async () => {
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
  const untested = scripted({}, (it) => [...research(it), agent({ work: reds(1, ['src/PayOrder.cs']) })(it), unavailable])
  await untested.start()
  assert.deepEqual(untested.replay.lines(), [])
})

test('a red whose tests all pass at its commit is no red', async () => {
  const host = scripted({ replay: new ScriptedReplay({ exits: { 'root-1': 0 } }) }, (it) => [...research(it), agent()(it), unavailable])

  await host.start()

  assert.equal(checked(host, 'distill')[0].commits[0].verdict, 'not-red')
  assert.deepEqual(host.agentRunner.judged, [])
})

test('a red proven by its e2e tests has them replayed at each green beside its tests, and the judge reads both', async () => {
  const FRONT = { name: 'web', root: '.', stack: 'react', bdd: false, paths: { src: ['src'], tests: ['tests', 'e2e'] }, commands: { test: 'npx vitest run', e2e: 'npx playwright test', mutation: 'npx stryker run' } }
  const replay = new ScriptedReplay({ exits: { 'root-1 npx vitest run': 0, 'root-2 npx vitest run': 0, 'root-2 npx playwright test': 1 } })
  const host = scripted({ components: [FRONT], replay }, (it) => [...research(it), agent({ plan: [['Customer pays by card', 'web', '@walking-skeleton']], work: reds(1, ['e2e/walking-skeleton.spec.ts', 'e2e/pay.spec.ts']) })(it), agent({ work: greenOf(1, ['src/Pay.tsx']) })(it), unavailable])
  host.agentRunner.judge = judging(judgeAnswer('accept'), judgeAnswer('send-back', 'the e2e test still fails'))

  await host.start()

  assert.deepEqual(host.replay.lines(), ['root-1 ./. $ npx vitest run', 'root-1 ./. $ npx playwright test', 'root-0 ./. $ npx playwright test', 'root-2 ./. $ npx vitest run', 'root-2 ./. $ npx playwright test'])
  assert.deepEqual(recorded(host, 'distill')[0].oracles.map(({ command }) => command), ['e2e'])
  assert.ok(host.agentRunner.judged[1].prompt.includes(`\nThe red of the story's acceptance tests is root-1; its replay printed to ${logOf('root-1', 'web', 'e2e')}, and at its parent to ${logOf('root-1', 'web', 'e2e-parent')}\nThe acceptance tests: e2e/walking-skeleton.spec.ts, e2e/pay.spec.ts\n`), host.agentRunner.judged[1].prompt)
  assert.deepEqual(recorded(host, 'deliver')[0].failures, [`commit root-2 "feat(checkout): group 1" does not make the group pass: the replay judge sends it back: read ${TRACKING}/logs/judge-root-2-green.md`])
})

test('a green that changes an acceptance test or the walking skeleton, or commits its inner tests apart, is refused', async () => {
  const COMPONENTS = [API, WEB]
  const touched = 'changes the acceptance tests, which DISTILL owns; undo that change, and if a test is wrong, stop blocked naming it'
  const cases = [
    [greenOf(1, ['src/Group1.cs', 'tests/Acceptance/S1AcceptanceTests.cs']), `commit root-2 "feat(checkout): group 1" ${touched}`],
    [greenOf(1, ['src/Group1.cs', 'tests/Integration/WalkingSkeletonTests.cs']), `commit root-2 "feat(checkout): group 1" ${touched}`],
    [(h) => { h.git.commit('test(checkout): unit of the payment', ['tests/Unit/PaymentTests.cs']); greenOf(1)(h) }, 'commit root-2 "test(checkout): unit of the payment" commits a test on its own: the tests of the inner loop go in the one feat or fix commit that makes the group pass'],
    [(h) => { greenOf(1)(h); h.git.commit('feat(checkout): receipt', ['src/Receipt.cs']) }, 'commit root-3 "feat(checkout): receipt" is a second feat or fix commit for the group; make it pass in one commit'],
    [(h) => { greenOf(1)(h); h.git.commit('refactor(checkout): name the payment', ['src/Group1.cs']) }, 'commit root-3 "refactor(checkout): name the payment" commits a change under green on its own: the group takes one feat or fix commit, refactoring included'],
    [() => {}, 'group 1 (S1) has no feat or fix commit: make its acceptance tests pass, then commit once'],
  ]
  for (const [work, why] of cases) {
    const host = scripted({ components: COMPONENTS }, (it) => [...research(it), agent({ work: reds() })(it), agent({ work })(it), unavailable])
    await host.start()
    assert.deepEqual(recorded(host, 'deliver').map(({ outcome, code, failures }) => [outcome, code, failures]), [['failed', 'tdd', [why]]], why)
    assert.deepEqual(checked(host, 'deliver').flatMap(({ commits }) => commits.filter(({ verdict }) => verdict !== 'ok').map(({ replay }) => replay)).filter((replay) => replay !== null), [], why)
  }
})

test('a component whose source path is its whole root keeps its acceptance tests immutable, and its documents outside TDD', async () => {
  const WHOLE = { ...API, paths: { src: ['.'], tests: ['tests'] } }
  const touched = scripted({ components: [WHOLE] }, (it) => [...research(it), agent({ work: reds() })(it), agent({ work: greenOf(1, ['Group1.cs', 'tests/Acceptance/S1AcceptanceTests.cs']) })(it), unavailable])
  await touched.start()
  assert.deepEqual(recorded(touched, 'deliver')[0].failures, ['commit root-2 "feat(checkout): group 1" changes the acceptance tests, which DISTILL owns; undo that change, and if a test is wrong, stop blocked naming it'])

  const documented = scripted({ components: [WHOLE] }, (it) => [...research(it), agent({ work: (h) => { h.git.commit('docs(checkout): how to pay', ['README.md']); reds()(h) } })(it), unavailable])
  await documented.start()
  assert.deepEqual(recorded(documented, 'distill').map(({ outcome, failures }) => [outcome, failures]), [['done', []]])
})

test('two components sharing a root each own the files of their own paths: the red replays both, each green its group\'s', async () => {
  const SHARED = [API, { ...WEB, root: '.', paths: { src: ['web/src'], tests: ['web/tests'] } }]
  const host = scripted({ components: SHARED }, (it) => [
    ...research(it), agent({ plan: [['Customer pays by card'], ['Customer sees the receipt', 'web', '@happy-path']], work: reds(2, ['tests/Integration/WalkingSkeletonTests.cs', 'tests/Acceptance/S1AcceptanceTests.cs', 'web/tests/receipt.test.tsx']) })(it),
    agent()(it), agent({ work: greenOf(2, ['web/src/Receipt.tsx', 'web/tests/unit/receipt-total.test.ts']) })(it),
  ])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(host.replay.lines(), ['root-1 ./. $ dotnet test', 'root-1 ./. $ npx vitest run', 'root-0 ./. $ dotnet test', 'root-0 ./. $ npx vitest run', 'root-2 ./. $ dotnet test', 'root-3 ./. $ npx vitest run'])
})

test('a green replay that times out goes to the judge, which asks a human when no agent can fix it', async () => {
  const machine = scripted({ replay: new ScriptedReplay({ exits: { 'root-2': 'timeout' } }) }, (it) => [...research(it), agent()(it), agent()(it), unavailable])
  machine.agentRunner.judge = judging(judgeAnswer('accept'), judgeAnswer('ask-human', 'dotnet is not installed'))
  const outcome = await machine.start()
  const answer = `${TRACKING}/logs/judge-root-2-green.md`
  assert.equal(outcome.status, 'waiting')
  assert.ok(outcome.reason.startsWith(waitingOnEnvironment('deliver', `the replay judge asks a human about the green commit root-2: read ${answer}`, 1, { owner: 'judge', log: answer }).split('\nThe run so far')[0]))
  assert.ok(machine.agentRunner.judged[1].prompt.includes(`\n- api: \`dotnet test\` at the commit root-2: dotnet did not finish within 600 s; printed to ${logOf('root-2')}\n`), machine.agentRunner.judged[1].prompt)
})

test('a docs or chore commit that changes a component\'s source or tests is refused, wherever it is made', async () => {
  const host = scripted({}, (it) => [...research(it), agent({ work: (h) => { h.git.commit('docs(contract): payment API', ['.copilot-tracking/skraft-plans/checkout/contract.yaml', 'src/PaymentController.cs']); reds()(h) } })(it), unavailable])

  await host.start()

  assert.deepEqual(recorded(host, 'distill')[0].failures, ['commit root-1 "docs(contract): payment API" changes a component\'s source or tests outside TDD; a docs, chore, build, ci or revert commit changes neither: put that change in the test, feat or fix commit it belongs to'])

  const tests = scripted({}, (it) => [...research(it), agent()(it), agent({ work: (h) => { h.git.commit('chore(checkout): tidy the steps', ['tests/Acceptance/PaymentSteps.cs']); greenOf(1)(h) } })(it), unavailable])
  await tests.start()
  assert.deepEqual(recorded(tests, 'deliver')[0].failures, ['commit root-2 "chore(checkout): tidy the steps" changes a component\'s source or tests outside TDD; a docs, chore, build, ci or revert commit changes neither: put that change in the test, feat or fix commit it belongs to'])

  const documented = scripted({}, (it) => [...research(it), agent()(it), agent({ work: (h) => { h.git.commit('docs(checkout): the payment flow', ['src/README.md']); greenOf(1)(h) } })(it), unavailable])
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
  const deliver = promptOf(host, `skraft ${SLUG} · deliver · group 1 of 1 · attempt 1`)
  assert.match(deliver, /: tests\/Acceptance\/AcceptanceTests\.cs\n- At your commit every test passes\.\n/)
  assert.doesNotMatch(deliver, /walking skeleton/i)
  assert.doesNotMatch(host.agentRunner.judged.at(-1).prompt, /walking skeleton/)
})

test('a human reads the scenarios, their groups and the red before DELIVER builds them; REVISE sends DISTILL back with the corrections', async () => {
  const host = scripted({ scenarioReviews: [{ answer: 'REVISE', reason: 'S2 is a refused card, not an expired one' }, { answer: 'APPROVED' }] }, (it) => [
    ...research(it), agent({ plan: THREE.slice(0, 2), work: designing(2, 'S1, S2') })(it), agent({ plan: THREE.slice(0, 2), work: grouped('S1, S2') })(it), agent()(it),
  ])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  const [first, second] = host.human.questions.filter(({ kind }) => kind === 'scenario-review')
  assert.equal(first.text, 'Read the 2 scenarios of the story before DELIVER builds them: S1 "Customer pays by card" (api; @walking-skeleton); S2 "Customer is refused an expired card" (api; @error-case). DELIVER makes them pass in 1 group: 1. S1, S2. The acceptance tests of every scenario, the walking skeleton and the skeleton of its chain are commit root-1 "test(checkout): acceptance tests S1–S2": tests/Integration/WalkingSkeletonTests.cs, tests/Acceptance/S1AcceptanceTests.cs, tests/Acceptance/S2AcceptanceTests.cs. APPROVED delivers them; REVISE sends DISTILL back with your corrections (edit the .feature or the test yourself first if you like, and say so).')
  assert.equal(second.text, first.text, 'the pass REVISE sent back committed nothing new: the red stands')
  assert.equal(second.key, 'scenario_review-2')
  assert.match(promptOf(host, `skraft ${SLUG} · distill · pass 2 · attempt 1`), /A human refused the work of pass 1:\n- A human read the scenarios and the walking skeleton and asks for these corrections: S2 is a refused card, not an expired one/)
  assert.deepEqual(recorded(host, 'distill').map(({ visit, outcome: done, skeleton }) => [visit, done, skeleton?.sha]), [[1, 'done', 'root-1'], [2, 'done', 'root-1']], 'the plan sent back keeps the red it had')

  const named = scripted({}, (it) => [...research(it), agent({ work: (h) => { reds(1, ['tests/Acceptance/S1AcceptanceTests.cs', 'tests/features/checkout/pay.feature'])(h); h.tracking.write(SLUG, PLAN, `${h.tracking.files.get(`${SLUG}/${PLAN}`)}\n| coverage | tests/features/checkout/pay.feature |\n`) } })(it), unavailable])
  await named.start()
  assert.match(named.human.questions.find(({ kind }) => kind === 'scenario-review').text, /before DELIVER builds them, as tests\/features\/checkout\/pay.feature writes them: S1 /)
})

test('a run stopped in the middle of group 2 resumes on group 2', async () => {
  const host = scripted({}, (it) => [...research(it), agent({ plan: THREE.slice(0, 2), work: designing(2) })(it), agent()(it), unavailable])
  assert.equal((await host.start()).code, 'agent-unavailable')

  host.agentRunner.behaviours.push(agent()(host))
  const outcome = await host.run()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(labels(host).filter((label) => /distill|deliver/.test(label)), [
    `skraft ${SLUG} · distill · attempt 1`,
    `skraft ${SLUG} · deliver · group 1 of 2 · attempt 1`,
    `skraft ${SLUG} · deliver · pass 2 · group 2 of 2 · attempt 1`,
    `skraft ${SLUG} · deliver · pass 2 · group 2 of 2 · attempt 1`,
  ])
})

test('a pass the gates send back after the last group fixes the whole story: a red, then a fix, the gate failure standing for the red', async () => {
  const machine = new ScriptedMachine({ exits: { '. $ dotnet test': 1 } })
  const host = scripted({ machine }, (it) => [...research(it), agent()(it), agent()(it), agent({ work: (h) => { machine.exits['. $ dotnet test'] = 0; tddCycle(SLUG, 'Fix')(h) } })(it)])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(labels(host).filter((label) => /deliver/.test(label)), [`skraft ${SLUG} · deliver · group 1 of 1 · attempt 1`, `skraft ${SLUG} · deliver · pass 2 · attempt 1`])
  assert.deepEqual(checked(host, 'deliver').at(-1).commits.map(({ kind, verdict, replay }) => [kind, verdict, replay]), [['red', 'ok', null], ['green', 'ok', null], ['refactor', 'ok', null]])
  assert.doesNotMatch(promptOf(host, `skraft ${SLUG} · deliver · pass 2 · attempt 1`), /- Group:/)
})

test('the exact green of a group of one scenario is its title made a subject: no quote, dollar, backquote nor backslash, spaces folded, the first letter lower case, cut on a word to 72 characters, no issue reference for a story without one', async () => {
  const LONG = 'Customer   pays "$5" by `card` with a \\ voucher that the shop accepts only on weekdays before noon'
  const host = scripted({}, (it) => [...research(it), agent({ plan: [[LONG, 'api', '@walking-skeleton @happy-path'], ['Customer gets a receipt', 'api', '']], work: designing(2) })(it), unavailable])

  await host.start()

  const deliver = promptOf(host, `skraft ${SLUG} · deliver · group 1 of 2 · attempt 1`)
  assert.ok(deliver.includes(`\n- Group: 1 of 2 — S1 "${LONG}" (component api, tags @walking-skeleton @happy-path)\n`), deliver)
  assert.ok(deliver.includes('\n  dotnet test <the filter leaving out S2> && git add <each file you changed> && git commit -s -m "feat(checkout): customer pays 5 by card with a voucher that the shop"\n'), deliver)
  assert.equal('feat(checkout): customer pays 5 by card with a voucher that the shop'.length <= 72, true)
})

test('the engineer is told the acceptance-test files of the red by its short sha, a red of a neighbour repository too', async () => {
  const NEIGHBOUR = { ...WEB, root: '../web' }
  const git = new InMemoryGit({ repositories: { '.': { mergeBases: { main: 'root-0' } }, '../web': { mergeBases: { main: 'up-web-0' } } } })
  const host = scripted({ components: [NEIGHBOUR], git }, (it) => [
    ...research(it), agent({ plan: [['Customer sees the receipt', 'web', '@walking-skeleton']], work: reds(1, ['../web/tests/receipt.test.tsx', '../web/tests/receipt-steps.ts']) })(it), unavailable,
  ])

  await host.start()

  assert.ok(promptOf(host, `skraft ${SLUG} · deliver · group 1 of 1 · attempt 1`).includes('\n- up-web- "test(checkout): acceptance tests S1–S1": ../web/tests/receipt.test.tsx, ../web/tests/receipt-steps.ts\n'))
})

test('a group whose engineer stops blocked runs again on that group once a human answers with an instruction', async () => {
  const blocked = { status: 'blocked', summary: 'the expired card rule is undecided' }
  const host = scripted({ answers: [{ answer: 'Refuse a card that expired before today' }] }, (it) => [
    ...research(it), agent({ plan: THREE.slice(0, 2), work: designing(2) })(it), agent()(it), agent({ result: blocked, work: () => {} })(it), agent()(it),
  ])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(labels(host).filter((label) => /deliver/.test(label)), [
    `skraft ${SLUG} · deliver · group 1 of 2 · attempt 1`,
    `skraft ${SLUG} · deliver · pass 2 · group 2 of 2 · attempt 1`,
    `skraft ${SLUG} · deliver · pass 3 · group 2 of 2 · attempt 1`,
  ])
  assert.ok(promptOf(host, `skraft ${SLUG} · deliver · pass 3 · group 2 of 2 · attempt 1`).includes('\n- Group: 2 of 2 — S2 "Customer is refused an expired card" (component api, tags @error-case)\n'))
})

test('a scenario review a workflow asks before the scenarios are written waits on the machine, saying where it belongs', async () => {
  const early = CYCLE_WORKFLOW
    .replace('distill  [shape=box, agent="acceptance-designer", phase="DISTILL"]', 'distill  [shape=box, agent="acceptance-designer", phase="DISTILL", each="scenario"]\n  scenario_review [shape=hexagon, question="scenario-review"]')
    .replace('deliver  [shape=box, agent="software-engineer", phase="DELIVER"]', 'deliver  [shape=box, agent="software-engineer", phase="DELIVER", each="scenario"]')
    .replace('adr -> distill   [label="RATIFIED"]', 'adr -> scenario_review   [label="RATIFIED"]\n  scenario_review -> distill [label="APPROVED"]\n  scenario_review -> design [label="REVISE", max_visits=1]')
  const host = scripted({ files: { '.skraft/pipeline.skraft.dot': early } }, (it) => [...research(it), unavailable])

  const outcome = await host.start()

  assert.equal(outcome.status, 'waiting')
  assert.ok(outcome.reason.startsWith(waitingOnEnvironment('scenario_review', 'the run recorded no scenario of the story to show yet; put the scenario review after the node that writes them').split('\nThe run so far')[0]))
})

test('a red an earlier attempt proved stays the red of the story when the pass is tried again, and is not judged again', async () => {
  const host = scripted({}, (it) => [...research(it), agent({ work: (h) => { reds()(h); h.tracking.write(SLUG, PLAN, '# Test plan\n') }, fill: false })(it), agent({ work: () => {} })(it), agent()(it), unavailable])

  await host.start()

  assert.deepEqual(recorded(host, 'distill').map(({ attempt, outcome, skeleton }) => [attempt, outcome, skeleton?.sha]), [[1, 'failed', undefined], [2, 'done', 'root-1']])
  assert.deepEqual(host.agentRunner.judged.map(({ label }) => label.split(' · ').slice(1, 3).join(' · ')), ['distill · judge red root-1 of attempt 1', 'deliver · judge green root-2 of attempt 1'])
  assert.deepEqual(recorded(host, 'deliver').map(({ outcome, failures }) => [outcome, failures]), [['done', []]])
})

test('a green that also changes another component the group needs is accepted, and the run journals that component', async () => {
  const host = scripted({ components: [API, WEB] }, (it) => [...research(it), agent()(it), agent({ work: greenOf(1, ['src/Group1.cs', 'web/src/Pay.tsx']) })(it), unavailable])

  await host.start()

  const [delivered] = recorded(host, 'deliver')
  assert.deepEqual([delivered.outcome, delivered.failures, delivered.green], ['done', [], { group: 1, others: ['web'] }])
})
