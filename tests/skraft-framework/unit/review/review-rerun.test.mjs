import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, API, finding, lenses, nominal, refutes, reviews, says, scripted, SLUG, tddCycle, TRACKING } from '../support/pipeline-host.mjs'
import { designating, edit } from '../workflow/support.mjs'
import { BUILT_IN_WORKFLOW, InMemoryAgentCatalog, PLUGIN_AGENTS } from '../support/in-memory-host.mjs'
import { openJournal } from '../../../../plugins/skraft-framework/engine/application/run-journal.mjs'

const blocker = says('consistency', 'fail', [finding('F1', 'blocker', 'the ADR contradicts the context map')])

/** The lenses dispatched by the review node on its pass. @param {ReturnType<typeof scripted>} host @param {string} step @param {number} visit */
const askedOn = (host, step, visit) => host.agentRunner.reviewed()
  .filter((dispatch) => dispatch.agent !== 'finding-refuter' && dispatch.label.includes(` · ${step} · `) && (visit > 1 ? dispatch.label.includes(`· pass ${visit} ·`) : !dispatch.label.includes('· pass ')))
  .map((dispatch) => dispatch.agent)

test('on the next pass only the lenses that had findings or whose inputs changed run again; the others keep their verdict', async () => {
  const host = scripted({}, (it) => [
    ...nominal(it).slice(0, 2),
    agent({ fill: false, work: ({ git }) => git.commit('docs(checkout): ADR for the payment context', ['docs/adr/adr-002-payment-context.md']) })(it),
    ...nominal(it).slice(2),
  ])
  host.agentRunner.review = lenses({ consistency: [blocker] })

  await host.start()

  assert.deepEqual(askedOn(host, 'design_review', 1), ['consistency-lens', 'architecture-compliance-lens', 'fitness-lens'])
  assert.deepEqual(askedOn(host, 'design_review', 2), ['consistency-lens', 'architecture-compliance-lens'])
  const second = host.events().filter((event) => event.type === 'review.lens' && event.step === 'design_review' && event.visit === 2)
  assert.deepEqual(second.map(({ lens, verdict, reused }) => [lens, verdict, reused]), [
    ['fitness', 'pass', true],
    ['consistency', 'pass', undefined],
    ['architecture-compliance', 'pass', undefined],
  ])
  const first = host.events().find((event) => event.type === 'review.lens' && event.lens === 'fitness')
  assert.equal(second[0].fingerprint, first.fingerprint)
  assert.deepEqual(reviews(host).slice(0, 2), [['design_review', 1, 'needs-rework', 'design'], ['design_review', 2, 'approved', 'distill']])
  assert.ok((await host.tracking.read(SLUG, 'reviews/design_review-1/verdict.yaml')).endsWith('\nreused: []\n'))
  assert.ok((await host.tracking.read(SLUG, 'reviews/design_review-2/verdict.yaml')).endsWith('\nrefutations: []\nreused:\n  - lens: "fitness"\n'))
})

test('a lens that passed with a low finding runs again on the next pass, its inputs unchanged', async () => {
  const host = scripted({}, (it) => [...nominal(it).slice(0, 2), agent({ fill: false })(it), ...nominal(it).slice(2)])
  host.agentRunner.review = lenses({ consistency: [blocker], fitness: [says('fitness', 'pass', [finding('F1', 'low', 'name the latency budget')])] })

  await host.start()

  assert.deepEqual(askedOn(host, 'design_review', 2), ['consistency-lens', 'fitness-lens'])
})

test('an answer that cannot be read is asked once more with the reason; a second one stops the run naming the lens, and the resumed run asks only that lens again', async () => {
  const host = scripted({}, nominal)
  host.agentRunner.review = lenses({ consistency: ['Looks fine to me.', 'lens: consistency\nverdict: ok\nfindings: []'] })

  const outcome = await host.start()

  const reason = 'consistency-lens answered 2 times without a readable verdict: verdict "ok" is not one of pass, fail, inconclusive'
  assert.deepEqual(outcome, { status: 'blocked', slug: SLUG, phase: 'DESIGN', code: 'lens-unreadable', reason })
  const asked = host.agentRunner.reviewed().filter((dispatch) => dispatch.agent === 'consistency-lens')
  assert.deepEqual(asked.map((dispatch) => dispatch.label), [`skraft ${SLUG} · design_review · consistency · attempt 1`, `skraft ${SLUG} · design_review · consistency · attempt 2`])
  assert.ok(asked[1].prompt.endsWith('\n\nYour previous answer was refused: the answer is not the YAML document the brief shows (line 1: is not a `key: value` line). Answer again with the YAML document only.'), asked[1].prompt)
  assert.deepEqual(host.agentRunner.batches.map((batch) => batch.map((dispatch) => dispatch.agent)), [['consistency-lens', 'architecture-compliance-lens', 'fitness-lens'], ['consistency-lens']])
  assert.deepEqual(host.events().at(-1), { ...host.events().at(-1), type: 'run.stopped', code: 'lens-unreadable', reason })
  assert.equal(host.events().some((event) => event.type === 'step.recorded' && event.step === 'design_review'), false)
  assert.deepEqual(host.events().filter((event) => event.type === 'review.lens').map((event) => event.lens), ['architecture-compliance', 'fitness'])

  assert.equal((await host.run()).status, 'done')

  assert.deepEqual(host.agentRunner.batches[2].map((dispatch) => dispatch.label), [`skraft ${SLUG} · design_review · consistency · attempt 1`])
  assert.equal(host.events().filter((event) => event.type === 'step.started' && event.step === 'design_review').length, 1)
  assert.deepEqual(host.events().filter((event) => event.type === 'review.lens' && event.step === 'design_review').map((event) => event.lens), ['architecture-compliance', 'fitness', 'consistency'])
  assert.deepEqual(reviews(host)[0], ['design_review', 1, 'approved', 'distill'])
})

test('an answer read on the second ask counts; one in a fenced block after prose is read; a lens that answered nothing is asked again', async () => {
  const host = scripted({}, nominal)
  host.agentRunner.review = lenses({
    consistency: [{ ok: false, text: '', error: 'consistency-lens ended: max_turns' }, `I checked the ADR.\n\n\`\`\`yaml\n${says('consistency', 'pass')}\n\`\`\``],
    fitness: [`\`\`\`yaml\nlens: fitness\nverdict: fail\nfindings: []\n\`\`\`\nThat was the example; my answer:\n\`\`\`\n${says('fitness', 'pass')}\n\`\`\``],
  })

  assert.equal((await host.start()).status, 'done')
  const retry = host.agentRunner.reviewed().find((dispatch) => dispatch.label.endsWith('consistency · attempt 2'))
  assert.ok(retry.prompt.endsWith('Your previous answer was refused: consistency-lens ended: max_turns. Answer again with the YAML document only.'), retry.prompt)
})

test('a refuter answer that cannot be read twice leaves the finding unverifiable, so it counts', async () => {
  const host = scripted({}, (it) => [...nominal(it).slice(0, 2), agent()(it), ...nominal(it).slice(2)])
  host.agentRunner.review = lenses({ consistency: [blocker], refuter: ['no idea', 'still no idea'] })

  await host.start()

  assert.deepEqual(host.events().filter((event) => event.type === 'review.refuted').map(({ verdict, reason }) => [verdict, reason]), [['unverifiable', 'unreadable 2 times: the answer is not the YAML document the brief shows (line 1: is not a `key: value` line)']])
  assert.deepEqual(reviews(host)[0], ['design_review', 1, 'needs-rework', 'design'])
})

test('a lens the host cannot start stops the run; the next run asks only the lenses that had not answered', async () => {
  const host = scripted({}, (it) => [...nominal(it).slice(0, 2), ...nominal(it).slice(2)])
  host.agentRunner.review = lenses({ consistency: [{ ok: false, text: '', unavailable: true, error: 'consistency-lens is not installed' }] })

  const stopped = await host.start()

  assert.deepEqual(stopped, { status: 'blocked', slug: SLUG, phase: 'DESIGN', code: 'agent-unavailable', reason: 'consistency-lens is not installed' })
  assert.deepEqual(host.events().filter((event) => event.type === 'review.lens').map((event) => event.lens), ['architecture-compliance', 'fitness'])

  const resumed = await host.run()

  assert.equal(resumed.status, 'done')
  assert.deepEqual(host.agentRunner.batches[1].map((dispatch) => dispatch.agent), ['consistency-lens'])
  assert.equal(host.events().filter((event) => event.type === 'step.started' && event.step === 'design_review').length, 1)
})

test('a resumed review does not check again a finding the refuter already answered', async () => {
  const host = scripted({}, (it) => [...nominal(it).slice(0, 2), agent()(it), ...nominal(it).slice(2)])
  host.agentRunner.review = lenses({
    consistency: [says('consistency', 'fail', [finding('F1', 'blocker', 'the ADR is missing'), finding('F2', 'high', 'two contexts own payments')])],
    refuter: [refutes('refuted'), { ok: false, text: '', unavailable: true, error: 'finding-refuter is not installed' }],
  })

  assert.equal((await host.start()).code, 'agent-unavailable')
  await host.run()

  assert.deepEqual(host.agentRunner.reviewed().filter((dispatch) => dispatch.agent === 'finding-refuter').map((dispatch) => dispatch.label.split(' · ')[2]), [
    'refute consistency F1', 'refute consistency F2', 'refute consistency F2',
  ])
  const recorded = host.events().find((event) => event.type === 'step.recorded' && event.step === 'design_review')
  assert.deepEqual(recorded.failures, ['consistency F2 G1 high at src/Checkout.cs:12: two contexts own payments'])
})

test('each lens journals its own cost, and the review records what its lenses and checks cost together', async () => {
  const host = scripted({}, nominal)
  host.agentRunner.review = (dispatch) => ({ ok: true, text: says(dispatch.agent.replace(/-lens$/, ''), 'pass'), costUsd: 0.25 })

  await host.start()

  const lensed = host.events().filter((event) => event.type === 'review.lens' && event.step === 'design_review')
  assert.deepEqual(lensed.map((event) => event.cost), [0.25, 0.25, 0.25])
  const recorded = host.events().find((event) => event.type === 'step.recorded' && event.step === 'design_review')
  assert.equal(recorded.cost, 0.75)
  assert.equal((await host.view()).costUsd, 0.75 * 3 + 0.25 * 1)

  const batched = scripted({}, nominal)
  batched.agentRunner.batchCostUsd = 0.5
  await batched.start()
  assert.equal(batched.events().find((event) => event.type === 'review.lens').cost, undefined)
  assert.equal(batched.events().find((event) => event.type === 'step.recorded' && event.step === 'design_review').cost, 0.5)

  const silent = scripted({}, nominal)
  await silent.start()
  assert.equal(silent.events().find((event) => event.type === 'step.recorded' && event.step === 'design_review').cost, undefined)
  assert.equal((await silent.view()).costUsd, null)
})

const WITH_THREATS = edit(BUILT_IN_WORKFLOW, ['lenses="consistency,architecture-compliance,fitness"', 'lenses="consistency,architecture-compliance,fitness,acme-threat-model"'])

test('a lens the repository adds to a review runs with the others, as a repository agent reading every input', async () => {
  const host = scripted({ files: designating(WITH_THREATS, { components: [API] }), catalog: new InMemoryAgentCatalog({ repository: ['acme-threat-model-lens'] }) }, nominal)
  host.agentRunner.review = lenses({ 'acme-threat-model': [says('acme-threat-model', 'fail', [finding('F1', 'medium', 'card data crosses the gateway unencrypted')])] })
  host.agentRunner.behaviours.splice(2, 0, agent()(host))

  await host.start({ story: { issue: 42, title: 'Pay by card' } })

  const [batch] = host.agentRunner.batches
  assert.deepEqual(batch.map(({ agent: id, source }) => `${id} ${source}`), ['consistency-lens plugin', 'architecture-compliance-lens plugin', 'fitness-lens plugin', 'acme-threat-model-lens repository'])
  assert.ok(batch[3].prompt.startsWith('## Skraft review lens: acme-threat-model (DESIGN)\n- Story: #42 — Pay by card\n'), batch[3].prompt)
  assert.deepEqual(batch[3].prompt.split('\n').filter((line) => /^  - .+: \/work\//.test(line)).map((line) => line.split(':')[0].trim()), [
    '- Review context (story, project rules, who wrote which document)', '- Documents of this phase', '- Documents of this phase', '- Documents of the story and of the other phases',
    '- Changes since the base of the run (open a whole file only when the patch lacks the context a finding needs)',
    '- Paths those changes touch (a path with no section in the patch is a new file',
  ])
  assert.deepEqual(reviews(host)[0], ['design_review', 1, 'needs-rework', 'design'])
})

test('a lens nobody provides refuses the workflow, naming the lens and its agent', async () => {
  const host = scripted({ files: designating(WITH_THREATS) }, () => [])

  const outcome = await host.init()

  assert.equal(outcome.ok, false)
  assert.match(outcome.reason, /node design_review: lens acme-threat-model \(agent acme-threat-model-lens\) not found in the plugin, \.claude\/agents\/ or \.github\/agents\//)

  const noRefuter = scripted({ catalog: new InMemoryAgentCatalog({ plugin: PLUGIN_AGENTS.filter((id) => id !== 'finding-refuter') }) }, () => [])
  const refused = await noRefuter.init()
  assert.match(refused.reason, /node design_review: agent finding-refuter not found/)
  assert.equal(refused.reason.match(/finding-refuter/g).length, 1)
})

test('a skill a lens or the refuter declares and nobody provides refuses the workflow, naming the node, the agent and the skill', async () => {
  const catalog = new InMemoryAgentCatalog({
    skills: { 'fitness-lens': ['acme-latency-budget', 'architecture-review-criteria'], 'coverage-lens': ['acme-scenarios'], 'finding-refuter': ['acme-evidence'], 'solution-architect': ['acme-house-style'] },
    skillFiles: { 'architecture-review-criteria': '# Criteria\n' },
  })
  const host = scripted({ catalog }, () => [])

  const outcome = await host.init()

  const where = "not found in the plugin's skills/, .claude/skills/ or .github/skills/"
  assert.deepEqual([outcome.ok, outcome.code, outcome.reason], [false, 'workflow-invalid', [
    `skraft is invalid: node design_review: skill acme-latency-budget of lens fitness (agent fitness-lens) ${where}`,
    `node design_review: skill acme-evidence of agent finding-refuter ${where}`,
    `node distill_review: skill acme-scenarios of lens coverage (agent coverage-lens) ${where}`,
  ].join('; ')])
})

test('each way an answer cannot be read is told to the lens on its second ask', async () => {
  const good = says('consistency', 'pass')
  const notYaml = (line, what) => `the answer is not the YAML document the brief shows (line ${line}: ${what})`
  const many = Array.from({ length: 21 }, (_, index) => finding(`F${index + 1}`, 'low', `note ${index + 1}`))
  const cases = [
    ['', 'the answer holds no YAML document'],
    ['{"lens": "consistency", "verdict": "pass", "findings": []}', notYaml(1, 'is not a `key: value` line')],
    ['- 1\n- 2', notYaml(1, 'is not a `key: value` line')],
    [{ ok: false, text: '' }, 'no answer'],
    [`\`\`\`yaml\n${good}\n\`\`\`\n\`\`\`\n${says('fitness', 'pass')}\n\`\`\``, 'lens is "fitness", expected "consistency"'],
    ['verdict: pass\nfindings: []', 'lens is null, expected "consistency"'],
    ['lens: consistency\nfindings: []', 'verdict null is not one of pass, fail, inconclusive'],
    ['lens: consistency\nverdict: pass', 'findings is missing; write `findings: []` when you find none'],
    ['lens: consistency\nverdict: pass\nfindings: none', notYaml(3, 'findings must be a list of `- key: value` items, or []')],
    ['lens: consistency\nverdict: fail\ndefects:\n  - severity: blocker\n    description: "the ADR is missing"', 'the key defects is not in the contract; the keys are lens, verdict, findings'],
    ['lens: consistency\nverdict: pass\nfindings: []\nlens: fitness', notYaml(4, 'repeats the key lens')],
    ['lens: *consistency\nverdict: pass\nfindings: []', notYaml(1, 'starts its value with a YAML marker; quote the value')],
    ['lens: consistency\nverdict: fail\nfindings:\n  - gate: G1\n    severity: high\n    description: the port: named twice', notYaml(6, 'holds `: ` or ` #` in a plain value; quote the value')],
    ['lens: consistency\nverdict: fail\nfindings:\n  - gate: G1\n    severity: high\n    description: "the port', notYaml(6, 'has a double-quoted value that does not close')],
    ['lens: consistency\nverdict: pass\nfindings: []\n  extra: 1', notYaml(4, 'is indented where a top-level key belongs')],
    ['lens: consistency\n\tverdict: pass', notYaml(2, 'is indented with a tab')],
    [says('consistency', 'fail', [finding('F1', 'high', 'one'), { gate: 'G2', severity: 'major', description: 'two' }]), 'finding 2: severity must be one of blocker, high, medium, low'],
    [says('consistency', 'fail', [{ gate: 'G1', severity: 'high', description: '  ' }]), 'finding 1: description is empty'],
    [says('consistency', 'fail', [{ severity: 'high', description: 'no gate named' }]), 'finding 1: gate must name the gate of your table, such as G1'],
    [says('consistency', 'fail', [finding('F1', 'high', 'one', { rule: 'R1' })]), 'finding 1: the key rule is not in the contract; the keys are id, gate, severity, location, description, suggestion'],
    [says('consistency', 'pass', [finding('F1', 'high', 'the ADR is missing')]), 'verdict is pass but finding F1 is high'],
    [says('consistency', 'fail', many), '21 findings; give at most 20, the most severe first'],
  ]
  for (const [bad, reason] of cases) {
    const host = scripted({}, nominal)
    host.agentRunner.review = lenses({ consistency: [bad, good] })

    await host.start()

    const retry = host.agentRunner.reviewed().find((dispatch) => dispatch.label.endsWith('consistency · attempt 2'))
    assert.ok(retry?.prompt.endsWith(`Your previous answer was refused: ${reason}. Answer again with the YAML document only.`), `${typeof bad === 'string' ? bad : JSON.stringify(bad)}\n${retry?.prompt}`)
  }
})

test('the last fenced block of an answer is read whatever its tag, its words in any case; a finding without id takes the first free number, its text on one line', async () => {
  const host = scripted({}, (it) => [...nominal(it).slice(0, 2), agent()(it), ...nominal(it).slice(2)])
  const answer = says('consistency-lens', 'FAIL', [finding('F1', 'low', 'a note'), { gate: 'G2', severity: 'Medium', location: '', description: 'no owner\n   for refunds' }, finding('F3', 'low', 'another note')])
  host.agentRunner.review = lenses({ consistency: [`Notes first.\n\`\`\`text\n${answer}\n\`\`\``] })

  await host.start()

  const recorded = host.events().find((event) => event.type === 'step.recorded' && event.step === 'design_review')
  assert.deepEqual(recorded.failures, ['consistency F2 G2 medium: no owner for refunds'])
  assert.deepEqual(host.events().find((event) => event.type === 'review.lens' && event.lens === 'consistency').findings.map(({ id }) => id), ['F1', 'F2', 'F3'])
})

test('a refuter answer with a verdict outside the three is asked again with the reason', async () => {
  const host = scripted({}, (it) => [...nominal(it).slice(0, 2), agent()(it), ...nominal(it).slice(2)])
  host.agentRunner.review = lenses({ consistency: [blocker], refuter: ['reason: "?"', refutes('confirmed')] })

  await host.start()

  const retry = host.agentRunner.reviewed().find((dispatch) => dispatch.label.endsWith('refute consistency F1 · attempt 2'))
  assert.ok(retry.prompt.endsWith('Your previous answer was refused: verdict null is not one of confirmed, refuted, unverifiable. Answer again with the YAML document only.'), retry.prompt)
})

test('a lens two review nodes share is asked by each; the second never takes over the first one\'s verdict or checks', async () => {
  const workflow = edit(BUILT_IN_WORKFLOW, ['lenses="coverage,business-alignment,testability,boundary-enforcement"', 'lenses="consistency,coverage"'])
  const host = scripted({ files: designating(workflow, { components: [API] }) }, (it) => [...nominal(it).slice(0, 3), agent()(it), nominal(it)[3]])
  host.agentRunner.review = lenses({
    consistency: [says('consistency', 'fail', [finding('F1', 'blocker', 'the ADR is missing')]), says('consistency', 'fail', [finding('F1', 'blocker', 'the plan skips refunds')])],
    refuter: [refutes('refuted'), refutes('confirmed')],
  })

  await host.start()

  assert.deepEqual(host.agentRunner.batches.slice(0, 2).map((batch) => batch.map((dispatch) => dispatch.label.split(' · ').slice(1).join(' · '))), [
    ['design_review · consistency · attempt 1', 'design_review · architecture-compliance · attempt 1', 'design_review · fitness · attempt 1'],
    ['design_review · refute consistency F1 · attempt 1'],
  ])
  assert.deepEqual(host.agentRunner.batches[3].map((dispatch) => dispatch.label.split(' · ').slice(1).join(' · ')), ['distill_review · refute consistency F1 · attempt 1'])
  assert.deepEqual(reviews(host).slice(0, 2), [['design_review', 1, 'approved', 'distill'], ['distill_review', 1, 'needs-rework', 'distill']])
})

test('every lens that answered unreadably twice is named', async () => {
  const host = scripted({}, (it) => nominal(it).slice(0, 2))
  host.agentRunner.review = lenses({ consistency: ['no', 'no'], fitness: ['[]', '[]'] })

  const outcome = await host.start()

  const notYaml = 'the answer is not the YAML document the brief shows (line 1: is not a `key: value` line)'
  assert.equal(outcome.reason, `consistency-lens answered 2 times without a readable verdict: ${notYaml}; fitness-lens answered 2 times without a readable verdict: ${notYaml}`)
})

test('each agent\'s documents in the tracking folder reach the lenses, by phase, with a shared context naming who wrote them', async () => {
  const rules = ['AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md', '.github/copilot-instructions.md', 'docs/adr/decisions-index.md']
  const host = scripted({ files: Object.fromEntries(rules.map((path) => [path, '# Rules\n'])) }, (it) => [
    agent()(it),
    agent({ work: ({ git, tracking }) => {
      tracking.write(SLUG, 'details/2026-10-11/contracts-checkout.md', '# Contracts\n')
      tracking.write(SLUG, 'results/notes.json', '{}')
      git.commit('docs(checkout): ADR for the card payment', ['docs/adr/adr-001-card-payment.md'])
    } })(it),
    ...nominal(it).slice(2),
  ])

  await host.start({ story: { issue: 42, title: 'Pay by card' } })

  const design = host.events().find((event) => event.type === 'step.recorded' && event.step === 'design')
  assert.deepEqual(design.documents, ['details/2026-10-11/consistency-matrix-checkout.md', 'details/2026-10-11/context-map.md', 'details/2026-10-11/contracts-checkout.md'])
  const fitness = host.agentRunner.reviewed().find((dispatch) => dispatch.agent === 'fitness-lens').prompt
  assert.deepEqual(fitness.split('\n').filter((line) => /^  - .+: \//.test(line)), [
    `  - Review context (story, project rules, who wrote which document): ${TRACKING}/reviews/design_review-1/context.md`,
    `  - Documents of this phase: ${TRACKING}/details/2026-10-11/context-map.md`,
    `  - Documents of this phase: ${TRACKING}/details/2026-10-11/consistency-matrix-checkout.md`,
    `  - Documents of this phase: ${TRACKING}/details/2026-10-11/contracts-checkout.md`,
    `  - Documents of the story and of the other phases: ${TRACKING}/research/2026-10-11/checkout-research.md`,
  ])
  assert.equal(await host.tracking.read(SLUG, 'reviews/design_review-1/context.md'), [
    '# Review context: design_review (DESIGN)',
    '', '## Story', '', '#42 — Pay by card',
    '', '## Project rules', '', ...rules.map((path) => `- ${path}`),
    '', '## Documents by phase',
    '', '### RESEARCH', '', '- research (solution-researcher):', `  - ${TRACKING}/research/2026-10-11/checkout-research.md`,
    '', '### DESIGN (under review)', '', '- design (solution-architect):', `  - ${TRACKING}/details/2026-10-11/context-map.md`, `  - ${TRACKING}/details/2026-10-11/consistency-matrix-checkout.md`,
    `  - ${TRACKING}/details/2026-10-11/contracts-checkout.md`,
    '',
  ].join('\n'))
  const coverage = host.agentRunner.reviewed().find((dispatch) => dispatch.agent === 'coverage-lens').prompt
  assert.ok(coverage.includes(`  - Documents of the story and of the other phases: ${TRACKING}/details/2026-10-11/contracts-checkout.md`), coverage)
  const story = await host.tracking.read(SLUG, 'reviews/distill_review-1/context.md')
  assert.ok(story.includes('- distill (acceptance-designer):'), story)

  const bare = scripted({}, nominal)
  await bare.start()
  assert.ok((await bare.tracking.read(SLUG, 'reviews/design_review-1/context.md')).includes('## Project rules\n\nnone found\n'))
})

test('a lens reading the changed paths runs again when a changed file\'s content changes, its path already listed', async () => {
  const host = scripted({ files: { 'docs/adr/adr-001-card-payment.md': '# ADR 001\nStatus: Proposed\n' } }, (it) => [
    ...nominal(it).slice(0, 2),
    agent({ fill: false, work: () => it.deps.workspace.write('docs/adr/adr-001-card-payment.md', '# ADR 001\nStatus: Proposed\nThe payment context owns refunds.\n') })(it),
    ...nominal(it).slice(2),
  ])
  host.agentRunner.review = lenses({ consistency: [blocker] })

  await host.start()

  assert.deepEqual(askedOn(host, 'design_review', 2), ['consistency-lens', 'architecture-compliance-lens'])
})

test('a lens answer that gives two findings the same id is asked again', async () => {
  const host = scripted({}, nominal)
  host.agentRunner.review = lenses({ consistency: [says('consistency', 'fail', [finding('F1', 'high', 'one'), finding('F1', 'blocker', 'two')]), says('consistency', 'pass')] })

  await host.start()

  const retry = host.agentRunner.reviewed().find((dispatch) => dispatch.label.endsWith('consistency · attempt 2'))
  assert.ok(retry.prompt.endsWith('Your previous answer was refused: finding id F1 is used twice. Answer again with the YAML document only.'), retry.prompt)
})

test('a review resumed after a stop still counts what its lenses cost before the stop, and the batches the host costs as a whole', async () => {
  const host = scripted({}, nominal)
  host.agentRunner.batchCostUsd = 0.5
  host.agentRunner.review = lenses({ fitness: [{ ok: false, text: '', unavailable: true, error: 'fitness-lens is not installed' }] })
  const priced = host.agentRunner.review
  host.agentRunner.review = async (dispatch) => {
    const answer = await priced(dispatch)
    return typeof answer === 'string' ? { ok: true, text: answer, costUsd: 0.25 } : answer
  }

  assert.equal((await host.start()).code, 'agent-unavailable')
  assert.equal((await host.run()).status, 'done')

  const recorded = host.events().find((event) => event.type === 'step.recorded' && event.step === 'design_review')
  assert.equal(recorded.cost, 0.25 * 3 + 0.5 * 2)
  assert.deepEqual(host.events().filter((event) => event.type === 'review.cost' && event.step === 'design_review').map(({ visit, cost }) => [visit, cost]), [[1, 0.5], [1, 0.5]])
})

test('a review node naming a lens twice, or a lens with a model family it cannot run on, is refused', async () => {
  const refusal = async (lenses) => {
    const workflow = edit(BUILT_IN_WORKFLOW, ['lenses="consistency,architecture-compliance,fitness"', `lenses="${lenses}"`])
    return (await scripted({ files: designating(workflow, { components: [API] }) }, () => []).init()).reason
  }
  const rule = 'must list kebab-case lens names, each once, each optionally followed by @<model family>'

  assert.match(await refusal('consistency,fitness,consistency'), new RegExp(`node design_review: lenses="consistency,fitness,consistency" ${rule}`))
  assert.match(await refusal('consistency,consistency@sonnet'), /lenses="consistency,consistency@sonnet" must list/)
  assert.match(await refusal(''), /lenses="" must list/)
  assert.match(await refusal('consistency:2'), /lenses="consistency:2" must list/)
  assert.match(await refusal('fitness@Claude-Haiku'), /lenses="fitness@Claude-Haiku" must list/)
  assert.equal((await scripted({ files: designating(edit(BUILT_IN_WORKFLOW, ['lenses="consistency,architecture-compliance,fitness"', 'lenses="consistency@opus,fitness@haiku"']), { components: [API] }) }, () => []).init()).ok, true)
})

test('a lens runs on the model family its node names, haiku when it names none, and the refuter one family above the strongest lens of its group', async () => {
  const workflow = edit(BUILT_IN_WORKFLOW, ['lenses="consistency,architecture-compliance,fitness"', 'lenses="consistency,architecture-compliance@opus,fitness@sonnet"'])
  const host = scripted({ files: designating(workflow, { components: [API] }) }, (it) => [...nominal(it).slice(0, 2), agent()(it), ...nominal(it).slice(2)])
  host.agentRunner.review = lenses({
    consistency: [says('consistency', 'fail', [finding('F1', 'blocker', 'the ADR contradicts the context map')])],
    'architecture-compliance': [says('architecture-compliance', 'fail', [finding('F1', 'high', 'the domain imports the database driver', { location: 'src/Checkout.cs:40' })])],
    fitness: [says('fitness', 'fail', [finding('F1', 'high', 'no latency budget', { location: 'src/Checkout.cs:41' })])],
  })

  assert.equal((await host.start()).status, 'done')

  const [batch] = host.agentRunner.batches
  assert.deepEqual(batch.map(({ agent: id, model, label }) => [id, model, label.split(' · ')[2]]), [
    ['consistency-lens', 'haiku', 'consistency'],
    ['architecture-compliance-lens', 'opus', 'architecture-compliance'],
    ['fitness-lens', 'sonnet', 'fitness'],
  ])
  assert.ok(batch[2].prompt.startsWith(`## Skraft review lens: fitness (DESIGN)\n`) && batch[2].prompt.includes('\nlens: fitness\n'), batch[2].prompt)
  assert.deepEqual(host.events().filter((event) => event.type === 'review.lens' && event.step === 'design_review' && event.visit === 1).map(({ lens, agent: id }) => `${lens} ${id}`), [
    'consistency consistency-lens', 'architecture-compliance architecture-compliance-lens', 'fitness fitness-lens',
  ])
  const checks = host.agentRunner.reviewed().filter((dispatch) => dispatch.agent === 'finding-refuter')
  assert.deepEqual(checks.map(({ model, label }) => [label.split(' · ')[2], model]), [
    ['refute consistency F1', 'sonnet'],
    ['refute architecture-compliance F1', 'opus'],
    ['refute fitness F1', 'opus'],
  ])
  const phaseAgents = host.agentRunner.dispatches.map(({ model }) => model)
  assert.deepEqual([...new Set(phaseAgents)], ['sonnet', 'opus'])
})

test('every attempt of a pass the review opened is told the review sent the work back', async () => {
  const host = scripted({}, (it) => [...nominal(it).slice(0, 2), agent({ result: null })(it), agent()(it), ...nominal(it).slice(2)])
  host.agentRunner.review = lenses({ consistency: [blocker] })

  assert.equal((await host.start()).status, 'done')

  const second = host.agentRunner.dispatches.find((dispatch) => dispatch.label === `skraft ${SLUG} · design · pass 2 · attempt 2`)
  assert.ok(second.prompt.includes('- Pass: 2, after the review sent the work back'), second.prompt)
  assert.deepEqual(host.events().filter((event) => event.type === 'step.started' && event.step === 'design').map(({ visit, attempt, sentBy }) => [visit, attempt, sentBy ?? null]), [
    [1, 1, null], [2, 1, 'review'], [2, 2, 'review'],
  ])

  const distill = scripted({}, (it) => [...nominal(it).slice(0, 3), agent({ work: ({ git }) => {
    git.commit('docs(checkout): note the refusal', ['tests/Acceptance/README.md'])
    git.commit('test(checkout): refuse a zero amount', ['tests/Acceptance/RefusalAcceptanceTests.cs'])
  } })(it), ...nominal(it).slice(3)])
  distill.agentRunner.review = lenses({ coverage: [says('coverage', 'fail', [finding('F1', 'blocker', 'a criterion has no scenario')])] })
  assert.equal((await distill.start()).status, 'done')
  const failing = distill.agentRunner.dispatches.find((dispatch) => dispatch.label === `skraft ${SLUG} · distill · pass 2 · attempt 1`).prompt
  assert.ok(failing.includes('- Commit the failing acceptance tests as `test(<story>): …`.') && !failing.includes('This pass answers the review'), failing)
  const reds = distill.events().filter((event) => event.type === 'commits.checked' && event.step === 'distill').flatMap((event) => event.commits).filter(({ kind }) => kind === 'red').map(({ sha, subject }) => `${sha.slice(0, 7)} "${subject}"`)
  const deliver = distill.agentRunner.dispatches.find((dispatch) => dispatch.agent === 'software-engineer').prompt
  assert.equal(reds.length, 2)
  assert.ok(deliver.includes(`never a \`feat\`. DISTILL's: ${reds.join(', ')}`), deliver)
})

test('a DELIVER pass the review opened is told which commit each finding takes: a fix with no red commit is refused, a strengthened test goes in a refactor', async () => {
  const integrity = says('test-integrity', 'fail', [finding('F1', 'blocker', 'the test asserts nothing', { gate: 'G7' })])
  const host = scripted({}, (it) => [...nominal(it), agent({ work: ({ git }) => git.commit('fix(checkout): assert the card amount', ['src/Checkout.cs']) })(it)])
  host.agentRunner.review = lenses({ 'test-integrity': [integrity] })
  host.agentRunner.behaviours.push(() => ({ ok: false, unavailable: true, text: '', error: 'stop here' }))

  await host.start()

  const deliver = host.events().filter((event) => event.type === 'step.recorded' && event.step === 'deliver')
  assert.deepEqual(deliver.map(({ visit, attempt, outcome, code }) => [visit, attempt, outcome, code]), [[1, 1, 'done', null], [2, 1, 'failed', 'tdd']])
  const judged = host.events().find((event) => event.type === 'commits.checked' && event.step === 'deliver' && event.visit === 2)
  assert.deepEqual(judged.commits.map(({ subject, verdict }) => [subject, verdict]), [['fix(checkout): assert the card amount', 'green-without-red']])
  const reworked = host.agentRunner.dispatches.find((dispatch) => dispatch.label === `skraft ${SLUG} · deliver · pass 2 · attempt 1`).prompt
  const acceptance = host.events().find((event) => event.type === 'commits.checked' && event.step === 'distill').commits[0]
  assert.ok(reworked.includes(`never a \`feat\`. DISTILL's: ${acceptance.sha.slice(0, 7)} "${acceptance.subject}"\n`), reworked)
  assert.ok(reworked.includes([
    '- This pass answers the review: a missing or wrong behaviour takes a failing `test(<story>): …` commit, then `fix(<story>): …`;',
    '  a test that proves too little, a name, or any change the tests already pass with takes `refactor(<story>): …`.',
  ].join('\n')), reworked)
  const first = host.agentRunner.dispatches.find((dispatch) => dispatch.label === `skraft ${SLUG} · deliver · attempt 1`).prompt
  assert.ok(!first.includes('This pass answers the review'), first)

  const strengthened = scripted({}, (it) => [...nominal(it), agent({ work: ({ git }) => git.commit('refactor(checkout): assert the card amount', ['tests/CheckoutTests.cs']) })(it)])
  strengthened.agentRunner.review = lenses({ 'test-integrity': [integrity] })
  assert.equal((await strengthened.start()).status, 'done')
  assert.deepEqual(strengthened.events().filter((event) => event.type === 'step.recorded' && event.step === 'deliver').map(({ visit, outcome }) => [visit, outcome]), [[1, 'done'], [2, 'done']])

  const again = scripted({}, (it) => [...nominal(it), agent({ work: ({ git }) => git.commit('fix(checkout): assert the card amount', ['src/Checkout.cs']) })(it), agent()(it)])
  again.agentRunner.review = lenses({ 'test-integrity': [integrity] })
  assert.equal((await again.start()).code, 'tdd')
  assert.deepEqual(again.events().filter((event) => event.type === 'step.recorded' && event.step === 'deliver').map(({ visit, attempt, outcome }) => [visit, attempt, outcome]), [[1, 1, 'done'], [2, 1, 'failed'], [2, 2, 'failed']])
})

test('a lens answer that sits in the journal before its pass started is not taken as that pass\'s answer', async () => {
  const reference = scripted({}, nominal)
  await reference.start()
  const fingerprint = reference.events().find((event) => event.type === 'review.lens' && event.step === 'design_review' && event.lens === 'consistency').fingerprint

  const host = scripted({}, (it) => [
    nominal(it)[0],
    async () => ({ ok: false, unavailable: true, text: '', error: 'the host went away' }),
    ...nominal(it).slice(1),
  ])
  assert.equal((await host.start()).code, 'agent-unavailable')
  const opened = await openJournal(host.deps, SLUG)
  await opened.journal.append('review.lens', { step: 'design_review', visit: 1, lens: 'consistency', agent: 'consistency-lens', fingerprint, verdict: 'pass', findings: [] })

  assert.equal((await host.run()).status, 'done')

  assert.ok(host.agentRunner.reviewed().some((dispatch) => dispatch.label === `skraft ${SLUG} · design_review · consistency · attempt 1`))
  assert.equal(host.events().filter((event) => event.type === 'review.lens' && event.step === 'design_review' && event.lens === 'consistency').length, 2)
})

test('a resumed review asks again a lens whose inputs changed since it answered in that pass', async () => {
  const host = scripted({ files: { 'docs/adr/adr-001-card-payment.md': '# ADR 001\n' } }, nominal)
  host.agentRunner.review = lenses({ fitness: [{ ok: false, text: '', unavailable: true, error: 'fitness-lens is not installed' }] })
  assert.equal((await host.start()).code, 'agent-unavailable')
  await host.deps.workspace.write('docs/adr/adr-001-card-payment.md', '# ADR 001\nThe payment context owns refunds.\n')

  await host.run()

  assert.deepEqual(host.agentRunner.batches[1].map((dispatch) => dispatch.agent), ['consistency-lens', 'architecture-compliance-lens', 'fitness-lens'])
})

test('a lens reads the skills its descriptor lists before any other input, and so does the refuter of its findings; a skill whose content changes or a rule file that changes makes it read again, a skill moved with the plugin does not', async () => {
  const skill = '/plugin/skills/architecture-review-criteria/SKILL.md'
  const catalog = new InMemoryAgentCatalog({ skills: { 'consistency-lens': ['architecture-review-criteria'], 'architecture-compliance-lens': ['architecture-review-criteria'] }, skillFiles: { 'architecture-review-criteria': '# Criteria\n' } })
  const host = scripted({ catalog, files: { 'AGENTS.md': '# Rules\n' } }, (it) => [
    ...nominal(it).slice(0, 2),
    agent({ fill: false, work: () => {
      it.deps.workspace.write('AGENTS.md', '# Rules\nNo port vocabulary.\n')
    } })(it),
    ...nominal(it).slice(2),
  ])
  host.agentRunner.review = lenses({ consistency: [blocker] })

  await host.start()

  const first = host.agentRunner.reviewed().find((dispatch) => dispatch.label === `skraft ${SLUG} · design_review · consistency · attempt 1`).prompt.split('\n')
  assert.deepEqual(first.slice(3, 5), [`- Skill (read it before any other input and judge with its criteria): ${skill}`, '- Read these inputs and the files they name; search the repository for nothing else:'])
  const check = host.agentRunner.reviewed().find((dispatch) => dispatch.agent === 'finding-refuter').prompt.split('\n')
  assert.equal(check[2], `- Skill (read it before any other input and judge with its criteria): ${skill}`)
  assert.equal(host.agentRunner.reviewed().find((dispatch) => dispatch.agent === 'fitness-lens').prompt.includes('- Skill'), false)
  assert.deepEqual(askedOn(host, 'design_review', 2), ['consistency-lens', 'architecture-compliance-lens', 'fitness-lens'])

  const learning = scripted({ catalog: new InMemoryAgentCatalog({ skillFiles: { 'skraft-quality-bar': '# Quality bar\n' } }) }, (it) => [
    ...nominal(it).slice(0, 2),
    agent({ fill: false, work: () => { it.deps.agentCatalog.skillsByAgent['fitness-lens'] = ['skraft-quality-bar'] } })(it),
    ...nominal(it).slice(2),
  ])
  learning.agentRunner.review = lenses({ consistency: [blocker] })
  await learning.start()
  assert.deepEqual(askedOn(learning, 'design_review', 2), ['consistency-lens', 'fitness-lens'])

  /** A run whose fitness lens reads one skill, `meanwhile` changing the catalog during the rework. @param {(catalog: InMemoryAgentCatalog) => void} meanwhile */
  const withSkill = async (meanwhile) => {
    const reading = scripted({ catalog: new InMemoryAgentCatalog({ skills: { 'fitness-lens': ['skraft-quality-bar'] }, skillFiles: { 'skraft-quality-bar': '# Quality bar\n' } }) }, (it) => [
      ...nominal(it).slice(0, 2),
      agent({ fill: false, work: () => meanwhile(it.deps.agentCatalog) })(it),
      ...nominal(it).slice(2),
    ])
    reading.agentRunner.review = lenses({ consistency: [blocker] })
    await reading.start()
    return reading
  }
  const edited = await withSkill((it) => { it.skillFiles['skraft-quality-bar'] = '# Quality bar\nName the latency budget.\n' })
  assert.deepEqual(askedOn(edited, 'design_review', 2), ['consistency-lens', 'fitness-lens'])
  const moved = await withSkill((it) => { it.skillRoot = '/home/dev/elsewhere/plugin/skills' })
  assert.deepEqual(askedOn(moved, 'design_review', 2), ['consistency-lens'])
})

test('a changed path that is no readable file, such as a nested repository, is reviewed by its name', async () => {
  const host = scripted({}, (it) => [
    ...nominal(it).slice(0, 3),
    agent({ work: (work) => { tddCycle()(work); work.git.change('src/PaymentsSdk') } })(it),
  ])
  const read = host.deps.workspace.read.bind(host.deps.workspace)
  host.deps.workspace.read = async (path) => {
    if (path === 'src/PaymentsSdk') throw Object.assign(new Error('EISDIR: illegal operation on a directory, read'), { code: 'EISDIR' })
    return read(path)
  }

  assert.equal((await host.start()).status, 'done')
  assert.ok((await host.tracking.read(SLUG, 'reviews/deliver_review-1/changed-files.txt')).includes('src/PaymentsSdk\n'))
})

test('an answer in the usual YAML forms is read: comments, single quotes, blocks, a bare dash, an id given as a number, an empty suggestion', async () => {
  const host = scripted({}, (it) => [...nominal(it).slice(0, 2), agent()(it), ...nominal(it).slice(2)])
  const answer = [
    '# my verdict',
    'lens: consistency   # the lens',
    "verdict: 'fail'",
    'findings:',
    '  # the one that blocks',
    '  - id: 7',
    '    gate: G2',
    '    severity: high',
    "    location: 'docs/adr/adr-001.md:3'",
    '    description: |',
    "      The ADR's provider",
    '      is not named.',
    '    suggestion: ~',
    '  -',
    '    gate: C1',
    '    severity: low',
    '    description: >',
    '      two names',
    '      for one context',
    '    suggestion: "name it \\"Payments\\"" # a note',
  ].join('\n')
  host.agentRunner.review = lenses({ consistency: [answer] })

  await host.start()

  const lensed = host.events().find((event) => event.type === 'review.lens' && event.lens === 'consistency')
  assert.deepEqual(lensed.findings, [
    { id: '7', gate: 'G2', severity: 'high', location: 'docs/adr/adr-001.md:3', description: "The ADR's provider is not named.", suggestion: null },
    { id: 'F1', gate: 'C1', severity: 'low', location: '', description: 'two names for one context', suggestion: 'name it "Payments"' },
  ])
})
