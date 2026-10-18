import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, API, finding, lenses, nominal, refutes, says, scripted, SLUG, tddCycle, TRACKING } from '../support/pipeline-host.mjs'
import { BUILT_IN_WORKFLOW } from '../support/in-memory-host.mjs'
import { designating, edit } from '../workflow/support.mjs'

const DISSENT = '- Only cold-reader found a blocker, high or medium finding; test-integrity, architecture-boundaries found none.'

/** The refuter's dispatches. @param {ReturnType<typeof scripted>} host */
const checks = (host) => host.agentRunner.reviewed().filter((dispatch) => dispatch.agent === 'finding-refuter')

/** The review.refuted events, as `lens finding verdict dissent`. @param {ReturnType<typeof scripted>} host */
const refuted = (host) => host.events().filter((event) => event.type === 'review.refuted').map(({ lens, finding: id, verdict, dissent }) => `${lens} ${id} ${verdict} ${dissent ?? '-'}`)

test('a lens alone in finding what sends the work back is judged with every input of the review, the lenses that passed named; the refutation is kept as a dissent', async () => {
  const host = scripted({}, nominal)
  host.agentRunner.review = lenses({
    'cold-reader': [says('cold-reader', 'fail', [finding('F1', 'medium', 'pay names no currency', { location: 'src/Checkout.cs:3' })])],
    refuter: [refutes('refuted', 'details/2026-10-11/context-map.md:12 fixes pay(amount) and no currency: the code answers the story as it is')],
  })

  assert.equal((await host.start()).status, 'done')

  const [check] = checks(host)
  assert.ok(check.prompt.includes([
    DISSENT,
    '- Judge it as the reviewer, with every input of the review: confirm it only when the defect stands with all of them and warrants sending the work back; refute it when the story, a contract or a document shows the work is right as it is, or when its fix would change what they fix, and say why in reason.',
  ].join('\n')), check.prompt)
  assert.ok(check.prompt.includes(`  - Review context (story, project rules, who wrote which document): ${TRACKING}/reviews/deliver_review-1/context.md`), check.prompt)
  assert.ok(check.prompt.includes(`  - Documents of the story and of the other phases: ${TRACKING}/details/2026-10-11/context-map.md`), check.prompt)
  assert.deepEqual(refuted(host), ['cold-reader F1 refuted true'])
  const verdict = await host.tracking.read(SLUG, 'reviews/deliver_review-1/verdict.yaml')
  assert.ok(verdict.includes('    dissent: true\n'), verdict)
  assert.ok(!host.agentRunner.reviewed().find((dispatch) => dispatch.agent === 'cold-reader-lens').prompt.includes('Review context'))
})

test('when two lenses find what sends the work back, each finding is checked on its own lens\'s inputs, with no dissent', async () => {
  const host = scripted({}, nominal)
  host.agentRunner.review = lenses({
    'cold-reader': [says('cold-reader', 'fail', [finding('F1', 'medium', 'pay names no currency', { location: 'src/Checkout.cs:3' })])],
    'architecture-boundaries': [says('architecture-boundaries', 'fail', [finding('F1', 'high', 'the domain imports the database driver', { location: 'src/Checkout.cs:1' })])],
    refuter: [refutes('refuted'), refutes('refuted')],
  })

  await host.start()

  const cold = checks(host).find(({ label }) => label.includes('refute cold-reader F1')).prompt
  assert.ok(!cold.includes('Only ') && !cold.includes('Review context'), cold)
  assert.deepEqual(refuted(host), ['architecture-boundaries F1 refuted -', 'cold-reader F1 refuted -'])
  assert.ok(!(await host.tracking.read(SLUG, 'reviews/deliver_review-1/verdict.yaml')).includes('dissent'))
})

test('a review of one lens has no dissent: nobody passed beside it', async () => {
  const workflow = edit(BUILT_IN_WORKFLOW, ['lenses="consistency,architecture-compliance,fitness"', 'lenses="consistency"'])
  const host = scripted({ files: designating(workflow, { components: [API] }) }, nominal)
  host.agentRunner.review = lenses({ consistency: [says('consistency', 'fail', [finding('F1', 'high', 'the ADR contradicts the context map')])], refuter: [refutes('refuted')] })

  await host.start()

  assert.ok(!checks(host)[0].prompt.includes('Only '), checks(host)[0].prompt)
  assert.deepEqual(refuted(host), ['consistency F1 refuted -'])
})

test('the engine\'s own G9 findings are never a dissent, even when no lens finds anything', async () => {
  const host = scripted({}, (it) => [
    ...nominal(it).slice(0, 3),
    agent({ work: ({ git }) => {
      tddCycle()({ git })
      git.patched('tests/CheckoutTests.cs', ['--- a/tests/CheckoutTests.cs', '+++ b/tests/CheckoutTests.cs', '@@ -9,1 +9,1 @@', '-    [Fact]', '+    [Fact(Skip = "flaky")]'])
      git.change('tests/CheckoutTests.cs')
    } })(it),
    () => ({ ok: false, unavailable: true, text: '', error: 'stop here' }),
  ])
  host.agentRunner.review = lenses({ refuter: [refutes('confirmed')] })

  await host.start()

  const [check] = checks(host)
  assert.ok(check.label.includes('refute test-integrity#patch F1') && !check.prompt.includes('Only '), check.prompt)
  assert.deepEqual(refuted(host), ['test-integrity#patch F1 confirmed -'])
})
