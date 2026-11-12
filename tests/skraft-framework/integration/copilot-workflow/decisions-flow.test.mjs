import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { PLUGIN_ROOT, copilotHost, actsAs, answeringSession, simulatedContext, decideTool } from './simulated-host.mjs'
import { ADR, ADR_PATH, decisionsIndex, INDEX_PATH, NOMINAL, SLUG, blocked, commit, fillOutputs, pipelineRepository, scenarioReviewText, scriptedLlm, TEST_COMMAND, writeResult } from '../support/pipeline-repository.mjs'
import { journal } from '../support/workspace.mjs'

const REASON = 'use the bank gateway, not Stripe'
const INSTRUCTION = 'Keep the bank gateway and revise the ADR'
const host = (cwd) => copilotHost(cwd)
/** The phase agents' calls, the review lenses left out. */
const phaseCalls = (calls) => calls.filter((call) => !call.label.includes('_review · '))

test('each question is put to the person once, as a choice among its options in Copilot; the choice is the answer, journaled host-confirmed, and the run goes on without pausing', async (t) => {
  const { cwd } = pipelineRepository(t)
  const { ctx, logs } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(scriptedLlm({ cwd })) })
  const session = answeringSession({ answers: ['RATIFIED'] })

  const outcome = await runSkraftPipelineWorkflow(ctx, copilotHost(cwd, PLUGIN_ROOT, session))

  assert.equal(outcome.status, 'done')
  assert.deepEqual(session.asked, [
    { kind: 'select', message: `Ratify the Proposed ADRs ${ADR_PATH}? RATIFIED marks them Accepted; REJECTED sends DESIGN back with your reason.`, options: ['RATIFIED', 'REJECTED'] },
    { kind: 'select', message: scenarioReviewText(cwd), options: ['APPROVED', 'REVISE'] },
  ])
  assert.deepEqual(journal(cwd, SLUG).filter((event) => event.type === 'question.answered').map(({ key, answer, reason, by }) => [key, answer, reason, by]), [['adr-1', 'RATIFIED', null, 'host-confirmed'], ['scenario_review-1', 'APPROVED', null, 'host-confirmed']])
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
  assert.deepEqual(journal(cwd, SLUG).filter((event) => event.type === 'question.answered').map(({ key, answer, reason, by }) => [key, answer, reason, by]), [['adr-1', 'REJECTED', REASON, 'host-confirmed'], ['adr-2', 'RATIFIED', null, 'host-confirmed'], ['scenario_review-1', 'APPROVED', null, 'host-confirmed']])
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

test('a start that refuses the ADR twice, then writes design an instruction once its return is spent, puts every dialog it needs: the instruction confirmed, the third ratification recorded', async (t) => {
  const { cwd } = pipelineRepository(t)
  const revises = (text) => (brief, { cwd: dir, slug }) => {
    commit(dir, `docs(${slug}): ${text}`, { [ADR_PATH]: `${ADR}\n${text}.\n` })
    writeResult(brief, { status: 'done', summary: text })
  }
  const llm = scriptedLlm({ cwd, acts: { 'solution-architect': [NOMINAL['solution-architect'], revises('revised once'), revises('revised twice'), revises('revised thrice')] } })
  const { ctx } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(llm) })
  const session = answeringSession({ answers: ['REJECTED', REASON, 'REJECTED', REASON, INSTRUCTION, true, 'RATIFIED'] })

  await runSkraftPipelineWorkflow(ctx, copilotHost(cwd, PLUGIN_ROOT, session)).catch(() => null)

  assert.deepEqual(session.asked.slice(0, 7).map(({ kind }) => kind), ['select', 'input', 'select', 'input', 'input', 'confirm', 'select'])
  assert.match(session.asked[4].message, /^design is blocked: adr -> design was taken as often as its max_visits allows\./)
  assert.deepEqual(journal(cwd, SLUG).filter((event) => event.type === 'question.answered').slice(0, 4).map(({ key, answer }) => [key, answer]), [['adr-1', 'REJECTED'], ['adr-2', 'REJECTED'], ['design-1', INSTRUCTION], ['adr-3', 'RATIFIED']])
})

test('a blocked step asks the person for an instruction in a text field, then to confirm it; the instruction runs it again in the same run, and STOP typed there ends it', async (t) => {
  const { cwd } = pipelineRepository(t)
  const llm = scriptedLlm({ cwd, acts: { 'solution-architect': [blocked('which payment provider?'), blocked('still unsure')] } })
  const { ctx, calls } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(llm) })
  const session = answeringSession({ answers: ['Use the bank gateway', true, 'stop'] })

  const outcome = await runSkraftPipelineWorkflow(ctx, copilotHost(cwd, PLUGIN_ROOT, session))

  assert.deepEqual([outcome.status, outcome.code, outcome.reason], ['blocked', 'agent-blocked', 'solution-architect is blocked: still unsure'])
  // #500: the instruction typed is shown back and confirmed before it is recorded; an option typed needs no confirmation.
  assert.deepEqual(session.asked.map(({ kind }) => kind), ['input', 'confirm', 'input'])
  assert.equal(session.asked[1].message, 'Send this instruction to design? Use the bank gateway')
  assert.match(session.asked[0].message, /^design is blocked: solution-architect says it cannot go on; [^]* An instruction runs design again on a new pass with what is left above and the instruction; STOP ends the run\.\nThe run so far \(commits, refusals, incidents\): .+$/)
  assert.equal(session.asked[0].message.split('\n').at(-1), `The run so far (commits, refusals, incidents): ${join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, 'run-report.md')}`)
  assert.ok(phaseCalls(calls)[2].prompt.includes('\nA human refused the work of pass 1:\n- Use the bank gateway'), phaseCalls(calls)[2].prompt)
  assert.deepEqual(journal(cwd, SLUG).filter((event) => event.type === 'question.answered').map(({ key, answer, by }) => [key, answer, by]), [['design-1', 'Use the bank gateway', 'host-confirmed'], ['design-2', 'STOP', 'host-confirmed']])
})

test('an instruction the person writes in Copilot, then does not send, pauses the run as any question not answered, and its log says it was not sent; a text with no word is not asked again', async (t) => {
  const { cwd } = pipelineRepository(t)
  const llm = scriptedLlm({ cwd, acts: { 'solution-architect': [blocked('which payment provider?')] } })
  const { ctx, logs } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(llm) })

  await assert.rejects(runSkraftPipelineWorkflow(ctx, copilotHost(cwd, PLUGIN_ROOT, answeringSession({ answers: ['Use the bank gateway', false] }))), { name: 'AbortError', message: 'paused at design-1' })
  assert.equal(logs.at(-1), 'design-1 was not answered: you did not send the instruction you wrote. Resume this run to be asked again, ask Copilot in the chat to put the question to you, or type skraft decide design-1 "<instruction>"|STOP in a terminal and resume this run.')
  const unshown = () => { throw new Error('no dialog outside a chat turn') }
  const again = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(llm) })
  await assert.rejects(runSkraftPipelineWorkflow(again.ctx, copilotHost(cwd, PLUGIN_ROOT, answeringSession({ answers: ['Use the bank gateway', unshown] }))), { name: 'AbortError', message: 'paused at design-1' })
  // A confirmation Copilot never showed keeps its own reason.
  assert.match(again.logs.at(-1), /^design-1 was not answered: Copilot did not put the question to you\. /)
  const wordless = answeringSession({ answers: ['5'] })
  const outcome = await runSkraftPipelineWorkflow(ctx, copilotHost(cwd, PLUGIN_ROOT, wordless))

  // Unlike the Claude Code mod, which puts the question again, the run ends waiting for skraft decide.
  assert.deepEqual([outcome.status, outcome.code], ['waiting', 'blocked'])
  assert.deepEqual(wordless.asked.map(({ kind }) => kind), ['input'])
  assert.ok(logs.includes(`${SLUG}: design-1 not answered: an instruction tells the agent in words what to do; write a sentence, or STOP`), logs.join('\n'))
  assert.deepEqual(journal(cwd, SLUG).filter((event) => event.type === 'question.answered'), [])
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
  assert.deepEqual(session.asked.map(({ kind, options }) => [kind, options]), [['select', ['RATIFIED', 'REJECTED']], ['select', ['RATIFIED', 'REJECTED']], ['select', ['APPROVED', 'REVISE']]])
})

test('a paused ratification consumes the native refusal with its reason, and the same run sends only the architect back', async (t) => {
  const { cwd } = pipelineRepository(t)
  const { ctx, calls, logs } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(scriptedLlm({ cwd })) })

  await assert.rejects(runSkraftPipelineWorkflow(ctx, host(cwd)), { name: 'AbortError', message: 'paused at adr-1' })
  assert.equal(logs.at(-1), 'adr-1 was not answered: this Copilot host cannot put a question to you. Resume this run to be asked again, ask Copilot in the chat to put the question to you, or type skraft decide adr-1 RATIFIED|REJECTED in a terminal and resume this run.')

  assert.match(await decideTool(cwd).handler({ key: 'adr-1', answer: 'REJECTED' }), /^Refused:/)
  const person = answeringSession({ answers: ['REJECTED', REASON] })
  assert.equal(await decideTool(cwd, person).handler({ key: 'adr-1', answer: 'REJECTED', reason: REASON }), `Recorded: ${SLUG}: adr-1 answered REJECTED; run the pipeline again to go on. Resume the paused skraft-pipeline run (/workflows).`)
  assert.deepEqual(person.asked, [])

  await assert.rejects(runSkraftPipelineWorkflow(ctx, host(cwd)), { name: 'AbortError', message: 'paused at adr-2' })

  const phases = phaseCalls(calls)
  assert.deepEqual(phases.map((call) => call.label), [`skraft ${SLUG} · research · attempt 1`, `skraft ${SLUG} · design · attempt 1`, `skraft ${SLUG} · design · pass 2 · attempt 1`])
  assert.ok(phases[2].prompt.endsWith(`A human refused the work of pass 1:\n- ${ADR_PATH}: ${REASON}`), phases[2].prompt)
  assert.deepEqual(journal(cwd, SLUG).filter((event) => event.type === 'question.answered').map(({ key, answer, reason, by }) => [key, answer, reason, by]), [['adr-1', 'REJECTED', REASON, 'decide']])
})

test('a native instruction passes Decide validation and sends the blocked step back on same-run resume without elicitation', async (t) => {
  const { cwd } = pipelineRepository(t)
  const llm = scriptedLlm({ cwd, acts: { 'solution-architect': [blocked('which payment provider?'), blocked('still unsure')] } })
  const { ctx, calls } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(llm) })
  await assert.rejects(runSkraftPipelineWorkflow(ctx, host(cwd)), { name: 'AbortError', message: 'paused at design-1' })
  const person = answeringSession({ answers: ['x'.repeat(1001), '5', 'Use the bank gateway', false, 'Use the bank gateway', true] })

  assert.equal(await decideTool(cwd, person).handler({ key: 'design-1', answer: 'x'.repeat(1001) }), 'Refused: an instruction is at most 1000 characters; nothing was recorded.')
  assert.equal(await decideTool(cwd, person).handler({ key: 'design-1', answer: '5' }), 'Refused: an instruction tells the agent in words what to do; write a sentence, or STOP; nothing was recorded.')
  assert.equal(await decideTool(cwd, person).handler({ key: 'design-1', answer: 'Use the bank gateway' }), `Recorded: ${SLUG}: design-1 answered Use the bank gateway; run the pipeline again to go on. Resume the paused skraft-pipeline run (/workflows).`)
  assert.deepEqual(person.asked, [])
  await assert.rejects(runSkraftPipelineWorkflow(ctx, host(cwd)), { name: 'AbortError', message: 'paused at design-2' })

  assert.ok(phaseCalls(calls)[2].prompt.includes('\nA human refused the work of pass 1:\n- Use the bank gateway'), phaseCalls(calls)[2].prompt)
  assert.deepEqual(journal(cwd, SLUG).filter((event) => event.type === 'question.answered').map(({ key, answer, by }) => [key, answer, by]), [['design-1', 'Use the bank gateway', 'decide']])
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
  assert.equal(phaseCalls(calls).length, 7)
  assert.deepEqual(session.asked.map(({ options }) => options), [['RATIFIED', 'REJECTED'], ['APPROVED', 'REVISE'], ['RETRY', 'ABORT'], ['RETRY', 'ABORT']])
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
