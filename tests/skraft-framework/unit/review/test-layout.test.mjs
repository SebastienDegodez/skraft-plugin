import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, API, nominal, scripted, SLUG, TRACKING } from '../support/pipeline-host.mjs'
import { InMemoryAgentCatalog } from '../support/in-memory-host.mjs'

/** A DISTILL that commits these files, each added (new) unless named in `changed`. @param {string[]} added @param {string[]} [changed] */
const distill = (added, changed = []) => agent({ work: ({ git }) => {
  for (const path of added) git.patched(path, ['new file mode 100644', '--- /dev/null', `+++ b/${path}`, '@@ -0,0 +1,1 @@', '+// test'])
  for (const path of changed) git.patched(path, [`--- a/${path}`, `+++ b/${path}`, '@@ -1,1 +1,1 @@', '-// old', '+// test'])
  git.commit('test(checkout): acceptance of the card payment', [...added, ...changed])
} })

/** The run up to the DISTILL review: every lens passes, the refuter confirms what it is asked. @param {object} options @param {string[]} added @param {string[]} [changed] */
const reviewed = async (options, added, changed) => {
  const host = scripted(options, (it) => [...nominal(it).slice(0, 2), distill(added, changed)(it), () => ({ ok: false, unavailable: true, text: '', error: 'stop here' })])
  await host.start()
  return host
}

/** The engine's G11 findings on the DISTILL review, as `severity location: description`. @param {ReturnType<typeof scripted>} host */
const layout = (host) => (host.events().find((event) => event.type === 'review.lens' && event.lens === 'testability#layout')?.findings ?? [])
  .map(({ id, gate, severity, location, description }) => `${id} ${gate} ${severity} ${location}: ${description}`)

test('a .NET acceptance test added outside a <Context>.UnitTest project is a G11 blocker the engine reads, given to testability and checked by the refuter one tier above testability, with the skills and the descriptor that state G11', async () => {
  const catalog = new InMemoryAgentCatalog({ skills: { 'testability-lens': ['acceptance-review-criteria'] }, skillFiles: { 'acceptance-review-criteria': '# G11\n' } })
  const host = await reviewed({ catalog, config: { assign: { agents: { 'testability-lens': 'implementer' } } } }, ['tests/Acceptance/CheckoutAcceptanceTests.cs', 'src/Checkout.cs'])

  assert.deepEqual(layout(host), [
    'F1 G11 blocker tests/Acceptance/CheckoutAcceptanceTests.cs: a test added outside a <Context>.UnitTest, <Context>.UnitTests or <Context>.Tests project and the integration place of dotnet, where clean-architecture-testing puts it',
    'F2 G11 blocker tests: api gains tests and none in a <Context>.UnitTest, <Context>.UnitTests or <Context>.Tests project: the acceptance test of a new use case goes there',
  ])
  const testability = host.agentRunner.reviewed().find((dispatch) => dispatch.agent === 'testability-lens').prompt
  assert.ok(testability.includes('- The engine reports these findings from the patch; never report them again:\n  - F1 G11 blocker at tests/Acceptance/CheckoutAcceptanceTests.cs'), testability)
  assert.deepEqual(host.agentRunner.reviewed().filter((dispatch) => dispatch.agent === 'finding-refuter').map(({ label, model }) => `${label.split(' · ')[2]} ${model}`), ['refute testability#layout F1 frontier', 'refute testability#layout F2 frontier'])
  const check = host.agentRunner.reviewed().find((dispatch) => dispatch.agent === 'finding-refuter').prompt
  assert.ok(check.includes('\n- Skill (read it before any other input and judge with its criteria): /plugin/skills/acceptance-review-criteria/SKILL.md\n- Lens (read it with the skills: its gate table states the rule of each gate a finding cites): /plugin/agents/testability-lens.md\n'), check)
  assert.deepEqual(host.events().find((event) => event.type === 'step.recorded' && event.step === 'distill_review').outcome, 'needs-rework')
})

test('the engine\'s own G11 findings left at a review\'s ceiling are asked about with what they say, no context given and no table of others (#499)', async () => {
  const added = ['tests/Acceptance/CheckoutAcceptanceTests.cs']
  const host = scripted({ answers: [{ answer: 'STOP' }] }, (it) => [...nominal(it).slice(0, 2), ...[1, 2, 3].map(() => distill(added)(it))])

  assert.equal((await host.start()).code, 'loop-ceiling')

  assert.equal(host.human.questions[0].text, [
    'distill_review: distill did not fix every finding after 3 passes, so the run does not send it back again.',
    '',
    'Blocker and high (2):',
    '- blocker · testability#layout F1 G11 at tests/Acceptance/CheckoutAcceptanceTests.cs: a test added outside a .UnitTest, .UnitTests or .Tests project and the integration place of dotnet, where clean-architecture-testing puts it',
    '- blocker · testability#layout F2 G11 at tests: api gains tests and none in a .UnitTest, .UnitTests or .Tests project: the acceptance test of a new use case goes there',
    '',
    `Every finding with its context: ${TRACKING}/reviews/distill_review-3/verdict.yaml`,
    'A blocker or high finding cannot be accepted: an instruction runs distill again with every finding and the instruction; STOP ends the run.',
  ].join('\n'))
})

test('tests added in the unit or the integration place of their language pass, its project named in the singular or the plural; a test the patch only changes, or a source file, is not judged', async () => {
  const dotnet = await reviewed({}, ['tests/Checkout.UnitTest/Features/PayTests.cs', 'tests/Checkout.IntegrationTest/Api/PayEndpointTests.cs', 'tests/fixtures/payment.json', 'tests/Checkout.UnitTest/fixtures/Card.cs'], ['tests/Legacy/OldTests.cs'])
  assert.deepEqual(layout(dotnet), [])

  const plural = await reviewed({}, ['tests/MonAssurance.UnitTests/Features/EligibilityCheck/EligibilityCheckAcceptanceTests.cs', 'tests/MonAssurance.IntegrationTests/Api/EligibilityEndpointsTests.cs', 'tests/Billing.Unit.Tests/RefundTests.cs', 'tests/Billing.Integration.Tests/RefundApiTests.cs'])
  assert.deepEqual(layout(plural), [])

  const tests = await reviewed({}, ['tests/Checkout.Tests/PayTests.cs', 'tests/Checkout.Test/RefundTests.cs', 'src/Checkout/PayTests.cs'])
  assert.deepEqual(layout(tests), [])

  const java = await reviewed({ components: [{ ...API, stack: 'java', paths: { src: ['src'], tests: ['.'] } }] }, ['checkout-unit-test/src/test/java/PayTest.java', 'checkout-integration-test/src/test/java/PayIT.java'])
  assert.deepEqual(layout(java), [])

  const javaPlural = await reviewed({ components: [{ ...API, stack: 'java', paths: { src: ['src'], tests: ['.'] } }] }, ['checkout-unit-tests/src/test/java/PayTest.java', 'checkout-integration-tests/src/test/java/PayIT.java'])
  assert.deepEqual(layout(javaPlural), [])

  const node = await reviewed({ components: [{ ...API, stack: 'javascript', paths: { src: ['src'], tests: ['tests'] } }] }, ['tests/unit/pay.test.mjs', 'tests/integration/pay-api.test.mjs'])
  assert.deepEqual(layout(node), [])
})

test('a .NET or Java component whose new tests all sit in its integration project, however named, gains none in its unit place', async () => {
  const dotnet = await reviewed({}, ['tests/Checkout.Integration.Tests/PayApiTests.cs', 'tests/Checkout.IntegrationTests/RefundApiTests.cs'])
  assert.deepEqual(layout(dotnet), ['F1 G11 blocker tests: api gains tests and none in a <Context>.UnitTest, <Context>.UnitTests or <Context>.Tests project: the acceptance test of a new use case goes there'])

  const java = await reviewed({ components: [{ ...API, stack: 'java', paths: { src: ['src'], tests: ['.'] } }] }, ['checkout-integration-tests/src/test/java/PayIT.java'])
  assert.deepEqual(layout(java), ['F1 G11 blocker .: api gains tests and none in a <context>-unit-test or <context>-unit-tests module: the acceptance test of a new use case goes there'])
})

/** A component of that stack, its tests where `tests` says. @param {string} stack @param {string[]} [tests] */
const component = (stack, tests = ['tests']) => ({ components: [{ ...API, stack, paths: { src: ['src'], tests } }] })

test('each stack passes the unit and integration places clean-architecture-testing gives it, under the test paths skraft-config.json configures, and refuses a test added elsewhere under them', async () => {
  const placed = {
    python: [component('python'), ['tests/unit/place_order/test_place_order.py', 'tests/integration/orders/test_sqlalchemy_orders.py']],
    typescript: [component('typescript', ['test']), ['test/unit/borrow-book.test.ts', 'test/integration/books-api.test.ts']],
    react: [component('react'), ['tests/unit/todos/application/ListTodos.test.ts', 'tests/integration/todos/infrastructure/HttpTodoGateway.test.ts']],
    configured: [component('python', ['tests/py/unit', 'tests/py/integration']), ['tests/py/unit/test_pay.py', 'tests/py/integration/test_pay_api.py']],
    root: [component('dotnet', ['.']), ['Checkout.UnitTests/PayTests.cs', 'Checkout.IntegrationTests/PayApiTests.cs']],
    dotnet: [component('dotnet', ['tests/MonAssurance.UnitTests', 'tests/MonAssurance.IntegrationTests']), ['tests/MonAssurance.UnitTests/Features/EligibilityCheckTests.cs', 'tests/MonAssurance.IntegrationTests/Api/EligibilityEndpointsTests.cs']],
  }
  for (const [stack, [options, added]] of Object.entries(placed)) assert.deepEqual(layout(await reviewed(options, added)), [], stack)

  assert.deepEqual(layout(await reviewed(component('python'), ['tests/test_pay.py', 'tests/unit/test_refund.py'])), ['F1 G11 blocker tests/test_pay.py: a test added outside tests/unit/ and the integration place of python, where clean-architecture-testing puts it'])
  assert.deepEqual(layout(await reviewed(component('typescript', ['test']), ['test/books-api.test.ts'])), [
    'F1 G11 blocker test/books-api.test.ts: a test added outside test/unit/ and the integration place of typescript, where clean-architecture-testing puts it',
    'F2 G11 blocker test: api gains tests and none in test/unit/: the acceptance test of a new use case goes there',
  ])
  assert.deepEqual(layout(await reviewed(component('react'), ['tests/components/TodoList.test.tsx', 'tests/unit/todos/ui/TodoList.test.tsx'])), ['F1 G11 blocker tests/components/TodoList.test.tsx: a test added outside tests/unit/ and the integration place of react, where clean-architecture-testing puts it'])
  assert.deepEqual(layout(await reviewed(component('python', ['tests/py/unit', 'tests/py/integration']), ['tests/py/integration/test_pay_api.py'])), ['F1 G11 blocker tests/py/unit: api gains tests and none in tests/py/unit/: the acceptance test of a new use case goes there'])
  assert.deepEqual(layout(await reviewed(component('dotnet', ['.']), ['Checkout.Integration.Tests/PayApiTests.cs'])), ['F1 G11 blocker .: api gains tests and none in a <Context>.UnitTest, <Context>.UnitTests or <Context>.Tests project: the acceptance test of a new use case goes there'])
  assert.deepEqual(layout(await reviewed(component('dotnet', ['tests/MonAssurance.UnitTests', 'tests/Shared']), ['tests/Shared/Builders/DriverTests.cs'])), [
    'F1 G11 blocker tests/Shared/Builders/DriverTests.cs: a test added outside a <Context>.UnitTest, <Context>.UnitTests or <Context>.Tests project and the integration place of dotnet, where clean-architecture-testing puts it',
    'F2 G11 blocker tests/MonAssurance.UnitTests: api gains tests and none in a <Context>.UnitTest, <Context>.UnitTests or <Context>.Tests project: the acceptance test of a new use case goes there',
  ])
})

test('a JavaScript or Java test added beside its unit place is named with that place', async () => {
  const node = await reviewed({ components: [{ ...API, stack: 'javascript', paths: { src: ['src'], tests: ['tests'] } }] }, ['tests/pay.test.mjs'])
  assert.deepEqual(layout(node), [
    'F1 G11 blocker tests/pay.test.mjs: a test added outside tests/unit/ and the integration place of javascript, where clean-architecture-testing puts it',
    'F2 G11 blocker tests: api gains tests and none in tests/unit/: the acceptance test of a new use case goes there',
  ])

  const bare = await reviewed({ components: [{ ...API, stack: 'javascript', paths: { src: [], tests: [] } }] }, ['pay.test.mjs'])
  assert.deepEqual(layout(bare), [
    'F1 G11 blocker pay.test.mjs: a test added outside unit/ and the integration place of javascript, where clean-architecture-testing puts it',
    'F2 G11 blocker .: api gains tests and none in unit/: the acceptance test of a new use case goes there',
  ])

  const java = await reviewed({ components: [{ ...API, stack: 'java', paths: { src: ['src'], tests: ['.'] } }] }, ['checkout-unit-test/src/test/java/PayTest.java', 'src/test/java/RefundTest.java'])
  assert.deepEqual(layout(java), ['F1 G11 blocker src/test/java/RefundTest.java: a test added outside a <context>-unit-test or <context>-unit-tests module and the integration place of java, where clean-architecture-testing puts it'])
  assert.ok(!(await java.tracking.read(SLUG, 'reviews/distill_review-1/verdict.yaml')).includes('dissent'))
})
