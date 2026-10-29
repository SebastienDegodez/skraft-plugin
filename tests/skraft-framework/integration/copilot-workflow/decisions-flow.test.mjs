import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { PLUGIN_ROOT, copilotHost, actsAs, confirmingSession, simulatedContext, decideTool } from './simulated-host.mjs'
import { ADR, ADR_PATH, NOMINAL, SLUG, blocked, commit, fillOutputs, pipelineRepository, scriptedLlm, TEST_COMMAND, writeResult } from '../support/pipeline-repository.mjs'
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

test('a blocked architect pauses the run on its question; an instruction confirmed in Copilot sends it back with it on resume, and STOP ends the run', async (t) => {
  const { cwd } = pipelineRepository(t)
  const llm = scriptedLlm({ cwd, acts: { 'solution-architect': [blocked('which payment provider?'), blocked('still unsure')] } })
  const { ctx, calls, logs } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(llm) })
  const session = confirmingSession()
  const decide = decideTool(cwd, session)

  await assert.rejects(runSkraftPipelineWorkflow(ctx, host(cwd)), { name: 'AbortError', message: 'paused at design-1' })
  assert.equal(logs.at(-1), 'Answer design-1 with an instruction for the blocked step, or STOP: Copilot asks you to confirm it, or type skraft decide design-1 "<instruction>" in a terminal; then resume this run.')
  assert.equal(await decide.handler({ key: 'design-1', answer: 'x'.repeat(1001) }), 'Refused: an instruction is at most 1000 characters; nothing was recorded.')
  assert.equal(await decide.handler({ key: 'design-1', answer: 'Use the bank gateway' }), `Recorded: ${SLUG}: design-1 answered Use the bank gateway; run the pipeline again to go on. Resume the paused skraft-pipeline run (/workflows).`)
  assert.deepEqual(session.asked, [`skraft ${SLUG}: record Use the bank gateway as your answer to design-1?`])
  await assert.rejects(runSkraftPipelineWorkflow(ctx, host(cwd)), { name: 'AbortError', message: 'paused at design-2' })
  assert.equal((await decide.handler({ key: 'design-2', answer: 'stop' })).startsWith('Recorded: '), true)
  const outcome = await runSkraftPipelineWorkflow(ctx, host(cwd))

  assert.deepEqual([outcome.status, outcome.code, outcome.reason], ['blocked', 'agent-blocked', 'solution-architect is blocked: still unsure'])
  const phases = phaseCalls(calls)
  assert.deepEqual(phases.map((call) => call.label), [`skraft ${SLUG} · research · attempt 1`, `skraft ${SLUG} · design · attempt 1`, `skraft ${SLUG} · design · pass 2 · attempt 1`])
  assert.ok(phases[2].prompt.includes('\nA human refused the work of pass 1:\n- Use the bank gateway'), phases[2].prompt)
  assert.deepEqual(journal(cwd, SLUG).filter((event) => event.type === 'question.answered').map(({ key, answer, by }) => [key, answer, by]), [['design-1', 'Use the bank gateway', 'host-confirmed'], ['design-2', 'STOP', 'host-confirmed']])
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
  await decideTool(cwd).handler({ key: 'gates-1', answer: 'RETRY' })
  const outcome = await runSkraftPipelineWorkflow(ctx, host(cwd))

  assert.equal(outcome.status, 'done')
  assert.equal(phaseCalls(calls).length, 5)
  assert.deepEqual(journal(cwd, SLUG).filter((event) => event.type === 'step.started' && event.step === 'gates').length, 1)
})

test('an unpublished ADR the architect supersedes on the refused pass is refused; edited in place, it is asked again on resume', async (t) => {
  const { cwd } = pipelineRepository(t)
  const tokens = 'docs/adr/adr-002-card-tokens.md'
  const supersedes = (brief, { cwd: dir, slug }) => {
    fillOutputs(brief, 'Tokens.\n')
    commit(dir, `docs(${slug}): tokens supersede the card payment`, { [tokens]: ADR.replace('adr: 1', 'adr: 2').replace('supersedes: null', 'supersedes: ADR-001') })
    writeResult(brief, { status: 'done', summary: 'ADR-002 supersedes ADR-001' })
  }
  const inPlace = (brief, { cwd: dir, slug }) => {
    commit(dir, `docs(${slug}): card payment with tokens`, { [tokens]: null, [ADR_PATH]: `${ADR}\nWith tokens.\n` })
    writeResult(brief, { status: 'done', summary: 'ADR-001 edited in place' })
  }
  const llm = scriptedLlm({ cwd, acts: { 'solution-architect': [NOMINAL['solution-architect'], supersedes, inPlace] } })
  const { ctx, calls } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(llm) })
  const decide = decideTool(cwd)
  await assert.rejects(runSkraftPipelineWorkflow(ctx, host(cwd)), { message: 'paused at adr-1' })
  await decide.handler({ key: 'adr-1', answer: 'REJECTED', reason: 'tokens belong in ADR-001' })

  await assert.rejects(runSkraftPipelineWorkflow(ctx, host(cwd)), { message: 'paused at adr-2' })
  await decide.handler({ key: 'adr-2', answer: 'RATIFIED' })
  const outcome = await runSkraftPipelineWorkflow(ctx, host(cwd))

  assert.equal(outcome.status, 'done')
  const design = journal(cwd, SLUG).filter((event) => event.type === 'step.recorded' && event.step === 'design')
  assert.deepEqual(design.map(({ visit, attempt, code }) => [visit, attempt, code]), [[1, 1, null], [2, 1, 'adr-lifecycle'], [2, 2, null]])
  assert.deepEqual(design[1].failures, [`${tokens} supersedes ADR-001, which is not on the default branch yet: edit ${ADR_PATH} in place instead`])
  const retried = phaseCalls(calls).find((call) => call.label === `skraft ${SLUG} · design · pass 2 · attempt 2`).prompt
  assert.ok(retried.includes(`Refused in attempt 1 of 3:\n- ${tokens} supersedes ADR-001`), retried)
  assert.equal(journal(cwd, SLUG).filter((event) => event.type === 'question.asked' && event.key.startsWith('adr-')).length, 2)
  assert.match(readFileSync(join(cwd, ...ADR_PATH.split('/')), 'utf8'), /^status: Accepted$/m)
})
