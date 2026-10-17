import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, API, finding, lenses, nominal, refutes, reviews, says, scripted, SLUG } from '../support/pipeline-host.mjs'
import { designating, edit } from '../workflow/support.mjs'
import { BUILT_IN_WORKFLOW, InMemoryAgentCatalog, PLUGIN_AGENTS } from '../support/in-memory-host.mjs'

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
})

test('a lens that passed with a low finding runs again on the next pass, its inputs unchanged', async () => {
  const host = scripted({}, (it) => [...nominal(it).slice(0, 2), agent({ fill: false })(it), ...nominal(it).slice(2)])
  host.agentRunner.review = lenses({ consistency: [blocker], fitness: [says('fitness', 'pass', [finding('F1', 'low', 'name the latency budget')])] })

  await host.start()

  assert.deepEqual(askedOn(host, 'design_review', 2), ['consistency-lens', 'fitness-lens'])
})

test('an answer that cannot be read is asked once more with the reason; a second one stops the run naming the lens', async () => {
  const host = scripted({}, (it) => nominal(it).slice(0, 2))
  host.agentRunner.review = lenses({ consistency: ['Looks fine to me.', '{"lens": "consistency", "verdict": "ok"}'] })

  const outcome = await host.start()

  assert.deepEqual(outcome, {
    status: 'blocked', slug: SLUG, phase: 'DESIGN', code: 'lens-unreadable',
    reason: 'consistency-lens answered 2 times without a readable verdict: verdict "ok" is not one of pass, fail, inconclusive',
  })
  const asked = host.agentRunner.reviewed().filter((dispatch) => dispatch.agent === 'consistency-lens')
  assert.deepEqual(asked.map((dispatch) => dispatch.label), [`skraft ${SLUG} · design_review · consistency · attempt 1`, `skraft ${SLUG} · design_review · consistency · attempt 2`])
  assert.ok(asked[1].prompt.endsWith('\n\nYour previous answer was refused: the answer is not JSON. Answer again with the JSON document only.'), asked[1].prompt)
  assert.deepEqual(host.agentRunner.batches.map((batch) => batch.map((dispatch) => dispatch.agent)), [['consistency-lens', 'architecture-compliance-lens', 'fitness-lens'], ['consistency-lens']])
  const recorded = host.events().filter((event) => event.type === 'step.recorded').at(-1)
  assert.deepEqual([recorded.step, recorded.outcome, recorded.next], ['design_review', 'blocked', null])
  assert.deepEqual(host.events().filter((event) => event.type === 'review.lens').map((event) => event.lens), ['architecture-compliance', 'fitness'])
  assert.ok(host.progress.lines.includes(`${SLUG}: design_review blocked (lens-unreadable)`), host.progress.lines.join('\n'))
  assert.equal((await host.run()).code, 'lens-unreadable')
})

test('an answer read on the second ask counts; one in a fenced block after prose is read; a lens that answered nothing is asked again', async () => {
  const host = scripted({}, nominal)
  host.agentRunner.review = lenses({
    consistency: [{ ok: false, text: '', error: 'consistency-lens ended: max_turns' }, `I checked the ADR.\n\n\`\`\`json\n${says('consistency', 'pass')}\n\`\`\``],
    fitness: [`\`\`\`text\nnotes\n\`\`\`\n\`\`\`json\n${says('fitness', 'pass')}\n\`\`\``],
  })

  assert.equal((await host.start()).status, 'done')
  const retry = host.agentRunner.reviewed().find((dispatch) => dispatch.label.endsWith('consistency · attempt 2'))
  assert.ok(retry.prompt.endsWith('Your previous answer was refused: consistency-lens ended: max_turns. Answer again with the JSON document only.'), retry.prompt)
})

test('a refuter answer that cannot be read twice leaves the finding unverifiable, so it counts', async () => {
  const host = scripted({}, (it) => [...nominal(it).slice(0, 2), agent()(it), ...nominal(it).slice(2)])
  host.agentRunner.review = lenses({ consistency: [blocker], refuter: ['no idea', 'still no idea'] })

  await host.start()

  assert.deepEqual(host.events().filter((event) => event.type === 'review.refuted').map(({ verdict, reason }) => [verdict, reason]), [['unverifiable', 'unreadable twice: the answer is not JSON']])
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
  assert.deepEqual(recorded.failures, ['consistency F2 high at src/Checkout.cs:12: two contexts own payments'])
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
  assert.equal(batch[3].prompt.split('\n').filter((line) => line.startsWith('  - ')).length, 4)
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

test('each way an answer cannot be read is told to the lens on its second ask', async () => {
  const good = says('consistency', 'pass')
  const cases = [
    ['', 'the answer holds no JSON document'],
    ['[1, 2]', 'the answer is not a JSON object'],
    ['null', 'the answer is not a JSON object'],
    ['"pass"', 'the answer is not a JSON object'],
    [{ ok: false, text: '' }, 'no answer'],
    [`\`\`\`json\n${says('fitness', 'pass')}\n\`\`\`\n\`\`\`\n${good}\n\`\`\``, 'lens is "fitness", expected "consistency"'],
    ['{"verdict": "pass"}', 'lens is null, expected "consistency"'],
    ['{"lens": "consistency"}', 'verdict null is not one of pass, fail, inconclusive'],
    ['{"lens": "consistency", "verdict": "pass", "findings": {}}', 'findings is not a list'],
    [says('consistency', 'fail', [finding('F1', 'high', 'one'), { severity: 'major', description: 'two' }]), 'finding 2 needs a severity among blocker, high, medium, low and a description'],
    [says('consistency', 'fail', [{ severity: 'high', description: '  ' }]), 'finding 1 needs a severity among blocker, high, medium, low and a description'],
  ]
  for (const [bad, reason] of cases) {
    const host = scripted({}, nominal)
    host.agentRunner.review = lenses({ consistency: [bad, good] })

    await host.start()

    const retry = host.agentRunner.reviewed().find((dispatch) => dispatch.label.endsWith('consistency · attempt 2'))
    assert.ok(retry?.prompt.endsWith(`Your previous answer was refused: ${reason}. Answer again with the JSON document only.`), `${bad}\n${retry?.prompt}`)
  }
})

test('an untagged block is read when no json block is there; a finding without id is numbered by its place', async () => {
  const host = scripted({}, (it) => [...nominal(it).slice(0, 2), agent()(it), ...nominal(it).slice(2)])
  host.agentRunner.review = lenses({
    consistency: [`Notes first.\n\`\`\`\n${says('consistency', 'fail', [finding('F1', 'low', 'a note'), { severity: 'medium', location: '', description: 'no owner for refunds' }])}\n\`\`\``],
  })

  await host.start()

  const recorded = host.events().find((event) => event.type === 'step.recorded' && event.step === 'design_review')
  assert.deepEqual(recorded.failures, ['consistency F2 medium: no owner for refunds'])
})

test('a refuter answer with a verdict outside the three is asked again with the reason', async () => {
  const host = scripted({}, (it) => [...nominal(it).slice(0, 2), agent()(it), ...nominal(it).slice(2)])
  host.agentRunner.review = lenses({ consistency: [blocker], refuter: ['{"reason": "?"}', refutes('confirmed')] })

  await host.start()

  const retry = host.agentRunner.reviewed().find((dispatch) => dispatch.label.endsWith('refute consistency F1 · attempt 2'))
  assert.ok(retry.prompt.endsWith('Your previous answer was refused: verdict null is not one of confirmed, refuted, unverifiable. Answer again with the JSON document only.'), retry.prompt)
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

  assert.equal(outcome.reason, 'consistency-lens answered 2 times without a readable verdict: the answer is not JSON; fitness-lens answered 2 times without a readable verdict: the answer is not a JSON object')
})
