import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, finding, lenses, nominal, refutes, reviews, says, scripted, SLUG, TRACKING } from '../support/pipeline-host.mjs'

const CONTEXT_MAP = 'details/2026-10-11/context-map.md'
const RESEARCH = 'research/2026-10-11/checkout-research.md'
const TEST_PLAN = 'details/2026-10-11/test-plan-checkout.md'
const CHANGE_LOG = 'changes/2026-10-11/change-log.md'

/** The lens and refuter dispatches, as `agent label`. @param {ReturnType<typeof scripted>} host */
const lensLabels = (host) => host.agentRunner.reviewed().map(({ agent: id, source, label }) => `${id} ${source} ${label}`)

test('every lens of each phase passing approves the phase, and the run goes on to the next one', async () => {
  const host = scripted({}, nominal)

  const outcome = await host.start({ story: { issue: 42, title: 'Pay by card' } })

  assert.equal(outcome.status, 'done')
  assert.deepEqual(reviews(host), [
    ['design_review', 1, 'approved', 'distill'],
    ['distill_review', 1, 'approved', 'deliver'],
    ['deliver_review', 1, 'approved', 'exit'],
  ])
  assert.deepEqual(host.agentRunner.batches.map((batch) => batch.map(({ agent: id }) => id)), [
    ['consistency-lens', 'architecture-compliance-lens', 'fitness-lens'],
    ['coverage-lens', 'business-alignment-lens', 'testability-lens', 'boundary-enforcement-lens'],
    ['test-integrity-lens', 'architecture-boundaries-lens', 'cold-reader-lens'],
  ])
  assert.deepEqual(lensLabels(host).slice(0, 3), [
    `consistency-lens plugin skraft ${SLUG} · design_review · consistency · attempt 1`,
    `architecture-compliance-lens plugin skraft ${SLUG} · design_review · architecture-compliance · attempt 1`,
    `fitness-lens plugin skraft ${SLUG} · design_review · fitness · attempt 1`,
  ])
  const recorded = host.events().find((event) => event.type === 'step.recorded' && event.step === 'design_review')
  assert.deepEqual([recorded.code, recorded.failures, recorded.reason], [null, [], 'APPROVED: consistency, architecture-compliance, fitness approve'])
  assert.deepEqual(host.events().filter((event) => event.type === 'review.lens' && event.step === 'design_review').map(({ visit, lens, agent: id, verdict, findings }) => [visit, lens, id, verdict, findings]), [
    [1, 'consistency', 'consistency-lens', 'pass', []],
    [1, 'architecture-compliance', 'architecture-compliance-lens', 'pass', []],
    [1, 'fitness', 'fitness-lens', 'pass', []],
  ])
  assert.ok(host.progress.lines.includes(`${SLUG}: design_review (consistency, architecture-compliance, fitness)`), host.progress.lines.join('\n'))
  assert.ok(host.progress.lines.includes(`${SLUG}: design_review APPROVED: consistency, architecture-compliance, fitness approve`), host.progress.lines.join('\n'))
})

test('a lens reads only its own inputs; the cold reader gets neither the story nor the scope', async () => {
  const host = scripted({}, nominal)

  await host.start({ story: { issue: 42, title: 'Pay by card' } })

  const prompt = (id, step) => host.agentRunner.reviewed().find((dispatch) => dispatch.agent === id && dispatch.label.includes(step)).prompt
  const shape = (lens) => `{"lens": "${lens}", "verdict": "pass" | "fail" | "inconclusive", "findings": [{"id": "F1", "severity": "blocker" | "high" | "medium" | "low", "location": "<path>:<line>", "description": "<what is wrong>", "suggestion": "<how to fix>"}]}`
  assert.equal(prompt('consistency-lens', 'design_review'), [
    '## Skraft review lens: consistency (DESIGN)',
    '- Story: #42 — Pay by card',
    `- Feature scope: ${SLUG}`,
    '- Read only these inputs; search the repository for nothing else:',
    `  - Documents of this phase: ${TRACKING}/${CONTEXT_MAP}`,
    `  - Documents of the story and of the other phases: ${TRACKING}/${RESEARCH}`,
    `  - Changes since the base of the run (open a whole file only when the patch lacks the context a finding needs): ${TRACKING}/reviews/design_review-1/changes.patch`,
    `  - Paths those changes touch: ${TRACKING}/reviews/design_review-1/changed-files.txt`,
    '- Write no file, change nothing, start no agent.',
    `- End your answer with this JSON document alone; "findings" is [] when you find none: ${shape('consistency')}`,
  ].join('\n'))
  assert.equal(prompt('fitness-lens', 'design_review'), [
    '## Skraft review lens: fitness (DESIGN)',
    '- Story: #42 — Pay by card',
    `- Feature scope: ${SLUG}`,
    '- Read only these inputs; search the repository for nothing else:',
    `  - Documents of this phase: ${TRACKING}/${CONTEXT_MAP}`,
    `  - Documents of the story and of the other phases: ${TRACKING}/${RESEARCH}`,
    '- Write no file, change nothing, start no agent.',
    `- End your answer with this JSON document alone; "findings" is [] when you find none: ${shape('fitness')}`,
  ].join('\n'))
  assert.equal(prompt('cold-reader-lens', 'deliver_review'), [
    '## Skraft review lens: cold-reader',
    '- Read only these inputs; search the repository for nothing else:',
    `  - Changes since the base of the run (open a whole file only when the patch lacks the context a finding needs): ${TRACKING}/reviews/deliver_review-1/changes.patch`,
    `  - Paths those changes touch: ${TRACKING}/reviews/deliver_review-1/changed-files.txt`,
    '- Write no file, change nothing, start no agent.',
    `- End your answer with this JSON document alone; "findings" is [] when you find none: ${shape('cold-reader')}`,
  ].join('\n'))
  assert.ok(prompt('test-integrity-lens', 'deliver_review').includes([
    `  - Documents of this phase: ${TRACKING}/${CHANGE_LOG}`,
    `  - Documents of the story and of the other phases: ${TRACKING}/${RESEARCH}`,
    `  - Documents of the story and of the other phases: ${TRACKING}/${CONTEXT_MAP}`,
    `  - Documents of the story and of the other phases: ${TRACKING}/${TEST_PLAN}`,
  ].join('\n')), prompt('test-integrity-lens', 'deliver_review'))
})

test('the changes a lens reads are those since the base of the run: the patch without the tracking files, the paths without the engine\'s own', async () => {
  const folder = `.copilot-tracking/skraft-plans/${SLUG}`
  const host = scripted({}, (it) => [
    agent()(it),
    agent({ work: ({ git }) => {
      git.adds(`${folder}/details/2026-10-11/consistency-matrix-checkout.md`, 'consistency-gate: PASS')
      git.change(`${folder}/details/2026-10-11/consistency-matrix-checkout.md`, `${folder}/events.jsonl`, `${folder}/results/design-1-1.json`, `${folder}/reviews/old/changes.patch`)
      git.commit('docs(checkout): ADR for the card payment', ['docs/adr/adr-001-card-payment.md'])
    } })(it),
    ...nominal(it).slice(2),
  ])
  host.git.adds('docs/adr/adr-001-card-payment.md', '# ADR 001: pay by card')

  await host.start()

  assert.equal(await host.tracking.read(SLUG, 'reviews/design_review-1/changed-files.txt'), `docs/adr/adr-001-card-payment.md\n${folder}/details/2026-10-11/consistency-matrix-checkout.md\n`)
  assert.equal(await host.tracking.read(SLUG, 'reviews/design_review-1/changes.patch'), 'diff --git a/docs/adr/adr-001-card-payment.md b/docs/adr/adr-001-card-payment.md\n+# ADR 001: pay by card\n')
  assert.equal(await host.tracking.read(SLUG, 'reviews/deliver_review-1/changed-files.txt'), [
    'docs/adr/adr-001-card-payment.md', 'tests/Acceptance/CheckoutAcceptanceTests.cs', 'tests/CheckoutTests.cs', 'src/Checkout.cs',
    `${folder}/details/2026-10-11/consistency-matrix-checkout.md`, '',
  ].join('\n'))
})

test('a lens whose trigger matches a changed path or an added line runs with the others; one that matches nothing does not', async () => {
  const host = scripted({}, (it) => [
    ...nominal(it).slice(0, 3),
    agent({ work: ({ git }) => {
      git.adds('tests/CheckoutTests.cs', 'var server = WireMockServer.Start();')
      git.commit('test(checkout): Checkout pays by card', ['tests/CheckoutTests.cs'])
      git.commit('feat(checkout): Checkout pays by card', ['src/Checkout.cs'])
    } })(it),
  ])

  await host.start()

  assert.deepEqual(host.agentRunner.batches.at(-1).map(({ agent: id }) => id), ['test-integrity-lens', 'architecture-boundaries-lens', 'cold-reader-lens', 'mock-fidelity-lens'])
})

test('a confirmed blocker sends the work back to the phase agent with the findings in its brief', async () => {
  const host = scripted({}, (it) => [...nominal(it).slice(0, 2), agent()(it), ...nominal(it).slice(2)])
  host.agentRunner.review = lenses({
    consistency: [says('consistency', 'fail', [
      finding('F1', 'blocker', 'the ADR contradicts the context map', { suggestion: 'align the payment context' }),
      finding('F2', 'low', 'a typo in the title', { location: '' }),
    ])],
  })

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(reviews(host).slice(0, 2), [['design_review', 1, 'needs-rework', 'design'], ['design_review', 2, 'approved', 'distill']])
  const recorded = host.events().find((event) => event.type === 'step.recorded' && event.step === 'design_review')
  assert.deepEqual([recorded.code, recorded.failures, recorded.reason], [
    null,
    ['consistency F1 blocker at src/Checkout.cs:12: the ADR contradicts the context map (suggestion: align the payment context)'],
    'NEEDS_REWORK: 1 finding to address',
  ])
  assert.deepEqual(host.events().filter((event) => event.type === 'review.refuted').map(({ visit, lens, finding: id, verdict }) => [visit, lens, id, verdict]), [[1, 'consistency', 'F1', 'confirmed']])
  const second = host.agentRunner.dispatches[2]
  assert.equal(second.label, `skraft ${SLUG} · design · pass 2 · attempt 1`)
  assert.ok(second.prompt.includes('- Pass: 2, after the review sent the work back'), second.prompt)
  assert.ok(second.prompt.endsWith([
    '',
    'The review sent the work back on pass 1, with these findings:',
    '- consistency F1 blocker at src/Checkout.cs:12: the ADR contradicts the context map (suggestion: align the payment context)',
  ].join('\n')), second.prompt)
  const started = host.events().filter((event) => event.type === 'step.started' && event.step === 'design')
  assert.deepEqual(started.map(({ visit, sentBy, feedback }) => [visit, sentBy, feedback.length]), [[1, undefined, 0], [2, 'review', 1]])
  assert.ok(host.progress.lines.includes(`${SLUG}: design_review NEEDS_REWORK: 1 finding to address`), host.progress.lines.join('\n'))
})

test('a refuted blocker does not count; an unverifiable one does, and medium findings count without a check', async () => {
  const refuted = scripted({}, nominal)
  refuted.agentRunner.review = lenses({
    consistency: [says('consistency', 'fail', [finding('F1', 'blocker', 'the ADR is missing')])],
    refuter: [refutes('refuted', 'docs/adr/adr-001-card-payment.md is in the patch')],
  })

  assert.equal((await refuted.start()).status, 'done')
  assert.deepEqual(reviews(refuted)[0], ['design_review', 1, 'approved', 'distill'])
  const check = refuted.agentRunner.reviewed().find((dispatch) => dispatch.agent === 'finding-refuter')
  assert.equal(check.label, `skraft ${SLUG} · design_review · refute consistency F1 · attempt 1`)
  assert.equal(check.prompt, [
    '## Skraft finding check: consistency F1',
    '- Finding: blocker at src/Checkout.cs:12: the ADR is missing',
    '- Read only these inputs; search the repository for nothing else:',
    `  - Documents of this phase: ${TRACKING}/${CONTEXT_MAP}`,
    `  - Documents of the story and of the other phases: ${TRACKING}/${RESEARCH}`,
    `  - Changes since the base of the run (open a whole file only when the patch lacks the context a finding needs): ${TRACKING}/reviews/design_review-1/changes.patch`,
    `  - Paths those changes touch: ${TRACKING}/reviews/design_review-1/changed-files.txt`,
    '- Confirm the finding only when these inputs show it; refute it when they show it is wrong; say unverifiable when they cannot tell.',
    '- Write no file, change nothing, start no agent.',
    '- End your answer with this JSON document alone: {"verdict": "confirmed" | "refuted" | "unverifiable", "reason": "<the evidence you read>"}',
  ].join('\n'))

  const kept = scripted({}, (it) => [...nominal(it).slice(0, 2), agent()(it), ...nominal(it).slice(2)])
  kept.agentRunner.review = lenses({
    consistency: [says('consistency', 'fail', [finding('F1', 'blocker', 'the ADR is missing'), finding('F2', 'high', 'two contexts own payments')])],
    fitness: [says('fitness', 'pass', [finding('F1', 'medium', 'no latency budget')])],
    refuter: [refutes('refuted'), refutes('unverifiable', 'the context map does not say')],
  })

  await kept.start()

  const recorded = kept.events().find((event) => event.type === 'step.recorded' && event.step === 'design_review')
  assert.deepEqual([recorded.outcome, recorded.failures], ['needs-rework', [
    'consistency F2 high at src/Checkout.cs:12: two contexts own payments (not verified)',
    'fitness F1 medium at src/Checkout.cs:12: no latency budget',
  ]])
  assert.deepEqual(kept.events().filter((event) => event.type === 'review.refuted').map(({ lens, finding: id, verdict, reason }) => [lens, id, verdict, reason]), [
    ['consistency', 'F1', 'refuted', 'refuted by the patch'],
    ['consistency', 'F2', 'unverifiable', 'the context map does not say'],
  ])
})

test('a lens that fails without a finding, or answers inconclusive, sends the work back', async () => {
  const host = scripted({}, (it) => [...nominal(it).slice(0, 2), agent()(it), ...nominal(it).slice(2)])
  host.agentRunner.review = lenses({
    consistency: [says('consistency', 'fail')],
    fitness: [says('fitness', 'inconclusive', [finding('F1', 'low', 'the research document is empty')])],
  })

  await host.start()

  const recorded = host.events().find((event) => event.type === 'step.recorded' && event.step === 'design_review')
  assert.deepEqual([recorded.outcome, recorded.failures, recorded.reason], ['needs-rework', [
    'consistency: failed without naming a finding',
    'fitness: inconclusive: the research document is empty',
  ], 'NEEDS_REWORK: 2 findings to address'])
})

test('a review sent back more often than its edge allows stops the run, naming the edge and the findings', async () => {
  const host = scripted({}, (it) => [...nominal(it).slice(0, 2), agent()(it), agent()(it), agent()(it)])
  const blocker = says('consistency', 'fail', [finding('F1', 'blocker', 'the ADR contradicts the context map')])
  host.agentRunner.review = lenses({ consistency: [blocker, blocker, blocker, blocker] })

  const outcome = await host.start()

  assert.deepEqual(outcome, {
    status: 'blocked', slug: SLUG, phase: 'DESIGN', code: 'loop-ceiling',
    reason: 'design_review -> design was already taken 3 times, its max_visits; consistency F1 blocker at src/Checkout.cs:12: the ADR contradicts the context map',
  })
})
