import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInit } from '../../../../plugins/skraft-framework/engine/application/init.mjs'
import { createRunPipeline } from '../../../../plugins/skraft-framework/engine/application/run-pipeline.mjs'
import { createObserve } from '../../../../plugins/skraft-framework/engine/application/observe.mjs'
import {
  FakeHasher, FixedClock, InMemorySourceControl, InMemoryTemplates, InMemoryTracking, InMemoryWorkspace, RecordingProgress, ScriptedAgentRunner,
} from '../support/in-memory-host.mjs'

const OUTPUT = 'research/2026-10-11/checkout-research.md'

const host = () => {
  const tracking = new InMemoryTracking()
  const deps = {
    journal: tracking,
    activePipeline: tracking,
    files: tracking,
    workspace: new InMemoryWorkspace(),
    sourceControl: new InMemorySourceControl(),
    templates: new InMemoryTemplates({}),
    clock: new FixedClock('2026-10-11T09:00:00.000Z'),
    hasher: new FakeHasher(),
    agentRunner: new ScriptedAgentRunner(),
    progress: new RecordingProgress(),
  }
  return { tracking, deps }
}

test('the view of a working copy with no active pipeline says so', async () => {
  const { deps } = host()

  assert.deepEqual(await createObserve(deps).view(), {
    slug: null,
    status: 'idle',
    reason: 'no active pipeline in this working copy (.copilot-tracking/skraft-plans/.active-slug); start one with an explicit slug',
    phases: [{ phase: 'RESEARCH', state: 'pending' }],
    current: null,
    attempts: 0,
    costUsd: null,
  })
})

test('the view follows a run from its start to RESEARCH closed, with its cost', async () => {
  const { tracking, deps } = host()
  await createInit(deps).init({ slug: 'checkout' })
  assert.deepEqual(await createObserve(deps).view(), {
    slug: 'checkout', status: 'running', reason: '', phases: [{ phase: 'RESEARCH', state: 'pending' }], current: null, attempts: 0, costUsd: null,
  })

  const seen = []
  deps.agentRunner.behaviours.push(async () => {
    seen.push(await createObserve(deps).view())
    return { ok: true, text: 'no file', costUsd: 0.25 }
  }, async () => {
    await tracking.write('checkout', OUTPUT, 'Findings.\n')
    return { ok: true, text: 'done', costUsd: 0.5 }
  })
  await createRunPipeline(deps).run({})

  assert.deepEqual(seen, [{
    slug: 'checkout',
    status: 'running',
    reason: '',
    phases: [{ phase: 'RESEARCH', state: 'open' }],
    current: { step: 'research', phase: 'RESEARCH', agent: 'solution-researcher', attempt: 1 },
    attempts: 1,
    costUsd: null,
  }])
  assert.deepEqual(await createObserve(deps).view(), {
    slug: 'checkout', status: 'done', reason: 'RESEARCH closed', phases: [{ phase: 'RESEARCH', state: 'closed' }], current: null, attempts: 2, costUsd: 0.75,
  })
})

test('the view of a blocked run keeps the reason, and of a tampered journal says it is tampered', async () => {
  const { tracking, deps } = host()
  await createInit(deps).init({ slug: 'checkout' })
  deps.agentRunner.behaviours.push(() => undefined, () => undefined)
  const blocked = await createRunPipeline(deps).run({})

  const view = await createObserve(deps).view()
  assert.equal(view.status, 'blocked')
  assert.equal(view.reason, blocked.reason)
  assert.deepEqual(view.phases, [{ phase: 'RESEARCH', state: 'open' }])

  tracking.rewriteJournal('checkout', (lines) => lines.slice(1))
  const tampered = await createObserve(deps).view()
  assert.equal(tampered.status, 'tampered')
  assert.equal(tampered.reason, 'journal tampered: events.jsonl line 1 does not open the chain; restore the file or start a new slug')
})

test('the view of a run stopped on an agent the host cannot start says blocked, until the step resumes', async () => {
  const { tracking, deps } = host()
  await createInit(deps).init({ slug: 'checkout' })
  deps.agentRunner.behaviours.push(() => ({ ok: false, unavailable: true, text: '', error: 'not installed' }))
  await createRunPipeline(deps).run({})

  const stopped = await createObserve(deps).view()
  assert.equal(stopped.status, 'blocked')
  assert.equal(stopped.reason, 'not installed')

  deps.agentRunner.behaviours.push(() => tracking.write('checkout', OUTPUT, 'Findings.\n'))
  await createRunPipeline(deps).run({})
  assert.equal((await createObserve(deps).view()).status, 'done')
})
