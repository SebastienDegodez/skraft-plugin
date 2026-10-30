import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, finding, lenses, pipelineHost, refutes, says, scripted, SLUG, tddCycle } from '../support/pipeline-host.mjs'
import { edit, WITH_SECURITY } from '../workflow/support.mjs'
import { BUILT_IN_WORKFLOW, FixedClock, InMemoryAgentCatalog, ScriptedMachine } from '../support/in-memory-host.mjs'

const PHASES = ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER', 'PUBLISH']
const phases = (...states) => PHASES.map((phase, index) => ({ phase, state: states[index] }))
const unavailable = () => ({ ok: false, unavailable: true, text: '' })

const GATES = 'build, format, lint, test, architecture, coverage'
const UNTOUCHED = Object.freeze({ state: 'pending', outcome: null, visits: 0, attempts: 0, retries: 0, durationMs: 0, costUsd: null })
const node = (id, kind, phase, what) => ({ id, kind, phase, what, ...UNTOUCHED })
const edge = (from, to, label = null) => ({ from, to, label, taken: 0 })
/** The default workflow as the view draws it before a run: each step pending, no edge taken. */
const PENDING_GRAPH = Object.freeze({
  nodes: [
    node('publish_consent', 'ask', 'RESEARCH', 'publish-consent'),
    node('visuals_consent', 'ask', 'RESEARCH', 'reporting-consent'),
    node('research', 'agent', 'RESEARCH', 'solution-researcher'),
    node('design', 'agent', 'DESIGN', 'solution-architect'),
    node('design_review', 'review', 'DESIGN', 'consistency, architecture-compliance, fitness'),
    node('adr', 'ask', 'DESIGN', 'adr-ratification'),
    node('distill', 'agent', 'DISTILL', 'acceptance-designer'),
    node('distill_review', 'review', 'DISTILL', 'coverage, business-alignment, testability, boundary-enforcement'),
    node('deliver', 'agent', 'DELIVER', 'software-engineer'),
    node('gates', 'gate', 'DELIVER', GATES),
    node('deliver_review', 'call', 'DELIVER', 'test-integrity, architecture-boundaries, cold-reader, mock-fidelity, contract-fidelity'),
    node('mutation', 'gate', 'DELIVER', 'mutation'),
    node('visuals', 'publish', 'DELIVER', 'publish playwright-visuals'),
    node('kill_proposal', 'agent', 'DELIVER', 'software-engineer'),
    node('pr_writer', 'agent', 'PUBLISH', 'pr-writer'),
    node('mutation_plan', 'ask', 'DELIVER', 'mutation-plan'),
    node('publish', 'publish', 'PUBLISH', 'publish pull-request'),
    node('kill_mutants', 'agent', 'DELIVER', 'software-engineer'),
    node('mutation_review', 'review', 'DELIVER', 'test-integrity'),
    node('mutation_gates', 'gate', 'DELIVER', GATES),
  ],
  edges: [
    edge('publish_consent', 'visuals_consent'), edge('visuals_consent', 'research'), edge('research', 'design'), edge('design', 'design_review'),
    edge('design_review', 'design', 'NEEDS_REWORK'), edge('design_review', 'adr', 'APPROVED'), edge('adr', 'distill', 'RATIFIED'), edge('adr', 'design', 'REJECTED'),
    edge('distill', 'distill_review'), edge('distill_review', 'distill', 'NEEDS_REWORK'), edge('distill_review', 'deliver', 'APPROVED'),
    edge('deliver', 'gates'), edge('gates', 'deliver', 'FAIL'), edge('gates', 'deliver_review', 'PASS'),
    edge('deliver_review', 'deliver', 'NEEDS_REWORK'), edge('deliver_review', 'mutation', 'APPROVED'), edge('mutation', 'visuals', 'PASS'),
    edge('mutation', 'kill_proposal', 'FAIL'), edge('kill_proposal', 'mutation_plan'), edge('mutation_plan', 'kill_mutants', 'APPLY'),
    edge('kill_mutants', 'mutation_review'), edge('mutation_review', 'kill_mutants', 'NEEDS_REWORK'), edge('mutation_review', 'mutation_gates', 'APPROVED'),
    edge('mutation_gates', 'kill_mutants', 'FAIL'), edge('mutation_gates', 'mutation', 'PASS'),
    edge('visuals', 'pr_writer'), edge('pr_writer', 'publish'),
  ],
})
/** What lenses that all passed with no finding say. @param {...string} names */
const passing = (...names) => names.map((lens) => ({ lens, verdict: 'pass', findings: 0 }))
const NO_RUN = Object.freeze({ graph: PENDING_GRAPH, reviews: [], gates: [], agents: [] })
/** The view less its graph and its agents, which the scenarios on them assert. */
const core = ({ graph, agents, ...rest }) => rest

test('the view of a working copy with no active pipeline says so, with the workflow\'s phases pending, or none when it cannot be read', async () => {
  const host = pipelineHost()

  assert.deepEqual(await host.view(), {
    slug: null,
    status: 'idle',
    reason: 'no active pipeline in this working copy (.copilot-tracking/skraft-plans/.active-slug); start one with an explicit slug',
    phases: phases('pending', 'pending', 'pending', 'pending', 'pending'),
    current: null,
    question: null,
    attempts: 0,
    costUsd: null,
    ...NO_RUN,
  })

  await host.deps.workspace.write('skraft-config.json', 'not json')
  const unreadable = await host.view()
  assert.deepEqual([unreadable.phases, unreadable.graph], [[], { nodes: [], edges: [] }])
})

test('the view of an active slug that has no journal says it is not initialised', async () => {
  const host = pipelineHost()
  await host.tracking.activate(SLUG)

  assert.deepEqual(await host.view(), {
    slug: SLUG, status: 'not-initialised', reason: `${SLUG} has no journal (events.jsonl)`, phases: phases('pending', 'pending', 'pending', 'pending', 'pending'), current: null, question: null, attempts: 0, costUsd: null, ...NO_RUN,
  })
})

test('the view follows a run, its open step, its attempts and its cost', async () => {
  const host = pipelineHost()
  await host.init()
  assert.deepEqual(await host.view(), {
    slug: SLUG, status: 'running', reason: '', phases: phases('pending', 'pending', 'pending', 'pending', 'pending'), current: null, question: null, attempts: 0, costUsd: null, ...NO_RUN,
  })

  const seen = []
  host.agentRunner.behaviours.push(async () => {
    seen.push(core(await host.view()))
    return { ok: true, text: 'nothing written', costUsd: 0.25 }
  }, async (dispatch) => {
    await agent()(host)(dispatch)
    return { ok: true, text: 'done', costUsd: 0.5 }
  }, async () => {
    seen.push(core(await host.view()))
    return unavailable()
  })
  await host.run()

  assert.deepEqual(seen, [{
    slug: SLUG, status: 'running', reason: '', phases: phases('open', 'pending', 'pending', 'pending', 'pending'),
    current: { step: 'research', phase: 'RESEARCH', agent: 'solution-researcher', gates: null, question: null, visit: 1, attempt: 1 }, question: null, attempts: 3, costUsd: null, reviews: [], gates: [],
  }, {
    slug: SLUG, status: 'running', reason: '', phases: phases('closed', 'open', 'pending', 'pending', 'pending'),
    current: { step: 'design', phase: 'DESIGN', agent: 'solution-architect', gates: null, question: null, visit: 1, attempt: 1 }, question: null, attempts: 5, costUsd: 0.75, reviews: [], gates: [],
  }])
  assert.deepEqual((await host.view()).status, 'blocked')
})

test('the view of a run at its gates names them, and of a completed run says done with each review verdict and each gate result', async () => {
  const host = scripted({}, (it) => [agent()(it), agent()(it), agent()(it), agent({ work: ({ git }) => { git.commit('test(checkout): pay', ['tests/PayTests.cs']); git.commit('feat(checkout): pay', ['src/Pay.cs']) } })(it)])
  const seen = []
  host.machine.meanwhile['. $ dotnet build'] = async () => { seen.push((await host.view()).current) }

  await host.start()

  assert.deepEqual(seen, [{ step: 'gates', phase: 'DELIVER', agent: null, gates: ['build', 'format', 'lint', 'test', 'architecture', 'coverage'], question: null, visit: 1, attempt: 1 }])
  assert.deepEqual(core(await host.view()), {
    slug: SLUG, status: 'done', reason: 'PUBLISH closed', phases: phases('closed', 'closed', 'closed', 'closed', 'closed'), current: null, question: null, attempts: 15, costUsd: null,
    reviews: [
      { step: 'design_review', visit: 1, verdict: 'approved', lenses: passing('consistency', 'architecture-compliance', 'fitness') },
      { step: 'distill_review', visit: 1, verdict: 'approved', lenses: passing('coverage', 'business-alignment', 'testability', 'boundary-enforcement') },
      { step: 'deliver_review', visit: 1, verdict: 'approved', lenses: passing('test-integrity', 'architecture-boundaries', 'cold-reader') },
    ],
    gates: [
      { component: 'api', gate: 'build', command: 'dotnet build', status: 'pass', durationMs: 0, evidence: 'gates/api/build-1.log', survivors: undefined },
      { component: 'api', gate: 'test', command: 'dotnet test', status: 'pass', durationMs: 0, evidence: 'gates/api/test-1.log', survivors: undefined },
      { component: 'api', gate: 'mutation', command: 'dotnet stryker', status: 'pass', durationMs: 0, evidence: 'gates/api/mutation-1.log', survivors: null },
    ],
  })
})

test('the view of a blocked run keeps the reason, and of a tampered journal says it is tampered', async () => {
  const host = scripted({}, (it) => [agent({ fill: false })(it), agent({ fill: false })(it)])
  const blocked = await host.start()

  const view = await host.view()
  assert.deepEqual([view.status, view.reason, view.phases], ['blocked', blocked.reason, phases('open', 'pending', 'pending', 'pending', 'pending')])

  host.tracking.rewriteJournal(SLUG, (lines) => lines.slice(1))
  assert.deepEqual(await host.view(), {
    slug: SLUG, status: 'tampered', reason: 'journal tampered: events.jsonl line 1 does not open the chain; restore the file or start a new slug',
    phases: phases('pending', 'pending', 'pending', 'pending', 'pending'), current: null, question: null, attempts: 0, costUsd: null, ...NO_RUN,
  })
})

test('the view of a run stopped on an agent the host cannot start says blocked, until the step resumes', async () => {
  const host = scripted({}, () => [unavailable])
  await host.start()

  const stopped = await host.view()
  assert.deepEqual([stopped.status, stopped.reason], ['blocked', 'solution-researcher could not be started'])

  const seen = []
  host.agentRunner.behaviours.push(agent()(host), async () => {
    seen.push(await host.view())
    return unavailable()
  })
  await host.run()
  assert.deepEqual(seen.map((view) => [view.status, view.reason]), [['running', '']])
})

test('the view draws the phases of the repository\'s workflow, and of the journal when the workflow cannot be read', async () => {
  const renamed = edit(BUILT_IN_WORKFLOW,
    ['  exit     [shape=Msquare]', '  exit     [shape=Msquare]\n  security [shape=box, agent="acme-security-reviewer", phase="SECURITY"]'],
    ['  adr -> distill   [label="RATIFIED"]', '  adr -> security  [label="RATIFIED"]\n  security -> distill'])
  const host = scripted({ files: { '.skraft/pipeline.skraft.dot': renamed }, catalog: new InMemoryAgentCatalog({ repository: ['acme-security-reviewer'] }) }, (it) => [agent()(it), unavailable])
  await host.start()
  assert.deepEqual((await host.view()).phases.map((view) => view.phase), ['RESEARCH', 'DESIGN', 'SECURITY', 'DISTILL', 'DELIVER', 'PUBLISH'])
  host.deps.agentCatalog.repository.clear()
  assert.deepEqual((await host.view()).phases.map((view) => view.phase), ['RESEARCH', 'DESIGN', 'SECURITY', 'DISTILL', 'DELIVER', 'PUBLISH'])

  await host.deps.workspace.write('.skraft/pipeline.skraft.dot', 'digraph {')
  const unreadable = await host.view()
  assert.deepEqual(unreadable.phases, [{ phase: 'RESEARCH', state: 'closed' }, { phase: 'DESIGN', state: 'open' }])
  assert.deepEqual(unreadable.graph, {
    nodes: [
      { id: 'publish_consent', kind: null, phase: 'RESEARCH', what: null, state: 'done', outcome: 'skipped', visits: 1, attempts: 1, retries: 0, durationMs: 0, costUsd: null },
      { id: 'visuals_consent', kind: null, phase: 'RESEARCH', what: null, state: 'done', outcome: 'skipped', visits: 1, attempts: 1, retries: 0, durationMs: 0, costUsd: null },
      { id: 'research', kind: null, phase: 'RESEARCH', what: null, state: 'done', outcome: 'done', visits: 1, attempts: 1, retries: 0, durationMs: 0, costUsd: null },
      { id: 'design', kind: null, phase: 'DESIGN', what: null, state: 'open', outcome: null, visits: 1, attempts: 1, retries: 0, durationMs: 0, costUsd: null },
    ],
    edges: [],
  })

  await host.deps.workspace.write('skraft-config.json', 'not json')
  assert.deepEqual((await host.view()).phases, [{ phase: 'RESEARCH', state: 'closed' }, { phase: 'DESIGN', state: 'open' }])
})

test('before a run, the view draws the workflow\'s steps, each pending with what it runs, and its edges, none taken', async () => {
  const host = pipelineHost()

  const idle = await host.view()
  assert.deepEqual([idle.graph, idle.reviews, idle.gates], [PENDING_GRAPH, [], []])

  await host.init()
  assert.deepEqual((await host.view()).graph, PENDING_GRAPH)
})

/** A host whose design review sends the design back once, each agent and batch with a cost. */
const reworkedDesign = () => {
  const clock = new FixedClock('2026-10-11T09:00:00.000Z')
  const costs = (costUsd) => ({ ok: true, text: 'done', costUsd })
  const host = scripted({ clock, machine: new ScriptedMachine({ clock, takesMs: 1_000 }) }, (it) => [
    agent({ answer: costs(0.25) })(it),
    agent({ answer: costs(0.5) })(it),
    agent({ answer: costs(0.5) })(it),
    agent()(it),
    agent({ work: tddCycle() })(it),
  ])
  host.agentRunner.batchCostUsd = 0.125
  host.agentRunner.review = lenses({ consistency: [says('consistency', 'fail', [finding('F1', 'high', 'the ADR contradicts the context map')])] })
  return host
}

test('the view marks each step of the run done or in progress, with its outcome, passes, attempts, time and cost, and the edges it took', async () => {
  const host = reworkedDesign()
  const seen = []
  host.machine.meanwhile['. $ dotnet build'] = async () => { seen.push((await host.view()).graph.nodes.filter((step) => step.state !== 'pending').map(({ id, state }) => [id, state])) }

  assert.equal((await host.start()).status, 'done')

  assert.deepEqual(seen[0].slice(-3), [['distill_review', 'done'], ['deliver', 'done'], ['gates', 'open']])
  const { graph } = await host.view()
  assert.deepEqual(graph.nodes.map(({ id, state, outcome, visits, attempts, retries, costUsd }) => [id, state, outcome, visits, attempts, retries, costUsd]), [
    ['publish_consent', 'done', 'skipped', 1, 1, 0, null],
    ['visuals_consent', 'done', 'skipped', 1, 1, 0, null],
    ['research', 'done', 'done', 1, 1, 0, 0.25],
    ['design', 'done', 'done', 2, 2, 1, 1],
    ['design_review', 'done', 'approved', 2, 2, 1, 0.375],
    ['adr', 'done', 'skipped', 1, 1, 0, null],
    ['distill', 'done', 'done', 1, 1, 0, null],
    ['distill_review', 'done', 'approved', 1, 1, 0, 0.125],
    ['deliver', 'done', 'done', 1, 1, 0, null],
    ['gates', 'done', 'pass', 1, 1, 0, null],
    ['deliver_review', 'done', 'approved', 1, 1, 0, 0.125],
    ['mutation', 'done', 'pass', 1, 1, 0, null],
    ['visuals', 'done', 'skipped', 1, 1, 0, null],
    ['kill_proposal', 'pending', null, 0, 0, 0, null],
    ['pr_writer', 'done', 'done', 1, 1, 0, null],
    ['mutation_plan', 'pending', null, 0, 0, 0, null],
    ['publish', 'done', 'local', 1, 1, 0, null],
    ['kill_mutants', 'pending', null, 0, 0, 0, null],
    ['mutation_review', 'pending', null, 0, 0, 0, null],
    ['mutation_gates', 'pending', null, 0, 0, 0, null],
  ])
  assert.equal(graph.nodes.find((step) => step.id === 'gates').durationMs, 2_000)
  assert.deepEqual(graph.edges.filter((taken) => taken.taken > 0).map(({ from, to, taken }) => [from, to, taken]), [
    ['publish_consent', 'visuals_consent', 1], ['visuals_consent', 'research', 1], ['research', 'design', 1], ['design', 'design_review', 2],
    ['design_review', 'design', 1], ['design_review', 'adr', 1], ['adr', 'distill', 1], ['distill', 'distill_review', 1], ['distill_review', 'deliver', 1],
    ['deliver', 'gates', 1], ['gates', 'deliver_review', 1], ['deliver_review', 'mutation', 1], ['mutation', 'visuals', 1], ['visuals', 'pr_writer', 1], ['pr_writer', 'publish', 1],
  ])
})

test('the view shows the last pass of each review: what each lens said and how many findings, then the verdict once recorded', async () => {
  const host = reworkedDesign()
  const answer = host.agentRunner.review
  const seen = []
  host.agentRunner.review = async (dispatch) => {
    if (dispatch.label.includes('design_review')) seen.push(JSON.stringify((await host.view()).reviews))
    return answer(dispatch)
  }

  await host.start()

  const failed = [{ lens: 'consistency', verdict: 'fail', findings: 1 }, ...passing('architecture-compliance', 'fitness')]
  assert.deepEqual([...new Set(seen)].map((reviews) => JSON.parse(reviews)), [
    [],
    [{ step: 'design_review', visit: 1, verdict: null, lenses: failed }],
    [{ step: 'design_review', visit: 1, verdict: 'needs-rework', lenses: failed }],
  ])
  assert.deepEqual((await host.view()).reviews[0], { step: 'design_review', visit: 2, verdict: 'approved', lenses: passing('consistency', 'architecture-compliance', 'fitness') })
})

test('the view shows the last result of each gate of each component, a test that failed then passed among them', async () => {
  const clock = new FixedClock('2026-10-11T09:00:00.000Z')
  const machine = new ScriptedMachine({ exits: { '. $ dotnet test': 1 }, clock, takesMs: 1_000 })
  const host = scripted({ machine, clock }, (it) => [agent()(it), agent()(it), agent()(it), agent({ work: tddCycle() })(it), agent({ work: (h) => { machine.exits['. $ dotnet test'] = 0; tddCycle('checkout', 'Refund')(h) } })(it)])
  const seen = []
  host.machine.meanwhile['. $ dotnet build'] = async () => { seen.push((await host.view()).gates.map(({ gate, status, evidence }) => [gate, status, evidence])) }

  await host.start()

  assert.deepEqual(seen, [[], [['build', 'pass', 'gates/api/build-1.log'], ['test', 'fail', 'gates/api/test-1.log']]])
  assert.deepEqual((await host.view()).gates.map(({ gate, status, durationMs, evidence }) => [gate, status, durationMs, evidence]), [
    ['build', 'pass', 1_000, 'gates/api/build-2.log'],
    ['test', 'pass', 1_000, 'gates/api/test-2.log'],
    ['mutation', 'pass', 1_000, 'gates/api/mutation-1.log'],
  ])
})

test('the last pass of a review shows only the lenses that pass ran, and no verdict until the pass records one', async () => {
  const mocks = ({ git }) => {
    git.adds('tests/CheckoutTests.cs', 'var server = WireMockServer.Start();')
    tddCycle()({ git })
  }
  const noMoreMocks = ({ git }) => {
    git.patches = {}
    tddCycle(SLUG, 'Refund')({ git })
  }
  const host = scripted({}, (it) => [agent()(it), agent()(it), agent()(it), agent({ work: mocks })(it), agent({ work: noMoreMocks })(it)])
  const answer = lenses({
    'test-integrity': [says('test-integrity', 'fail', [finding('F1', 'blocker', 'the refund test asserts nothing')]), says('test-integrity', 'fail', [finding('F2', 'high', 'the test name says nothing')])],
    refuter: [refutes('confirmed'), refutes('refuted')],
  })
  const seen = []
  host.agentRunner.review = async (dispatch) => {
    if (dispatch.agent === 'finding-refuter') seen.push((await host.view()).reviews.at(-1))
    return answer(dispatch)
  }

  assert.equal((await host.start()).status, 'done')

  const found = { lens: 'test-integrity', verdict: 'fail', findings: 1 }
  assert.deepEqual(seen, [
    { step: 'deliver_review', visit: 1, verdict: null, lenses: [found, ...passing('architecture-boundaries', 'cold-reader', 'mock-fidelity')] },
    { step: 'deliver_review', visit: 2, verdict: null, lenses: [found, ...passing('architecture-boundaries', 'cold-reader')] },
  ])
  assert.deepEqual((await host.view()).reviews.at(-1), { step: 'deliver_review', visit: 2, verdict: 'approved', lenses: [found, ...passing('architecture-boundaries', 'cold-reader')] })
})
