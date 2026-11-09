import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryGit, ScriptedMachine, ScriptedReplay, judgeAnswer } from '../support/in-memory-host.mjs'
import { API, CYCLE_WORKFLOW, REFS_42, SLUG, TRACKING, agent, scripted, tddCycle } from '../support/pipeline-host.mjs'
import { waitingOnEnvironment } from '../support/decisions.mjs'

const unavailable = () => ({ ok: false, unavailable: true, text: '' })
const research = (it) => [agent()(it), agent()(it)]
/** Where the engine keeps what the replay of a commit printed. */
const logOf = (sha, component = 'api', command = 'test') => `${TRACKING}/logs/replay-${sha}-${component}-${command}.log`
const printed = (...logs) => `the replay's output is in ${logs.join(', ')}`
/** The judge answering from a queue, then accepting. @param {Array<string | object>} answers */
const judging = (...answers) => () => answers.shift() ?? judgeAnswer('accept')
const recorded = (host, step) => host.events().filter((event) => event.type === 'step.recorded' && event.step === step)
const checked = (host, step) => host.events().filter((event) => event.type === 'commits.checked' && event.step === step)
const labels = (host) => host.agentRunner.dispatches.map(({ label }) => label)
const promptOf = (host, label) => host.agentRunner.dispatches.find((dispatch) => dispatch.label === label).prompt
const THREE = [['Customer pays by card'], ['Customer is refused an expired card', 'api', '@error-case'], ['Customer gets a receipt', 'api', '@happy-path']]
const WEB = { name: 'web', root: 'web', stack: 'react', bdd: false, paths: { src: ['src'], tests: ['tests'] }, commands: { test: 'npx vitest run', mutation: 'npx stryker run' } }
/** A red of scenario k of the api component, as the acceptance designer commits it. */
const red = (index, files = [`tests/Acceptance/S${index}AcceptanceTests.cs`], body = '') => ({ git }) => git.commit(`test(${SLUG}): scenario ${index}`, files, body)
/** The green of scenario k, as the software engineer commits it. */
const greenOf = (index, files = [`src/Scenario${index}.cs`, `tests/Unit/Scenario${index}Tests.cs`], body = '') => ({ git }) => git.commit(`feat(${SLUG}): scenario ${index}`, files, body)

test('a story of three scenarios is delivered one scenario at a time: the red of its acceptance test, then one green, in order', async () => {
  const host = scripted({}, (it) => [...research(it), agent({ plan: THREE })(it), agent()(it), agent()(it), agent()(it), agent()(it), agent()(it)])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(labels(host).filter((label) => /distill|deliver/.test(label)), [
    `skraft ${SLUG} · distill · attempt 1`,
    `skraft ${SLUG} · deliver · scenario 1 of 3 · attempt 1`,
    `skraft ${SLUG} · distill · pass 2 · scenario 2 of 3 · attempt 1`,
    `skraft ${SLUG} · deliver · pass 2 · scenario 2 of 3 · attempt 1`,
    `skraft ${SLUG} · distill · pass 3 · scenario 3 of 3 · attempt 1`,
    `skraft ${SLUG} · deliver · pass 3 · scenario 3 of 3 · attempt 1`,
  ])
  assert.deepEqual([...checked(host, 'distill'), ...checked(host, 'deliver')].sort((a, b) => a.commits[0].sha.localeCompare(b.commits[0].sha, 'en', { numeric: true })).map((event) => event.commits.map(({ subject, kind, verdict, replay }) => [subject, kind, verdict, replay?.judge.decision])), [
    [['test(checkout): scenario 1', 'red', 'ok', 'accept']],
    [['feat(checkout): scenario 1', 'green', 'ok', 'accept']],
    [['test(checkout): scenario 2', 'red', 'ok', 'accept']],
    [['feat(checkout): scenario 2', 'green', 'ok', 'accept']],
    [['test(checkout): scenario 3', 'red', 'ok', 'accept']],
    [['feat(checkout): scenario 3', 'green', 'ok', 'accept']],
  ])
  assert.deepEqual(recorded(host, 'distill_review').length, 1)
  assert.deepEqual(host.events().filter((event) => event.type === 'phase.closed').map(({ phase }) => phase), ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER', 'PUBLISH'])
  const loop = host.events()
    .filter((event) => (event.type === 'phase.closed' && event.phase === 'DISTILL') || (['step.started', 'step.recorded'].includes(event.type) && ['distill', 'deliver'].includes(event.step)))
    .map((event) => (event.type === 'phase.closed' ? 'DISTILL closed' : `${event.type === 'step.started' ? 'start' : 'done'} ${event.step} ${event.visit}`))
  assert.deepEqual(loop, ['start distill 1', 'done distill 1', 'start deliver 1', 'done deliver 1', 'start distill 2', 'done distill 2', 'start deliver 2', 'done deliver 2', 'start distill 3', 'done distill 3', 'DISTILL closed', 'start deliver 3', 'done deliver 3'], 'DISTILL closes once the red of the last scenario is written')
  assert.deepEqual(host.replay.lines(), ['root-1 ./. $ dotnet test', 'root-0 ./. $ dotnet test', 'root-2 ./. $ dotnet test', 'root-3 ./. $ dotnet test', 'root-2 ./. $ dotnet test', 'root-4 ./. $ dotnet test', 'root-5 ./. $ dotnet test', 'root-4 ./. $ dotnet test', 'root-6 ./. $ dotnet test'])
  assert.deepEqual(host.agentRunner.judged.map(({ label }) => label.split(' · ').slice(1, 3).join(' · ')), ['distill · judge red root-1 of attempt 1', 'deliver · judge green root-2 of attempt 1', 'distill · judge red root-3 of attempt 1', 'deliver · judge green root-4 of attempt 1', 'distill · judge red root-5 of attempt 1', 'deliver · judge green root-6 of attempt 1'])
})

test('the engineer is told its scenario, the acceptance tests it never changes and the exact green commit; the designer the next scenario and the exact red', async () => {
  const host = scripted({}, (it) => [...research(it), agent({ plan: THREE.slice(0, 2), work: red(1, ['tests/Acceptance/S1AcceptanceTests.cs', 'src/PayOrder.cs'], REFS_42) })(it), agent({ work: greenOf(1, undefined, REFS_42) })(it), agent({ work: red(2, undefined, REFS_42) })(it), unavailable])

  await host.start({ story: { issue: 42, title: 'Pay by card' } })

  const deliver = promptOf(host, `skraft ${SLUG} · deliver · scenario 1 of 2 · attempt 1`)
  assert.match(deliver, /\n- Scenario: 1 of 2 — "Customer pays by card" \(component api, tags @walking-skeleton\)\n/)
  assert.match(deliver, /\n- Acceptance tests DISTILL committed, which you never change \(a wrong one: stop blocked, naming it\):\n- root-1 "test\(checkout\): scenario 1": tests\/Acceptance\/S1AcceptanceTests.cs\n/)
  assert.match(deliver, /\n {2}dotnet test && git add <each file you changed> && git commit -s -m "feat\(checkout\): customer pays by card" -m "Refs: #42"\n/)
  assert.doesNotMatch(deliver, /Commit each TDD cycle/)
  const distill = promptOf(host, `skraft ${SLUG} · distill · pass 2 · scenario 2 of 2 · attempt 1`)
  assert.match(distill, /\n- Scenario: 2 of 2 — "Customer is refused an expired card" \(component api, tags @error-case\)\n/)
  assert.match(distill, /\n {2}git commit -s -m "test\(checkout\): customer is refused an expired card" -m "Refs: #42"\n/)
  const policy = [
    '- How the tests of each component treat what the code depends on, in the targeted scenarios and in the walking skeleton S1:',
    '- api (dotnet) entry point: in-process (targeted), real (walking skeleton) — WebApplicationFactory; source plugin',
  ].join('\n')
  assert.ok(promptOf(host, `skraft ${SLUG} · distill · attempt 1`).includes(policy), promptOf(host, `skraft ${SLUG} · distill · attempt 1`))
  assert.ok(distill.includes(policy))
  assert.ok(!deliver.includes(policy.split('\n')[0]))
})

test('a component that overrides its infrastructure policy in skraft-config.json has the designer told the override, with its source', async () => {
  const OVERRIDING = { ...API, infrastructure: { internalGateway: { targeted: 'testcontainers' } } }
  const host = scripted({ components: [OVERRIDING] }, (it) => [...research(it), agent()(it), unavailable])

  await host.start()

  assert.match(promptOf(host, `skraft ${SLUG} · distill · attempt 1`), /\n- api \(dotnet\) internal gateway: testcontainers \(targeted\), testcontainers \(walking skeleton\)[^\n]*; source skraft-config.json\n/)
})

test('a red that commits no test of its component is refused before any replay', async () => {
  const untested = scripted({}, (it) => [...research(it), agent({ work: red(1, ['src/PayOrder.cs']) })(it), unavailable])
  await untested.start()
  assert.deepEqual(recorded(untested, 'distill')[0].failures, ['commit root-1 "test(checkout): scenario 1" commits no test of its component: the acceptance test of the scenario goes in its test paths, with the skeleton it calls'])
  assert.deepEqual(untested.replay.lines(), [])
})

test('a scenario proven by its e2e tests has them replayed at its green beside its tests, and the judge reads both', async () => {
  const FRONT = { name: 'web', root: '.', stack: 'react', bdd: false, paths: { src: ['src'], tests: ['tests', 'e2e'] }, commands: { test: 'npx vitest run', e2e: 'npx playwright test', mutation: 'npx stryker run' } }
  const replay = new ScriptedReplay({ exits: { 'root-1 npx vitest run': 0, 'root-0 npx playwright test': 0, 'root-2 npx vitest run': 0, 'root-2 npx playwright test': 1 } })
  const host = scripted({ components: [FRONT], replay }, (it) => [...research(it), agent({ plan: [['Customer pays by card', 'web', '@walking-skeleton']], work: red(1, ['e2e/pay.spec.ts']) })(it), agent({ work: greenOf(1, ['src/Pay.tsx']) })(it), unavailable])
  host.agentRunner.judge = judging(judgeAnswer('accept'), judgeAnswer('send-back', 'the e2e test still fails'))

  await host.start()

  assert.deepEqual(host.replay.lines(), ['root-1 ./. $ npx vitest run', 'root-1 ./. $ npx playwright test', 'root-0 ./. $ npx playwright test', 'root-2 ./. $ npx vitest run', 'root-2 ./. $ npx playwright test'])
  assert.deepEqual(recorded(host, 'distill').at(-1).oracle, { scenario: 1, sha: 'root-1', subject: 'test(checkout): scenario 1', component: 'web', files: ['e2e/pay.spec.ts'], command: 'e2e' })
  assert.ok(host.agentRunner.judged[1].prompt.includes(`\nThe red of its scenario is root-1; its replay printed to ${logOf('root-1', 'web', 'e2e')}, and at its parent to ${logOf('root-1', 'web', 'e2e-parent')}\nThe acceptance tests of its scenario: e2e/pay.spec.ts\n`), host.agentRunner.judged[1].prompt)
  assert.deepEqual(recorded(host, 'deliver')[0].failures, [`commit root-2 "feat(checkout): scenario 1" does not make the scenario pass: the replay judge sends it back: read ${TRACKING}/logs/judge-root-2-green.md`])
})

test('a green that changes the scenario\'s acceptance test, commits its inner tests apart or touches another component is refused', async () => {
  const COMPONENTS = [API, WEB]
  const cases = [
    [greenOf(1, ['src/Scenario1.cs', 'tests/Acceptance/S1AcceptanceTests.cs']), 'commit root-2 "feat(checkout): scenario 1" changes the scenario\'s acceptance tests, which DISTILL owns; undo that change, and if the test is wrong, stop blocked naming it'],
    [(h) => { h.git.commit('test(checkout): unit of the payment', ['tests/Unit/PaymentTests.cs']); greenOf(1)(h) }, 'commit root-2 "test(checkout): unit of the payment" commits a test on its own: the tests of the inner loop go in the one feat or fix commit that makes the scenario pass'],
    [greenOf(1, ['src/Scenario1.cs', 'web/src/Pay.tsx']), 'commit root-2 "feat(checkout): scenario 1" changes another component than the scenario\'s; that change needs a scenario of its own: stop blocked naming it'],
    [(h) => { greenOf(1)(h); h.git.commit('feat(checkout): receipt', ['src/Receipt.cs']) }, 'commit root-3 "feat(checkout): receipt" is a second feat or fix commit for the scenario; make it pass in one commit'],
    [(h) => { greenOf(1)(h); h.git.commit('refactor(checkout): name the payment', ['src/Scenario1.cs']) }, 'commit root-3 "refactor(checkout): name the payment" commits a change under green on its own: the scenario takes one feat or fix commit, refactoring included'],
    [() => {}, 'scenario 1 has no feat or fix commit: make its acceptance test pass, then commit once'],
  ]
  for (const [work, why] of cases) {
    const host = scripted({ components: COMPONENTS }, (it) => [...research(it), agent()(it), agent({ work })(it), unavailable])
    await host.start()
    assert.deepEqual(recorded(host, 'deliver').map(({ outcome, code, failures }) => [outcome, code, failures]), [['failed', 'tdd', [why]]], why)
    assert.deepEqual(checked(host, 'deliver').flatMap(({ commits }) => commits.filter(({ verdict }) => verdict !== 'ok').map(({ replay }) => replay)).filter((replay) => replay !== null), [], why)
  }
})

test('a component whose source path is its whole root keeps its acceptance tests immutable, and its documents outside TDD', async () => {
  const WHOLE = { ...API, paths: { src: ['.'], tests: ['tests'] } }
  const touched = scripted({ components: [WHOLE] }, (it) => [...research(it), agent()(it), agent({ work: greenOf(1, ['Scenario1.cs', 'tests/Acceptance/S1AcceptanceTests.cs']) })(it), unavailable])
  await touched.start()
  assert.deepEqual(recorded(touched, 'deliver')[0].failures, ['commit root-2 "feat(checkout): scenario 1" changes the scenario\'s acceptance tests, which DISTILL owns; undo that change, and if the test is wrong, stop blocked naming it'])

  const documented = scripted({ components: [WHOLE] }, (it) => [...research(it), agent({ work: (h) => { h.git.commit('docs(checkout): how to pay', ['README.md']); red(1)(h) } })(it), unavailable])
  await documented.start()
  assert.deepEqual(recorded(documented, 'distill').map(({ outcome, failures }) => [outcome, failures]), [['done', []]])
})

test('two components sharing a root each own the files of their own paths', async () => {
  const SHARED = [API, { ...WEB, root: '.', paths: { src: ['web/src'], tests: ['web/tests'] } }]
  const host = scripted({ components: SHARED }, (it) => [
    ...research(it), agent({ plan: [['Customer pays by card'], ['Customer sees the receipt', 'web', '@happy-path']] })(it), agent()(it),
    agent({ work: red(2, ['web/tests/receipt.test.tsx']) })(it), agent({ work: greenOf(2, ['web/src/Receipt.tsx', 'web/tests/unit/receipt-total.test.ts']) })(it),
  ])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(host.replay.lines().slice(3), ['root-3 ./. $ npx vitest run', 'root-2 ./. $ npx vitest run', 'root-4 ./. $ npx vitest run'])
})

test('a green the machine cannot replay goes to the judge, which asks a human when no agent can fix it', async () => {
  const machine = scripted({ replay: new ScriptedReplay({ exits: { 'root-2': null } }) }, (it) => [...research(it), agent()(it), agent()(it), unavailable])
  machine.agentRunner.judge = judging(judgeAnswer('accept'), judgeAnswer('ask-human', 'dotnet is not installed'))
  const outcome = await machine.start()
  const answer = `${TRACKING}/logs/judge-root-2-green.md`
  assert.deepEqual([outcome.status, outcome.reason], ['waiting', waitingOnEnvironment('deliver', `the replay judge asks a human about the green commit root-2: read ${answer}`, 1, { owner: 'judge', log: answer })])
  assert.ok(machine.agentRunner.judged[1].prompt.includes(`\n- api: \`dotnet test\` at the commit root-2: could not start dotnet; printed to ${logOf('root-2')}\n`), machine.agentRunner.judged[1].prompt)
})

test('a docs or chore commit that changes a component\'s source or tests is refused, wherever it is made', async () => {
  const host = scripted({}, (it) => [...research(it), agent({ work: (h) => { h.git.commit('docs(contract): payment API', ['.copilot-tracking/skraft-plans/checkout/contract.yaml', 'src/PaymentController.cs']); red(1)(h) } })(it), unavailable])

  await host.start()

  assert.deepEqual(recorded(host, 'distill')[0].failures, ['commit root-1 "docs(contract): payment API" changes a component\'s source or tests outside TDD; a docs, chore, build, ci or revert commit changes neither: put that change in the test, feat or fix commit it belongs to'])

  const tests = scripted({}, (it) => [...research(it), agent()(it), agent({ work: (h) => { h.git.commit('chore(checkout): tidy the steps', ['tests/Acceptance/PaymentSteps.cs']); greenOf(1)(h) } })(it), unavailable])
  await tests.start()
  assert.deepEqual(recorded(tests, 'deliver')[0].failures, ['commit root-2 "chore(checkout): tidy the steps" changes a component\'s source or tests outside TDD; a docs, chore, build, ci or revert commit changes neither: put that change in the test, feat or fix commit it belongs to'])

  const documented = scripted({}, (it) => [...research(it), agent()(it), agent({ work: (h) => { h.git.commit('docs(checkout): the payment flow', ['src/README.md']); greenOf(1)(h) } })(it), unavailable])
  await documented.start()
  assert.deepEqual(recorded(documented, 'deliver').map(({ outcome, failures }) => [outcome, failures]), [['done', []]])
})

test('the scenarios of every component are Gherkin, not code: they go with the red of S1, or in a docs commit, whatever folder holds them', async () => {
  const COMPONENTS = [API, { ...WEB, bdd: [{ features: 'tests/features' }] }]
  const together = scripted({ components: COMPONENTS }, (it) => [...research(it), agent({ work: red(1, ['tests/Acceptance/S1AcceptanceTests.cs', 'web/tests/features/checkout/pay.feature']) })(it), unavailable])
  await together.start()
  assert.deepEqual(recorded(together, 'distill').map(({ outcome, failures }) => [outcome, failures]), [['done', []]])

  const apart = scripted({ components: COMPONENTS }, (it) => [...research(it), agent({ work: (h) => { h.git.commit('docs(checkout): the scenarios of the web front end', ['web/tests/features/checkout/pay.feature']); red(1)(h) } })(it), unavailable])
  await apart.start()
  assert.deepEqual(recorded(apart, 'distill').map(({ outcome, failures }) => [outcome, failures]), [['done', []]])
})

test('the test plan lists the scenarios, S1 the walking skeleton in a back-end component, or declares why the story has none', async () => {
  const COMPONENTS = [API, WEB]
  const cases = [
    [{ plan: [['Customer pays by card', 'api', '@happy-path']] }, ['details/2026-10-11/test-plan-checkout.md: tag S1, and S1 only, @walking-skeleton, or declare "Walking skeleton exemption: library | refactoring | docs-only"']],
    [{ plan: [['Customer sees the price', 'web', '@walking-skeleton']] }, ['details/2026-10-11/test-plan-checkout.md: the walking skeleton S1 runs in a back-end component; web is a react front end']],
    [{ plan: [['Customer pays by card', 'billing']] }, ['details/2026-10-11/test-plan-checkout.md: S1 names component "billing", which is none of api, web']],
    [{ plan: [['Customer pays by card', 'api', '@walking-skeleton'], ['Customer sees the receipt', 'web', '@walking-skeleton']] }, ['details/2026-10-11/test-plan-checkout.md: tag S1, and S1 only, @walking-skeleton, or declare "Walking skeleton exemption: library | refactoring | docs-only"']],
    [{ fill: false }, ['details/2026-10-11/test-plan-checkout.md lists no scenario: write a "## Scenarios" heading followed by the table | # | Scenario | Component | Tags |, one row per scenario']],
  ]
  const plan = (rows, after = '') => ({ work: (h) => { red(1)(h); h.tracking.write(SLUG, 'details/2026-10-11/test-plan-checkout.md', `## Scenarios\n\n| # | Scenario | Component | Tags |\n|---|---|---|---|\n${rows.join('\n')}\n${after}`) }, fill: false })
  const PLAN = 'details/2026-10-11/test-plan-checkout.md'
  cases.push(
    [plan(['| S2 | Customer pays by card | api | @walking-skeleton |', '| S1 | Customer gets a receipt | api | |']), [`${PLAN}: row 1 is not S1; number the scenarios S1, S2, … in the order DELIVER builds them`, `${PLAN}: row 2 is not S2; number the scenarios S1, S2, … in the order DELIVER builds them`, `${PLAN}: tag S1, and S1 only, @walking-skeleton, or declare "Walking skeleton exemption: library | refactoring | docs-only"`]],
    [plan(['| S1 | Customer pays by card | api | @walking-skeleton |', '| S2 |  | api |', '| S3 | Customer pays by card | api |']), [`${PLAN}: S2 has no title`, `${PLAN}: two scenarios are titled "Customer pays by card"`]],
    [plan(['| S1 | Customer pays by card | api | @walking-skeleton |', '| S2 | Customer gets a receipt |']), [`${PLAN}: S2 names component "", which is none of api, web`]],
    [plan(['| S1 | Customer pays by card | api | @walking-skeleton |'], 'Walking skeleton exemption: someday\n'), [`${PLAN}: walking skeleton exemption "someday" must be none, library, refactoring, docs-only`]],
    [plan(['| S1 | Reader finds the API documented | api | @walking-skeleton |'], 'Walking skeleton exemption: library\n'), [`${PLAN}: the story declares its walking skeleton exempt (library), and S1 carries @walking-skeleton`]],
    [{ work: (h) => { red(1)(h); h.tracking.write(SLUG, PLAN, '## Scenarios\n\nNone yet.\n') }, fill: false }, [`${PLAN} lists no scenario: write a "## Scenarios" heading followed by the table | # | Scenario | Component | Tags |, one row per scenario`]],
  )
  for (const [behaviour, failures] of cases) {
    const host = scripted({ components: COMPONENTS }, (it) => [...research(it), agent(behaviour.fill === false && behaviour.work === undefined ? { work: (h) => { red(1)(h); h.tracking.write(SLUG, 'details/2026-10-11/test-plan-checkout.md', '# Test plan\n') } } : behaviour)(it), unavailable])
    await host.start()
    assert.deepEqual(recorded(host, 'distill').map(({ code, failures: found }) => [code, found]), [['scenarios', failures]], JSON.stringify(behaviour))
  }
})

test('a repository whose only component is a front end has its walking skeleton there', async () => {
  const host = scripted({ components: [{ ...WEB, root: '.' }] }, (it) => [...research(it), agent({ plan: [['Customer sees the price', 'web', '@walking-skeleton']], work: red(1, ['tests/price.test.tsx']) })(it), unavailable])

  await host.start()

  assert.deepEqual(recorded(host, 'distill').map(({ outcome, failures }) => [outcome, failures]), [['done', []]])
})

test('a story declared exempt of a walking skeleton as docs only, whose commits change source, is refused', async () => {
  const host = scripted({}, (it) => [...research(it), agent({
    plan: [['Reader finds the API documented', 'api', '@happy-path']],
    work: (h) => {
      red(1, ['tests/Acceptance/S1AcceptanceTests.cs', 'src/Skeleton.cs'])(h)
      h.tracking.write(SLUG, 'details/2026-10-11/test-plan-checkout.md', `${h.tracking.files.get(`${SLUG}/details/2026-10-11/test-plan-checkout.md`) ?? ''}\nWalking skeleton exemption: docs-only\n`)
    },
  })(it), unavailable])

  await host.start()

  assert.deepEqual(recorded(host, 'distill').map(({ code, failures }) => [code, failures]), [['scenarios', ['the story declares its walking skeleton exempt as docs only, and commit root-1 "test(checkout): scenario 1" changes src/Skeleton.cs, source of api; remove the exemption and tag S1 @walking-skeleton']]])
})

test('a human reads the scenarios and the walking skeleton before DELIVER builds them; REVISE sends DISTILL back with the corrections', async () => {
  const host = scripted({ scenarioReviews: [{ answer: 'REVISE', reason: 'S2 is a refused card, not an expired one' }, { answer: 'APPROVED' }] }, (it) => [
    ...research(it), agent({ plan: THREE.slice(0, 2) })(it), agent({ plan: THREE.slice(0, 2), work: () => {} })(it), agent()(it), agent()(it), agent()(it),
  ])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  const [first, second] = host.human.questions.filter(({ kind }) => kind === 'scenario-review')
  assert.equal(first.text, 'Read the 2 scenarios of the story before DELIVER builds them, one at a time: S1 "Customer pays by card" (api; @walking-skeleton); S2 "Customer is refused an expired card" (api; @error-case). The acceptance test of S1 and its skeleton are commit root-1 "test(checkout): scenario 1": tests/Acceptance/S1AcceptanceTests.cs. APPROVED delivers them; REVISE sends DISTILL back with your corrections (edit the .feature or the test yourself first if you like, and say so).')
  const named = scripted({}, (it) => [...research(it), agent({ work: (h) => { red(1, ['tests/Acceptance/S1AcceptanceTests.cs', 'tests/features/checkout/pay.feature'])(h); h.tracking.write(SLUG, 'details/2026-10-11/test-plan-checkout.md', `${h.tracking.files.get(`${SLUG}/details/2026-10-11/test-plan-checkout.md`)}\n| coverage | tests/features/checkout/pay.feature |\n`) } })(it), unavailable])
  await named.start()
  assert.match(named.human.questions.find(({ kind }) => kind === 'scenario-review').text, /one at a time, as tests\/features\/checkout\/pay.feature writes them: S1 /)
  const two = scripted({}, (it) => [...research(it), agent({ work: (h) => { red(1, ['tests/Acceptance/S1AcceptanceTests.cs', 'tests/features/checkout/pay.feature', 'tests/features/checkout/refund.feature'])(h); h.tracking.write(SLUG, 'details/2026-10-11/test-plan-checkout.md', `${h.tracking.files.get(`${SLUG}/details/2026-10-11/test-plan-checkout.md`)}\n| coverage | tests/features/checkout/pay.feature |\n| coverage | tests/features/checkout/refund.feature |\n`) } })(it), unavailable])
  await two.start()
  assert.match(two.human.questions.find(({ kind }) => kind === 'scenario-review').text, /one at a time, as tests\/features\/checkout\/pay.feature, tests\/features\/checkout\/refund.feature write them: S1 /)
  assert.equal(second.key, 'scenario_review-2')
  assert.match(promptOf(host, `skraft ${SLUG} · distill · pass 2 · attempt 1`), /A human refused the work of pass 1:\n- A human read the scenarios and the walking skeleton and asks for these corrections: S2 is a refused card, not an expired one/)
  assert.deepEqual(recorded(host, 'distill').map(({ visit, group, outcome: done }) => [visit, group, done]), [[1, undefined, 'done'], [2, undefined, 'done'], [3, 2, 'done']])
})

test('a run stopped in the middle of scenario 2 resumes on scenario 2', async () => {
  const host = scripted({}, (it) => [...research(it), agent({ plan: THREE.slice(0, 2) })(it), agent()(it), unavailable])
  assert.equal((await host.start()).code, 'agent-unavailable')

  host.agentRunner.behaviours.push(agent()(host), agent()(host))
  const outcome = await host.run()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(labels(host).filter((label) => /distill|deliver/.test(label)), [
    `skraft ${SLUG} · distill · attempt 1`,
    `skraft ${SLUG} · deliver · scenario 1 of 2 · attempt 1`,
    `skraft ${SLUG} · distill · pass 2 · scenario 2 of 2 · attempt 1`,
    `skraft ${SLUG} · distill · pass 2 · scenario 2 of 2 · attempt 1`,
    `skraft ${SLUG} · deliver · pass 2 · scenario 2 of 2 · attempt 1`,
  ])
})

test('a pass the gates send back after the last scenario fixes the whole story: a red, then a fix, the gate failure standing for the red', async () => {
  const machine = new ScriptedMachine({ exits: { '. $ dotnet test': 1 } })
  const host = scripted({ machine }, (it) => [...research(it), agent()(it), agent()(it), agent({ work: (h) => { machine.exits['. $ dotnet test'] = 0; tddCycle(SLUG, 'Fix')(h) } })(it)])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(labels(host).filter((label) => /deliver/.test(label)), [`skraft ${SLUG} · deliver · scenario 1 of 1 · attempt 1`, `skraft ${SLUG} · deliver · pass 2 · attempt 1`])
  assert.deepEqual(checked(host, 'deliver').at(-1).commits.map(({ kind, verdict, replay }) => [kind, verdict, replay]), [['red', 'ok', null], ['green', 'ok', null], ['refactor', 'ok', null]])
  assert.doesNotMatch(promptOf(host, `skraft ${SLUG} · deliver · pass 2 · attempt 1`), /- Scenario:/)
})

test('a pass that writes a scenario\'s acceptance test commits it once, in the scenario\'s component alone', async () => {
  const COMPONENTS = [API, WEB]
  const cases = [
    [(h) => { red(1)(h); h.git.commit('test(checkout): scenario 1 again', ['tests/Acceptance/S1MoreTests.cs']) }, 'commit root-2 "test(checkout): scenario 1 again" is a second test commit for the scenario; commit its acceptance test and skeleton in one test commit'],
    [red(1, ['tests/Acceptance/S1AcceptanceTests.cs', 'web/tests/pay.test.tsx']), 'commit root-1 "test(checkout): scenario 1" changes another component than the scenario\'s: its acceptance test lives in the component the test plan names for it'],
    [red(1, ['web/tests/pay.test.tsx']), 'commit root-1 "test(checkout): scenario 1" changes another component than the scenario\'s: its acceptance test lives in the component the test plan names for it'],
    [(h) => { red(1)(h); h.git.commit('feat(checkout): pay early', ['src/Pay.cs']) }, 'commit root-2 "feat(checkout): pay early" is no test commit: the acceptance test of a scenario and the skeleton it calls go in one test commit, and no behaviour'],
    [() => {}, 'scenario 1 has no failing acceptance test committed: commit it with the skeleton it calls as one test commit'],
  ]
  for (const [work, why] of cases) {
    const host = scripted({ components: COMPONENTS }, (it) => [...research(it), agent({ work })(it), unavailable])
    await host.start()
    assert.deepEqual(recorded(host, 'distill').map(({ outcome, code, failures }) => [outcome, code, failures]), [['failed', 'tdd', [why]]], why)
  }
})

test('the exact commit of a scenario is its title made a subject: no quote, dollar, backquote nor backslash, spaces folded, the first letter lower case, cut on a word to 72 characters, no issue reference for a story without one', async () => {
  const LONG = 'Customer   pays "$5" by `card` with a \\ voucher that the shop accepts only on weekdays before noon'
  const host = scripted({}, (it) => [...research(it), agent({ plan: [[LONG, 'api', '@walking-skeleton @happy-path'], ['Customer gets a receipt', 'api', '']] })(it), agent()(it), agent()(it), unavailable])

  await host.start()

  const deliver = promptOf(host, `skraft ${SLUG} · deliver · scenario 1 of 2 · attempt 1`)
  assert.ok(deliver.includes(`\n- Scenario: 1 of 2 — "${LONG}" (component api, tags @walking-skeleton @happy-path)\n`), deliver)
  assert.ok(deliver.includes('\n  dotnet test && git add <each file you changed> && git commit -s -m "feat(checkout): customer pays 5 by card with a voucher that the shop"\n'), deliver)
  assert.equal('feat(checkout): customer pays 5 by card with a voucher that the shop'.length <= 72, true)
  const distill = promptOf(host, `skraft ${SLUG} · distill · pass 2 · scenario 2 of 2 · attempt 1`)
  assert.ok(distill.includes('\n- Scenario: 2 of 2 — "Customer gets a receipt" (component api)\n'), distill)
  assert.ok(distill.includes([
    '- Write the failing acceptance test of this scenario only, beside the earlier ones, and extend the skeleton it calls; change no test of an earlier scenario,',
    '  write none for a later one, never skip one.',
    '- Run the test once and read its output: it fails on an assertion. Then commit the test and the skeleton in one commit, exactly:',
    '  git commit -s -m "test(checkout): customer gets a receipt"\n',
  ].join('\n')), distill)
})

test('the engineer is told every acceptance-test file of the reds so far, each red by its short sha, a red of a neighbour repository too', async () => {
  const NEIGHBOUR = { ...WEB, root: '../web' }
  const git = new InMemoryGit({ repositories: { '.': { mergeBases: { main: 'root-0' } }, '../web': { mergeBases: { main: 'up-web-0' } } } })
  const host = scripted({ components: [API, NEIGHBOUR], git }, (it) => [
    ...research(it), agent({ plan: [['Customer pays by card'], ['Customer sees the receipt', 'web', '@happy-path']], work: red(1, ['tests/Acceptance/S1AcceptanceTests.cs', 'tests/Acceptance/PaymentSteps.cs']) })(it),
    agent()(it), agent({ work: red(2, ['../web/tests/receipt.test.tsx']) })(it), unavailable,
  ])

  await host.start()

  assert.ok(promptOf(host, `skraft ${SLUG} · deliver · scenario 1 of 2 · attempt 1`).includes('\n- root-1 "test(checkout): scenario 1": tests/Acceptance/S1AcceptanceTests.cs, tests/Acceptance/PaymentSteps.cs\n'))
  assert.ok(promptOf(host, `skraft ${SLUG} · deliver · pass 2 · scenario 2 of 2 · attempt 1`).includes('\n- up-web- "test(checkout): scenario 2": ../web/tests/receipt.test.tsx\n'))
})

test('a scenario whose engineer stops blocked runs again on that scenario once a human answers with an instruction', async () => {
  const blocked = { status: 'blocked', summary: 'the expired card rule is undecided' }
  const host = scripted({ answers: [{ answer: 'Refuse a card that expired before today' }] }, (it) => [
    ...research(it), agent({ plan: THREE.slice(0, 2) })(it), agent()(it), agent()(it), agent({ result: blocked, work: () => {} })(it), agent()(it),
  ])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(labels(host).filter((label) => /deliver/.test(label)), [
    `skraft ${SLUG} · deliver · scenario 1 of 2 · attempt 1`,
    `skraft ${SLUG} · deliver · pass 2 · scenario 2 of 2 · attempt 1`,
    `skraft ${SLUG} · deliver · pass 3 · scenario 2 of 2 · attempt 1`,
  ])
  assert.ok(promptOf(host, `skraft ${SLUG} · deliver · pass 3 · scenario 2 of 2 · attempt 1`).includes('\n- Scenario: 2 of 2 — "Customer is refused an expired card" (component api, tags @error-case)\n'))
})

test('a scenario review a workflow asks before the scenarios are written waits on the machine, saying where it belongs', async () => {
  const early = CYCLE_WORKFLOW
    .replace('distill  [shape=box, agent="acceptance-designer", phase="DISTILL"]', 'distill  [shape=box, agent="acceptance-designer", phase="DISTILL", each="scenario"]\n  scenario_review [shape=hexagon, question="scenario-review"]')
    .replace('deliver  [shape=box, agent="software-engineer", phase="DELIVER"]', 'deliver  [shape=box, agent="software-engineer", phase="DELIVER", each="scenario"]')
    .replace('adr -> distill   [label="RATIFIED"]', 'adr -> scenario_review   [label="RATIFIED"]\n  scenario_review -> distill [label="APPROVED"]\n  scenario_review -> design [label="REVISE", max_visits=1]')
  const host = scripted({ files: { '.skraft/pipeline.skraft.dot': early } }, (it) => [...research(it), unavailable])

  const outcome = await host.start()

  assert.deepEqual([outcome.status, outcome.reason], ['waiting', waitingOnEnvironment('scenario_review', 'the run recorded no scenario of the story to show yet; put the scenario review after the node that writes them')])
})

test('a red an earlier attempt proved stays the scenario\'s oracle when the pass is tried again, and is not judged again', async () => {
  const PLAN = 'details/2026-10-11/test-plan-checkout.md'
  const host = scripted({}, (it) => [...research(it), agent({ work: (h) => { red(1)(h); h.tracking.write(SLUG, PLAN, '# Test plan\n') }, fill: false })(it), agent({ work: () => {} })(it), agent()(it), unavailable])

  await host.start()

  assert.deepEqual(recorded(host, 'distill').map(({ outcome, oracle }) => [outcome, oracle?.command]), [['failed', undefined], ['done', 'test']])
  assert.deepEqual(host.agentRunner.judged.map(({ label }) => label.split(' · ').slice(1, 3).join(' · ')), ['distill · judge red root-1 of attempt 1', 'deliver · judge green root-2 of attempt 1'])
  assert.deepEqual(recorded(host, 'deliver').map(({ outcome, failures }) => [outcome, failures]), [['done', []]])
})

test('a pass that writes the acceptance test of a later scenario commits it, whatever the scenarios before it committed', async () => {
  const host = scripted({}, (it) => [...research(it), agent({ plan: THREE.slice(0, 2) })(it), agent()(it), agent({ work: () => {} })(it), unavailable])

  await host.start()

  assert.deepEqual(recorded(host, 'distill').map(({ outcome, failures }) => [outcome, failures]), [['done', []], ['failed', ['scenario 2 has no failing acceptance test committed: commit it with the skeleton it calls as one test commit']]])
})
