import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { PLUGIN_ROOT, copilotHost, actsAs, simulatedContext, decideTool } from './simulated-host.mjs'
import { ADR_PATH, SLUG, pipelineRepository, scriptedLlm, TEST_COMMAND } from '../support/pipeline-repository.mjs'
import { journal } from '../support/workspace.mjs'

const REASON = 'use the bank gateway, not Stripe'
const host = (cwd) => copilotHost(cwd)
/** The phase agents' calls, the review lenses left out. */
const phaseCalls = (calls) => calls.filter((call) => !call.label.includes('_review · '))

test('the run pauses at the ratification; a rejection through skraft_decide sends the architect back on resume, and only it', async (t) => {
  const { cwd } = pipelineRepository(t)
  const llm = scriptedLlm({ cwd })
  const { ctx, calls, logs } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(llm) })

  await assert.rejects(runSkraftPipelineWorkflow(ctx, host(cwd)), { name: 'AbortError', message: 'paused at adr-1' })
  assert.ok(logs.includes(`Waiting for you — Ratify the Proposed ADRs ${ADR_PATH}? RATIFIED marks them Accepted; REJECTED sends DESIGN back with your reason.`), logs.join('\n'))

  const decide = decideTool(cwd)
  assert.equal(await decide.handler({ key: 'adr-1', answer: 'REJECTED' }), 'Refused: REJECTED needs the reason, which goes back to the agent; nothing was recorded.')
  assert.equal(await decide.handler({ key: 'adr-1', answer: 'REJECTED', reason: REASON }), `Recorded: ${SLUG}: adr-1 answered REJECTED; run the pipeline again to go on. Resume the paused skraft-pipeline run (/workflows).`)

  await assert.rejects(runSkraftPipelineWorkflow(ctx, host(cwd)), { name: 'AbortError', message: 'paused at adr-2' })

  const phases = phaseCalls(calls)
  assert.deepEqual(phases.map((call) => call.label), [`skraft ${SLUG} · research · attempt 1`, `skraft ${SLUG} · design · attempt 1`, `skraft ${SLUG} · design · pass 2 · attempt 1`])
  assert.ok(phases[2].prompt.endsWith(`A human refused the work of pass 1:\n- ${ADR_PATH}: ${REASON}`), phases[2].prompt)
})

test('a resumed run whose question is still open passes the pause and waits', async (t) => {
  const { cwd } = pipelineRepository(t)
  const { ctx } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(scriptedLlm({ cwd })) })
  await assert.rejects(runSkraftPipelineWorkflow(ctx, host(cwd)), { name: 'AbortError' })

  const outcome = await runSkraftPipelineWorkflow(ctx, host(cwd))

  assert.deepEqual({ status: outcome.status, code: outcome.code }, { status: 'waiting', code: 'adr-ratification' })
  assert.equal(journal(cwd, SLUG).filter((event) => event.type === 'question.asked').length, 1)
})

test('a gate the machine cannot run pauses the run on an environment question; RETRY on resume runs the gate again', async (t) => {
  const { cwd } = pipelineRepository(t)
  const { ctx, calls } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(scriptedLlm({ cwd })) })
  const decide = decideTool(cwd)
  await assert.rejects(runSkraftPipelineWorkflow(ctx, host(cwd)), { message: 'paused at adr-1' })
  await decide.handler({ key: 'adr-1', answer: 'RATIFIED' })
  const configPath = join(cwd, 'skraft-config.json')
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  const broken = { ...config, components: [{ ...config.components[0], commands: { test: TEST_COMMAND, build: 'skraft-missing-build' } }] }
  writeFileSync(configPath, JSON.stringify(broken))

  await assert.rejects(runSkraftPipelineWorkflow(ctx, host(cwd)), { message: 'paused at gates-1' })
  writeFileSync(configPath, JSON.stringify(config))
  await decide.handler({ key: 'gates-1', answer: 'RETRY' })
  const outcome = await runSkraftPipelineWorkflow(ctx, host(cwd))

  assert.equal(outcome.status, 'done')
  assert.equal(phaseCalls(calls).length, 4)
  assert.deepEqual(journal(cwd, SLUG).filter((event) => event.type === 'step.started' && event.step === 'gates').length, 1)
})
