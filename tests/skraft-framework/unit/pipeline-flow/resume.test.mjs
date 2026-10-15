import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInit } from '../../../../plugins/skraft-framework/engine/application/init.mjs'
import { createRunPipeline } from '../../../../plugins/skraft-framework/engine/application/run-pipeline.mjs'
import {
  FakeHasher, FixedClock, InMemorySourceControl, InMemoryTemplates, InMemoryTracking, InMemoryWorkspace, RecordingProgress, ScriptedAgentRunner,
} from '../support/in-memory-host.mjs'

const TEMPLATE = '# Research: {{topic}}\n'
const OUTPUT = 'research/2026-10-11/checkout-research.md'

const host = () => {
  const tracking = new InMemoryTracking()
  const clock = new FixedClock('2026-10-11T23:59:00.000Z')
  const deps = {
    journal: tracking,
    activePipeline: tracking,
    files: tracking,
    workspace: new InMemoryWorkspace(),
    sourceControl: new InMemorySourceControl(),
    templates: new InMemoryTemplates({ 'research.template.md': TEMPLATE }),
    clock,
    hasher: new FakeHasher(),
    agentRunner: new ScriptedAgentRunner(),
    progress: new RecordingProgress(),
  }
  return { tracking, clock, deps, agentRunner: deps.agentRunner }
}

const fill = (tracking) => tracking.write('checkout', OUTPUT, `${TEMPLATE.replace('{{topic}}', 'Checkout')}Findings.\n`)
const interrupted = () => { throw new Error('host interrupted') }

test('a run resumed after RESEARCH closed dispatches nothing and writes nothing', async () => {
  const { tracking, deps, agentRunner } = host()
  agentRunner.behaviours.push(() => fill(tracking))
  await createInit(deps).init({ slug: 'checkout' })
  await createRunPipeline(deps).run({ slug: 'checkout' })
  const journal = tracking.journal('checkout')

  const resumed = await createRunPipeline(deps).run({})

  assert.equal(resumed.status, 'done')
  assert.equal(agentRunner.dispatches.length, 1)
  assert.deepEqual(tracking.journal('checkout'), journal)
})

test('a run interrupted after the researcher wrote its document closes RESEARCH without dispatching it again', async () => {
  const { tracking, clock, deps, agentRunner } = host()
  agentRunner.behaviours.push(() => { fill(tracking); interrupted() })
  await createInit(deps).init({ slug: 'checkout' })
  await assert.rejects(createRunPipeline(deps).run({ slug: 'checkout' }), /host interrupted/)
  clock.advance(60 * 60_000) // the next day: the output keeps the date of its dispatch

  const resumed = await createRunPipeline(deps).run({ slug: 'checkout' })

  assert.equal(resumed.status, 'done')
  assert.equal(agentRunner.dispatches.length, 1)
  assert.deepEqual(tracking.journal('checkout').map((event) => event.type), [
    'run.started', 'step.started', 'step.recorded', 'phase.closed', 'run.finished',
  ])
})

test('a run interrupted before the researcher wrote anything dispatches the same attempt again, under the same label', async () => {
  const { tracking, clock, deps, agentRunner } = host()
  agentRunner.behaviours.push(interrupted, () => fill(tracking))
  await createInit(deps).init({ slug: 'checkout' })
  await assert.rejects(createRunPipeline(deps).run({ slug: 'checkout' }), /host interrupted/)
  clock.advance(60 * 60_000)

  const resumed = await createRunPipeline(deps).run({ slug: 'checkout' })

  assert.equal(resumed.status, 'done')
  assert.deepEqual(agentRunner.dispatches.map((dispatch) => dispatch.label), [
    'skraft checkout · research · attempt 1', 'skraft checkout · research · attempt 1',
  ])
  assert.equal(agentRunner.dispatches[0].prompt, agentRunner.dispatches[1].prompt)
  assert.equal(tracking.journal('checkout').filter((event) => event.type === 'step.started').length, 1)
})

test('init on an initialised slug keeps its journal and its story', async () => {
  const { tracking, deps } = host()
  await createInit(deps).init({ slug: 'checkout', story: { issue: 7, title: null } })

  const again = await createInit(deps).init({ slug: 'checkout', story: { issue: 8, title: 'Other' } })

  assert.deepEqual(again, { ok: true, slug: 'checkout', created: false, code: null, reason: 'checkout is the active pipeline' })
  assert.deepEqual(tracking.journal('checkout').map((event) => [event.type, event.story]), [['run.started', { issue: 7, title: null }]])
})
