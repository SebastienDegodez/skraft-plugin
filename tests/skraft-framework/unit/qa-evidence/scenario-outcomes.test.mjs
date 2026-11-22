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

/** The rows of the scenario table of qa-report.md, the one the pull request folds. */
const scenariosOf = async (host) => (await sectionOf(host, 'Scenario outcomes')).split('\n').slice(2)

/** A section of qa-report.md, without its heading. */
const sectionOf = async (host, heading) => {
  const report = await host.tracking.read(SLUG, 'qa-report.md')
  const start = report.indexOf(`## ${heading}\n\n`)
  assert.ok(start >= 0, report)
  return report.slice(start + `## ${heading}\n\n`.length).split('\n\n## ')[0].trim()
}

test('a scenario passed when its acceptance test is its red commit\'s, a green delivered its group and the whole suite passed on the final commit; its test named in the log is said', async () => {
  const host = await delivered()

  assert.deepEqual(await scenariosOf(host), [
    '| S1 | Customer pays by card | `@AC-1` | api | `root-1` | `root-2` | r4 on `root-2` | yes | — |',
    '| S2 | Customer is refused an expired card | `@AC-2` | api | `root-1` | `root-2` | r4 on `root-2` | no | — |',
  ])
  assert.ok((await sectionOf(host, 'QA')).startsWith('QA: 2/2 scenarios passed on `root-2` (run r4, 0 s).'))
})

test('a whole suite that failed, or ran on another commit than the final one, proves no scenario', async () => {
  const failed = await delivered({ edit: (run) => (run.gate === 'test' ? { ...run, exitCode: 1 } : run) })
  assert.deepEqual(await scenariosOf(failed), [
    '| S1 | Customer pays by card | `@AC-1` | api | `root-1` | `root-2` | not proven: the whole test suite failed on the final commit | yes | — |',
    '| S2 | Customer is refused an expired card | `@AC-2` | api | `root-1` | `root-2` | not proven: the whole test suite failed on the final commit | no | — |',
  ])

  const elsewhere = await delivered({ edit: (run) => (run.gate === 'test' ? { ...run, headAfter: 'root-1' } : run) })
  assert.deepEqual((await scenariosOf(elsewhere))[0], '| S1 | Customer pays by card | `@AC-1` | api | `root-1` | `root-2` | not proven: the whole test suite did not run on the final commit | yes | — |')

  const none = await delivered({ omit: ['api/test'] })
  assert.deepEqual((await scenariosOf(none))[1], '| S2 | Customer is refused an expired card | `@AC-2` | api | `root-1` | `root-2` | not proven: no traced run of the whole test suite of its component | — | — |')
})
