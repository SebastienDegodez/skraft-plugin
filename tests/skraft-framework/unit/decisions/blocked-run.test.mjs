import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUILT_IN_WORKFLOW, InMemoryAgentCatalog, InMemoryGit, ScriptedMachine } from '../support/in-memory-host.mjs'
import { agent, API, finding, green, lenses, nominal, reviews, says, scenarioReview, scripted, SLUG, reworkCycle, TRACKING } from '../support/pipeline-host.mjs'
import { dispatched, eventsOf, withoutReportSummary } from '../support/decisions.mjs'
import { edit, WITH_SECURITY } from '../workflow/support.mjs'

const withSecurity = { files: { '.skraft/pipeline.skraft.dot': WITH_SECURITY }, catalog: new InMemoryAgentCatalog({ repository: ['acme-security-reviewer'] }) }
const unavailable = () => ({ ok: false, unavailable: true, text: '' })
/** A front end in a repository of its own. */
const WEB = Object.freeze({ name: 'web', root: '../web', stack: 'react', bdd: false, mocking: { strategy: 'inprocess' }, paths: { src: ['src'], tests: ['src'] }, commands: { lint: 'npx eslint .', mutation: 'npx stryker run' } })
const INSTRUCTION = 'Use the bank gateway of Acme'
const NO_PROVIDER = 'The story names no payment provider.'
const blockedAgent = (it) => agent({ result: { status: 'blocked', summary: NO_PROVIDER } })(it)
const NO_WORD = 'an instruction tells the agent in words what to do; write a sentence, or STOP'
const RESEARCH_BLOCKED = `research is blocked: solution-researcher says it cannot go on; its reason is in ${TRACKING}/results/research-1-1.json.\nLeft by research (1):\n- ${NO_PROVIDER}\n An instruction runs research again on a new pass with what is left above and the instruction; STOP ends the run.\nThe run so far (commits, refusals, incidents): ${TRACKING}/run-report.md`

test('an agent that says it is blocked asks a human what to do instead of ending the run', async () => {
  const host = scripted({}, (it) => [blockedAgent(it)])

  const outcome = await host.start()

  assert.deepEqual(withoutReportSummary(outcome), { status: 'waiting', slug: SLUG, phase: 'RESEARCH', code: 'blocked', reason: `${RESEARCH_BLOCKED} Answer with skraft decide research-1 "<instruction>"|STOP.` })
  assert.deepEqual(withoutReportSummary(host.human.questions), [{ key: 'research-1', kind: 'blocked', text: RESEARCH_BLOCKED, options: ['STOP'], refusals: [], header: 'Blocked' }])
  const [{ key, kind, step, visit, subjects }] = eventsOf(host, 'question.asked')
  assert.deepEqual({ key, kind, step, visit, subjects }, { key: 'research-1', kind: 'blocked', step: 'research', visit: 1, subjects: [] })
  assert.equal(host.types().at(-1), 'question.asked')
  assert.equal((await host.view()).status, 'waiting')
})

test('an instruction runs the blocked node again on a new pass of the same run, with the instruction in its brief', async () => {
  const host = scripted({}, (it) => [blockedAgent(it), agent()(it), unavailable])
  await host.start()

  const decided = await host.decide({ key: 'research-1', answer: '  Use the bank gateway\n of Acme ' })
  const outcome = await host.run()

  assert.deepEqual(decided, { ok: true, slug: SLUG, key: 'research-1', code: null, reason: `${SLUG}: research-1 answered ${INSTRUCTION}; run the pipeline again to go on` })
  assert.deepEqual([outcome.status, outcome.phase, outcome.code], ['blocked', 'DESIGN', 'agent-unavailable'])
  assert.deepEqual(dispatched(host), [`skraft ${SLUG} · research · attempt 1`, `skraft ${SLUG} · research · pass 2 · attempt 1`, `skraft ${SLUG} · design · attempt 1`])
  const brief = host.agentRunner.dispatches[1].prompt
  assert.ok(brief.includes('- Pass: 2, after a human sent the work back'), brief)
  // #500: the agent gets what the block left, not the instruction alone.
  assert.ok(brief.endsWith(`\n\nWhat pass 1 left when it was blocked:\n- ${NO_PROVIDER}\n\nA human refused the work of pass 1:\n- ${INSTRUCTION}`), brief)
  assert.deepEqual(eventsOf(host, 'step.started').filter((event) => event.step === 'research').map(({ visit, attempt, feedback, instruction, sentBy }) => [visit, attempt, feedback, instruction, sentBy]), [
    [1, 1, [], undefined, undefined],
    [2, 1, [NO_PROVIDER], INSTRUCTION, 'ask'],
  ])
  assert.deepEqual(eventsOf(host, 'question.answered').map(({ key, answer, reason, by }) => [key, answer, reason, by]), [['research-1', INSTRUCTION, null, 'decide']])
  assert.equal(eventsOf(host, 'run.started').length, 1)
  assert.deepEqual((await host.report()).answers, [{ key: 'research-1', kind: 'blocked', step: 'research', answer: INSTRUCTION, reason: null, by: 'decide' }])
  assert.ok((await host.tracking.read(SLUG, 'run-report.md')).includes(`\n| research-1 | research | ${INSTRUCTION} | decide |\n`))
})

test('an agent refused with the same signature twice stops without another attempt or a human question', async () => {
  const host = scripted({}, (it) => [agent({ fill: false, result: null })(it), agent({ fill: false, result: null })(it), agent()(it), unavailable])
  const outcome = await host.start()

  assert.deepEqual([outcome.status, outcome.phase, outcome.code], ['blocked', 'RESEARCH', 'repeated-failure'])
  assert.deepEqual(host.human.questions, [])
  assert.deepEqual(dispatched(host).slice(0, 2), [`skraft ${SLUG} · research · attempt 1`, `skraft ${SLUG} · research · attempt 2`])
  assert.deepEqual(eventsOf(host, 'step.started').filter((event) => event.step === 'research').map(({ visit, attempt, missing, feedback }) => [visit, attempt, missing, feedback]), [
    [1, 1, [], []],
    [1, 2, [`research/2026-10-11/${SLUG}-research.md`], ['result is missing']],
  ])
})
/** The journal's lines chained and signed again, after an edit, as the machine that wrote them would. */
const resigned = async (host, lines) => {
  const key = await host.deps.journalKeys.read(JSON.parse(lines[0]).keyId)
  const out = []
  for (const line of lines) {
    const prev = out.length === 0 ? 'null' : JSON.stringify(await host.deps.hasher.sha256(out.at(-1)))
    const body = line.replace(/,"sig":"[0-9a-f]+"}$/, '}').replace(/"prev":(null|"[0-9a-f]+")/, `"prev":${prev}`)
    out.push(`${body.slice(0, -1)},"sig":"${await host.deps.hasher.hmacSha256(key, body)}"}`)
  }
  return out
}
test('a lens that reaches no verdict asks a human; an instruction runs the review again, each lens it asks reading the instruction', async () => {
  const host = scripted({}, (it) => [...nominal(it).slice(0, 2), unavailable])
  host.agentRunner.review = lenses({ fitness: [says('fitness', 'inconclusive', [finding('F1', 'low', 'the research document is empty')])] })

  const waiting = await host.start()
  await host.decide({ answer: INSTRUCTION })
  const outcome = await host.run()

  const text = `design_review is blocked: a lens answered inconclusive; the verdict is in ${TRACKING}/reviews/design_review-1/verdict.yaml. An instruction runs design_review again on a new pass with it; STOP ends the run.\nThe run so far (commits, refusals, incidents): ${TRACKING}/run-report.md`
  assert.deepEqual(withoutReportSummary(waiting), { status: 'waiting', slug: SLUG, phase: 'DESIGN', code: 'blocked', reason: `${text} Answer with skraft decide design_review-1 "<instruction>"|STOP.` })
  assert.deepEqual([outcome.phase, outcome.code], ['DISTILL', 'agent-unavailable'])
  assert.deepEqual(reviews(host), [['design_review', 1, 'blocked', null], ['design_review', 2, 'approved', 'adr']])
  const second = host.agentRunner.reviewed().filter((dispatch) => dispatch.label.includes(' · pass 2 · '))
  assert.deepEqual(second.map((dispatch) => dispatch.agent), ['fitness-lens'])
  assert.ok(second[0].prompt.includes(`\n- A human's instruction for this pass, after the last one was blocked: ${INSTRUCTION}\n`), second[0].prompt)
  assert.ok(!host.agentRunner.reviewed()[0].prompt.includes("A human's instruction"))
  assert.deepEqual(eventsOf(host, 'step.started').filter((event) => event.step === 'design_review').map(({ visit, feedback, instruction, sentBy }) => [visit, feedback, instruction, sentBy]), [[1, [], undefined, undefined], [2, [], INSTRUCTION, 'ask']])
})

test('the node run again that blocks again asks again; STOP then ends the run blocked, and nothing more runs', async () => {
  const host = scripted({}, (it) => [blockedAgent(it), agent({ result: { status: 'blocked', summary: 'Still no provider.' } })(it)])
  await host.start()
  await host.decide({ answer: INSTRUCTION })

  const again = await host.run()
  const stop = await host.decide({ key: 'research-2', answer: 'Stop', reason: 'the story is dropped' })
  const stopped = await host.run()

  assert.deepEqual([again.status, again.code], ['waiting', 'blocked'])
  assert.deepEqual(eventsOf(host, 'question.asked').map(({ key, visit, text }) => [key, visit, text.split('; ')[1]]), [
    ['research-1', 1, `its reason is in ${TRACKING}/results/research-1-1.json.\nLeft by research (1):\n- ${NO_PROVIDER}\n An instruction runs research again on a new pass with what is left above and the instruction`],
    ['research-2', 2, `its reason is in ${TRACKING}/results/research-2-1.json.\nLeft by research (1):\n- Still no provider.\n An instruction runs research again on a new pass with what is left above and the instruction`],
  ])
  assert.equal(stop.reason, `${SLUG}: research-2 answered STOP; run the pipeline again to go on`)
  assert.deepEqual(stopped, { status: 'blocked', slug: SLUG, phase: 'RESEARCH', code: 'agent-blocked', reason: 'solution-researcher is blocked: Still no provider.' })
  assert.deepEqual(host.types().slice(-3), ['question.asked', 'question.answered', 'run.finished'])
  assert.deepEqual(eventsOf(host, 'question.answered').map(({ key, answer, reason }) => [key, answer, reason]), [['research-1', INSTRUCTION, null], ['research-2', 'STOP', 'the story is dropped']])
  const length = host.events().length
  assert.deepEqual(await host.run(), stopped)
  assert.equal(host.events().length, length)
  assert.equal(host.agentRunner.dispatches.length, 2)
  assert.equal((await host.view()).status, 'blocked')
})

test('an answer to a blocked question is refused, without echoing it, when it holds no text, no word, or more than 1000 characters', async () => {
  const host = scripted({}, (it) => [blockedAgent(it)])
  await host.start()
  const refused = (reason) => ({ ok: false, slug: SLUG, key: 'research-1', code: 'invalid-answer', reason })

  assert.deepEqual(await host.decide({ answer: ' \n ' }), refused('the answer must be an instruction, or STOP'))
  assert.deepEqual(await host.decide({ answer: 7 }), refused('the answer must be an instruction, or STOP'))
  // #500: a bare digit typed in the dialog was sent to the architect as its whole instruction.
  for (const wordless of ['5', ' 3 ', '42?', '#1', 'ok']) assert.deepEqual(await host.decide({ answer: wordless }), refused(NO_WORD))
  assert.deepEqual(await host.decide({ answer: 'x'.repeat(990), reason: 'y'.repeat(10) }), refused('an instruction is at most 1000 characters'))
  assert.deepEqual(eventsOf(host, 'question.answered'), [])
  assert.equal((await host.decide({ answer: 'x'.repeat(989), reason: 'y'.repeat(10) })).ok, true)
  assert.equal(eventsOf(host, 'question.answered')[0].answer, `${'x'.repeat(989)} ${'y'.repeat(10)}`)
  assert.deepEqual(await host.decide({ answer: 'STOP' }), { ok: false, slug: SLUG, key: null, code: 'already-answered', reason: 'research-1 was already answered' })
})

test('an instruction written in any script is taken: a word counts its combining marks, and two letters of a script written without spaces are a word', async () => {
  const NFD_ETE = 'e\u0301te\u0301'
  for (const [written, recorded] of [['करो', 'करो'], ['ठीक है', 'ठीक है'], [NFD_ETE, '\u00e9t\u00e9'], ['修复', '修复'], ['みて', 'みて'], ['メモ', 'メモ'], ['고쳐', '고쳐']]) {
    const host = scripted({}, (it) => [blockedAgent(it)])
    await host.start()

    assert.deepEqual(await host.decide({ answer: written }), { ok: true, slug: SLUG, key: 'research-1', code: null, reason: `${SLUG}: research-1 answered ${recorded}; run the pipeline again to go on` }, written)
    assert.equal(eventsOf(host, 'question.answered')[0].answer, recorded)
  }
  const host = scripted({}, (it) => [blockedAgent(it)])
  await host.start()
  // A mark alone, or two Latin letters, is still no word.
  for (const wordless of ['\u0301\u0301\u0301', 'e\u0301', 'ok', '修']) assert.deepEqual(await host.decide({ answer: wordless }), { ok: false, slug: SLUG, key: 'research-1', code: 'invalid-answer', reason: NO_WORD }, wordless)
})

test('an instruction for a node the workflow no longer has stops the run as changed', async () => {
  const host = scripted(withSecurity, (it) => [agent()(it), agent()(it), agent({ result: { status: 'blocked', summary: 'No threat model.' } })(it)])
  await host.start()
  await host.decide({ answer: INSTRUCTION })
  await host.deps.workspace.write('.skraft/pipeline.skraft.dot', BUILT_IN_WORKFLOW)

  const outcome = await host.run()

  assert.deepEqual(outcome, { status: 'blocked', slug: SLUG, phase: null, code: 'workflow-changed', reason: 'the workflow has no node security any more; restore the workflow the run started with' })
  assert.equal(host.agentRunner.dispatches.length, 3)
})
