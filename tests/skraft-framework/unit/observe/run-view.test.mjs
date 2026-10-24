import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, pipelineHost, scripted, SLUG } from '../support/pipeline-host.mjs'
import { edit, WITH_SECURITY } from '../workflow/support.mjs'
import { InMemoryAgentCatalog } from '../support/in-memory-host.mjs'

const PHASES = ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER']
const phases = (...states) => PHASES.map((phase, index) => ({ phase, state: states[index] }))
const unavailable = () => ({ ok: false, unavailable: true, text: '' })

test('the view of a working copy with no active pipeline says so, with the workflow\'s phases pending, or none when it cannot be read', async () => {
  const host = pipelineHost()

  assert.deepEqual(await host.view(), {
    slug: null,
    status: 'idle',
    reason: 'no active pipeline in this working copy (.copilot-tracking/skraft-plans/.active-slug); start one with an explicit slug',
    phases: phases('pending', 'pending', 'pending', 'pending'),
    current: null,
    question: null,
    attempts: 0,
    costUsd: null,
  })

  await host.deps.workspace.write('skraft-config.json', 'not json')
  assert.deepEqual((await host.view()).phases, [])
})

test('the view of an active slug that has no journal says it is not initialised', async () => {
  const host = pipelineHost()
  await host.tracking.activate(SLUG)

  assert.deepEqual(await host.view(), {
    slug: SLUG, status: 'not-initialised', reason: `${SLUG} has no journal (events.jsonl)`, phases: phases('pending', 'pending', 'pending', 'pending'), current: null, question: null, attempts: 0, costUsd: null,
  })
})

test('the view follows a run, its open step, its attempts and its cost', async () => {
  const host = pipelineHost()
  await host.init()
  assert.deepEqual(await host.view(), {
    slug: SLUG, status: 'running', reason: '', phases: phases('pending', 'pending', 'pending', 'pending'), current: null, question: null, attempts: 0, costUsd: null,
  })

  const seen = []
  host.agentRunner.behaviours.push(async () => {
    seen.push(await host.view())
    return { ok: true, text: 'nothing written', costUsd: 0.25 }
  }, async (dispatch) => {
    await agent()(host)(dispatch)
    return { ok: true, text: 'done', costUsd: 0.5 }
  }, async () => {
    seen.push(await host.view())
    return unavailable()
  })
  await host.run()

  assert.deepEqual(seen, [{
    slug: SLUG, status: 'running', reason: '', phases: phases('open', 'pending', 'pending', 'pending'),
    current: { step: 'research', phase: 'RESEARCH', agent: 'solution-researcher', gates: null, question: null, visit: 1, attempt: 1 }, question: null, attempts: 1, costUsd: null,
  }, {
    slug: SLUG, status: 'running', reason: '', phases: phases('closed', 'open', 'pending', 'pending'),
    current: { step: 'design', phase: 'DESIGN', agent: 'solution-architect', gates: null, question: null, visit: 1, attempt: 1 }, question: null, attempts: 3, costUsd: 0.75,
  }])
  assert.deepEqual((await host.view()).status, 'blocked')
})

test('the view of a run at its gates names them, and of a completed run says done', async () => {
  const host = scripted({}, (it) => [agent()(it), agent()(it), agent()(it), agent({ work: ({ git }) => { git.commit('test(checkout): pay', ['tests/PayTests.cs']); git.commit('feat(checkout): pay', ['src/Pay.cs']) } })(it)])
  const seen = []
  host.machine.meanwhile['. $ dotnet build'] = async () => { seen.push((await host.view()).current) }

  await host.start()

  assert.deepEqual(seen, [{ step: 'gates', phase: 'DELIVER', agent: null, gates: ['build', 'format', 'lint', 'test', 'architecture', 'coverage'], question: null, visit: 1, attempt: 1 }])
  assert.deepEqual(await host.view(), {
    slug: SLUG, status: 'done', reason: 'DELIVER closed', phases: phases('closed', 'closed', 'closed', 'closed'), current: null, question: null, attempts: 10, costUsd: null,

  })
})

test('the view of a blocked run keeps the reason, and of a tampered journal says it is tampered', async () => {
  const host = scripted({}, (it) => [agent({ fill: false })(it), agent({ fill: false })(it)])
  const blocked = await host.start()

  const view = await host.view()
  assert.deepEqual([view.status, view.reason, view.phases], ['blocked', blocked.reason, phases('open', 'pending', 'pending', 'pending')])

  host.tracking.rewriteJournal(SLUG, (lines) => lines.slice(1))
  assert.deepEqual(await host.view(), {
    slug: SLUG, status: 'tampered', reason: 'journal tampered: events.jsonl line 1 does not open the chain; restore the file or start a new slug',
    phases: phases('pending', 'pending', 'pending', 'pending'), current: null, question: null, attempts: 0, costUsd: null,
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
  const renamed = edit(WITH_SECURITY, ['agent="acme-security-reviewer"', 'agent="acme-security-reviewer", phase="SECURITY"'], ['agent="acceptance-designer", phase="DISTILL"', 'agent="acceptance-designer", phase="DISTILL"'])
  const host = scripted({ config: { workflow: 'skraft-workflow.dot' }, files: { 'skraft-workflow.dot': renamed }, catalog: new InMemoryAgentCatalog({ repository: ['acme-security-reviewer'] }) }, (it) => [agent()(it), unavailable])
  await host.start()
  assert.deepEqual((await host.view()).phases.map((view) => view.phase), ['RESEARCH', 'DESIGN', 'SECURITY', 'DISTILL', 'DELIVER'])
  host.deps.agentCatalog.repository.clear()
  assert.deepEqual((await host.view()).phases.map((view) => view.phase), ['RESEARCH', 'DESIGN', 'SECURITY', 'DISTILL', 'DELIVER'])

  await host.deps.workspace.write('skraft-workflow.dot', 'digraph {')
  assert.deepEqual((await host.view()).phases, [{ phase: 'RESEARCH', state: 'closed' }, { phase: 'DESIGN', state: 'open' }])

  await host.deps.workspace.write('skraft-config.json', 'not json')
  assert.deepEqual((await host.view()).phases, [{ phase: 'RESEARCH', state: 'closed' }, { phase: 'DESIGN', state: 'open' }])
})
