import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, API, nominal, scripted, SLUG } from '../support/pipeline-host.mjs'

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

test('a .NET acceptance test added outside a <Context>.UnitTest project is a G11 blocker the engine reads, given to testability and checked by the refuter', async () => {
  const host = await reviewed({}, ['tests/Acceptance/CheckoutAcceptanceTests.cs', 'src/Checkout.cs'])

  assert.deepEqual(layout(host), [
    'F1 G11 blocker tests/Acceptance/CheckoutAcceptanceTests.cs: a test added outside a <Context>.UnitTest project and the integration place of dotnet, where clean-architecture-testing puts it',
    'F2 G11 blocker tests: api gains tests and none in a <Context>.UnitTest project: the acceptance test of a new use case goes there',
  ])
  const testability = host.agentRunner.reviewed().find((dispatch) => dispatch.agent === 'testability-lens').prompt
  assert.ok(testability.includes('- The engine reports these findings from the patch; never report them again:\n  - F1 G11 blocker at tests/Acceptance/CheckoutAcceptanceTests.cs'), testability)
  assert.deepEqual(host.agentRunner.reviewed().filter((dispatch) => dispatch.agent === 'finding-refuter').map(({ label }) => label.split(' · ')[2]), ['refute testability#layout F1', 'refute testability#layout F2'])
  assert.deepEqual(host.events().find((event) => event.type === 'step.recorded' && event.step === 'distill_review').outcome, 'needs-rework')
})

test('tests added in the unit or the integration place of their language pass; a test the patch only changes, or a source file, is not judged', async () => {
  const dotnet = await reviewed({}, ['tests/Checkout.UnitTest/Features/PayTests.cs', 'tests/Checkout.IntegrationTest/Api/PayEndpointTests.cs', 'tests/fixtures/payment.json', 'tests/Checkout.UnitTest/fixtures/Card.cs'], ['tests/Legacy/OldTests.cs'])
  assert.deepEqual(layout(dotnet), [])

  const java = await reviewed({ components: [{ ...API, stack: 'java', paths: { src: ['src'], tests: ['.'] } }] }, ['checkout-unit-test/src/test/java/PayTest.java', 'checkout-integration-test/src/test/java/PayIT.java'])
  assert.deepEqual(layout(java), [])

  const node = await reviewed({ components: [{ ...API, stack: 'javascript', paths: { src: ['src'], tests: ['tests'] } }] }, ['tests/unit/pay.test.mjs', 'tests/integration/pay-api.test.mjs'])
  assert.deepEqual(layout(node), [])
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
  assert.deepEqual(layout(java), ['F1 G11 blocker src/test/java/RefundTest.java: a test added outside a <context>-unit-test module and the integration place of java, where clean-architecture-testing puts it'])
  assert.ok(!(await java.tracking.read(SLUG, 'reviews/distill_review-1/verdict.yaml')).includes('dissent'))
})
