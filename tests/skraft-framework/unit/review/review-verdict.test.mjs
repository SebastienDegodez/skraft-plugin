import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, API, finding, lenses, nominal, REFS_42, refutes, reviews, says, scripted, SLUG, tddCycle, TRACKING } from '../support/pipeline-host.mjs'
import { opening, section } from '../support/description.mjs'
import { answerYaml } from '../support/answer-yaml.mjs'

/** The refuter's answer on several findings at one line. @param {Array<[string, string, string?]>} each `<lens> <id>`, verdict, reason */
const checksAnswer = (each) => answerYaml({ checks: each.map(([finding, verdict, reason = `${verdict} by the patch`]) => ({ finding, verdict, reason })) })
import { BUILT_IN_REVIEW, BUILT_IN_WORKFLOW, InMemoryAgentCatalog, InMemoryGit } from '../support/in-memory-host.mjs'
import { ejectedPipeline, edit, withLenses } from '../workflow/support.mjs'

const CONTEXT_MAP = 'details/2026-10-11/context-map.md'
const MATRIX = 'details/2026-10-11/consistency-matrix-checkout.md'
const SCAN = 'details/2026-10-11/structural-scan.json'
const RESEARCH = 'research/2026-10-11/checkout-research.md'
/** The story's issue, as the run read it when it started. */
const ISSUE = 'plans/2026-10-11/issue-42.md'
const TEST_PLAN = 'details/2026-10-11/test-plan-checkout.md'
const CHANGE_LOG = 'changes/2026-10-11/change-log.md'

/** The lens and refuter dispatches, as `agent label`. @param {ReturnType<typeof scripted>} host */
const lensLabels = (host) => host.agentRunner.reviewed().map(({ agent: id, source, label }) => `${id} ${source} ${label}`)

test('every lens of each phase passing approves the phase, and the run goes on to the next one', async () => {
  const host = scripted({}, (it) => nominal(it, REFS_42))

  const outcome = await host.start({ story: { issue: 42, title: 'Pay by card' } })

  assert.equal(outcome.status, 'done')
  assert.deepEqual(reviews(host), [
    ['design_review', 1, 'approved', 'adr'],
    ['distill_review', 1, 'approved', 'deliver'],
    ['deliver_review', 1, 'approved', 'mutation'],
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
  assert.deepEqual([recorded.code, recorded.failures, recorded.reason], [null, [], 'APPROVED: every lens passed'])
  assert.deepEqual(host.events().filter((event) => event.type === 'review.lens' && event.step === 'design_review').map(({ visit, lens, agent: id, verdict, findings, gates }) => [visit, lens, id, verdict, findings, gates]), [
    [1, 'consistency', 'consistency-lens', 'pass', [], { G1: 'Every structural commitment has an ADR', G2: 'No contradicting ADRs', C1: 'Same names everywhere' }],
    [1, 'architecture-compliance', 'architecture-compliance-lens', 'pass', [], {}],
    [1, 'fitness', 'fitness-lens', 'pass', [], {}],
  ])
  assert.ok(host.progress.lines.includes(`${SLUG}: design_review (consistency, architecture-compliance, fitness) — reviewer · economy · haiku`), host.progress.lines.join('\n'))
  assert.ok(host.progress.lines.includes(`${SLUG}: design_review APPROVED: every lens passed`), host.progress.lines.join('\n'))
})

test('a lens reads only its own inputs; the cold reader gets neither the story nor the scope', async () => {
  const host = scripted({}, (it) => nominal(it, REFS_42))

  await host.start({ story: { issue: 42, title: 'Pay by card' } })

  const prompt = (id, step) => host.agentRunner.reviewed().find((dispatch) => dispatch.agent === id && dispatch.label.includes(step)).prompt
  const answer = (lens) => [
    '- End your answer with this YAML document in a ```yaml block, at most 20 findings, every free text in double quotes:',
    '- Every finding gives severityReason, drift, occurrences: an answer with a finding lacking one is refused.',
    '- Every finding the refuter does not refute sends the work back to be fixed, a low one too, whether you answer pass or fail; pass names low findings only.',
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
    '    severityReason: "<why this severity: what it breaks, for whom>"',
    '    drift: label         # label (a name differs) | classification (a kind differs) | structural (anything else)',
    '    occurrences:         # every place the same fact is wrong, the location first',
    '      - "<path>:<line>"',
    '```',
  ]
  assert.equal(prompt('consistency-lens', 'design_review'), [
    '## Skraft review lens: consistency (DESIGN)',
    '- Story: #42 — Pay by card',
    `- Feature scope: ${SLUG}`,
    '- Read these inputs and the files they name; search the repository for nothing else:',
    `  - Review context (story, project rules, who wrote which document): ${TRACKING}/reviews/design_review-1/context.md`,
    `  - Documents of this phase: ${TRACKING}/${MATRIX}`,
    `  - Documents of this phase: ${TRACKING}/${SCAN}`,
    `  - Documents of the story and of the other phases: ${TRACKING}/${ISSUE}`,
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
    `  - Documents of this phase: ${TRACKING}/${MATRIX}`,
    `  - Documents of this phase: ${TRACKING}/${SCAN}`,
    `  - Documents of the story and of the other phases: ${TRACKING}/${ISSUE}`,
    `  - Documents of the story and of the other phases: ${TRACKING}/${RESEARCH}`,
    `  - Changes since the base of the run (open a whole file only when the patch lacks the context a finding needs): ${TRACKING}/reviews/design_review-1/design.patch`,
    `  - Paths those changes touch (a path with no section in the patch is a new file: open it): ${TRACKING}/reviews/design_review-1/design-files.txt`,
    '- Write no file, change nothing, start no agent.',
    ...answer('fitness'),
  ].join('\n'))
  assert.equal(prompt('cold-reader-lens', 'deliver_review'), [
    '## Skraft review lens: cold-reader',
    '- Read these inputs and the files they name; search the repository for nothing else:',
    `  - Changes since the base of the run (open a whole file only when the patch lacks the context a finding needs): ${TRACKING}/reviews/deliver_review-1/code.patch`,
    `  - Paths those changes touch (a path with no section in the patch is a new file: open it): ${TRACKING}/reviews/deliver_review-1/code-files.txt`,
    '- Write no file, change nothing, start no agent.',
    ...answer('cold-reader'),
  ].join('\n'))
  const KIND = { 'Review context (story, project rules, who wrote which document)': 'overview', 'Documents of this phase': 'outputs', 'Documents of the story and of the other phases': 'context', 'Paths those changes touch (a path with no section in the patch is a new file': 'files', 'Components (stack, mocking strategy, contract testing, BDD, gates that passed)': 'components' }
  const kinds = (dispatch) => [...new Set(dispatch.prompt.split('\n').filter((line) => /^  - .+: \//.test(line)).map((line) => line.slice(4, line.indexOf(':'))).map((title) => KIND[title] ?? 'patch'))]
  assert.deepEqual(Object.fromEntries(host.agentRunner.reviewed().map((dispatch) => [dispatch.agent, kinds(dispatch)])), {
    'consistency-lens': ['overview', 'outputs', 'context', 'patch', 'files'],
    'architecture-compliance-lens': ['overview', 'outputs', 'patch', 'files'],
    'fitness-lens': ['overview', 'outputs', 'context', 'patch', 'files'],
    'coverage-lens': ['overview', 'outputs', 'context', 'patch', 'files'],
    'business-alignment-lens': ['overview', 'outputs', 'context', 'patch', 'files'],
    'testability-lens': ['overview', 'outputs', 'patch', 'files'],
    'boundary-enforcement-lens': ['overview', 'outputs', 'patch', 'files'],
    'test-integrity-lens': ['overview', 'outputs', 'context', 'patch', 'files'],
    'architecture-boundaries-lens': ['overview', 'context', 'patch', 'files', 'components'],
    'cold-reader-lens': ['patch', 'files'],
  })
  assert.ok(prompt('test-integrity-lens', 'deliver_review').includes([
    `  - Documents of this phase: ${TRACKING}/${CHANGE_LOG}`,
    `  - Documents of the story and of the other phases: ${TRACKING}/${ISSUE}`,
    `  - Documents of the story and of the other phases: ${TRACKING}/${RESEARCH}`,
    `  - Documents of the story and of the other phases: ${TRACKING}/${MATRIX}`,
    `  - Documents of the story and of the other phases: ${TRACKING}/${SCAN}`,
    `  - Documents of the story and of the other phases: ${TRACKING}/${TEST_PLAN}`,
  ].join('\n')), prompt('test-integrity-lens', 'deliver_review'))
})

test('the changes a lens reads are those since the base of the run, without the tracking files: a lens gets the documents of the run by their paths', async () => {
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

  assert.equal(await host.tracking.read(SLUG, 'reviews/design_review-1/changed-files.txt'), 'docs/adr/adr-001-card-payment.md\n')
  assert.equal(await host.tracking.read(SLUG, 'reviews/design_review-1/changes.patch'), 'diff --git a/docs/adr/adr-001-card-payment.md b/docs/adr/adr-001-card-payment.md\n+# ADR 001: pay by card\n')
  assert.equal(await host.tracking.read(SLUG, 'reviews/deliver_review-1/changed-files.txt'), [
    'docs/adr/adr-001-card-payment.md', 'tests/Acceptance/CheckoutAcceptanceTests.cs', 'tests/CheckoutTests.cs', 'src/Checkout.cs', '',
  ].join('\n'))
})

test('when the phase changed nothing outside the tracking folder, the lenses are told so instead of being given an empty patch', async () => {
  const host = scripted({}, (it) => [agent()(it), agent()(it)])
  host.agentRunner.behaviours.push(() => ({ ok: false, unavailable: true, text: '', error: 'stop here' }))

  await host.start()

  const compliance = host.agentRunner.batches[0].find((dispatch) => dispatch.agent === 'architecture-compliance-lens').prompt
  assert.ok(compliance.includes([
    `  - Documents of this phase: ${TRACKING}/${MATRIX}`,
    `  - Documents of this phase: ${TRACKING}/${SCAN}`,
    '- Changes since the base of the run: none outside the tracking folder; judge the documents above.',
  ].join('\n')), compliance)
  assert.ok(!compliance.includes('changes.patch') && !compliance.includes('changed-files.txt'), compliance)
  const fitness = host.agentRunner.batches[0].find((dispatch) => dispatch.agent === 'fitness-lens').prompt
  assert.ok(fitness.includes('- Changes since the base of the run: none outside the tracking folder; judge the documents above.'), fitness)
  assert.ok(!fitness.includes('changes.patch') && !fitness.includes('changed-files.txt'), fitness)
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
  assert.ok(mocks.includes(`  - Components (stack, mocking strategy, contract testing, BDD, gates that passed): ${TRACKING}/reviews/deliver_review-1/components.json`), mocks)
  assert.deepEqual(JSON.parse(await host.tracking.read(SLUG, 'reviews/deliver_review-1/components.json')), [{ name: 'api', root: '.', stack: 'dotnet', mocking: { strategy: 'inprocess' }, contractTesting: false, bdd: false, gates: ['build', 'test'] }])

  const web = { ...API, name: 'web', root: 'web', bdd: false, paths: { src: ['src'], tests: ['tests'] } }
  const contracts = scripted({ components: [{ ...API, mocking: undefined, contractTesting: true, bdd: [{ features: 'docs/features', steps: 'tests/Steps' }], commands: { architecture: 'dotnet test --filter Architecture', ...API.commands } }, web] }, (it) => [
    ...nominal(it).slice(0, 3),
    agent({ work: ({ git }) => {
      git.removes('src/Checkout.cs', 'var server = WireMockServer.Start();')
      git.commit('test(checkout): the payment contract is honoured', ['tests/Contracts/PaymentContractTests.cs'])
      git.commit('feat(checkout): Checkout pays by card', ['src/Checkout.cs'])
    } })(it),
  ])
  await contracts.start()
  assert.deepEqual(contracts.agentRunner.batches.at(-1).map(({ agent: id }) => id), ['test-integrity-lens', 'architecture-boundaries-lens', 'cold-reader-lens', 'contract-fidelity-lens'])
  assert.deepEqual(JSON.parse(await contracts.tracking.read(SLUG, 'reviews/deliver_review-1/components.json')), [
    { name: 'api', root: '.', stack: 'dotnet', mocking: { strategy: 'microcks' }, contractTesting: true, bdd: true, gates: ['build', 'test', 'architecture'] },
    { name: 'web', root: 'web', stack: 'dotnet', mocking: { strategy: 'inprocess' }, contractTesting: false, bdd: false, gates: ['build', 'test'] },
  ])
  assert.deepEqual(JSON.parse(await contracts.tracking.read(SLUG, 'reviews/design_review-1/components.json'))[0].gates, [])
})

test('a lens runs on the trigger its node names, whichever lens it is: none runs it always, when="contract" waits for contracts', async () => {
  const review = edit(BUILT_IN_REVIEW,
    ['lens="mock-fidelity", when="mock"', 'lens="mock-fidelity"'],
    ['lens="cold-reader"', 'lens="cold-reader", when="contract"'])
  const host = scripted({ files: { '.skraft/review.skraft.dot': review } }, nominal)

  assert.equal((await host.start()).status, 'done')

  assert.deepEqual(host.agentRunner.batches.at(-1).map(({ agent: id }) => id), ['test-integrity-lens', 'architecture-boundaries-lens', 'mock-fidelity-lens'])
  assert.deepEqual(host.events().find((event) => event.type === 'step.started' && event.step === 'deliver_review').lenses, ['test-integrity', 'architecture-boundaries', 'cold-reader', 'mock-fidelity', 'contract-fidelity'])
})

test('a blind lens reads the changes without the decision records and design documents of the run: no ADR, no supersession registry, no context map, event model or scenario', async () => {
  const records = ['docs/adr/adr-001-card-payment.md', 'docs/adr/supersessions.md']
  const designs = ['docs/architecture/context-map.md', 'docs/architecture/payment.md', 'docs/domain/event-model/payment.md']
  const scenarios = ['docs/features/payment/pay-by-card.feature', 'tests/docs/features/payment/nested.feature']
  const host = scripted({}, (it) => [
    agent()(it),
    agent({ work: ({ git }) => git.commit('docs(checkout): ADR and design of the card payment', [...records, ...designs]) })(it),
    agent({ work: ({ git }) => git.commit('test(checkout): acceptance of the card payment', ['tests/Acceptance/CheckoutAcceptanceTests.cs', ...scenarios]) })(it),
    agent({ work: tddCycle() })(it),
  ])

  await host.start()

  const folder = 'reviews/deliver_review-1'
  const all = await host.tracking.read(SLUG, `${folder}/changed-files.txt`)
  const code = await host.tracking.read(SLUG, `${folder}/code-files.txt`)
  const documents = [...records, ...designs, ...scenarios]
  assert.ok(documents.every((path) => all.includes(`${path}\n`)), all)
  assert.equal(code, all.split('\n').filter((line) => line !== '' && !documents.includes(line)).map((line) => `${line}\n`).join(''))
  assert.ok(code.includes('tests/Acceptance/CheckoutAcceptanceTests.cs\n'), code)
  const patch = await host.tracking.read(SLUG, `${folder}/code.patch`)
  const changes = await host.tracking.read(SLUG, `${folder}/changes.patch`)
  assert.ok(documents.every((path) => !patch.includes(path) && changes.includes(`diff --git a/${path}`)), patch)
  assert.equal(await host.tracking.read(SLUG, 'reviews/distill_review-1/features-files.txt'), `${scenarios.join('\n')}\n`)
  const featurePatch = await host.tracking.read(SLUG, 'reviews/distill_review-1/features.patch')
  assert.ok(scenarios.every((path) => featurePatch.includes(`diff --git a/${path}`)) && !featurePatch.includes('CheckoutAcceptanceTests'), featurePatch)
  assert.ok(host.agentRunner.reviewed().find((dispatch) => dispatch.agent === 'business-alignment-lens').prompt.includes('distill_review-1/features.patch'))
  const lens = host.agentRunner.reviewed().find((dispatch) => dispatch.agent === 'test-integrity-lens').prompt
  assert.ok(lens.includes(`${folder}/changes.patch`) && !lens.includes('code.patch'), lens)
})

test('a document a later pass deleted or renamed is no input of the review any more', async () => {
  const OLD = 'details/2026-10-11/supersession-plan-checkout.md'
  const NEW = 'details/2026-10-11/supersession-plan-pay-by-card.md'
  const host = scripted({}, (it) => [
    agent()(it),
    agent({ work: ({ tracking }) => tracking.write(SLUG, OLD, '# Supersession plan\n') })(it),
    agent({ work: ({ tracking }) => { tracking.files.delete(`${SLUG}/${OLD}`); tracking.write(SLUG, NEW, '# Supersession plan\n') } })(it),
    ...nominal(it).slice(2),
  ])
  host.agentRunner.review = lenses({ consistency: [says('consistency', 'fail', [finding('F1', 'high', 'two contexts own payments')])] })

  await host.start()

  const second = host.agentRunner.reviewed().filter((dispatch) => dispatch.agent === 'consistency-lens').at(-1).prompt
  assert.ok(second.includes(`${TRACKING}/${NEW}`) && !second.includes(OLD), second)
  assert.ok(!(await host.tracking.read(SLUG, 'reviews/design_review-2/context.md')).includes(OLD))
})

test('a review whose every lens waits for a trigger that nothing matches approves, saying no lens applies', async () => {
  const workflow = withLenses(BUILT_IN_WORKFLOW, 'distill_review', ['mock-fidelity when=mock', 'contract-fidelity when=contract'])
  const host = scripted({ files: ejectedPipeline(workflow, { components: [API] }) }, nominal)

  assert.equal((await host.start()).status, 'done')
  const recorded = host.events().find((event) => event.type === 'step.recorded' && event.step === 'distill_review')
  assert.deepEqual([recorded.outcome, recorded.reason, recorded.cost], ['approved', 'APPROVED: no lens applies to these changes', undefined])
  assert.equal(host.agentRunner.batches.length, 2)
})

test('a confirmed blocker sends the work back to the phase agent with the findings in its brief', async () => {
  const host = scripted({}, (it) => [...nominal(it).slice(0, 2), agent()(it), ...nominal(it).slice(2)])
  host.agentRunner.review = lenses({
    consistency: [says('consistency', 'fail', [
      finding('F1', 'blocker', 'the ADR contradicts the context map', { suggestion: 'align the payment context' }),
      finding('F2', 'low', 'a typo in the title', { location: '' }),
      finding('F3', 'high', 'the context map names two payment contexts', { location: `${TRACKING}/${CONTEXT_MAP}:44-45` }),
      finding('F4', 'high', 'the ADR has no status', { location: '.\\docs\\adr\\adr-001-card-payment.md:3' }),
      finding('F5', 'low', 'the criterion is worded twice', { location: '/plugin/skills/architecture-review-criteria/SKILL.md:55' }),
    ])],
  })

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(reviews(host).slice(0, 2), [['design_review', 1, 'needs-rework', 'design'], ['design_review', 2, 'approved', 'adr']])
  const recorded = host.events().find((event) => event.type === 'step.recorded' && event.step === 'design_review')
  assert.deepEqual([recorded.code, recorded.failures, recorded.reason], [
    null,
    [
      'consistency F1 G1 blocker at src/Checkout.cs:12: the ADR contradicts the context map (suggestion: align the payment context)',
      `consistency F3 G1 high at .copilot-tracking/skraft-plans/${SLUG}/${CONTEXT_MAP}:44-45: the context map names two payment contexts`,
      'consistency F4 G1 high at docs/adr/adr-001-card-payment.md:3: the ADR has no status',
      'consistency F2 G1 low: a typo in the title',
      'consistency F5 G1 low at /plugin/skills/architecture-review-criteria/SKILL.md:55: the criterion is worded twice',
    ],
    'NEEDS_REWORK: 5 reasons to address',
  ])
  assert.deepEqual(host.events().filter((event) => event.type === 'review.refuted').map(({ visit, lens, finding: id, verdict }) => [visit, lens, id, verdict]), [
    [1, 'consistency', 'F1', 'confirmed'], [1, 'consistency', 'F2', 'confirmed'], [1, 'consistency', 'F3', 'confirmed'], [1, 'consistency', 'F4', 'confirmed'], [1, 'consistency', 'F5', 'confirmed'],
  ])
  assert.deepEqual(host.events().find((event) => event.type === 'review.lens' && event.lens === 'consistency').findings.map(({ location }) => location), [
    'src/Checkout.cs:12', '', `.copilot-tracking/skraft-plans/${SLUG}/${CONTEXT_MAP}:44-45`, 'docs/adr/adr-001-card-payment.md:3', '/plugin/skills/architecture-review-criteria/SKILL.md:55',
  ])
  const second = host.agentRunner.dispatches[2]
  assert.equal(second.label, `skraft ${SLUG} · design · pass 2 · attempt 1`)
  assert.ok(second.prompt.includes('- Pass: 2, after the review sent the work back'), second.prompt)
  assert.ok(second.prompt.endsWith([
    '',
    'The review sent the work back on pass 1, with these findings:',
    '- consistency F1 G1 blocker at src/Checkout.cs:12: the ADR contradicts the context map (suggestion: align the payment context)',
    `- consistency F3 G1 high at .copilot-tracking/skraft-plans/${SLUG}/${CONTEXT_MAP}:44-45: the context map names two payment contexts`,
    '- consistency F4 G1 high at docs/adr/adr-001-card-payment.md:3: the ADR has no status',
    '- consistency F2 G1 low: a typo in the title',
    '- consistency F5 G1 low at /plugin/skills/architecture-review-criteria/SKILL.md:55: the criterion is worded twice',
  ].join('\n')), second.prompt)
  const started = host.events().filter((event) => event.type === 'step.started' && event.step === 'design')
  assert.deepEqual(started.map(({ visit, sentBy, feedback }) => [visit, sentBy, feedback.length]), [[1, undefined, 0], [2, 'review', 5]])
  assert.ok(host.progress.lines.includes(`${SLUG}: design_review NEEDS_REWORK: 5 reasons to address`), host.progress.lines.join('\n'))
})

test('a refuted blocker or medium does not count; an unverifiable one does; the pass writes its verdict beside its inputs', async () => {
  const refuted = scripted({}, nominal)
  refuted.agentRunner.review = lenses({
    consistency: [says('consistency', 'fail', [finding('F1', 'blocker', 'the ADR is missing')])],
    refuter: [refutes('refuted', 'docs/adr/adr-001-card-payment.md is in the patch')],
  })

  assert.equal((await refuted.start()).status, 'done')
  assert.deepEqual(reviews(refuted)[0], ['design_review', 1, 'approved', 'adr'])
  assert.equal(refuted.events().find((event) => event.type === 'step.recorded' && event.step === 'design_review').reason, 'APPROVED: no finding counts; 1 refuted (consistency F1)')
  const shown = refuted.progress.lines.slice(refuted.progress.lines.findIndex((line) => line.includes('design_review APPROVED')))
  assert.deepEqual(shown.slice(0, 3), [
    `${SLUG}: design_review APPROVED: no finding counts; 1 refuted (consistency F1)`,
    `  refuted: consistency F1 G1 blocker at src/Checkout.cs:12: the ADR is missing — docs/adr/adr-001-card-payment.md is in the patch`,
    `  details: ${TRACKING}/reviews/design_review-1/verdict.yaml`,
  ])
  assert.ok(refuted.progress.lines.includes(`${SLUG}: distill_review APPROVED: every lens passed`), refuted.progress.lines.join('\n'))
  const check = refuted.agentRunner.reviewed().find((dispatch) => dispatch.agent === 'finding-refuter')
  assert.equal(check.label, `skraft ${SLUG} · design_review · refute consistency F1 · attempt 1`)
  assert.equal(check.prompt, [
    '## Skraft finding check: consistency F1',
    '- Finding: G1 blocker at src/Checkout.cs:12: the ADR is missing',
    '- Only consistency found a blocker, high or medium finding; architecture-compliance, fitness found none.',
    '- Judge it as the reviewer, with every input of the review: confirm it only when the defect stands with all of them and warrants sending the work back; refute it when the story, a contract or a document shows the work is right as it is, or when its fix would change what they fix, and say why in reason.',
    '- Lens (read it with the skills: its gate table states the rule of each gate a finding cites): /plugin/agents/consistency-lens.md',
    '- Read these inputs and the files they name; search the repository for nothing else:',
    `  - Review context (story, project rules, who wrote which document): ${TRACKING}/reviews/design_review-1/context.md`,
    `  - Documents of this phase: ${TRACKING}/${MATRIX}`,
    `  - Documents of this phase: ${TRACKING}/${SCAN}`,
    `  - Documents of the story and of the other phases: ${TRACKING}/${RESEARCH}`,
    `  - Changes since the base of the run (open a whole file only when the patch lacks the context a finding needs): ${TRACKING}/reviews/design_review-1/changes.patch`,
    `  - Paths those changes touch (a path with no section in the patch is a new file: open it): ${TRACKING}/reviews/design_review-1/changed-files.txt`,
    `  - Changes since the base of the run (open a whole file only when the patch lacks the context a finding needs): ${TRACKING}/reviews/design_review-1/design.patch`,
    `  - Paths those changes touch (a path with no section in the patch is a new file: open it): ${TRACKING}/reviews/design_review-1/design-files.txt`,
    '- Confirm the finding only when these inputs show it; refute it when they show it is wrong, citing the path:line; say unverifiable when they cannot tell.',
    '- Judge by the rule of the gate a finding cites, as the lens, the skills and the inputs above state it, with the references a skill names for that gate; a rule no input states is no reason to refute: say unverifiable.',
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
    fitness: [says('fitness', 'fail', [
      finding('F1', 'medium', 'no latency budget', { location: 'docs/adr/adr-001.md:4' }),
      finding('F2', 'medium', 'no error budget', { location: 'docs/adr/adr-001.md:9' }),
    ])],
    refuter: [refutes('refuted'), refutes('unverifiable', 'the context map does not say'), refutes('confirmed', 'the map spells it C:\\pay'), refutes('confirmed'), refutes('refuted', 'docs/adr/adr-001.md:9 sets one')],
  })

  await kept.start()

  const recorded = kept.events().find((event) => event.type === 'step.recorded' && event.step === 'design_review')
  assert.ok(kept.progress.lines.includes(`${SLUG}: design_review NEEDS_REWORK: 3 reasons to address; 2 refuted (consistency F1, fitness F2)`), kept.progress.lines.join('\n'))
  assert.deepEqual([recorded.outcome, recorded.failures], ['needs-rework', [
    'consistency F2 G1 high at src/Checkout.cs:12: two contexts own payments (not verified)',
    'fitness F1 G1 medium at docs/adr/adr-001.md:4: no latency budget',
    // A low finding the refuter confirmed counts like any other (#499): the producer fixes it on the pass that goes back.
    'consistency F3 G1 low at src/Checkout.cs:12: the "Payments" context is named C:\\pay (suggestion: one name)',
  ]])
  assert.deepEqual(kept.events().filter((event) => event.type === 'review.refuted').map(({ lens, finding: id, verdict, reason }) => [lens, id, verdict, reason]), [
    ['consistency', 'F1', 'refuted', 'refuted by the patch'],
    ['consistency', 'F2', 'unverifiable', 'the context map does not say'],
    ['consistency', 'F3', 'confirmed', 'the map spells it C:\\pay'],
    ['fitness', 'F1', 'confirmed', 'confirmed by the patch'],
    ['fitness', 'F2', 'refuted', 'docs/adr/adr-001.md:9 sets one'],
  ])
  const entryLines = (lens, id, severity, location, description, suggestion = 'null') => [
    `  - lens: "${lens}"`, `    id: "${id}"`, '    gate: "G1"', `    severity: "${severity}"`, `    location: "${location}"`, `    description: ${description}`, `    suggestion: ${suggestion}`,
    `    severityReason: "${severity} by the criterion"`, '    drift: "structural"', `    occurrences: "${location}"`,
  ]
  assert.equal(await kept.tracking.read(SLUG, 'reviews/design_review-1/verdict.yaml'), [
    'status: "NEEDS_REWORK"',
    'code: null',
    'summary: "NEEDS_REWORK: 3 reasons to address; 2 refuted (consistency F1, fitness F2)"',
    'findings:',
    ...entryLines('consistency', 'F2', 'high', 'src/Checkout.cs:12', '"two contexts own payments"'),
    ...entryLines('fitness', 'F1', 'medium', 'docs/adr/adr-001.md:4', '"no latency budget"'),
    ...entryLines('consistency', 'F3', 'low', 'src/Checkout.cs:12', '"the \\"Payments\\" context is named C:\\\\pay"', '"one name"'),
    'notes: []',
    'refutations:',
    '  - lens: "consistency"', '    finding: "F1"', '    verdict: "refuted"', '    reason: "refuted by the patch"',
    '  - lens: "consistency"', '    finding: "F2"', '    verdict: "unverifiable"', '    reason: "the context map does not say"',
    '  - lens: "consistency"', '    finding: "F3"', '    verdict: "confirmed"', '    reason: "the map spells it C:\\\\pay"',
    '  - lens: "fitness"', '    finding: "F1"', '    verdict: "confirmed"', '    reason: "confirmed by the patch"',
    '  - lens: "fitness"', '    finding: "F2"', '    verdict: "refuted"', '    reason: "docs/adr/adr-001.md:9 sets one"',
    'reused: []',
    '',
  ].join('\n'))
  assert.match(await kept.tracking.read(SLUG, 'reviews/design_review-2/verdict.yaml'), /^status: "APPROVED"\ncode: null\nsummary: "APPROVED: every lens passed"\nfindings: \[\]\nnotes: \[\]\nrefutations: \[\]\n/)
})

test('findings of different lenses at the same line with the same severity are checked in one call, each on its own verdict, with the skills and the descriptor of each lens, and the next brief lists those that count once', async () => {
  const catalog = new InMemoryAgentCatalog({
    skills: { 'consistency-lens': ['architecture-review-criteria'], 'architecture-compliance-lens': ['architecture-review-criteria', 'clean-architecture'] },
    skillFiles: { 'architecture-review-criteria': '# Criteria\n', 'clean-architecture': '# Clean Architecture\n' },
  })
  const host = scripted({ catalog }, (it) => [...nominal(it).slice(0, 2), agent()(it), ...nominal(it).slice(2)])
  host.agentRunner.review = lenses({
    consistency: [says('consistency', 'fail', [
      finding('F1', 'blocker', 'the ADR contradicts the context map', { suggestion: 'align the payment context' }),
      finding('F2', 'high', 'two contexts own payments'),
      finding('F3', 'medium', 'the refund path is undocumented'),
      finding('F4', 'medium', 'the refund owner is unnamed'),
    ])],
    'architecture-compliance': [says('architecture-compliance', 'fail', [
      finding('F2', 'blocker', 'the domain imports the database driver', { location: './src/Checkout.cs:12', gate: 'A3' }),
      finding('F3', 'medium', 'the use case returns an entity', { location: 'src\\Checkout.cs:12', suggestion: 'return a DTO' }),
      finding('F4', 'medium', 'no owner', { location: '' }),
    ])],
    fitness: [says('fitness', 'fail', [
      finding('F1', 'blocker', 'no latency budget', { location: 'src/Checkout.cs:13' }),
      finding('F2', 'medium', 'no error budget', { suggestion: 'set an error budget' }),
      finding('F3', 'medium', 'no owner either', { location: '' }),
    ])],
    refuter: [
      checksAnswer([['consistency F1', 'confirmed'], ['architecture-compliance F2', 'refuted', 'src/Checkout.cs:12 imports the domain only']]),
      { ok: false, text: '', unavailable: true, error: 'finding-refuter is not installed' },
      checksAnswer([['consistency F3', 'confirmed'], ['architecture-compliance F3', 'confirmed'], ['fitness F2', 'confirmed']]),
      ...Array.from({ length: 4 }, () => refutes('confirmed')), refutes('refuted'),
    ],
  })
  const scriptedAnswer = host.agentRunner.review
  host.agentRunner.review = async (dispatch) => {
    const answer = await scriptedAnswer(dispatch)
    return typeof answer === 'string' ? { ok: true, text: answer, costUsd: 0.25 } : answer
  }

  assert.equal((await host.start()).code, 'agent-unavailable')
  assert.equal((await host.run()).status, 'done')

  const checks = host.agentRunner.reviewed().filter((dispatch) => dispatch.agent === 'finding-refuter')
  assert.deepEqual(checks.map((dispatch) => dispatch.label.split(' · ')[2]), [
    'refute consistency F1, architecture-compliance F2', 'refute consistency F2', 'refute consistency F3, architecture-compliance F3, fitness F2',
    'refute consistency F4', 'refute architecture-compliance F4', 'refute fitness F1', 'refute fitness F3', 'refute consistency F2',
  ])
  assert.ok(checks[0].prompt.startsWith([
    '## Skraft finding check: consistency F1, architecture-compliance F2',
    '- Finding (consistency F1): G1 blocker at src/Checkout.cs:12: the ADR contradicts the context map',
    '- Finding (architecture-compliance F2): A3 blocker at src/Checkout.cs:12: the domain imports the database driver',
    '- Skill (read it before any other input and judge with its criteria): /plugin/skills/architecture-review-criteria/SKILL.md',
    '- Skill (read it before any other input and judge with its criteria): /plugin/skills/clean-architecture/SKILL.md',
    '- Lens (read it with the skills: its gate table states the rule of each gate a finding cites): /plugin/agents/consistency-lens.md',
    '- Lens (read it with the skills: its gate table states the rule of each gate a finding cites): /plugin/agents/architecture-compliance-lens.md',
    '- Read these inputs and the files they name; search the repository for nothing else:',
    `  - Review context (story, project rules, who wrote which document): ${TRACKING}/reviews/design_review-1/context.md`,
    `  - Documents of this phase: ${TRACKING}/${MATRIX}`,
    `  - Documents of this phase: ${TRACKING}/${SCAN}`,
    `  - Documents of the story and of the other phases: ${TRACKING}/${RESEARCH}`,
    `  - Changes since the base of the run (open a whole file only when the patch lacks the context a finding needs): ${TRACKING}/reviews/design_review-1/changes.patch`,
    `  - Paths those changes touch (a path with no section in the patch is a new file: open it): ${TRACKING}/reviews/design_review-1/changed-files.txt`,
    '- Check each finding on its own, though they share a line: confirm it only when these inputs show it; refute it when they show it is wrong, citing the path:line; say unverifiable when they cannot tell.',
    '- Judge by the rule of the gate a finding cites, as the lens, the skills and the inputs above state it, with the references a skill names for that gate; a rule no input states is no reason to refute: say unverifiable.',
    '- Write no file, change nothing, start no agent.',
    '- End your answer with this YAML document in a ```yaml block:',
    '```yaml',
    'checks:',
    '  - finding: "consistency F1"',
    '    verdict: refuted     # confirmed | refuted | unverifiable',
    '    reason: "<the path:line you read and what it shows>"',
    '  - finding: "architecture-compliance F2"',
  ].join('\n')), checks[0].prompt)
  assert.ok(checks[1].prompt.startsWith('## Skraft finding check: consistency F2\n- Finding: G1 high at src/Checkout.cs:12: two contexts own payments\n'), checks[1].prompt)
  assert.deepEqual(host.events().filter((event) => event.type === 'review.refuted').map(({ lens, finding: id, verdict, cost }) => `${lens} ${id} ${verdict} ${cost}`), [
    'consistency F1 confirmed 0.25', 'architecture-compliance F2 refuted undefined',
    'consistency F3 confirmed 0.25', 'architecture-compliance F3 confirmed undefined', 'fitness F2 confirmed undefined',
    'consistency F4 confirmed 0.25', 'architecture-compliance F4 confirmed 0.25', 'fitness F1 confirmed 0.25', 'fitness F3 confirmed 0.25',
    'consistency F2 refuted 0.25',
  ])
  const recorded = host.events().find((event) => event.type === 'step.recorded' && event.step === 'design_review')
  assert.equal(recorded.cost, 0.25 * 3 + 0.25 * 7)
  const failures = [
    'consistency F1 G1 blocker at src/Checkout.cs:12: the ADR contradicts the context map (suggestion: align the payment context)',
    'consistency F3 G1, architecture-compliance F3 G1, fitness F2 G1 medium at src/Checkout.cs:12: the refund path is undocumented; the use case returns an entity; no error budget (suggestion: return a DTO; set an error budget)',
    'consistency F4 G1 medium at src/Checkout.cs:12: the refund owner is unnamed',
    'architecture-compliance F4 G1 medium: no owner',
    'fitness F1 G1 blocker at src/Checkout.cs:13: no latency budget',
    'fitness F3 G1 medium: no owner either',
  ]
  assert.deepEqual(recorded.failures, failures)
  assert.ok(host.agentRunner.dispatches[2].prompt.endsWith(['', 'The review sent the work back on pass 1, with these findings:', ...failures.map((line) => `- ${line}`)].join('\n')), host.agentRunner.dispatches[2].prompt)
})

test('a check of several findings that does not give each its own verdict is refused, then the findings stay unverifiable', async () => {
  const host = scripted({}, (it) => [...nominal(it).slice(0, 2), () => ({ ok: false, unavailable: true, text: '', error: 'stop here' })])
  host.agentRunner.review = lenses({
    consistency: [says('consistency', 'fail', [finding('F1', 'high', 'two contexts own payments')])],
    fitness: [says('fitness', 'fail', [finding('F1', 'high', 'no latency budget')])],
    refuter: [refutes('refuted'), checksAnswer([['consistency F1', 'refuted']])],
  })

  await host.start()

  const [first, retry] = host.agentRunner.reviewed().filter((dispatch) => dispatch.agent === 'finding-refuter')
  assert.ok(first.prompt.includes('  - finding: "fitness F1"'), first.prompt)
  assert.ok(retry.prompt.endsWith('Your previous answer was refused: the key verdict is not in the contract; give checks, one item per finding. Answer again with the YAML document only.'), retry.prompt)
  assert.deepEqual(host.events().filter((event) => event.type === 'review.refuted').map(({ lens, verdict, reason }) => `${lens} ${verdict} ${reason}`), [
    'consistency unverifiable unreadable 2 times: checks must name each finding exactly once: consistency F1, fitness F1',
    'fitness unverifiable unreadable 2 times: checks must name each finding exactly once: consistency F1, fitness F1',
  ])
})

test('a low finding sends the work back whatever its lens answered, once the refuter, one tier above the lens, did not refute it; a refuted low is set aside (#499)', async () => {
  const host = scripted({}, (it) => [...nominal(it).slice(0, 2), agent()(it), ...nominal(it).slice(2)])
  host.agentRunner.review = lenses({
    consistency: [says('consistency', 'fail', [finding('F1', 'low', 'the caller has two names'), finding('F2', 'low', 'a typo in the title', { location: '' })])],
    fitness: [says('fitness', 'pass', [finding('F1', 'low', 'name the latency budget', { location: 'docs/adr/adr-001.md:4' })])],
    refuter: [refutes('confirmed'), refutes('refuted', 'the title has no typo'), refutes('unverifiable', 'the ADR does not say')],
  })

  assert.equal((await host.start()).status, 'done')

  const recorded = host.events().find((event) => event.type === 'step.recorded' && event.step === 'design_review')
  assert.deepEqual([recorded.outcome, recorded.code, recorded.next, recorded.reason], ['needs-rework', null, 'design', 'NEEDS_REWORK: 2 reasons to address; 1 refuted (consistency F2)'])
  assert.deepEqual(recorded.failures, ['consistency F1 G1 low at src/Checkout.cs:12: the caller has two names', 'fitness F1 G1 low at docs/adr/adr-001.md:4: name the latency budget (not verified)'])
  assert.deepEqual(recorded.findings.map(({ lens, id, severity }) => `${lens} ${id} ${severity}`), ['consistency F1 low', 'fitness F1 low'])
  const checks = host.agentRunner.reviewed().filter((dispatch) => dispatch.agent === 'finding-refuter')
  assert.deepEqual(checks.map(({ label, model }) => `${label.split(' · ')[2]} ${model}`), ['refute consistency F1 standard', 'refute consistency F2 standard', 'refute fitness F1 standard'])
  assert.deepEqual(host.events().filter((event) => event.type === 'review.refuted').map(({ lens, finding: id, verdict }) => `${lens} ${id} ${verdict}`), ['consistency F1 confirmed', 'consistency F2 refuted', 'fitness F1 unverifiable'])
  const second = host.agentRunner.dispatches.find((dispatch) => dispatch.label === `skraft ${SLUG} · design · pass 2 · attempt 1`)
  assert.ok(second.prompt.endsWith('The review sent the work back on pass 1, with these findings:\n- consistency F1 G1 low at src/Checkout.cs:12: the caller has two names\n- fitness F1 G1 low at docs/adr/adr-001.md:4: name the latency budget (not verified)'), second.prompt)
  assert.deepEqual(reviews(host).slice(0, 2), [['design_review', 1, 'needs-rework', 'design'], ['design_review', 2, 'approved', 'adr']])
  const approved = host.events().filter((event) => event.type === 'step.recorded' && event.step === 'design_review')[1]
  assert.equal(approved.reason, 'APPROVED: every lens passed')

  const refuted = scripted({}, nominal)
  refuted.agentRunner.review = lenses({ fitness: [says('fitness', 'pass', [finding('F1', 'low', 'name the latency budget')])], refuter: [refutes('refuted', 'the ADR names it')] })
  assert.equal((await refuted.start()).status, 'done')
  const kept = refuted.events().find((event) => event.type === 'step.recorded' && event.step === 'design_review')
  assert.deepEqual([kept.outcome, kept.next, kept.reason, kept.findings], ['approved', 'adr', 'APPROVED: no finding counts; 1 refuted (fitness F1)', undefined])
})

test('a lens that answers inconclusive blocks the review without sending the work back; one that fails with low findings only does not; the other lenses\' findings are journaled', async () => {
  const host = scripted({ answers: [{ answer: 'STOP' }] }, (it) => [...nominal(it).slice(0, 2), () => ({ ok: false, unavailable: true, text: '', error: 'the work was sent back' })])
  host.agentRunner.review = lenses({
    consistency: [says('consistency', 'fail', [finding('F1', 'low', 'a typo in the title')])],
    'architecture-compliance': [says('architecture-compliance', 'fail', [finding('F1', 'blocker', 'the domain imports the database driver')])],
    fitness: [says('fitness', 'inconclusive', [finding('F1', 'low', 'the research document is empty'), finding('F2', 'low', 'no story to read')])],
  })

  const outcome = await host.start()

  const reason = 'fitness: inconclusive: the research document is empty; no story to read'
  assert.deepEqual(outcome, { status: 'blocked', slug: SLUG, phase: 'DESIGN', code: 'lens-inconclusive', reason })
  const recorded = host.events().find((event) => event.type === 'step.recorded' && event.step === 'design_review')
  assert.deepEqual([recorded.outcome, recorded.code, recorded.failures, recorded.next, recorded.reason, recorded.findings], ['blocked', 'lens-inconclusive', [], null, reason, undefined])
  assert.deepEqual(host.progress.lines.filter((line) => line.startsWith('  ')), [])
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

  const silent = scripted({ answers: [{ answer: 'STOP' }] }, (it) => nominal(it).slice(0, 2))
  silent.agentRunner.review = lenses({ 'architecture-compliance': [says('architecture-compliance', 'inconclusive')], fitness: [says('fitness', 'inconclusive')] })
  assert.deepEqual(await silent.start(), { status: 'blocked', slug: SLUG, phase: 'DESIGN', code: 'lens-inconclusive', reason: 'architecture-compliance: inconclusive; fitness: inconclusive' })
})

/** The design agents of a DESIGN that loops to its ceiling: the first pass and the two the review sends back. */
const designUntilCeiling = (it) => [...nominal(it).slice(0, 2), agent()(it), agent()(it)]
const VERDICT_3 = `${TRACKING}/reviews/design_review-3/verdict.yaml`

test('a review whose blocker or high finding is left after three passes asks the developer for an instruction or STOP, never ACCEPT, each such finding with its context (#499)', async () => {
  const host = scripted({ answers: [{ answer: 'STOP' }] }, designUntilCeiling)
  // 119 characters, then the 120th and on: the table keeps 119 and marks the cut.
  const LONG = `${'the context map spells it "Payment" | '.repeat(3)}${'x'.repeat(5)}, and the glossary spells it otherwise`
  // 120 characters once its pipe is escaped: kept whole.
  const EXACT = `a glossary | ${'y'.repeat(106)}`
  const high = says('consistency', 'fail', [
    finding('F1', 'high', 'the published contract has no Refund type <b>now</b>', { severityReason: 'billing reads the contract, ask @billing', drift: 'structural', occurrences: ['src/Checkout.cs:12', 'docs/architecture/payments.md:40', 'docs/api/openapi.yaml:88'], suggestion: 'add Refund to the contract; fixes #12' }),
    finding('F2', 'low', 'the context map spells it "Payment", see @alice'),
    finding('F3', 'blocker', 'the ADR has no status', { location: '', occurrences: ['docs/adr/adr-001.md:1'], drift: 'label' }),
    finding('F4', 'medium', LONG, { location: 'docs/glossary.md:3' }),
    finding('F5', 'medium', EXACT, { location: 'docs/glossary.md:9' }),
  ])
  host.agentRunner.review = lenses({ consistency: [high, high, high] })

  const outcome = await host.start()

  assert.deepEqual(reviews(host).map(([, visit, result, next]) => [visit, result, next]), [[1, 'needs-rework', 'design'], [2, 'needs-rework', 'design'], [3, 'needs-rework', null]])
  const [asked] = host.human.questions
  assert.deepEqual([asked.kind, asked.options], ['blocked', ['STOP']])
  assert.equal(asked.text, [
    'design_review: design did not fix every finding after 3 passes, so the run does not send it back again.',
    '',
    'Blocker and high (2):',
    '- high · consistency F1 G1 at src/Checkout.cs:12: the published contract has no Refund type now',
    '  why high: billing reads the contract, ask `@billing`',
    '  drift: structural',
    '  also at: docs/architecture/payments.md:40, docs/api/openapi.yaml:88',
    '  fix: add Refund to the contract; `fixes #12`',
    '- blocker · consistency F3 G1: the ADR has no status',
    '  why blocker: blocker by the criterion',
    '  drift: label',
    '  also at: docs/adr/adr-001.md:1',
    '',
    'Medium and low (3):',
    '| Severity | Finding | Where | What |',
    '|---|---|---|---|',
    `| medium | consistency F4 | docs/glossary.md:3 | ${LONG.replaceAll('|', '\\|').slice(0, 119)}… |`,
    `| medium | consistency F5 | docs/glossary.md:9 | ${EXACT.replace('|', '\\|')} |`,
    '| low | consistency F2 | src/Checkout.cs:12 | the context map spells it "Payment", see `@alice` |',
    '',
    `Every finding with its context: ${VERDICT_3}`,
    'A blocker or high finding cannot be accepted: an instruction runs design again with every finding and the instruction; STOP ends the run.',
  ].join('\n'))
  assert.deepEqual(outcome, {
    status: 'blocked', slug: SLUG, phase: 'DESIGN', code: 'loop-ceiling',
    reason: `design_review -> design was already taken 2 times, its max_visits; consistency F1 G1 high at src/Checkout.cs:12: the published contract has no Refund type <b>now</b> (suggestion: add Refund to the contract; fixes #12); consistency F3 G1 blocker: the ADR has no status; consistency F4 G1 medium at docs/glossary.md:3: ${LONG}; consistency F5 G1 medium at docs/glossary.md:9: ${EXACT}; consistency F2 G1 low at src/Checkout.cs:12: the context map spells it "Payment", see @alice`,
  })
  const written = await host.tracking.read(SLUG, 'reviews/design_review-3/verdict.yaml')
  assert.ok(written.includes('    severityReason: "billing reads the contract, ask @billing"\n    drift: "structural"\n    occurrences: "src/Checkout.cs:12, docs/architecture/payments.md:40, docs/api/openapi.yaml:88"\n'), written)
})

test('ACCEPT typed at the question of a ceiling with a high finding left is an instruction like any other: the producer runs again with it, and nothing is listed as accepted (#499)', async () => {
  const host = scripted({}, (it) => [...designUntilCeiling(it), agent()(it), ...nominal(it).slice(2)])
  const high = says('consistency', 'fail', [finding('F1', 'high', 'the published contract has no Refund type')])
  host.agentRunner.review = lenses({ consistency: [high, high, high] })

  await host.start()
  await host.decide({ answer: 'ACCEPT' })
  assert.equal((await host.run()).status, 'done')

  const pass = host.agentRunner.dispatches.find((dispatch) => dispatch.label === `skraft ${SLUG} · design · pass 4 · attempt 1`)
  assert.ok(pass?.prompt.endsWith('\n\nA human refused the work of pass 3:\n- ACCEPT'), pass?.prompt)
  assert.equal((await host.tracking.read(SLUG, 'run-report.md')).includes('## Accepted findings'), false)
  assert.equal(section(await host.tracking.read(SLUG, 'pull-request.md'), 'Review'), 'Every lens of the last pass of each review passed without a finding.')
})

test('a review with only medium and low findings left after three passes lets the developer ACCEPT them: the run goes on past the review, and the report and the pull request list them (#499)', async () => {
  const host = scripted({ answers: [{ answer: 'ACCEPT' }] }, (it) => [...designUntilCeiling(it), ...nominal(it).slice(2)])
  const medium = says('consistency', 'fail', [
    finding('F1', 'medium', 'a read model is classified twice', { location: 'docs/architecture/payments.md:7' }), finding('F2', 'low', 'a typo | in the title', { location: '' }),
    finding('F3', 'medium', 'the map names no currency', { location: 'docs/architecture/payments.md:9' }),
  ])
  // The refuter confirms F1 and F2 and refutes F3 on each pass: F3, which one lens alone found, is never accepted.
  const checks = (pass) => [refutes('confirmed'), refutes('confirmed'), refutes('refuted', `payments.md:9 names EUR (pass ${pass})`)]
  host.agentRunner.review = lenses({ consistency: [medium, medium, medium], refuter: [1, 2, 3].flatMap(checks) })

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  const [asked] = host.human.questions
  assert.deepEqual([asked.kind, asked.header, asked.options], ['review-ceiling', 'Review', ['ACCEPT', 'STOP']])
  assert.equal(asked.text, [
    'design_review: design did not fix every finding after 3 passes, so the run does not send it back again.',
    '',
    'Medium and low (2):',
    '| Severity | Finding | Where | What |',
    '|---|---|---|---|',
    '| medium | consistency F1 | docs/architecture/payments.md:7 | a read model is classified twice |',
    '| low | consistency F2 | - | a typo \\| in the title |',
    '',
    `Every finding with its context: ${VERDICT_3}`,
    'ACCEPT takes these findings as they stand and goes on (they are listed in the run report and the pull request); an instruction runs design again with every finding and the instruction; STOP ends the run.',
  ].join('\n'))
  assert.deepEqual(reviews(host).slice(2, 4), [['design_review', 3, 'needs-rework', null], ['distill_review', 1, 'approved', 'deliver']])
  assert.equal(host.agentRunner.dispatches.filter((dispatch) => dispatch.agent === 'solution-architect').length, 3)
  const report = await host.tracking.read(SLUG, 'run-report.md')
  assert.ok(report.includes('\n## Accepted findings\n\n| Review | Severity | Finding | Where | What |\n| --- | --- | --- | --- | --- |\n| design_review | medium | consistency F1 | docs/architecture/payments.md:7 | a read model is classified twice |\n| design_review | low | consistency F2 | - | a typo \\| in the title |\n'), report)
  const description = await host.tracking.read(SLUG, 'pull-request.md')
  assert.equal(opening(description, 'Review'), '<details open><summary>Review: 1 to decide, 2 accepted</summary>')
  assert.equal(section(description, 'Review'), [
    '**design_review** · 3 passes · lenses reviewer · refuter standard', '',
    '| Status | Severity | Lens | Location | Finding | Why |',
    '| --- | --- | --- | --- | --- | --- |',
    '| To decide | medium | consistency · G1 Every structural commitment has an ADR (F3) | `docs/architecture/payments.md:9` | the map names no currency | one lens alone, against the lenses that passed; refuted: payments.md:9 names EUR (pass 3) |',
    '| Accepted | medium | consistency · G1 Every structural commitment has an ADR (F1) | `docs/architecture/payments.md:7` | a read model is classified twice | a human accepted it as it stands at the review\'s ceiling |',
    '| Accepted | low | consistency · G1 Every structural commitment has an ADR (F2) | - | a typo \\| in the title | a human accepted it as it stands at the review\'s ceiling |',
  ].join('\n'))
  assert.equal(description.includes('Accepted findings'), false, 'the review table holds the accepted findings: no second list')
})

test('STOP to a review-ceiling question ends the run blocked at the ceiling, and a later run asks nothing more (#499)', async () => {
  const host = scripted({ answers: [{ answer: 'STOP' }] }, designUntilCeiling)
  const medium = says('consistency', 'fail', [finding('F1', 'medium', 'a read model is classified twice', { location: 'docs/architecture/payments.md:7' })])
  host.agentRunner.review = lenses({ consistency: [medium, medium, medium] })

  const outcome = await host.start()

  const reason = 'design_review -> design was already taken 2 times, its max_visits; consistency F1 G1 medium at docs/architecture/payments.md:7: a read model is classified twice'
  assert.deepEqual(outcome, { status: 'blocked', slug: SLUG, phase: 'DESIGN', code: 'loop-ceiling', reason })
  assert.deepEqual(host.human.questions.map(({ kind, options }) => [kind, options]), [['review-ceiling', ['ACCEPT', 'STOP']]])
  assert.deepEqual(host.events().filter((event) => event.type === 'question.answered').map(({ key, answer }) => [key, answer]), [['design-1', 'STOP']])
  assert.deepEqual(host.events().filter((event) => event.type === 'question.asked').map(({ key, step, visit, subjects }) => [key, step, visit, subjects]), [['design-1', 'design', 3, []]])
  assert.deepEqual([host.events().at(-1).type, host.events().at(-1).status, host.events().at(-1).code], ['run.finished', 'blocked', 'loop-ceiling'])
  assert.equal(host.agentRunner.dispatches.filter((dispatch) => dispatch.agent === 'solution-architect').length, 3)

  assert.equal((await host.run()).code, 'loop-ceiling')
  assert.equal(host.human.questions.length, 1)
  assert.equal(host.events().filter((event) => event.type === 'question.asked').length, 1)
  assert.deepEqual((await host.report()).accepted, [])
})

test('ACCEPT given with skraft decide at the ceiling of distill_review closes DISTILL and enters DELIVER; a run stopped after it resumes without asking again (#499)', async () => {
  const unavailable = () => ({ ok: false, unavailable: true, text: '' })
  const host = scripted({}, (it) => [...nominal(it).slice(0, 3), agent()(it), agent()(it), unavailable, nominal(it)[3]])
  const medium = says('coverage', 'fail', [finding('F1', 'medium', 'the refund rule has no scenario', { location: 'tests/Acceptance/refund.feature:4' }), finding('F2', 'low', 'a step is worded twice', { location: 'tests/Acceptance/refund.feature:9' })])
  host.agentRunner.review = lenses({ coverage: [medium, medium, medium] })

  const waiting = await host.start()
  assert.deepEqual([waiting.status, waiting.phase, waiting.code], ['waiting', 'DISTILL', 'review-ceiling'])
  assert.ok(waiting.reason.endsWith('Answer with skraft decide distill-1 ACCEPT|"<instruction>"|STOP.'), waiting.reason)
  await host.decide({ answer: 'accept' })
  const stopped = await host.run()
  const done = await host.run()

  assert.deepEqual([stopped.phase, stopped.code, done.status], ['DELIVER', 'agent-unavailable', 'done'])
  assert.deepEqual(host.events().filter((event) => event.type.startsWith('question.')).map(({ type, key, kind, answer }) => [type, key, kind, answer]), [
    ['question.asked', 'distill-1', 'review-ceiling', undefined],
    ['question.answered', 'distill-1', undefined, 'ACCEPT'],
  ])
  const after = host.events().slice(host.events().findIndex((event) => event.type === 'question.answered'))
  assert.deepEqual(after.filter((event) => event.type === 'phase.closed' || event.type === 'step.started').slice(0, 3).map(({ type, phase, step }) => `${type} ${phase} ${step ?? ''}`.trim()), [
    // The resumed run picks up the open attempt of deliver: no new step.started for it, no question again.
    'phase.closed DISTILL', 'step.started DELIVER deliver', 'step.started DELIVER gates',
  ])
  assert.deepEqual(reviews(host).filter(([step]) => step !== 'design_review'), [
    ['distill_review', 1, 'needs-rework', 'distill'], ['distill_review', 2, 'needs-rework', 'distill'], ['distill_review', 3, 'needs-rework', null],
    ['deliver_review', 1, 'approved', 'mutation'],
  ])
  assert.equal(host.agentRunner.dispatches.filter((dispatch) => dispatch.agent === 'acceptance-designer').length, 3)
  const engineer = host.agentRunner.dispatches.find((dispatch) => dispatch.agent === 'software-engineer')
  assert.ok(!engineer.prompt.includes('A human refused') && !engineer.prompt.includes('What pass'), engineer.prompt)
  assert.deepEqual(host.events().filter((event) => event.type === 'step.started' && event.step === 'deliver').map(({ visit, attempt, missing, feedback, sentBy, instruction, group }) => [visit, attempt, missing, feedback, sentBy, instruction, group]), [[1, 1, [], [], undefined, undefined, undefined]])
  const report = await host.tracking.read(SLUG, 'run-report.md')
  // Only what the ceiling's question asked about: not design_review's findings, not the consents answered ACCEPTED before.
  assert.equal(report.slice(report.indexOf('## Accepted findings'), report.indexOf('## Forge writes') < 0 ? report.indexOf('Started at') : report.indexOf('## Forge writes')), [
    '## Accepted findings', '',
    '| Review | Severity | Finding | Where | What |',
    '| --- | --- | --- | --- | --- |',
    '| distill_review | medium | coverage F1 | tests/Acceptance/refund.feature:4 | the refund rule has no scenario |',
    '| distill_review | low | coverage F2 | tests/Acceptance/refund.feature:9 | a step is worded twice |',
    '', '',
  ].join('\n'))
})

test('ACCEPT at the ceiling of deliver_review, a call to .skraft/review.skraft.dot, goes on by its APPROVED edge to the mutation gate (#499)', async () => {
  const host = scripted({ answers: [{ answer: 'ACCEPT' }] }, (it) => [
    ...nominal(it),
    agent({ work: tddCycle(SLUG, 'Refund') })(it), agent({ work: tddCycle(SLUG, 'Discount') })(it),
  ])
  const low = says('test-integrity', 'fail', [finding('F1', 'low', 'the refund test name says nothing', { gate: 'G7', location: 'tests/CheckoutTests.cs:9' })])
  host.agentRunner.review = lenses({ 'test-integrity': [low, low, low] })

  assert.equal((await host.start()).status, 'done')

  assert.deepEqual(reviews(host).filter(([step]) => step === 'deliver_review'), [
    ['deliver_review', 1, 'needs-rework', 'deliver'], ['deliver_review', 2, 'needs-rework', 'deliver'], ['deliver_review', 3, 'needs-rework', null],
  ])
  const [asked] = host.human.questions
  assert.deepEqual([asked.kind, asked.options], ['review-ceiling', ['ACCEPT', 'STOP']])
  assert.ok(asked.text.startsWith('deliver_review: deliver did not fix every finding after 3 passes'), asked.text)
  const answered = host.events().findIndex((event) => event.type === 'question.answered')
  assert.equal(host.events().slice(answered).find((event) => event.type === 'step.started').step, 'mutation')
})

test('ACCEPT for a review the workflow no longer has stops the run as changed, running nothing (#499)', async () => {
  // A review of the repository's own, after design_review: no mandatory node, so a copy may drop it.
  const withSecurity = edit(BUILT_IN_WORKFLOW,
    ['  adr      [shape=hexagon, question="adr-ratification"]', '  security_review_lenses [shape=component]\n  security_review_fitness [shape=note, lens="fitness"]\n  security_review_refuter [shape=octagon]\n  security_review [shape=tripleoctagon]\n  adr      [shape=hexagon, question="adr-ratification"]'],
    ['  design_review -> adr     [label="APPROVED"]', '  design_review -> security_review_lenses [label="APPROVED"]\n  security_review_lenses -> security_review_fitness -> security_review_refuter\n  security_review_refuter -> security_review\n  security_review -> design [label="NEEDS_REWORK", max_visits=3]\n  security_review -> adr [label="APPROVED"]'])
  const host = scripted({ files: ejectedPipeline(withSecurity) }, (it) => [...designUntilCeiling(it), agent()(it)])
  const medium = says('fitness', 'fail', [finding('F1', 'medium', 'no latency budget')])
  host.agentRunner.review = lenses({ fitness: [says('fitness', 'pass'), medium, medium, medium, medium] })
  assert.equal((await host.start()).code, 'review-ceiling')
  await host.decide({ answer: 'ACCEPT' })
  await host.deps.workspace.write('.skraft/pipeline.skraft.dot', BUILT_IN_WORKFLOW)
  const dispatched = host.agentRunner.dispatches.length

  const outcome = await host.run()

  assert.deepEqual(outcome, { status: 'blocked', slug: SLUG, phase: null, code: 'workflow-changed', reason: 'the workflow has no node security_review any more; restore the workflow the run started with' })
  assert.equal(host.agentRunner.dispatches.length, dispatched)
})

test('an instruction at a review ceiling sends the producer every finding left, then the instruction, whether the question offered ACCEPT or not (#500)', async () => {
  for (const severity of ['blocker', 'low']) {
    const host = scripted({}, (it) => [...designUntilCeiling(it), () => ({ ok: false, unavailable: true, text: '' })])
    const left = says('consistency', 'fail', [finding('F1', severity, 'the ADR contradicts the context map')])
    host.agentRunner.review = lenses({ consistency: [left, left, left] })

    await host.start()
    await host.decide({ answer: 'Follow the context map' })
    await host.run()

    assert.equal(host.events().find((event) => event.type === 'question.asked').kind, severity === 'low' ? 'review-ceiling' : 'blocked')
    assert.deepEqual((await host.report()).accepted, [])
    const pass = host.agentRunner.dispatches.find((dispatch) => dispatch.label === `skraft ${SLUG} · design · pass 4 · attempt 1`)
    assert.ok(pass?.prompt.endsWith(`\n\nWhat pass 3 left when it was blocked:\n- consistency F1 G1 ${severity} at src/Checkout.cs:12: the ADR contradicts the context map\n\nA human refused the work of pass 3:\n- Follow the context map`), `${severity}: ${pass?.prompt}`)
  }
})

test('the changes of a component in a neighbour repository are read from that repository, each repository once, its paths rebased whole', async () => {
  const WEB = { name: 'web', root: '../web', stack: 'react', bdd: false, paths: { src: ['src'], tests: ['src'] }, commands: { build: 'npm run build', test: 'npx vitest run' } }
  const git = new InMemoryGit({ repositories: { '.': { mergeBases: { main: 'root-0' } }, '../web': { mergeBases: { main: 'up-web-0' } } } })
  git.patched('../web/src/App.tsx', ['--- a/src/App.tsx', '+++ b/src/App.tsx'])
  git.adds('../web/src/App.tsx', 'export const App = () => null')
  git.change('../web/src/App.tsx')
  git.patched('../web/src/Payment Form.tsx', ['--- a/src/Payment Form.tsx\t', '+++ b/src/Payment Form.tsx\t'])
  git.adds('../web/src/Payment Form.tsx', 'export const PaymentForm = () => null')
  git.change('../web/src/Payment Form.tsx')
  const host = scripted({ components: [API, WEB], git }, (it) => nominal(it).slice(0, 2))
  host.agentRunner.behaviours.push(() => ({ ok: false, unavailable: true, text: '', error: 'stop here' }))

  await host.start()

  assert.equal(await host.tracking.read(SLUG, 'reviews/design_review-1/changed-files.txt'), 'docs/adr/adr-001-card-payment.md\n../web/src/App.tsx\n../web/src/Payment Form.tsx\n')
  assert.equal(await host.tracking.read(SLUG, 'reviews/design_review-1/changes.patch'), [
    'diff --git a/docs/adr/adr-001-card-payment.md b/docs/adr/adr-001-card-payment.md',
    'diff --git a/../web/src/App.tsx b/../web/src/App.tsx',
    '--- a/../web/src/App.tsx',
    '+++ b/../web/src/App.tsx',
    '+export const App = () => null',
    'diff --git a/../web/src/Payment Form.tsx b/../web/src/Payment Form.tsx',
    '--- a/../web/src/Payment Form.tsx\t',
    '+++ b/../web/src/Payment Form.tsx\t',
    '+export const PaymentForm = () => null',
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
  const workflow = edit(BUILT_IN_WORKFLOW,
    ['design_review [shape=tripleoctagon, mandatory=true]', 'design_review [shape=tripleoctagon]'],
    ['  design_review -> design  [label="NEEDS_REWORK", max_visits=2]\n', ''])
  const host = scripted({ workflow }, (it) => nominal(it).slice(0, 2))
  host.agentRunner.review = lenses({ consistency: [says('consistency', 'fail', [finding('F1', 'medium', 'no owner for refunds')])] })

  const outcome = await host.start()

  assert.deepEqual(outcome, {
    status: 'blocked', slug: SLUG, phase: 'DESIGN', code: 'review-rejected',
    reason: 'design_review asked for rework and the workflow has no NEEDS_REWORK edge out of it; consistency F1 G1 medium at src/Checkout.cs:12: no owner for refunds',
  })
})

test('the engine reads in the patch the skips added to tests, the test files deleted and the assertions removed with fewer added back, as G9 findings the refuter checks one tier above the lens they report for', async () => {
  const host = scripted({}, (it) => [
    ...nominal(it).slice(0, 3),
    agent({ work: ({ git }) => {
      tddCycle()({ git })
      git.patched('tests/CheckoutTests.cs', [
        '--- a/tests/CheckoutTests.cs', '+++ b/tests/CheckoutTests.cs', '@@ -10,4 +10,3 @@',
        '-    [Fact]', '+    [Fact(Skip = "flaky on CI")]', '     public void PaysByCard() {',
        '-        Assert.Equal(90, total);', '-        Assert.Equal("EUR", currency);', '+        Assert.NotNull(total);', '+    [Fact(Skip = "slow")]',
      ])
      git.patched('tests/TotalTests.cs', ['--- a/tests/TotalTests.cs', '+++ b/tests/TotalTests.cs', '@@ -4,1 +4,1 @@', '-        Assert.Equal(1, count);', '+        Assert.Equal(2, count);'])
      git.patched('tests/RefundTests.cs', ['deleted file mode 100644', '--- a/tests/RefundTests.cs', '+++ /dev/null', '@@ -1,2 +0,0 @@', '-public class RefundTests {', '-}'])
      git.patched('src/Checkout.cs', ['--- a/src/Checkout.cs', '+++ b/src/Checkout.cs', '@@ -3,0 +3,1 @@', '+    items.Skip(1); // [Ignore] in a comment of the code', '-    Assert(total > 0);'])
      git.patched('src/test_refunds.py', ['--- a/src/test_refunds.py', '+++ b/src/test_refunds.py', '@@ -1,0 +1,1 @@', '+@pytest.mark.skipif(sys.platform == "win32", reason="slow")'])
      git.patched('src/App.test.tsx', ['--- a/src/App.test.tsx', '+++ b/src/App.test.tsx', '@@ -7,1 +7,1 @@', '-  it("renders the total", () => {', '+  it.only("renders the total", () => {'])
      git.patched('src/latest.ts', ['--- a/src/latest.ts', '+++ b/src/latest.ts', '@@ -2,1 +2,0 @@', '-  expect(version).toBe(2)'])
      git.patched('tests/fixtures/payment.json', ['deleted file mode 100644', '--- a/tests/fixtures/payment.json', '+++ /dev/null'])
      git.patched('src/specs/payment.yaml', ['deleted file mode 100644', '--- a/src/specs/payment.yaml', '+++ /dev/null'])
      git.commit('refactor(checkout): trim the payment tests', ['tests/TotalTests.cs', 'tests/RefundTests.cs', 'src/test_refunds.py', 'src/App.test.tsx', 'src/latest.ts', 'tests/fixtures/payment.json', 'src/specs/payment.yaml'])
    } })(it),
  ])
  const unavailable = { ok: false, text: '', unavailable: true, error: 'finding-refuter is not installed' }
  host.agentRunner.review = lenses({ refuter: [refutes('confirmed'), unavailable, refutes('confirmed'), refutes('refuted', 'tests/Refunds/RefundTests.cs:1 holds the moved tests')] })
  host.agentRunner.behaviours.push(() => ({ ok: false, unavailable: true, text: '', error: 'stop here' }))

  assert.equal((await host.start()).code, 'agent-unavailable')
  await host.run()

  const scanned = host.events().find((event) => event.type === 'review.lens' && event.lens === 'test-integrity#patch')
  assert.deepEqual(scanned.gates, { G7: 'No test theater', G9: 'Iron Rule' }, 'the names of the gates of the lens the scan reports for')
  assert.deepEqual([scanned.agent, scanned.verdict, scanned.findings], ['skraft-engine', 'fail', [
    { id: 'F1', gate: 'G9', severity: 'blocker', location: 'tests/CheckoutTests.cs:10', description: 'a skip or a focus added to a test: [Fact(Skip = "flaky on CI")]', suggestion: null },
    { id: 'F2', gate: 'G9', severity: 'blocker', location: 'tests/CheckoutTests.cs:13', description: 'a skip or a focus added to a test: [Fact(Skip = "slow")]', suggestion: null },
    { id: 'F3', gate: 'G9', severity: 'high', location: 'tests/CheckoutTests.cs', description: '2 assertion lines removed, 1 added back', suggestion: null },
    { id: 'F4', gate: 'G9', severity: 'blocker', location: 'tests/RefundTests.cs', description: 'test file deleted', suggestion: null },
    { id: 'F5', gate: 'G9', severity: 'blocker', location: 'src/test_refunds.py:1', description: 'a skip or a focus added to a test: @pytest.mark.skipif(sys.platform == "win32", reason="slow")', suggestion: null },
    { id: 'F6', gate: 'G9', severity: 'blocker', location: 'src/App.test.tsx:7', description: 'a skip or a focus added to a test: it.only("renders the total", () => {', suggestion: null },
  ]])
  const lens = host.agentRunner.reviewed().find((dispatch) => dispatch.agent === 'test-integrity-lens').prompt
  assert.ok(lens.includes([
    '- The engine reports these findings from the patch; never report them again:',
    '  - F1 G9 blocker at tests/CheckoutTests.cs:10: a skip or a focus added to a test: [Fact(Skip = "flaky on CI")]',
  ].join('\n')), lens)
  assert.ok(!host.agentRunner.reviewed().find((dispatch) => dispatch.agent === 'cold-reader-lens').prompt.includes('The engine reports'))
  const checks = host.agentRunner.reviewed().filter((dispatch) => dispatch.agent === 'finding-refuter')
  assert.deepEqual(checks.map(({ label, model }) => [label.split(' · ')[2], model]), [
    ['refute test-integrity#patch F1', 'standard'], ['refute test-integrity#patch F2', 'standard'], ['refute test-integrity#patch F3', 'standard'], ['refute test-integrity#patch F4', 'standard'],
    ['refute test-integrity#patch F5', 'standard'], ['refute test-integrity#patch F6', 'standard'], ['refute test-integrity#patch F2', 'standard'],
  ])
  assert.ok(checks[0].prompt.includes(`  - Changes since the base of the run (open a whole file only when the patch lacks the context a finding needs): ${TRACKING}/reviews/deliver_review-1/changes.patch`), checks[0].prompt)
  const recorded = host.events().find((event) => event.type === 'step.recorded' && event.step === 'deliver_review')
  assert.deepEqual(recorded.failures, [
    'test-integrity#patch F1 G9 blocker at tests/CheckoutTests.cs:10: a skip or a focus added to a test: [Fact(Skip = "flaky on CI")]',
    'test-integrity#patch F2 G9 blocker at tests/CheckoutTests.cs:13: a skip or a focus added to a test: [Fact(Skip = "slow")]',
    'test-integrity#patch F3 G9 high at tests/CheckoutTests.cs: 2 assertion lines removed, 1 added back',
    'test-integrity#patch F5 G9 blocker at src/test_refunds.py:1: a skip or a focus added to a test: @pytest.mark.skipif(sys.platform == "win32", reason="slow")',
    'test-integrity#patch F6 G9 blocker at src/App.test.tsx:7: a skip or a focus added to a test: it.only("renders the total", () => {',
  ])
  assert.equal(host.events().filter((event) => event.type === 'review.lens' && event.lens === 'test-integrity#patch').length, 1)

  const clean = scripted({}, nominal)
  await clean.start()
  assert.deepEqual(clean.events().filter((event) => event.type === 'review.lens' && event.lens === 'test-integrity#patch'), [])
})
