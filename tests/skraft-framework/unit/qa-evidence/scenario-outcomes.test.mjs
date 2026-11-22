import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SLUG, agent, scripted } from '../support/pipeline-host.mjs'

const research = (it) => [agent()(it), agent()(it)]
const TWO = [['Customer pays by card', 'api', '@walking-skeleton @AC-1'], ['Customer is refused an expired card', 'api', '@error-case @AC-2']]
const IMPL_PLAN = 'details/2026-10-11/impl-plan-checkout.md'
/** The designer's pass: one red holding both acceptance tests, then one group of both. */
const designing = async ({ git, tracking }) => {
  git.commit(`test(${SLUG}): acceptance tests S1–S2`, ['tests/Integration/WalkingSkeletonTests.cs', 'tests/Acceptance/S1AcceptanceTests.cs', 'tests/Acceptance/S2AcceptanceTests.cs'])
  await tracking.write(SLUG, IMPL_PLAN, '# Implementation plan\n\n| Group | Scenarios | Rule |\n|---|---|---|\n| 1 | S1, S2 | rule 1 |\n')
}
/** What the whole suite prints: the test of S1 named, S2's under another name. */
const SUITE_LOG = 'Passed CheckoutTests.S1_pays_by_card [12 ms]\nPassed CheckoutTests.refuses_expired_card [3 ms]\nPassed ReceiptTests.S21_prints_the_receipt [2 ms]\n'

/** A story of two scenarios, delivered in one green, its trace changed by `trace`. */
const delivered = async (trace = {}) => {
  const host = scripted({}, (it) => [...research(it), agent({ plan: TWO, work: designing })(it), agent({ trace: { log: (run) => (run.gate === 'test' ? SUITE_LOG : ''), ...trace } })(it)])
  const outcome = await host.start()
  assert.equal(outcome.status, 'done', outcome.reason)
  return host
}

/** The Scenarios section of qa-report.md. */
const scenariosOf = async (host) => {
  const report = await host.tracking.read(SLUG, 'qa-report.md')
  const start = report.indexOf('## Scenarios\n')
  assert.ok(start >= 0, report)
  return report.slice(start).split('\n\n')[1].split('\n')
}

test('a scenario passed when its acceptance test is its red commit\'s, a green delivered its group and the whole suite passed on the final commit; its test named in the log is said', async () => {
  const host = await delivered()

  assert.deepEqual(await scenariosOf(host), [
    '- S1 Customer pays by card (api, @AC-1): passed (red root-1, green root-2, suite run 4 on root-2, named in its log)',
    '- S2 Customer is refused an expired card (api, @AC-2): passed (red root-1, green root-2, suite run 4 on root-2, suite green; the log does not name this test)',
  ])
})

test('a whole suite that failed, or ran on another commit than the final one, proves no scenario', async () => {
  const failed = await delivered({ edit: (run) => (run.gate === 'test' ? { ...run, exitCode: 1 } : run) })
  assert.deepEqual(await scenariosOf(failed), [
    '- S1 Customer pays by card (api, @AC-1): not proven: the whole test suite failed on the final commit',
    '- S2 Customer is refused an expired card (api, @AC-2): not proven: the whole test suite failed on the final commit',
  ])

  const elsewhere = await delivered({ edit: (run) => (run.gate === 'test' ? { ...run, headAfter: 'root-1' } : run) })
  assert.deepEqual((await scenariosOf(elsewhere))[0], '- S1 Customer pays by card (api, @AC-1): not proven: the whole test suite did not run on the final commit')

  const none = await delivered({ omit: ['api/test'] })
  assert.deepEqual((await scenariosOf(none))[1], '- S2 Customer is refused an expired card (api, @AC-2): not proven: no traced run of the whole test suite of its component')
})
