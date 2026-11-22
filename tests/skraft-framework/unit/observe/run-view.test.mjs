import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, finding, green, lenses, nominal, PASSING_MATRIX, pipelineHost, refutes, says, scripted, SLUG, reworkCycle } from '../support/pipeline-host.mjs'
import { edit, WITH_SECURITY } from '../workflow/support.mjs'
import { BUILT_IN_WORKFLOW, FixedClock, InMemoryAgentCatalog, ScriptedMachine } from '../support/in-memory-host.mjs'

const PHASES = ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER', 'PUBLISH']
const phases = (...states) => PHASES.map((phase, index) => ({ phase, state: states[index] }))
const unavailable = () => ({ ok: false, unavailable: true, text: '' })

const UNTOUCHED = Object.freeze({ state: 'pending', outcome: null, visits: 0, attempts: 0, retries: 0, durationMs: 0, costUsd: null })
const node = (id, kind, phase, what) => ({ id, kind, phase, what, ...UNTOUCHED })
const edge = (from, to, label = null) => ({ from, to, label, taken: 0 })
/** The default workflow as the view draws it before a run: each step pending, no edge taken. */
const PENDING_GRAPH = Object.freeze({
  nodes: [
    node('research', 'agent', 'RESEARCH', 'solution-researcher'),
    node('design', 'agent', 'DESIGN', 'solution-architect'),
    node('design_review', 'review', 'DESIGN', 'consistency, architecture-compliance, fitness'),
    node('adr', 'ask', 'DESIGN', 'adr-ratification'),
    node('distill', 'agent', 'DISTILL', 'acceptance-designer'),
    node('distill_review', 'review', 'DISTILL', 'coverage, business-alignment, testability, boundary-enforcement'),
    node('scenario_review', 'ask', 'DISTILL', 'scenario-review'),
    node('deliver', 'agent', 'DELIVER', 'software-engineer'),
    node('deliver_review', 'call', 'DELIVER', 'test-integrity, architecture-boundaries, cold-reader, mock-fidelity, contract-fidelity'),
    node('visuals', 'publish', 'DELIVER', 'publish playwright-visuals'),
    node('pr_writer', 'agent', 'PUBLISH', 'pr-writer'),
    node('publish', 'publish', 'PUBLISH', 'publish pull-request'),
  ],
  edges: [
    edge('research', 'design'), edge('design', 'design_review'),
    edge('design_review', 'design', 'NEEDS_REWORK'), edge('design_review', 'adr', 'APPROVED'), edge('adr', 'distill', 'RATIFIED'), edge('adr', 'design', 'REJECTED'),
    edge('distill', 'distill_review'), edge('distill_review', 'distill', 'NEEDS_REWORK'), edge('distill_review', 'scenario_review', 'APPROVED'),
    edge('scenario_review', 'deliver', 'APPROVED'), edge('scenario_review', 'distill', 'REVISE'),
    edge('deliver', 'deliver_review'),
    edge('deliver_review', 'deliver', 'NEEDS_REWORK'), edge('deliver_review', 'visuals', 'APPROVED'),
    edge('visuals', 'pr_writer'), edge('pr_writer', 'publish'),
  ],
})
/** What lenses that all passed with no finding say. @param {...string} names */
const passing = (...names) => names.map((lens) => ({ lens, verdict: 'pass', findings: 0 }))
const NO_RUN = Object.freeze({ graph: PENDING_GRAPH, reviews: [], evidence: [], agents: [] })
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
    current: { step: 'research', phase: 'RESEARCH', agent: 'solution-researcher', question: null, visit: 1, attempt: 1 }, question: null, attempts: 1, costUsd: null, reviews: [], evidence: [],
  }, {
    slug: SLUG, status: 'running', reason: '', phases: phases('closed', 'open', 'pending', 'pending', 'pending'),
    current: { step: 'design', phase: 'DESIGN', agent: 'solution-architect', question: null, visit: 1, attempt: 1 }, question: null, attempts: 3, costUsd: 0.75, reviews: [], evidence: [],
  }])
  assert.deepEqual((await host.view()).status, 'blocked')
})
test('the view of a blocked run keeps the reason, and of a tampered journal says it is tampered', async () => {
  const host = scripted({ answers: [{ answer: 'STOP' }] }, (it) => [agent({ fill: false })(it), agent({ fill: false })(it)])
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
  assert.deepEqual([idle.graph, idle.reviews, idle.evidence], [PENDING_GRAPH, [], []])

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
    agent({ answer: costs(0.5), work: ({ tracking }) => tracking.write(SLUG, PASSING_MATRIX[0], `${PASSING_MATRIX[1]}- reworked: the ADR now names the context map's relationship\n`) })(it),
    agent()(it),
    agent({ work: green() })(it),
  ])
  host.agentRunner.batchCostUsd = 0.125
  host.agentRunner.review = lenses({ consistency: [says('consistency', 'fail', [finding('F1', 'high', 'the ADR contradicts the context map')])] })
  return host
}

test('the view marks each step of the run done or in progress, with its outcome, passes, attempts, time and cost, and the edges it took', async () => {
  const host = reworkedDesign()

  assert.equal((await host.start()).status, 'done')

  const { graph } = await host.view()
  assert.deepEqual(graph.nodes.map(({ id, state, outcome, visits, attempts, retries, costUsd }) => [id, state, outcome, visits, attempts, retries, costUsd]), [
    ['research', 'done', 'done', 1, 1, 0, 0.25],
    ['design', 'done', 'done', 2, 2, 1, 1],
    ['design_review', 'done', 'approved', 2, 2, 1, 0.375],
    ['adr', 'done', 'skipped', 1, 1, 0, null],
    ['distill', 'done', 'done', 1, 1, 0, null],
    ['distill_review', 'done', 'approved', 1, 1, 0, 0.125],
    ['scenario_review', 'done', 'answered', 1, 1, 0, null],
    ['deliver', 'done', 'done', 1, 1, 0, null],
    ['deliver_review', 'done', 'approved', 1, 1, 0, 0.125],
    ['visuals', 'done', 'skipped', 1, 1, 0, null],
    ['pr_writer', 'done', 'done', 1, 1, 0, null],
    ['publish', 'done', 'local', 1, 1, 0, null],
  ])
  assert.deepEqual(graph.edges.filter((taken) => taken.taken > 0).map(({ from, to, taken }) => [from, to, taken]), [
    ['research', 'design', 1], ['design', 'design_review', 2],
    ['design_review', 'design', 1], ['design_review', 'adr', 1], ['adr', 'distill', 1], ['distill', 'distill_review', 1], ['distill_review', 'scenario_review', 1], ['scenario_review', 'deliver', 1],
    ['deliver', 'deliver_review', 1], ['deliver_review', 'visuals', 1], ['visuals', 'pr_writer', 1], ['pr_writer', 'publish', 1],
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
test('the last pass of a review shows only the lenses that pass ran, and no verdict until the pass records one', async () => {
  const mocks = ({ git }) => {
    git.adds('tests/CheckoutTests.cs', 'var server = WireMockServer.Start();')
    green()({ git })
  }
  const noMoreMocks = ({ git }) => {
    git.patches = {}
    reworkCycle(SLUG, 'Refund')({ git })
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

test('the view of a delivered run shows its quality evidence: the traced run of each gate the delivery stands on, with its folder and its log', async () => {
  const host = scripted({}, (it) => nominal(it))

  assert.equal((await host.start()).status, 'done')

  const { evidence } = await host.view()
  assert.deepEqual(evidence.map(({ gate, folder, run, log }) => [gate, folder, run, log]), [
    ['build', '.', 1, 'logs/runs/deliver-1-1/1.log'],
    ['format', '.', 2, 'logs/runs/deliver-1-1/2.log'],
    ['lint', '.', 3, 'logs/runs/deliver-1-1/3.log'],
    ['test', '.', 4, 'logs/runs/deliver-1-1/4.log'],
    ['architecture', '.', 5, 'logs/runs/deliver-1-1/5.log'],
    ['coverage', '.', 6, 'logs/runs/deliver-1-1/6.log'],
  ])
})
