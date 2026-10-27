import { test } from 'node:test'
import assert from 'node:assert/strict'
import { API } from '../support/pipeline-host.mjs'
import { finding, lenses, REVIEWS, reviewHost, says, SLUG, TEST_FILE, weakensAssertion } from './support.mjs'

const NO_COPIES = "- In this review, docs/adr/decisions-index.md, the ADRs and the rule files in the working copy are the pull request author's version, and no base copies are given: judge without them."
const DEGRADED = '- No `.feature` file and no test plan among these inputs: judge G9 by comparing the lines the patch removes with the lines it adds (an assertion weakened, a test deleted, a skip or a focus added); their absence alone is no reason to answer inconclusive.'

test('a pull request of the .NET fixture that weakens an assertion needs rework: test-integrity, told it has no .feature nor test plan, cites the removed line under G9', async () => {
  const host = reviewHost()
  weakensAssertion(host.git)
  const weakened = finding('F1', 'blocker', 'Assert.Equal(90, total) became Assert.NotNull(total)', { gate: 'G9', location: `/work/${TEST_FILE}:14` })
  host.agentRunner.review = lenses({ 'test-integrity': [says('test-integrity', 'fail', [weakened])] })

  const outcome = await host.review()

  assert.deepEqual(outcome, {
    status: 'NEEDS_REWORK', number: 12, pass: 1, code: null,
    reason: 'NEEDS_REWORK: 1 reason to address',
    reasons: [`test-integrity F1 G9 blocker at ${TEST_FILE}:14: Assert.Equal(90, total) became Assert.NotNull(total)`],
    details: [],
    file: `${REVIEWS}/reviews/verdict-1/verdict.yaml`,
    comment: null,
    unpublished: null,
  })
  assert.deepEqual(host.agentRunner.batches.map((batch) => batch.map(({ agent }) => agent)), [
    ['test-integrity-lens', 'architecture-boundaries-lens', 'cold-reader-lens'],
    ['finding-refuter'],
  ])
  const brief = host.prompt('test-integrity-lens')
  assert.ok(brief.startsWith('## Skraft review lens: test-integrity (DELIVER)\n- Story: #12\n- Feature scope: pr-12\n'), brief)
  assert.ok(!brief.includes('Discount at checkout'), brief)
  assert.ok(brief.includes(`\n  - Changes since the base of the run (open a whole file only when the patch lacks the context a finding needs): ${REVIEWS}/reviews/verdict-1/changes.patch\n`), brief)
  assert.ok(brief.includes(`\n${DEGRADED}\n`), brief)
  for (const prompt of [brief, host.prompt('finding-refuter')]) assert.ok(prompt.includes(`\n${NO_COPIES}\n`) && !prompt.includes('judge by the base copies'), prompt)
  assert.equal(await host.reviews.read('pr-12', 'reviews/verdict-1/changes.patch'), `diff --git a/${TEST_FILE} b/${TEST_FILE}\n-        Assert.Equal(90, total);\n+        Assert.NotNull(total);\n`)
  assert.deepEqual(host.events().map(({ type, step, visit, outcome: recorded }) => [type, step, visit, recorded]), [
    ['step.started', 'verdict', 1, undefined],
    ['review.lens', 'verdict', 1, undefined],
    ['review.lens', 'verdict', 1, undefined],
    ['review.lens', 'verdict', 1, undefined],
    ['review.refuted', 'verdict', 1, undefined],
    ['step.recorded', 'verdict', 1, 'needs-rework'],
  ])
  assert.deepEqual(host.progress.lines, [
    'pr-12: review of pull request #12 (test-integrity, architecture-boundaries, cold-reader, mock-fidelity, contract-fidelity)',
    'pr-12: NEEDS_REWORK: 1 reason to address',
  ])
  assert.equal(host.events().at(-1).durationMs, 0)
  assert.deepEqual(JSON.parse(await host.reviews.read(SLUG, 'reviews/verdict-1/components.json')), [{ name: API.name, root: API.root, stack: API.stack, mocking: API.mocking, contractTesting: false, gates: [] }])
  const started = host.events()[0]
  assert.deepEqual([started.phase, started.pullRequest, started.base, started.head, started.lenses], ['DELIVER', 12, 'root-0', 'root-1', ['test-integrity', 'architecture-boundaries', 'cold-reader', 'mock-fidelity', 'contract-fidelity']])
})

test('a clean pull request is approved; a low finding stays a note, the refuter asked nothing, and a second run on the same head is pass 2', async () => {
  const host = reviewHost()
  host.git.commit('feat: discount at checkout', ['src/Checkout/Discount.cs'])
  host.git.adds('src/Checkout/Discount.cs', 'public decimal Apply(decimal total) => total > 100 ? total * 0.9m : total;')
  const low = finding('F1', 'low', 'name the discount threshold', { gate: 'C2', location: 'src/Checkout/Discount.cs:1', suggestion: 'DiscountThreshold' })
  host.agentRunner.review = lenses({ 'cold-reader': [says('cold-reader', 'pass', [low])] })

  const outcome = await host.review()

  assert.deepEqual(outcome, {
    status: 'APPROVED', number: 12, pass: 1, code: null,
    reason: 'APPROVED: no finding counts; 1 note (cold-reader F1)',
    reasons: [],
    details: ['note: cold-reader F1 C2 low at src/Checkout/Discount.cs:1: name the discount threshold (suggestion: DiscountThreshold)'],
    file: `${REVIEWS}/reviews/verdict-1/verdict.yaml`,
    comment: null,
    unpublished: null,
  })
  assert.equal(host.agentRunner.batches.length, 1)
  assert.equal(host.events().at(-1).outcome, 'approved')
  assert.equal(host.progress.lines.at(-1), 'pr-12: APPROVED: no finding counts; 1 note (cold-reader F1)')

  const again = await host.review()

  assert.deepEqual([again.status, again.pass], ['APPROVED', 2])
  assert.equal(host.progress.lines.at(-2), 'pr-12: review of pull request #12, pass 2 (test-integrity, architecture-boundaries, cold-reader, mock-fidelity, contract-fidelity)')
})

test('a lens that answers inconclusive blocks the review: BLOCKED, journaled blocked, no finding checked', async () => {
  const host = reviewHost()
  host.git.commit('feat: discount', ['src/Discount.cs'])
  const unread = finding('F1', 'low', 'the patch file could not be read', { gate: 'G7', location: '' })
  host.agentRunner.review = lenses({ 'test-integrity': [says('test-integrity', 'inconclusive', [unread])] })

  const outcome = await host.review()

  assert.deepEqual([outcome.status, outcome.code, outcome.reason], ['BLOCKED', 'lens-inconclusive', 'test-integrity: inconclusive: the patch file could not be read'])
  assert.deepEqual([host.events().at(-1).outcome, host.events().at(-1).code], ['blocked', 'lens-inconclusive'])
  assert.equal(host.agentRunner.batches.length, 1)
})
