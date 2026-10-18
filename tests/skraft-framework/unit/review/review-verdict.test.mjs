import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, API, finding, lenses, nominal, refutes, reviews, says, scripted, SLUG, TRACKING } from '../support/pipeline-host.mjs'
import { BUILT_IN_WORKFLOW, InMemoryGit } from '../support/in-memory-host.mjs'
import { designating, edit } from '../workflow/support.mjs'

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
  const answer = (lens) => [
    '- End your answer with this YAML document in a ```yaml block, at most 20 findings, every free text in double quotes:',
    '```yaml',
    `lens: ${lens}`,
    'verdict: fail            # pass | fail | inconclusive',
    'findings:                # [] when you find none',
    '  - id: F1',
    '    gate: G1             # the gate of your table',
    '    severity: blocker    # blocker | high | medium | low',
    '    location: "<path>:<line>"',
    '    description: "<what is wrong>"',
    '    suggestion: "<how to fix, one line; leave the key out when the fix is not evident>"',
    '```',
  ]
  assert.equal(prompt('consistency-lens', 'design_review'), [
    '## Skraft review lens: consistency (DESIGN)',
    '- Story: #42 — Pay by card',
    `- Feature scope: ${SLUG}`,
    '- Read these inputs and the files they name; search the repository for nothing else:',
    `  - Review context (story, project rules, who wrote which document): ${TRACKING}/reviews/design_review-1/context.md`,
    `  - Documents of this phase: ${TRACKING}/${CONTEXT_MAP}`,
    `  - Documents of the story and of the other phases: ${TRACKING}/${RESEARCH}`,
    `  - Changes since the base of the run (open a whole file only when the patch lacks the context a finding needs): ${TRACKING}/reviews/design_review-1/changes.patch`,
    `  - Paths those changes touch (a path with no section in the patch is a new file: open it): ${TRACKING}/reviews/design_review-1/changed-files.txt`,
    '- Write no file, change nothing, start no agent.',
    ...answer('consistency'),
  ].join('\n'))
  assert.equal(prompt('fitness-lens', 'design_review'), [
    '## Skraft review lens: fitness (DESIGN)',
    '- Story: #42 — Pay by card',
    `- Feature scope: ${SLUG}`,
    '- Read these inputs and the files they name; search the repository for nothing else:',
    `  - Review context (story, project rules, who wrote which document): ${TRACKING}/reviews/design_review-1/context.md`,
    `  - Documents of this phase: ${TRACKING}/${CONTEXT_MAP}`,
    `  - Documents of the story and of the other phases: ${TRACKING}/${RESEARCH}`,
    '- Write no file, change nothing, start no agent.',
    ...answer('fitness'),
  ].join('\n'))
  assert.equal(prompt('cold-reader-lens', 'deliver_review'), [
    '## Skraft review lens: cold-reader',
    '- Read these inputs and the files they name; search the repository for nothing else:',
    `  - Changes since the base of the run (open a whole file only when the patch lacks the context a finding needs): ${TRACKING}/reviews/deliver_review-1/changes.patch`,
    `  - Paths those changes touch (a path with no section in the patch is a new file: open it): ${TRACKING}/reviews/deliver_review-1/changed-files.txt`,
    '- Write no file, change nothing, start no agent.',
    ...answer('cold-reader'),
  ].join('\n'))
  const KIND = { 'Review context (story, project rules, who wrote which document)': 'overview', 'Documents of this phase': 'outputs', 'Documents of the story and of the other phases': 'context', 'Paths those changes touch (a path with no section in the patch is a new file': 'files', 'Components (stack, mocking strategy, contract testing)': 'components' }
  const kinds = (dispatch) => [...new Set(dispatch.prompt.split('\n').filter((line) => /^  - .+: \//.test(line)).map((line) => line.slice(4, line.indexOf(':'))).map((title) => KIND[title] ?? 'patch'))]
  assert.deepEqual(Object.fromEntries(host.agentRunner.reviewed().map((dispatch) => [dispatch.agent, kinds(dispatch)])), {
    'consistency-lens': ['overview', 'outputs', 'context', 'patch', 'files'],
    'architecture-compliance-lens': ['overview', 'outputs', 'patch', 'files'],
    'fitness-lens': ['overview', 'outputs', 'context'],
    'coverage-lens': ['overview', 'outputs', 'context', 'patch', 'files'],
    'business-alignment-lens': ['overview', 'outputs', 'context'],
    'testability-lens': ['overview', 'outputs', 'patch', 'files'],
    'boundary-enforcement-lens': ['overview', 'outputs', 'patch', 'files'],
    'test-integrity-lens': ['overview', 'outputs', 'context', 'patch', 'files'],
    'architecture-boundaries-lens': ['overview', 'context', 'patch', 'files'],
    'cold-reader-lens': ['patch', 'files'],
  })
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
  const mocks = host.agentRunner.batches.at(-1).at(-1).prompt
  assert.ok(mocks.includes(`  - Components (stack, mocking strategy, contract testing): ${TRACKING}/reviews/deliver_review-1/components.json`), mocks)
  assert.deepEqual(JSON.parse(await host.tracking.read(SLUG, 'reviews/deliver_review-1/components.json')), [{ name: 'api', root: '.', stack: 'dotnet', mocking: { strategy: 'inprocess' }, contractTesting: false }])

  const contracts = scripted({ components: [{ ...API, mocking: undefined, contractTesting: true }] }, (it) => [
    ...nominal(it).slice(0, 3),
    agent({ work: ({ git }) => {
      git.removes('src/Checkout.cs', 'var server = WireMockServer.Start();')
      git.commit('test(checkout): the payment contract is honoured', ['tests/Contracts/PaymentContractTests.cs'])
      git.commit('feat(checkout): Checkout pays by card', ['src/Checkout.cs'])
    } })(it),
  ])
  await contracts.start()
  assert.deepEqual(contracts.agentRunner.batches.at(-1).map(({ agent: id }) => id), ['test-integrity-lens', 'architecture-boundaries-lens', 'cold-reader-lens', 'contract-fidelity-lens'])
  assert.deepEqual(JSON.parse(await contracts.tracking.read(SLUG, 'reviews/deliver_review-1/components.json')), [{ name: 'api', root: '.', stack: 'dotnet', mocking: { strategy: 'microcks' }, contractTesting: true }])
})

test('a review whose every lens waits for a trigger that nothing matches approves, saying no lens applies', async () => {
  const workflow = edit(BUILT_IN_WORKFLOW, ['lenses="test-integrity,architecture-boundaries,cold-reader,mock-fidelity,contract-fidelity"', 'lenses="mock-fidelity,contract-fidelity"'])
  const host = scripted({ files: designating(workflow, { components: [API] }) }, nominal)

  assert.equal((await host.start()).status, 'done')
  const recorded = host.events().find((event) => event.type === 'step.recorded' && event.step === 'deliver_review')
  assert.deepEqual([recorded.outcome, recorded.reason, recorded.cost], ['approved', 'APPROVED: no lens applies to these changes', undefined])
  assert.equal(host.agentRunner.batches.length, 2)
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
    ['consistency F1 G1 blocker at src/Checkout.cs:12: the ADR contradicts the context map (suggestion: align the payment context)'],
    'NEEDS_REWORK: 1 reason to address',
  ])
  assert.deepEqual(host.events().filter((event) => event.type === 'review.refuted').map(({ visit, lens, finding: id, verdict }) => [visit, lens, id, verdict]), [[1, 'consistency', 'F1', 'confirmed']])
  const second = host.agentRunner.dispatches[2]
  assert.equal(second.label, `skraft ${SLUG} · design · pass 2 · attempt 1`)
  assert.ok(second.prompt.includes('- Pass: 2, after the review sent the work back'), second.prompt)
  assert.ok(second.prompt.endsWith([
    '',
    'The review sent the work back on pass 1, with these findings:',
    '- consistency F1 G1 blocker at src/Checkout.cs:12: the ADR contradicts the context map (suggestion: align the payment context)',
  ].join('\n')), second.prompt)
  const started = host.events().filter((event) => event.type === 'step.started' && event.step === 'design')
  assert.deepEqual(started.map(({ visit, sentBy, feedback }) => [visit, sentBy, feedback.length]), [[1, undefined, 0], [2, 'review', 1]])
  assert.ok(host.progress.lines.includes(`${SLUG}: design_review NEEDS_REWORK: 1 reason to address`), host.progress.lines.join('\n'))
})

test('a refuted blocker does not count; an unverifiable one does, and medium findings count without a check; the pass writes its verdict beside its inputs', async () => {
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
    '- Finding: G1 blocker at src/Checkout.cs:12: the ADR is missing',
    '- Read these inputs and the files they name; search the repository for nothing else:',
    `  - Review context (story, project rules, who wrote which document): ${TRACKING}/reviews/design_review-1/context.md`,
    `  - Documents of this phase: ${TRACKING}/${CONTEXT_MAP}`,
    `  - Documents of the story and of the other phases: ${TRACKING}/${RESEARCH}`,
    `  - Changes since the base of the run (open a whole file only when the patch lacks the context a finding needs): ${TRACKING}/reviews/design_review-1/changes.patch`,
    `  - Paths those changes touch (a path with no section in the patch is a new file: open it): ${TRACKING}/reviews/design_review-1/changed-files.txt`,
    '- Confirm the finding only when these inputs show it; refute it when they show it is wrong, citing the path:line; say unverifiable when they cannot tell.',
    '- Write no file, change nothing, start no agent.',
    '- End your answer with this YAML document in a ```yaml block:',
    '```yaml',
    'verdict: refuted         # confirmed | refuted | unverifiable',
    'reason: "<the path:line you read and what it shows>"',
    '```',
  ].join('\n'))

  const kept = scripted({}, (it) => [...nominal(it).slice(0, 2), agent()(it), ...nominal(it).slice(2)])
  kept.agentRunner.review = lenses({
    consistency: [says('consistency', 'fail', [
      finding('F1', 'blocker', 'the ADR is missing'), finding('F2', 'high', 'two contexts own payments'),
      finding('F3', 'low', 'the "Payments" context is named C:\\pay', { suggestion: 'one name' }),
    ])],
    fitness: [says('fitness', 'fail', [finding('F1', 'medium', 'no latency budget', { location: 'docs/adr/adr-001.md:4' })])],
    refuter: [refutes('refuted'), refutes('unverifiable', 'the context map does not say')],
  })

  await kept.start()

  const recorded = kept.events().find((event) => event.type === 'step.recorded' && event.step === 'design_review')
  assert.deepEqual([recorded.outcome, recorded.failures], ['needs-rework', [
    'consistency F2 G1 high at src/Checkout.cs:12: two contexts own payments (not verified)',
    'fitness F1 G1 medium at docs/adr/adr-001.md:4: no latency budget',
  ]])
  assert.deepEqual(kept.events().filter((event) => event.type === 'review.refuted').map(({ lens, finding: id, verdict, reason }) => [lens, id, verdict, reason]), [
    ['consistency', 'F1', 'refuted', 'refuted by the patch'],
    ['consistency', 'F2', 'unverifiable', 'the context map does not say'],
  ])
  const entryLines = (lens, id, severity, location, description, suggestion = 'null') => [
    `  - lens: "${lens}"`, `    id: "${id}"`, '    gate: "G1"', `    severity: "${severity}"`, `    location: "${location}"`, `    description: ${description}`, `    suggestion: ${suggestion}`,
  ]
  assert.equal(await kept.tracking.read(SLUG, 'reviews/design_review-1/verdict.yaml'), [
    'status: "NEEDS_REWORK"',
    'code: null',
    'summary: "NEEDS_REWORK: 2 reasons to address"',
    'findings:',
    ...entryLines('consistency', 'F2', 'high', 'src/Checkout.cs:12', '"two contexts own payments"'),
    ...entryLines('fitness', 'F1', 'medium', 'docs/adr/adr-001.md:4', '"no latency budget"'),
    'notes:',
    ...entryLines('consistency', 'F3', 'low', 'src/Checkout.cs:12', '"the \\"Payments\\" context is named C:\\\\pay"', '"one name"'),
    'refutations:',
    '  - lens: "consistency"', '    finding: "F1"', '    verdict: "refuted"', '    reason: "refuted by the patch"',
    '  - lens: "consistency"', '    finding: "F2"', '    verdict: "unverifiable"', '    reason: "the context map does not say"',
    'reused: []',
    '',
  ].join('\n'))
  assert.match(await kept.tracking.read(SLUG, 'reviews/design_review-2/verdict.yaml'), /^status: "APPROVED"\ncode: null\nsummary: "APPROVED: consistency, architecture-compliance, fitness approve"\nfindings: \[\]\nnotes: \[\]\nrefutations: \[\]\n/)
})

test('a lens that fails with no finding that blocks, or answers inconclusive, blocks the review without sending the work back; the other lenses\' findings are journaled', async () => {
  const host = scripted({}, (it) => [...nominal(it).slice(0, 2), () => ({ ok: false, unavailable: true, text: '', error: 'the work was sent back' })])
  host.agentRunner.review = lenses({
    consistency: [says('consistency', 'fail', [finding('F1', 'low', 'a typo in the title')])],
    'architecture-compliance': [says('architecture-compliance', 'fail', [finding('F1', 'blocker', 'the domain imports the database driver')])],
    fitness: [says('fitness', 'inconclusive', [finding('F1', 'low', 'the research document is empty'), finding('F2', 'low', 'no story to read')])],
  })

  const outcome = await host.start()

  const reason = [
    'consistency: failed without naming a blocker, high or medium finding: a typo in the title',
    'fitness: inconclusive: the research document is empty; no story to read',
  ].join('; ')
  assert.deepEqual(outcome, { status: 'blocked', slug: SLUG, phase: 'DESIGN', code: 'lens-inconclusive', reason })
  const recorded = host.events().find((event) => event.type === 'step.recorded' && event.step === 'design_review')
  assert.deepEqual([recorded.outcome, recorded.code, recorded.failures, recorded.next, recorded.reason], ['blocked', 'lens-inconclusive', [], null, reason])
  assert.deepEqual(host.events().filter((event) => event.type === 'review.lens').map(({ lens, verdict, findings }) => [lens, verdict, findings.map(({ id, severity }) => `${id} ${severity}`)]), [
    ['consistency', 'fail', ['F1 low']],
    ['architecture-compliance', 'fail', ['F1 blocker']],
    ['fitness', 'inconclusive', ['F1 low', 'F2 low']],
  ])
  assert.deepEqual(host.agentRunner.reviewed().filter((dispatch) => dispatch.agent === 'finding-refuter'), [])
  assert.deepEqual(host.agentRunner.dispatches.map((dispatch) => dispatch.agent), ['solution-researcher', 'solution-architect'])
  assert.ok(host.progress.lines.includes(`${SLUG}: design_review blocked (lens-inconclusive)`), host.progress.lines.join('\n'))
  const written = await host.tracking.read(SLUG, 'reviews/design_review-1/verdict.yaml')
  assert.ok(written.startsWith(`status: "BLOCKED"\ncode: "lens-inconclusive"\nsummary: ${JSON.stringify(reason)}\nfindings:\n  - lens: "architecture-compliance"\n    id: "F1"\n`), written)
  assert.ok(written.endsWith('\nrefutations: []\nreused: []\n'), written)
  assert.equal((await host.run()).code, 'lens-inconclusive')

  const silent = scripted({}, (it) => nominal(it).slice(0, 2))
  silent.agentRunner.review = lenses({ 'architecture-compliance': [says('architecture-compliance', 'inconclusive')] })
  assert.deepEqual(await silent.start(), { status: 'blocked', slug: SLUG, phase: 'DESIGN', code: 'lens-inconclusive', reason: 'architecture-compliance: inconclusive' })
})

test('a review sent back more often than its edge allows stops the run, naming the edge and the findings', async () => {
  const host = scripted({}, (it) => [...nominal(it).slice(0, 2), agent()(it), agent()(it), agent()(it)])
  const blocker = says('consistency', 'fail', [finding('F1', 'blocker', 'the ADR contradicts the context map')])
  host.agentRunner.review = lenses({ consistency: [blocker, blocker, blocker, blocker] })

  const outcome = await host.start()

  assert.deepEqual(outcome, {
    status: 'blocked', slug: SLUG, phase: 'DESIGN', code: 'loop-ceiling',
    reason: 'design_review -> design was already taken 3 times, its max_visits; consistency F1 G1 blocker at src/Checkout.cs:12: the ADR contradicts the context map',
  })
})

test('the changes of a component in a neighbour repository are read from that repository, each repository once', async () => {
  const WEB = { name: 'web', root: '../web', stack: 'react', paths: { src: ['src'], tests: ['src'] }, commands: { build: 'npm run build', test: 'npx vitest run' } }
  const git = new InMemoryGit({ repositories: { '.': { mergeBases: { main: 'root-0' } }, '../web': { mergeBases: { main: 'up-web-0' } } } })
  git.patched('../web/src/App.tsx', ['--- a/src/App.tsx', '+++ b/src/App.tsx'])
  git.adds('../web/src/App.tsx', 'export const App = () => null')
  git.change('../web/src/App.tsx')
  const host = scripted({ components: [API, WEB], git }, (it) => nominal(it).slice(0, 2))
  host.agentRunner.behaviours.push(() => ({ ok: false, unavailable: true, text: '', error: 'stop here' }))

  await host.start()

  assert.equal(await host.tracking.read(SLUG, 'reviews/design_review-1/changed-files.txt'), 'docs/adr/adr-001-card-payment.md\n../web/src/App.tsx\n')
  assert.equal(await host.tracking.read(SLUG, 'reviews/design_review-1/changes.patch'), [
    'diff --git a/docs/adr/adr-001-card-payment.md b/docs/adr/adr-001-card-payment.md',
    'diff --git a/../web/src/App.tsx b/../web/src/App.tsx',
    '--- a/../web/src/App.tsx',
    '+++ b/../web/src/App.tsx',
    '+export const App = () => null',
    '',
  ].join('\n'))
})

test('a review Git cannot diff stops the run as the environment, and the next run reviews again', async () => {
  const host = scripted({}, (it) => nominal(it))
  const diff = host.git.diff.bind(host.git)
  host.git.diff = async () => null

  const stopped = await host.start()

  assert.deepEqual(stopped, { status: 'blocked', slug: SLUG, phase: 'DESIGN', code: 'environment', reason: 'Git could not tell what changed since the base of the run, so design_review has nothing to review' })
  assert.equal(host.agentRunner.batches.length, 0)
  host.git.diff = diff
  assert.equal((await host.run()).status, 'done')
})

test('a review asking for rework where the workflow has no NEEDS_REWORK edge stops the run, saying so', async () => {
  const workflow = edit(BUILT_IN_WORKFLOW, ['  design_review -> design  [label="NEEDS_REWORK", max_visits=3]\n', ''])
  const host = scripted({ files: designating(workflow, { components: [API] }) }, (it) => nominal(it).slice(0, 2))
  host.agentRunner.review = lenses({ consistency: [says('consistency', 'fail', [finding('F1', 'medium', 'no owner for refunds')])] })

  const outcome = await host.start()

  assert.deepEqual(outcome, {
    status: 'blocked', slug: SLUG, phase: 'DESIGN', code: 'review-rejected',
    reason: 'design_review asked for rework and the workflow has no NEEDS_REWORK edge out of it; consistency F1 G1 medium at src/Checkout.cs:12: no owner for refunds',
  })
})
