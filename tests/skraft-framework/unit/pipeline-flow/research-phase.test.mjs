import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInit } from '../../../../plugins/skraft-framework/engine/application/init.mjs'
import { createRunPipeline } from '../../../../plugins/skraft-framework/engine/application/run-pipeline.mjs'
import { InMemoryTemplates, InMemoryTracking, RecordingProgress, ScriptedAgentRunner, inMemoryDeps } from '../support/in-memory-host.mjs'

const TEMPLATE = '<!-- markdownlint-disable-file -->\n# Research: {{topic}}\n'
const OUTPUT = 'research/2026-10-11/checkout-research.md'
const OUTPUT_PATH = `/work/.copilot-tracking/skraft-plans/checkout/${OUTPUT}`

const hostWith = (behaviours) => {
  const tracking = new InMemoryTracking()
  const agentRunner = new ScriptedAgentRunner(behaviours)
  const progress = new RecordingProgress()
  const templates = new InMemoryTemplates({ 'research.template.md': TEMPLATE })
  const deps = inMemoryDeps({ tracking, agentRunner, progress, templates, now: '2026-10-11T09:00:00.000Z' })
  return { tracking, agentRunner, progress, deps }
}

const researchWritten = (tracking) => () => tracking.write('checkout', OUTPUT, `${TEMPLATE.replace('{{topic}}', 'Pay by card')}\n## Key discoveries\nThe cart lives in src/cart.\n`)
const nothingWritten = () => undefined

const startCheckout = async (deps, story = { issue: 42, title: 'Pay by card' }) => {
  const initialised = await createInit(deps).init({ slug: 'checkout', story })
  assert.equal(initialised.ok, true, initialised.reason)
  return createRunPipeline(deps).run({ slug: 'checkout' })
}

test('a new slug dispatches the researcher once its research document exists, pre-created from the template', async () => {
  const seen = []
  const { tracking, agentRunner, deps } = hostWith([
    async (dispatch) => {
      seen.push(await tracking.read('checkout', OUTPUT))
      return researchWritten(tracking)()
    },
  ])

  await startCheckout(deps)

  assert.deepEqual(seen, [TEMPLATE])
  const [dispatch] = agentRunner.dispatches
  assert.equal(dispatch.agent, 'solution-researcher')
  assert.equal(dispatch.label, 'skraft checkout · research · attempt 1')
  assert.match(dispatch.prompt, /RESEARCH/)
  assert.ok(dispatch.prompt.includes(`- ${OUTPUT_PATH}`), dispatch.prompt)
  assert.ok(dispatch.prompt.includes('Story: #42 — Pay by card'), dispatch.prompt)
  assert.ok(dispatch.prompt.includes('Feature scope: checkout'), dispatch.prompt)
  assert.deepEqual(
    tracking.journal('checkout').filter((event) => event.type === 'step.started').map(({ step, phase, agent, attempt, outputs }) => ({ step, phase, agent, attempt, outputs })),
    [{ step: 'research', phase: 'RESEARCH', agent: 'solution-researcher', attempt: 1, outputs: [OUTPUT] }],
  )
})

test('a filled research document closes RESEARCH and ends the run, incomplete until the later phases exist', async () => {
  const { tracking, agentRunner, progress, deps } = hostWith([])
  agentRunner.behaviours.push(researchWritten(tracking))

  const outcome = await startCheckout(deps)

  assert.deepEqual(outcome, { status: 'done', slug: 'checkout', phase: 'RESEARCH', code: null, reason: 'RESEARCH closed' })
  assert.deepEqual(tracking.journal('checkout').map((event) => event.type), [
    'run.started', 'step.started', 'step.recorded', 'phase.closed', 'run.finished',
  ])
  const [started, , recorded, closed, finished] = tracking.journal('checkout')
  assert.deepEqual(started.story, { issue: 42, title: 'Pay by card' })
  assert.equal(started.slug, 'checkout')
  assert.equal(recorded.outcome, 'outputs-complete')
  assert.deepEqual(recorded.missing, [])
  assert.equal('cost' in recorded, false)
  assert.equal(closed.phase, 'RESEARCH')
  assert.equal(finished.status, 'incomplete')
  assert.deepEqual(progress.lines, [
    'phase RESEARCH',
    'checkout: solution-researcher, attempt 1',
    'checkout: RESEARCH closed',
  ])
})

test('a missing research document is asked again with the missing paths, then the run stops at the ceiling', async () => {
  const { tracking, agentRunner, deps } = hostWith([nothingWritten, nothingWritten])

  const outcome = await startCheckout(deps)

  assert.equal(agentRunner.dispatches.length, 2)
  assert.equal(agentRunner.dispatches[1].label, 'skraft checkout · research · attempt 2')
  const brief = (attempt) => [
    '## Skraft dispatch: solution-researcher (RESEARCH)',
    '- Story: #42 — Pay by card',
    '- Feature scope: checkout',
    `- Attempt: ${attempt} of 2`,
    '- Fill each output in place. The engine pre-created it from its template; keep the path, create no other copy:',
    `- ${OUTPUT_PATH}`,
  ]
  assert.equal(agentRunner.dispatches[0].prompt, brief(1).join('\n'))
  assert.equal(agentRunner.dispatches[1].prompt, [...brief(2), '', 'Missing outputs from attempt 1 of 2:', `- ${OUTPUT_PATH}`].join('\n'))
  assert.equal(outcome.status, 'blocked')
  assert.equal(outcome.code, 'missing-outputs')
  assert.equal(outcome.reason, `solution-researcher left required outputs missing after 2 attempts: ${OUTPUT_PATH}`)
  const events = tracking.journal('checkout')
  assert.deepEqual(events.filter((event) => event.type === 'step.recorded').map((event) => event.missing), [[OUTPUT], [OUTPUT]])
  assert.deepEqual(events.at(-1), { ...events.at(-1), type: 'run.finished', status: 'blocked', reason: outcome.reason })
  assert.ok(!events.some((event) => event.type === 'phase.closed'))
})

test('a research document left as its template, or deleted, counts as missing', async () => {
  const left = hostWith([nothingWritten, nothingWritten])
  assert.equal((await startCheckout(left.deps)).code, 'missing-outputs')
  assert.equal(await left.tracking.read('checkout', OUTPUT), TEMPLATE)

  const deleted = hostWith([() => { deleted.tracking.files.delete(`checkout/${OUTPUT}`) }, nothingWritten])
  const outcome = await startCheckout(deleted.deps)
  assert.equal(outcome.code, 'missing-outputs')

  const blank = hostWith([() => blank.tracking.write('checkout', OUTPUT, '  \n'), nothingWritten])
  assert.equal((await startCheckout(blank.deps)).code, 'missing-outputs')

  const plain = hostWith([nothingWritten, nothingWritten])
  plain.deps.templates = new InMemoryTemplates({ 'research.template.md': '# Research\n' })
  assert.equal((await startCheckout(plain.deps)).code, 'missing-outputs')
})

test('a second attempt that fills the document closes the phase after one retry', async () => {
  const { tracking, agentRunner, progress, deps } = hostWith([nothingWritten])
  agentRunner.behaviours.push(researchWritten(tracking))

  const outcome = await startCheckout(deps)

  assert.equal(outcome.status, 'done')
  assert.deepEqual(tracking.journal('checkout').filter((event) => event.type === 'step.started').map((event) => event.attempt), [1, 2])
  assert.deepEqual(progress.lines, [
    'phase RESEARCH',
    'checkout: solution-researcher, attempt 1',
    'checkout: solution-researcher, attempt 2',
    'checkout: RESEARCH closed',
  ])
})

test('an agent the host cannot start blocks the run without spending the attempt', async () => {
  const { tracking, agentRunner, deps } = hostWith([
    () => ({ ok: false, unavailable: true, text: '', error: 'agent "solution-researcher" is not installed' }),
  ])

  const outcome = await startCheckout(deps)

  assert.deepEqual(outcome, {
    status: 'blocked', slug: 'checkout', phase: 'RESEARCH', code: 'agent-unavailable', reason: 'agent "solution-researcher" is not installed',
  })
  assert.deepEqual(tracking.journal('checkout').map((event) => event.type), ['run.started', 'step.started', 'run.stopped'])
  assert.equal(tracking.journal('checkout')[2].code, 'agent-unavailable')

  agentRunner.behaviours.push(researchWritten(tracking))
  const resumed = await createRunPipeline(deps).run({ slug: 'checkout' })
  assert.equal(resumed.status, 'done')
  assert.deepEqual(agentRunner.dispatches.map((dispatch) => dispatch.label), [
    'skraft checkout · research · attempt 1', 'skraft checkout · research · attempt 1',
  ])
})

test('the step records what the dispatch cost and how long it took', async () => {
  const { tracking, deps } = hostWith([])
  deps.agentRunner.behaviours.push(async () => {
    deps.clock.advance(90_000)
    await researchWritten(tracking)()
    return { ok: true, text: 'done', costUsd: 0.42 }
  })

  await startCheckout(deps, null)

  const recorded = tracking.journal('checkout').find((event) => event.type === 'step.recorded')
  assert.equal(recorded.durationMs, 90_000)
  assert.equal(recorded.cost, 0.42)
  assert.ok(deps.agentRunner.dispatches[0].prompt.includes('Story: none'))
})
