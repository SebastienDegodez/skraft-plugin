import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInit } from '../../../../plugins/skraft-framework/engine/application/pipeline/init-usecase.mjs'
import { createRunPipeline } from '../../../../plugins/skraft-framework/engine/application/pipeline/run-pipeline-usecase.mjs'
import {
  FakeHasher, FixedClock, InMemorySourceControl, InMemoryTemplates, InMemoryTracking, InMemoryWorkspace, InMemoryUserSettings, RecordingProgress, ScriptedAgentRunner, InMemoryAgentCatalog, InMemoryWorkflowSource,
} from '../support/in-memory-host.mjs'

const host = () => {
  const tracking = new InMemoryTracking()
  const deps = {
    journal: tracking,
    activePipeline: tracking,
    files: tracking,
    workspace: new InMemoryWorkspace(),
    userSettings: new InMemoryUserSettings(),
    sourceControl: new InMemorySourceControl(),
    templates: new InMemoryTemplates({}),
    clock: new FixedClock('2026-10-11T09:00:00.000Z'),
    hasher: new FakeHasher(), workflowSource: new InMemoryWorkflowSource(), agentCatalog: new InMemoryAgentCatalog(),
    agentRunner: new ScriptedAgentRunner(),
    progress: new RecordingProgress(),
  }
  return { tracking, deps }
}

test('without an active pipeline a run is refused, never guessed from the slugs on disk', async () => {
  const { tracking, deps } = host()
  await tracking.write('checkout', 'events.jsonl', '')

  const outcome = await createRunPipeline(deps).run({})

  assert.deepEqual(outcome, {
    status: 'refused',
    slug: null,
    phase: null,
    code: 'no-active-pipeline',
    reason: 'no active pipeline in this working copy (.copilot-tracking/skraft-plans/.active-slug); start one with an explicit slug',
  })
  assert.deepEqual(deps.agentRunner.dispatches, [])
  assert.equal(tracking.activeSlug, null)
})

test('a slug other than the active pipeline is refused', async () => {
  const { deps } = host()
  await createInit(deps).init({ slug: 'checkout' })

  const outcome = await createRunPipeline(deps).run({ slug: 'refund' })

  assert.deepEqual(outcome, {
    status: 'refused',
    slug: 'refund',
    phase: null,
    code: 'slug-mismatch',
    reason: 'the active pipeline of this working copy is checkout, not refund; switch with an explicit init',
  })
})

test('an active slug without a journal is refused', async () => {
  const { tracking, deps } = host()
  await tracking.activate('checkout')

  const outcome = await createRunPipeline(deps).run({})

  assert.equal(outcome.code, 'not-initialised')
  assert.equal(outcome.reason, 'checkout has no journal (events.jsonl); start it with an explicit init')
})

test('init refuses a slug that is not kebab-case and changes nothing', async () => {
  const { tracking, deps } = host()

  for (const slug of ['Checkout', 'check out', '../x', '', undefined, 'a--b', '-a']) {
    const outcome = await createInit(deps).init({ slug })
    assert.deepEqual(outcome, { ok: false, slug: slug ?? null, created: false, code: 'invalid-slug', reason: `slug must be kebab-case, got ${JSON.stringify(slug ?? null)}` })
  }
  assert.equal(tracking.activeSlug, null)
  assert.equal(tracking.files.size, 0)
})

test('init makes the slug the active pipeline, switching from another one', async () => {
  const { tracking, deps } = host()
  await createInit(deps).init({ slug: 'checkout' })

  const outcome = await createInit(deps).init({ slug: 'refund-v2' })

  assert.deepEqual(outcome, { ok: true, slug: 'refund-v2', created: true, code: null, reason: 'refund-v2 is the active pipeline' })
  assert.equal(tracking.activeSlug, 'refund-v2')
  assert.equal(tracking.journal('refund-v2')[0].type, 'run.started')
  assert.equal(tracking.journal('refund-v2')[0].workflow, 'skraft')
  assert.deepEqual(tracking.journal('refund-v2')[0].story, null)
})
