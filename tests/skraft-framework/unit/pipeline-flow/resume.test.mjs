import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, pipelineHost, scripted, SLUG } from '../support/pipeline-host.mjs'

const interrupted = () => { throw new Error('host interrupted') }
const unavailable = () => ({ ok: false, unavailable: true, text: '' })

test('a run interrupted after the researcher did its work records it without dispatching it again', async () => {
  const host = scripted({}, (it) => [async (dispatch) => { await agent()(it)(dispatch); interrupted() }, unavailable])
  await host.init()
  await assert.rejects(host.run(), /host interrupted/)
  host.clock.advance(60 * 60_000) // the next day: the outputs keep the date of their dispatch

  const resumed = await host.run()

  assert.equal(resumed.code, 'agent-unavailable')
  assert.deepEqual(host.agentRunner.dispatches.map((dispatch) => dispatch.agent), ['solution-researcher', 'solution-architect'])
  assert.deepEqual(host.types(), ['run.started', 'step.started', 'step.recorded', 'phase.closed', 'step.started', 'run.stopped'])
})

test('a run interrupted before the agent finished dispatches the same attempt again, under the same label and brief', async () => {
  const host = scripted({}, (it) => [agent({ fill: false })(it), interrupted, agent()(it), unavailable])
  await host.init()
  await assert.rejects(host.run(), /host interrupted/)
  host.clock.advance(60 * 60_000)

  await host.run()

  assert.deepEqual(host.agentRunner.dispatches.slice(0, 3).map((dispatch) => dispatch.label), [
    `skraft ${SLUG} · research · attempt 1`, `skraft ${SLUG} · research · attempt 2`, `skraft ${SLUG} · research · attempt 2`,
  ])
  assert.equal(host.agentRunner.dispatches[2].prompt, host.agentRunner.dispatches[1].prompt)
  assert.equal(host.events().filter((event) => event.type === 'step.started' && event.step === 'research').length, 2)
})

test('a resumed attempt whose outputs are done but whose result is missing is dispatched again', async () => {
  const host = scripted({}, (it) => [async (dispatch) => { await agent({ result: null })(it)(dispatch); interrupted() }, agent()(it), unavailable])
  await host.init()
  await assert.rejects(host.run(), /host interrupted/)

  await host.run()

  assert.deepEqual(host.agentRunner.dispatches.map((dispatch) => dispatch.label).slice(0, 2), Array(2).fill(`skraft ${SLUG} · research · attempt 1`))
})

test('init on an initialised slug keeps its journal and its story', async () => {
  const host = pipelineHost()
  await host.init({ story: { issue: 7, title: null } })

  const again = await host.init({ story: { issue: 8, title: 'Other' } })

  assert.deepEqual(again, { ok: true, slug: SLUG, created: false, code: null, reason: `${SLUG} is the active pipeline` })
  assert.deepEqual(host.events().map((event) => [event.type, event.story]), [['run.started', { issue: 7, title: null }]])
})

test('a new run journals its slug, story, workflow, bases, DISCUSS artefacts, entry and unlocked gates', async () => {
  const host = pipelineHost()

  await host.init({ story: { issue: 42, title: 'Pay by card' } })

  const [started] = host.events()
  assert.deepEqual(
    { slug: started.slug, story: started.story, workflow: started.workflow, base: started.base, artifacts: started.artifacts, start: started.start, unlocked: started.unlocked },
    {
      slug: SLUG,
      story: { issue: 42, title: 'Pay by card' },
      workflow: 'skraft',
      base: [{ component: null, root: '.', repository: '.', ref: 'main', source: 'default', sha: 'root-0' }, { component: 'api', root: '.', repository: '.', ref: 'main', source: 'default', sha: 'root-0' }],
      artifacts: [],
      start: null,
      unlocked: [],
    },
  )
})
