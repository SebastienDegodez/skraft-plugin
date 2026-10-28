import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow, SKRAFT_PIPELINE_META } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import {
  PLUGIN_ROOT, TEMPLATE_PATH, copilotHost, eventsPath, fillsOutputs, journalEvents, journalLines, simulatedContext, stops, trackingDir, workingCopy, writesNothing,
} from './simulated-host.mjs'
import { leaseLeftToExpire } from '../support/lease.mjs'
import { repositoryOnForge } from '../support/issue-forge.mjs'

const host = (cwd) => copilotHost(cwd)

/** The absolute path of the first output the journal's first step.started names. */
const researchPath = async (cwd, slug) => {
  const started = (await journalEvents(cwd, slug)).find((event) => event.type === 'step.started' && event.step === 'research')
  return join(trackingDir(cwd, slug), ...started.outputs[0].split('/'))
}

// The workflow process dies while the agent runs: ctx.agent never settles.
const interrupted = (behaviour) => async (call) => {
  await behaviour(call)
  return new Promise(() => {})
}
/**
 * The run never settles once its agent is called: a resumed run starts from what the journal
 * holds, once the lease the dead run left expired. Waits for that call, however long starting
 * git takes on the host.
 */
const dies = async (run, { calls }, cwd) => {
  const deadline = Date.now() + 10_000
  while (calls.length === 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10))
  const settled = await Promise.race([run.then(() => 'settled', () => 'settled'), new Promise((resolve) => setTimeout(resolve, 50, 'hung'))])
  assert.equal(settled, 'hung')
  await leaseLeftToExpire(cwd, 'checkout')
}

/** The journal of a run that closed RESEARCH and stopped at a blocked architect. */
const STOPPED_IN_DESIGN = ['run.started', 'step.started', 'step.recorded', 'step.started', 'step.recorded', 'step.started', 'step.recorded', 'phase.closed', 'step.started', 'step.recorded', 'run.finished']
const ARCHITECT_BLOCKED = 'solution-architect is blocked: needs a decision on the payment provider'

test('the workflow declares skraft-pipeline with its five phases and optional arguments', () => {
  assert.equal(SKRAFT_PIPELINE_META.name, 'skraft-pipeline')
  assert.deepEqual(SKRAFT_PIPELINE_META.phases.map(({ title, detail }) => `${title}: ${detail}`), [
    'RESEARCH: Solution Researcher', 'DESIGN: Solution Architect', 'DISTILL: Acceptance Designer', 'DELIVER: Software Engineer and gates', 'PUBLISH: PR Writer and the pull request',
  ])
  assert.deepEqual(SKRAFT_PIPELINE_META.argsSchema.required, undefined)
  assert.deepEqual(
    Object.entries(SKRAFT_PIPELINE_META.argsSchema.properties).map(([name, { type }]) => `${name}: ${type}`),
    ['slug: string', 'issue: integer', 'title: string', 'base: string', 'fromArtifacts: boolean', 'agentIds: object'],
  )
})

test('a new slug dispatches the researcher with its output pre-created from the template', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  repositoryOnForge(t, cwd)
  const template = await readFile(TEMPLATE_PATH, 'utf8')
  const seen = []
  const { ctx, calls } = simulatedContext({
    args: { slug: 'checkout', issue: 42, title: 'Pay by card' },
    behaviours: [async (call) => { seen.push(await readFile(call.outputs[0], 'utf8')); return fillsOutputs()(call) }, stops()],
  })

  await runSkraftPipelineWorkflow(ctx, host(cwd))

  const path = await researchPath(cwd, 'checkout')
  assert.deepEqual(calls.map((call) => call.agent), ['skraft:solution-researcher', 'skraft:solution-architect'])
  assert.deepEqual(calls[0].outputs, [path])
  assert.ok(calls[0].prompt.includes(`- ${path}`))
  assert.ok(calls[0].prompt.includes('- Story: #42 — Pay by card'))
  assert.equal(calls[0].label, 'skraft checkout · research · attempt 1')
  assert.equal(calls[0].agent, 'skraft:solution-researcher')
  assert.deepEqual(seen, [template])
  assert.equal((await readFile(join(cwd, '.copilot-tracking', 'skraft-plans', '.active-slug'), 'utf8')).trim(), 'checkout')
})

test('an issue number that is not positive names no issue, and an empty title no title: the run starts on what is left of the story, as the mod does', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const story = async (slug, issue, title) => {
    const { ctx } = simulatedContext({ args: { slug, issue, title }, behaviours: [stops()] })
    await runSkraftPipelineWorkflow(ctx, host(cwd))
    return (await journalEvents(cwd, slug))[0].story
  }

  assert.deepEqual(
    [await story('pay-zero', 0, 'Pay by card'), await story('pay-below', -3, 'Pay by card'), await story('pay-untitled', 0, '')],
    [{ issue: null, title: 'Pay by card' }, { issue: null, title: 'Pay by card' }, null],
  )
})

test('a filled output and a done result close RESEARCH; a blocked architect then stops the run in DESIGN', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const { ctx, logs } = simulatedContext({ args: { slug: 'checkout' }, behaviours: [fillsOutputs(), stops()] })

  const outcome = await runSkraftPipelineWorkflow(ctx, host(cwd))

  assert.deepEqual(outcome, { status: 'blocked', slug: 'checkout', phase: 'DESIGN', code: 'agent-blocked', reason: ARCHITECT_BLOCKED })
  const events = await journalEvents(cwd, 'checkout')
  assert.deepEqual(events.map((event) => event.type), STOPPED_IN_DESIGN)
  assert.deepEqual(events[0].story, null)
  assert.deepEqual(events.filter((event) => event.type === 'phase.closed').map((event) => event.phase), ['RESEARCH'])
  assert.deepEqual(logs.filter((line) => line.startsWith('phase ')), ['phase RESEARCH', 'phase DESIGN'])
  assert.ok(logs.includes('checkout: RESEARCH closed'))
  assert.equal(logs.at(-1), `checkout: blocked (agent-blocked): ${ARCHITECT_BLOCKED}`)
})

test('an absent output is dispatched again with its path listed missing; the same failure twice blocks the run', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const { ctx, calls, logs } = simulatedContext({ args: { slug: 'checkout' }, behaviours: [writesNothing, writesNothing] })

  const outcome = await runSkraftPipelineWorkflow(ctx, host(cwd))

  const path = await researchPath(cwd, 'checkout')
  assert.equal(calls.length, 2)
  assert.deepEqual(calls.map((call) => call.label), ['skraft checkout · research · attempt 1', 'skraft checkout · research · attempt 2'])
  assert.ok(!calls[0].prompt.includes('Missing outputs'))
  assert.ok(calls[1].prompt.includes(`Missing outputs from attempt 1 of 3:\n- ${path}`), calls[1].prompt)
  assert.ok(calls[1].prompt.includes(`Refused in attempt 1 of 3:\n- result is missing`), calls[1].prompt)
  assert.equal(outcome.status, 'blocked')
  assert.equal(outcome.code, 'missing-outputs')
  assert.ok(outcome.reason.startsWith(`solution-researcher failed the same way on attempts 1 and 2: missing outputs: ${path}; result `), outcome.reason)
  assert.equal(logs.at(-1), `checkout: blocked (missing-outputs): ${outcome.reason}`)
})

test('a journal edited by hand blocks the run as tampered and dispatches nothing', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const first = simulatedContext({ args: { slug: 'checkout' }, behaviours: [interrupted(writesNothing)] })
  await dies(runSkraftPipelineWorkflow(first.ctx, host(cwd)), first, cwd)
  const lines = await journalLines(cwd, 'checkout')
  lines[0] = lines[0].replace('"story":null', '"story":{"issue":7}')
  await writeFile(eventsPath(cwd, 'checkout'), `${lines.join('\n')}\n`, 'utf8')

  for (const args of [{}, { slug: 'checkout' }]) {
    const { ctx, calls } = simulatedContext({ args, journal: first.journal })
    const outcome = await runSkraftPipelineWorkflow(ctx, host(cwd))
    assert.equal(outcome.status, 'blocked')
    assert.equal(outcome.code, 'journal-tampered')
    assert.equal(outcome.slug, 'checkout')
    assert.match(outcome.reason, /line 2 does not chain to line 1/)
    assert.equal(calls.length, 0)
  }
})

test('without an active pipeline nor a slug the run is refused and creates nothing', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const { ctx, calls } = simulatedContext()

  const outcome = await runSkraftPipelineWorkflow(ctx, host(cwd))

  assert.equal(outcome.status, 'refused')
  assert.equal(outcome.code, 'no-active-pipeline')
  assert.equal(calls.length, 0)
  assert.equal(existsSync(join(cwd, '.copilot-tracking')), false)
})

test('a slug that is not kebab-case is refused and creates nothing', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const { ctx, calls, logs } = simulatedContext({ args: { slug: 'Check Out' } })

  const outcome = await runSkraftPipelineWorkflow(ctx, host(cwd))

  assert.deepEqual(outcome, { status: 'refused', slug: null, phase: null, code: 'invalid-slug', reason: 'slug must be kebab-case: lowercase letters and digits, joined by single hyphens' })
  assert.equal(calls.length, 0)
  assert.equal(existsSync(join(cwd, '.copilot-tracking')), false)
  assert.equal(logs.at(-1), 'skraft: refused (invalid-slug): slug must be kebab-case: lowercase letters and digits, joined by single hyphens')
})

test('a run resumed after the researcher wrote its document closes RESEARCH without dispatching it again', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const first = simulatedContext({ args: { slug: 'checkout' }, behaviours: [interrupted(fillsOutputs())] })
  await dies(runSkraftPipelineWorkflow(first.ctx, host(cwd)), first, cwd)

  const resumed = simulatedContext({ args: { slug: 'checkout' }, journal: first.journal, behaviours: [stops()] })
  const outcome = await runSkraftPipelineWorkflow(resumed.ctx, host(cwd))

  assert.equal(outcome.reason, ARCHITECT_BLOCKED)
  assert.equal(first.calls.length, 1)
  assert.deepEqual(resumed.calls.map((call) => call.label), ['skraft checkout · design · attempt 1'])
  assert.deepEqual((await journalEvents(cwd, 'checkout')).map((event) => event.type), STOPPED_IN_DESIGN)
})

test('a resumed dispatch keeps its label and prompt, so the host returns its memoised answer', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const first = simulatedContext({ args: { slug: 'checkout' }, behaviours: [interrupted(writesNothing)] })
  await dies(runSkraftPipelineWorkflow(first.ctx, host(cwd)), first, cwd)
  const answered = [{ ...first.calls[0], text: 'already answered' }]

  const resumed = simulatedContext({ journal: answered, behaviours: [fillsOutputs(), stops()] })
  const outcome = await runSkraftPipelineWorkflow(resumed.ctx, host(cwd))

  assert.equal(outcome.reason, ARCHITECT_BLOCKED)
  assert.deepEqual(resumed.calls.map((call) => call.label), ['skraft checkout · research · attempt 2', 'skraft checkout · design · attempt 1'])
})

test('each journal line chains to the lowercase hex SHA-256 of the line before it', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const { ctx } = simulatedContext({ args: { slug: 'checkout' }, behaviours: [fillsOutputs(), stops()] })
  await runSkraftPipelineWorkflow(ctx, host(cwd))

  const lines = await journalLines(cwd, 'checkout')
  const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex')
  assert.equal(lines.length, STOPPED_IN_DESIGN.length)
  assert.deepEqual(lines.map((line) => JSON.parse(line).prev), [null, ...lines.slice(0, -1).map(sha256)])
})
