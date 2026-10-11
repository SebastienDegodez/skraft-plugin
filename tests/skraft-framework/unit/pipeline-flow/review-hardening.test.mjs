import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInit } from '../../../../plugins/skraft-framework/engine/application/init.mjs'
import { createRunPipeline } from '../../../../plugins/skraft-framework/engine/application/run-pipeline.mjs'
import { openJournal } from '../../../../plugins/skraft-framework/engine/application/run-journal.mjs'
import { createObserve } from '../../../../plugins/skraft-framework/engine/application/observe.mjs'
import { DEFAULT_PIPELINE } from '../../../../plugins/skraft-framework/engine/domain/pipeline/pipeline-definition.mjs'
import {
  FakeHasher, FixedClock, InMemoryTemplates, InMemoryTracking, RecordingProgress, ScriptedAgentRunner,
} from '../support/in-memory-host.mjs'

const TEMPLATE = '# Research: {{topic}}\n## Approaches\n{{approach_A}}\n'
const OUTPUT = 'research/2026-10-11/checkout-research.md'

const host = (iso = '2026-10-11T09:00:00.000Z') => {
  const tracking = new InMemoryTracking()
  const deps = {
    journal: tracking,
    activePipeline: tracking,
    files: tracking,
    templates: new InMemoryTemplates({ 'research.template.md': TEMPLATE }),
    clock: new FixedClock(iso),
    hasher: new FakeHasher(),
    agentRunner: new ScriptedAgentRunner(),
    progress: new RecordingProgress(),
  }
  return { tracking, deps, agentRunner: deps.agentRunner }
}

const started = async (deps) => {
  await createInit(deps).init({ slug: 'checkout' })
  return createRunPipeline(deps)
}

test('a document with a template placeholder left counts as missing', async () => {
  const { tracking, deps, agentRunner } = host()
  agentRunner.behaviours.push(
    () => tracking.write('checkout', OUTPUT, TEMPLATE.replace('{{topic}}', 'Checkout')),
    () => tracking.write('checkout', OUTPUT, '# Research: Checkout\n## Approaches\nCard first.\n'),
  )

  const outcome = await (await started(deps)).run({})

  assert.equal(outcome.status, 'done')
  assert.deepEqual(tracking.journal('checkout').filter((event) => event.type === 'step.recorded').map((event) => event.outcome), ['missing-outputs', 'outputs-complete'])
})

test('an agent that stops without an answer and without its document stops the run; the next run resumes the attempt', async () => {
  const { tracking, deps, agentRunner } = host()
  agentRunner.behaviours.push(() => ({ ok: false, text: '', error: 'aborted by the user' }))

  const outcome = await (await started(deps)).run({})

  assert.deepEqual(outcome, {
    status: 'blocked', slug: 'checkout', phase: 'RESEARCH', code: 'agent-failed', reason: 'solution-researcher stopped without finishing: aborted by the user',
  })
  assert.deepEqual(tracking.journal('checkout').map((event) => event.type), ['run.started', 'step.started', 'run.stopped'])
  assert.equal((await createObserve(deps).view()).status, 'blocked')

  agentRunner.behaviours.push(() => ({ ok: false, text: '' }), () => tracking.write('checkout', OUTPUT, 'Findings.\n'))
  assert.equal((await createRunPipeline(deps).run({})).reason, 'solution-researcher stopped without finishing: no answer')
  assert.equal((await createRunPipeline(deps).run({})).status, 'done')
  assert.deepEqual(agentRunner.dispatches.map((dispatch) => dispatch.label), Array(3).fill('skraft checkout · research · attempt 1'))
})

test('an agent that answers nothing but left its document filled closes the phase', async () => {
  const { tracking, deps, agentRunner } = host()
  agentRunner.behaviours.push(async () => { await tracking.write('checkout', OUTPUT, 'Findings.\n'); return { ok: false, text: '' } })

  assert.equal((await (await started(deps)).run({})).status, 'done')
})

test('a run whose journal another writer appended to meanwhile stops without breaking the chain', async () => {
  const { tracking, deps, agentRunner } = host()
  await createInit(deps).init({ slug: 'checkout' })
  agentRunner.behaviours.push(async () => {
    const other = await openJournal(deps, 'checkout')
    assert.equal(other.ok, true)
    if (other.ok) await other.journal.append('decision.recorded', { key: 'other-session' })
    await tracking.write('checkout', OUTPUT, 'Findings.\n')
  })

  const outcome = await createRunPipeline(deps).run({})

  assert.deepEqual(outcome, {
    status: 'blocked', slug: 'checkout', phase: null, code: 'journal-changed', reason: 'checkout: another run wrote events.jsonl meanwhile; run again once it stops',
  })
  assert.deepEqual(tracking.journal('checkout').map((event) => event.type), ['run.started', 'step.started', 'decision.recorded'])
  assert.equal((await createObserve(deps).view()).status, 'running')
  assert.equal((await createRunPipeline(deps).run({})).status, 'done')
})

test('a journal shortened by another writer meanwhile is a conflict too', async () => {
  const { tracking, deps, agentRunner } = host()
  await createInit(deps).init({ slug: 'checkout' })
  agentRunner.behaviours.push(() => tracking.rewriteJournal('checkout', (lines) => lines.slice(0, 1)))

  assert.equal((await createRunPipeline(deps).run({})).code, 'journal-changed')
})

test('a retry after midnight keeps the path of the first attempt', async () => {
  const { tracking, deps, agentRunner } = host('2026-10-11T23:59:00.000Z')
  agentRunner.behaviours.push(() => { deps.clock.advance(120_000) }, () => tracking.write('checkout', OUTPUT, 'Findings.\n'))

  const outcome = await (await started(deps)).run({})

  assert.equal(outcome.status, 'done')
  assert.deepEqual(tracking.journal('checkout').filter((event) => event.type === 'step.started').map((event) => event.outputs), [[OUTPUT], [OUTPUT]])
  assert.ok(![...tracking.files.keys()].some((key) => key.includes('2026-10-12')))
})

test('a run that reaches a later phase is no longer finished: the next run.finished closes it', async () => {
  const { tracking, deps, agentRunner } = host()
  agentRunner.behaviours.push(() => tracking.write('checkout', OUTPUT, 'Findings.\n'))
  await (await started(deps)).run({})
  const longer = {
    phases: [...DEFAULT_PIPELINE.phases, {
      phase: 'DESIGN',
      steps: [{ id: 'design', kind: 'dispatch', agent: 'solution-architect', outputs: [{ path: 'design/{date}/{slug}-design.md', template: null }], maxAttempts: 2 }],
    }],
  }
  const seen = []
  agentRunner.behaviours.push(async () => {
    seen.push((await createObserve(deps, longer).view()).status)
    await tracking.write('checkout', 'design/2026-10-11/checkout-design.md', 'Design.\n')
  })

  const outcome = await createRunPipeline(deps, longer).run({})

  assert.deepEqual(outcome, { status: 'done', slug: 'checkout', phase: 'DESIGN', code: null, reason: 'DESIGN closed' })
  assert.deepEqual(seen, ['running'])
  assert.deepEqual(tracking.journal('checkout').filter((event) => event.type === 'run.finished').map((event) => event.reason), ['RESEARCH closed', 'DESIGN closed'])
})

test('an output without a template is not pre-created and counts once written', async () => {
  const { tracking, deps, agentRunner } = host()
  const bare = { phases: [{ phase: 'RESEARCH', steps: [{ id: 'notes', kind: 'dispatch', agent: 'solution-researcher', outputs: [{ path: 'notes/{slug}.md', template: null }], maxAttempts: 1 }] }] }
  const seen = []
  agentRunner.behaviours.push(async () => { seen.push(await tracking.read('checkout', 'notes/checkout.md')) })
  await createInit(deps).init({ slug: 'checkout' })

  const outcome = await createRunPipeline(deps, bare).run({})

  assert.deepEqual(seen, [null])
  assert.equal(outcome.code, 'missing-outputs')
  assert.equal(outcome.reason, 'solution-researcher left required outputs missing after 1 attempts: /work/.copilot-tracking/skraft-plans/checkout/notes/checkout.md')
})

test('a document already there is not overwritten by the template before the dispatch', async () => {
  const { tracking, deps, agentRunner } = host()
  await tracking.write('checkout', OUTPUT, 'Earlier findings.\n')
  const seen = []
  agentRunner.behaviours.push(async () => { seen.push(await tracking.read('checkout', OUTPUT)) })

  await (await started(deps)).run({})

  assert.deepEqual(seen, ['Earlier findings.\n'])
})

test('a blocked run run again writes nothing more', async () => {
  const { tracking, deps, agentRunner } = host()
  agentRunner.behaviours.push(() => undefined, () => undefined)
  const first = await (await started(deps)).run({})
  const lines = await tracking.lines('checkout')

  const again = await createRunPipeline(deps).run({})

  assert.deepEqual(again, first)
  assert.deepEqual(await tracking.lines('checkout'), lines)
})

test('an empty pipeline definition has nothing to run', async () => {
  const { tracking, deps } = host()
  await createInit(deps).init({ slug: 'checkout' })

  const outcome = await createRunPipeline(deps, { phases: [] }).run({})

  assert.deepEqual(outcome, { status: 'done', slug: 'checkout', phase: null, code: null, reason: 'nothing to run' })
  assert.deepEqual(tracking.journal('checkout').at(-1).status, 'incomplete')
})
