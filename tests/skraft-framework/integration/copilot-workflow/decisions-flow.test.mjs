import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { PLUGIN_ROOT, copilotHost, actsAs, answeringSession, simulatedContext, decideTool } from './simulated-host.mjs'
import { ADR, ADR_PATH, decisionsIndex, INDEX_PATH, NOMINAL, SLUG, blocked, commit, fillOutputs, pipelineRepository, scriptedLlm, TEST_COMMAND, writeResult } from '../support/pipeline-repository.mjs'
import { journal } from '../support/workspace.mjs'

const REASON = 'use the bank gateway, not Stripe'
const host = (cwd) => copilotHost(cwd)
/** The phase agents' calls, the review lenses left out. */
const phaseCalls = (calls) => calls.filter((call) => !call.label.includes('_review · '))

test('each question is put to the person once, as a choice among its options in Copilot; the choice is the answer, journaled host-confirmed, and the run goes on without pausing', async (t) => {
  const { cwd } = pipelineRepository(t)
  const { ctx, logs } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(scriptedLlm({ cwd })) })
  const session = answeringSession({ answers: ['RATIFIED'] })

  const outcome = await runSkraftPipelineWorkflow(ctx, copilotHost(cwd, PLUGIN_ROOT, session))

  assert.equal(outcome.status, 'done')
  assert.deepEqual(session.asked, [{ kind: 'select', message: `Ratify the Proposed ADRs ${ADR_PATH}? RATIFIED marks them Accepted; REJECTED sends DESIGN back with your reason.`, options: ['RATIFIED', 'REJECTED'] }])
  assert.deepEqual(journal(cwd, SLUG).filter((event) => event.type === 'question.answered').map(({ key, answer, reason, by }) => [key, answer, reason, by]), [['adr-1', 'RATIFIED', null, 'host-confirmed']])
  assert.equal(logs.some((line) => line.startsWith('Waiting for you')), false, logs.join('\n'))
})

test('a refusal chosen in Copilot asks its reason next, in a text field; the architect gets it back in the same run', async (t) => {
  const { cwd } = pipelineRepository(t)
  const { ctx, calls } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(scriptedLlm({ cwd })) })
  const session = answeringSession({ answers: ['REJECTED', REASON, 'RATIFIED'] })

  const outcome = await runSkraftPipelineWorkflow(ctx, copilotHost(cwd, PLUGIN_ROOT, session))

  assert.equal(outcome.status, 'done')
  assert.deepEqual(session.asked.map(({ kind, message }) => [kind, message]).slice(0, 2), [
    ['select', `Ratify the Proposed ADRs ${ADR_PATH}? RATIFIED marks them Accepted; REJECTED sends DESIGN back with your reason.`],
    ['input', 'ADR: why REJECTED? Your reason goes back to the agent.'],
  ])
  assert.deepEqual(journal(cwd, SLUG).filter((event) => event.type === 'question.answered').map(({ key, answer, reason, by }) => [key, answer, reason, by]), [['adr-1', 'REJECTED', REASON, 'host-confirmed'], ['adr-2', 'RATIFIED', null, 'host-confirmed']])
  assert.ok(phaseCalls(calls)[2].prompt.endsWith(`A human refused the work of pass 1:\n- ${ADR_PATH}: ${REASON}`), phaseCalls(calls)[2].prompt)
})

test('a refusal whose reason the person leaves blank or dismisses is not recorded: the run pauses on the question and says why', async (t) => {
  const cases = [
    ['   ', 'you gave no reason for REJECTED, which needs one'],
    [null, 'you did not answer the question in Copilot'],
  ]
  for (const [reason, why] of cases) {
    const { cwd } = pipelineRepository(t)
    const { ctx, logs } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(scriptedLlm({ cwd })) })
    const session = answeringSession({ answers: ['REJECTED', reason] })

    await assert.rejects(runSkraftPipelineWorkflow(ctx, copilotHost(cwd, PLUGIN_ROOT, session)), { name: 'AbortError', message: 'paused at adr-1' })

    assert.deepEqual(session.asked.map(({ kind }) => kind), ['select', 'input'])
    assert.deepEqual(journal(cwd, SLUG).filter((event) => event.type === 'question.answered'), [])
    assert.equal(logs.at(-1), `adr-1 was not answered: ${why}. Resume this run to be asked again, ask Copilot in the chat to put the question to you, or type skraft decide adr-1 RATIFIED|REJECTED in a terminal and resume this run.`)
  }
})

test('a start that refuses the ADR three times reaches the limit of five dialogs: the sixth, the third reason, is not put; nothing of it is recorded and the run pauses with a fixed message', async (t) => {
  const { cwd } = pipelineRepository(t)
  const revises = (text) => (brief, { cwd: dir, slug }) => {
    commit(dir, `docs(${slug}): ${text}`, { [ADR_PATH]: `${ADR}\n${text}.\n` })
    writeResult(brief, { status: 'done', summary: text })
  }
  const llm = scriptedLlm({ cwd, acts: { 'solution-architect': [NOMINAL['solution-architect'], revises('revised once'), revises('revised twice')] } })
  const { ctx, logs } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(llm) })
  const session = answeringSession({ answers: ['REJECTED', REASON, 'REJECTED', REASON, 'REJECTED', REASON] })

  await assert.rejects(runSkraftPipelineWorkflow(ctx, copilotHost(cwd, PLUGIN_ROOT, session, { now: () => 0 })), { name: 'AbortError', message: 'paused at adr-3' })

  assert.deepEqual(session.asked.map(({ kind }) => kind), ['select', 'input', 'select', 'input', 'select'])
  assert.deepEqual(journal(cwd, SLUG).filter((event) => event.type === 'question.answered').map(({ key, answer }) => [key, answer]), [['adr-1', 'REJECTED'], ['adr-2', 'REJECTED']])
  assert.equal(logs.at(-1), 'adr-3 was not answered: too many questions were put to you in a short time. Resume this run to be asked again, ask Copilot in the chat to put the question to you, or type skraft decide adr-3 RATIFIED|REJECTED in a terminal and resume this run.')
})

test('a blocked step asks the person for an instruction in a text field; the instruction runs it again in the same run, and STOP typed there ends it', async (t) => {
  const { cwd } = pipelineRepository(t)
  const llm = scriptedLlm({ cwd, acts: { 'solution-architect': [blocked('which payment provider?'), blocked('still unsure')] } })
  const { ctx, calls } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(llm) })
  const session = answeringSession({ answers: ['Use the bank gateway', 'stop'] })

  const outcome = await runSkraftPipelineWorkflow(ctx, copilotHost(cwd, PLUGIN_ROOT, session))

  assert.deepEqual([outcome.status, outcome.code, outcome.reason], ['blocked', 'agent-blocked', 'solution-architect is blocked: still unsure'])
  assert.deepEqual(session.asked.map(({ kind }) => kind), ['input', 'input'])
  assert.match(session.asked[0].message, /^design is blocked: solution-architect says it cannot go on; .* An instruction runs design again on a new pass with it; STOP ends the run\.$/)
  assert.ok(phaseCalls(calls)[2].prompt.includes('\nA human refused the work of pass 1:\n- Use the bank gateway'), phaseCalls(calls)[2].prompt)
  assert.deepEqual(journal(cwd, SLUG).filter((event) => event.type === 'question.answered').map(({ key, answer, by }) => [key, answer, by]), [['design-1', 'Use the bank gateway', 'host-confirmed'], ['design-2', 'STOP', 'host-confirmed']])
})

test('a question the person dismisses in Copilot pauses the run, which says how to answer it; resumed, it puts the question again', async (t) => {
  const { cwd } = pipelineRepository(t)
  const { ctx, logs } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(scriptedLlm({ cwd })) })
  const session = answeringSession({ answers: [null, 'RATIFIED'] })

  await assert.rejects(runSkraftPipelineWorkflow(ctx, copilotHost(cwd, PLUGIN_ROOT, session)), { name: 'AbortError', message: 'paused at adr-1' })
  assert.deepEqual(logs.slice(-2), [
    `Waiting for you — Ratify the Proposed ADRs ${ADR_PATH}? RATIFIED marks them Accepted; REJECTED sends DESIGN back with your reason.`,
    'adr-1 was not answered: you did not answer the question in Copilot. Resume this run to be asked again, ask Copilot in the chat to put the question to you, or type skraft decide adr-1 RATIFIED|REJECTED in a terminal and resume this run.',
  ])
  const outcome = await runSkraftPipelineWorkflow(ctx, copilotHost(cwd, PLUGIN_ROOT, session))

  assert.equal(outcome.status, 'done')
  assert.deepEqual(session.asked.map(({ kind }) => kind), ['select', 'select'])
})

test('a run Copilot cannot put its question in pauses and says why; skraft_decide then puts that question once, a refusal with its reason, and the resumed run sends the architect back, and only it', async (t) => {
  const { cwd } = pipelineRepository(t)
  const { ctx, calls, logs } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(scriptedLlm({ cwd })) })

  await assert.rejects(runSkraftPipelineWorkflow(ctx, host(cwd)), { name: 'AbortError', message: 'paused at adr-1' })
  assert.equal(logs.at(-1), 'adr-1 was not answered: this Copilot host cannot put a question to you. Resume this run to be asked again, ask Copilot in the chat to put the question to you, or type skraft decide adr-1 RATIFIED|REJECTED in a terminal and resume this run.')

  const dismissed = answeringSession({ answers: ['REJECTED', null] })
  assert.equal(await decideTool(cwd, dismissed).handler({}), 'Refused: you did not answer the question in Copilot; answer it with skraft decide adr-1 RATIFIED|REJECTED typed in a terminal; nothing was recorded.')
  const person = answeringSession({ answers: ['REJECTED', REASON] })
  assert.equal(await decideTool(cwd, person).handler({}), `Recorded: ${SLUG}: adr-1 answered REJECTED; run the pipeline again to go on. Resume the paused skraft-pipeline run (/workflows).`)
  assert.deepEqual(person.asked.map(({ kind, message, options }) => [kind, message, options]), [
    ['select', `Ratify the Proposed ADRs ${ADR_PATH}? RATIFIED marks them Accepted; REJECTED sends DESIGN back with your reason.`, ['RATIFIED', 'REJECTED']],
    ['input', 'ADR: why REJECTED? Your reason goes back to the agent.', undefined],
  ])

  await assert.rejects(runSkraftPipelineWorkflow(ctx, host(cwd)), { name: 'AbortError', message: 'paused at adr-2' })

  const phases = phaseCalls(calls)
  assert.deepEqual(phases.map((call) => call.label), [`skraft ${SLUG} · research · attempt 1`, `skraft ${SLUG} · design · attempt 1`, `skraft ${SLUG} · design · pass 2 · attempt 1`])
  assert.ok(phases[2].prompt.endsWith(`A human refused the work of pass 1:\n- ${ADR_PATH}: ${REASON}`), phases[2].prompt)
  assert.deepEqual(journal(cwd, SLUG).filter((event) => event.type === 'question.answered').map(({ key, answer, reason, by }) => [key, answer, reason, by]), [['adr-1', 'REJECTED', REASON, 'host-confirmed']])
})

test('skraft_decide asks a blocked step its instruction in a text field; one Decide refuses records nothing, and the instruction it takes sends the step back on resume', async (t) => {
  const { cwd } = pipelineRepository(t)
  const llm = scriptedLlm({ cwd, acts: { 'solution-architect': [blocked('which payment provider?'), blocked('still unsure')] } })
  const { ctx, calls } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(llm) })
  await assert.rejects(runSkraftPipelineWorkflow(ctx, host(cwd)), { name: 'AbortError', message: 'paused at design-1' })
  const person = answeringSession({ answers: ['x'.repeat(1001), 'Use the bank gateway'] })

  assert.equal(await decideTool(cwd, person).handler({}), 'Refused: an instruction is at most 1000 characters; nothing was recorded.')
  assert.equal(await decideTool(cwd, person).handler({}), `Recorded: ${SLUG}: design-1 answered Use the bank gateway; run the pipeline again to go on. Resume the paused skraft-pipeline run (/workflows).`)
  assert.deepEqual(person.asked.map(({ kind }) => kind), ['input', 'input'])
  await assert.rejects(runSkraftPipelineWorkflow(ctx, host(cwd)), { name: 'AbortError', message: 'paused at design-2' })

  assert.ok(phaseCalls(calls)[2].prompt.includes('\nA human refused the work of pass 1:\n- Use the bank gateway'), phaseCalls(calls)[2].prompt)
  assert.deepEqual(journal(cwd, SLUG).filter((event) => event.type === 'question.answered').map(({ key, answer, by }) => [key, answer, by]), [['design-1', 'Use the bank gateway', 'host-confirmed']])
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
  const session = answeringSession({ answers: ['RATIFIED', null, 'RETRY'] })
  const configPath = join(cwd, 'skraft-config.json')
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  const broken = { ...config, components: [{ ...config.components[0], commands: { test: TEST_COMMAND, build: 'skraft-missing-build' } }] }
  writeFileSync(configPath, JSON.stringify(broken))

  await assert.rejects(runSkraftPipelineWorkflow(ctx, copilotHost(cwd, PLUGIN_ROOT, session)), { message: 'paused at gates-1' })
  writeFileSync(configPath, JSON.stringify(config))
  const outcome = await runSkraftPipelineWorkflow(ctx, copilotHost(cwd, PLUGIN_ROOT, session))

  assert.equal(outcome.status, 'done')
  assert.equal(phaseCalls(calls).length, 5)
  assert.deepEqual(session.asked.map(({ options }) => options), [['RATIFIED', 'REJECTED'], ['RETRY', 'ABORT'], ['RETRY', 'ABORT']])
  assert.deepEqual(journal(cwd, SLUG).filter((event) => event.type === 'step.started' && event.step === 'gates').length, 1)
})

test('an unpublished ADR the architect supersedes on the refused pass is refused; edited in place, it is asked again', async (t) => {
  const { cwd } = pipelineRepository(t)
  const tokens = 'docs/adr/adr-002-card-tokens.md'
  const supersedes = (brief, { cwd: dir, slug }) => {
    fillOutputs(brief, 'Tokens.\n')
    commit(dir, `docs(${slug}): tokens supersede the card payment`, { [tokens]: ADR.replace('adr: 1', 'adr: 2').replace('supersedes: null', 'supersedes: ADR-001'), [INDEX_PATH]: decisionsIndex(1, 2) })
    writeResult(brief, { status: 'done', summary: 'ADR-002 supersedes ADR-001' })
  }
  const inPlace = (brief, { cwd: dir, slug }) => {
    commit(dir, `docs(${slug}): card payment with tokens`, { [tokens]: null, [ADR_PATH]: `${ADR}\nWith tokens.\n`, [INDEX_PATH]: decisionsIndex(1) })
    writeResult(brief, { status: 'done', summary: 'ADR-001 edited in place' })
  }
  const llm = scriptedLlm({ cwd, acts: { 'solution-architect': [NOMINAL['solution-architect'], supersedes, inPlace] } })
  const { ctx, calls } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(llm) })
  const session = answeringSession({ answers: ['REJECTED', 'tokens belong in ADR-001', 'RATIFIED'] })

  const outcome = await runSkraftPipelineWorkflow(ctx, copilotHost(cwd, PLUGIN_ROOT, session))

  assert.equal(outcome.status, 'done')
  const design = journal(cwd, SLUG).filter((event) => event.type === 'step.recorded' && event.step === 'design')
  assert.deepEqual(design.map(({ visit, attempt, code }) => [visit, attempt, code]), [[1, 1, null], [2, 1, 'adr-lifecycle'], [2, 2, null]])
  assert.deepEqual(design[1].failures, [`${tokens} supersedes ADR-001, which is not on the default branch yet: edit ${ADR_PATH} in place instead`])
  const retried = phaseCalls(calls).find((call) => call.label === `skraft ${SLUG} · design · pass 2 · attempt 2`).prompt
  assert.ok(retried.includes(`Refused in attempt 1 of 3:\n- ${tokens} supersedes ADR-001`), retried)
  assert.equal(journal(cwd, SLUG).filter((event) => event.type === 'question.asked' && event.key.startsWith('adr-')).length, 2)
  assert.match(readFileSync(join(cwd, ...ADR_PATH.split('/')), 'utf8'), /^status: Accepted$/m)
})
