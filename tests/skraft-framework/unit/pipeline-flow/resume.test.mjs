import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, nominal, pipelineHost, reviews, scripted, SLUG } from '../support/pipeline-host.mjs'
import { BUILT_IN_WORKFLOW, InMemoryCodeHost } from '../support/in-memory-host.mjs'
import { edit } from '../workflow/support.mjs'

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
  assert.deepEqual(host.types(), ['run.started', 'step.started', 'step.recorded', 'step.started', 'step.recorded', 'step.started', 'step.recorded', 'phase.closed', 'step.started', 'run.stopped'])
})

test('a run resumed on an ejected pipeline that dropped a node the run already passed reviews the next phase as usual', async () => {
  const host = scripted({}, (it) => [agent()(it), unavailable])
  await host.init()
  assert.equal((await host.run()).code, 'agent-unavailable')
  await host.workspace.write('.skraft/pipeline.skraft.dot', edit(BUILT_IN_WORKFLOW,
    ['  visuals_consent [shape=hexagon, question="reporting-consent"]\n', ''],
    ['publish_consent -> visuals_consent -> research', 'publish_consent -> research']))
  host.agentRunner.behaviours.push(nominal(host)[1], unavailable)

  await host.run()

  assert.deepEqual(reviews(host)[0], ['design_review', 1, 'approved', 'adr'])
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

test('a resumed attempt whose result or outputs are missing is dispatched again', async () => {
  const host = scripted({}, (it) => [async (dispatch) => { await agent({ result: null })(it)(dispatch); interrupted() }, agent()(it), unavailable])
  await host.init()
  await assert.rejects(host.run(), /host interrupted/)

  await host.run()

  assert.deepEqual(host.agentRunner.dispatches.map((dispatch) => dispatch.label).slice(0, 2), Array(2).fill(`skraft ${SLUG} · research · attempt 1`))

  const unfilled = scripted({}, (it) => [async (dispatch) => { await agent({ fill: false })(it)(dispatch); interrupted() }, agent()(it), unavailable])
  await unfilled.init()
  await assert.rejects(unfilled.run(), /host interrupted/)
  await unfilled.run()
  assert.deepEqual(unfilled.agentRunner.dispatches.map((dispatch) => dispatch.label).slice(0, 2), Array(2).fill(`skraft ${SLUG} · research · attempt 1`))
})

test('init on an initialised slug keeps its journal and its story', async () => {
  const host = pipelineHost()
  await host.init({ story: { issue: 7, title: null } })

  const again = await host.init({ story: { issue: 8, title: 'Other' } })

  assert.deepEqual(again, { ok: true, slug: SLUG, created: false, code: null, reason: `${SLUG} is the active pipeline` })
  assert.deepEqual(host.events().map((event) => [event.type, event.story, event.artifacts]), [['run.started', { issue: 7, title: null }, ['plans/2026-10-11/issue-7.md']]])
  assert.deepEqual(host.codeHost.issuesRead, [7])
})

test('a new run journals its slug, story, workflow, bases, DISCUSS artefacts, entry and unlocked gates, its issue kept beside its DISCUSS artefacts', async () => {
  const codeHost = new InMemoryCodeHost({ issues: { 42: { title: 'Pay by card', body: '## Acceptance criteria\n\n- paying 10 answers paid 10' } } })
  const host = pipelineHost({ codeHost })
  await host.tracking.write(SLUG, 'plans/2026-10-01/stories-v1.md', '# Stories\n')

  await host.init({ story: { issue: 42, title: 'Pay by card' } })

  const [started] = host.events()
  assert.deepEqual(
    { slug: started.slug, story: started.story, workflow: started.workflow, base: started.base, artifacts: started.artifacts, start: started.start, unlocked: started.unlocked },
    {
      slug: SLUG,
      story: { issue: 42, title: 'Pay by card' },
      workflow: 'skraft',
      base: [{ component: null, root: '.', repository: '.', ref: 'main', source: 'default', sha: 'root-0' }, { component: 'api', root: '.', repository: '.', ref: 'main', source: 'default', sha: 'root-0' }],
      artifacts: ['plans/2026-10-11/issue-42.md', 'plans/2026-10-01/stories-v1.md'],
      start: null,
      unlocked: [],
    },
  )
  assert.equal(await host.tracking.read(SLUG, 'plans/2026-10-11/issue-42.md'), [
    '# Issue #42: Pay by card', '', 'https://github.example.com/acme/shop/issues/42', '', '## Acceptance criteria', '', '- paying 10 answers paid 10', '',
  ].join('\n'))
})

test('a run from an issue the forge cannot give starts nothing, says why in a fixed reason, and reads it again when started again', async () => {
  const codeHost = new InMemoryCodeHost({ fails: { issue: 'gh is not signed in to github.com; run gh auth login --hostname github.com' }, issues: {} })
  const host = pipelineHost({ codeHost })

  const unreadable = await host.init({ story: { issue: 42, title: 'Pay by card' } })
  delete codeHost.fails.issue
  const missing = await host.init({ story: { issue: 42, title: 'Pay by card' } })

  assert.deepEqual(unreadable, { ok: false, slug: SLUG, created: false, code: 'issue-unreadable', reason: 'issue #42 of the story cannot be read: gh is not signed in to github.com; run gh auth login --hostname github.com' })
  assert.deepEqual(missing, { ok: false, slug: SLUG, created: false, code: 'issue-not-found', reason: "the forge the remote names has no issue #42; start the run with the number of the story's issue" })
  assert.deepEqual([host.events(), await host.tracking.list(SLUG, 'plans'), host.codeHost.issuesRead], [[], [], [42, 42]])
  assert.equal(await host.tracking.current(), null)
})

test('a later attempt the host could not start is dispatched again on resume, not judged on the earlier attempt\'s work', async () => {
  const host = scripted({}, (it) => [
    agent({ work: ({ git }) => git.change('src/Hack.cs') })(it),
    unavailable,
    agent({ result: { status: 'done', summary: 'Reverted the stray file.' }, work: ({ git }) => git.revert('src/Hack.cs') })(it),
    unavailable,
  ])
  await host.start()

  await host.run()

  assert.deepEqual(host.agentRunner.dispatches.map((dispatch) => dispatch.label), [
    `skraft ${SLUG} · research · attempt 1`, `skraft ${SLUG} · research · attempt 2`, `skraft ${SLUG} · research · attempt 2`, `skraft ${SLUG} · design · attempt 1`,
  ])
  assert.deepEqual(host.events().filter((event) => event.type === 'step.recorded' && event.step === 'research').map((event) => [event.attempt, event.outcome]), [[1, 'failed'], [2, 'done']])
  assert.equal(await host.tracking.read(SLUG, 'results/research-1-2.json'), JSON.stringify({ status: 'done', summary: 'Reverted the stray file.' }))
})
