import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { createSkraftDecideTool } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-decide-tool.mjs'
import { createObserve } from '../../../../plugins/skraft-framework/engine/application/pipeline/observe-usecase.mjs'
import { createNodeAdapters } from '../../../../plugins/skraft-framework/engine/infrastructure/node-adapters.mjs'
import { actsAs, copilotHost, simulatedContext, trackingDir } from '../copilot-workflow/simulated-host.mjs'
import { FAMILY_MODELS, LENSES, SLUG, briefOf, finding, pipelineRepository, says, scriptedLlm, writesOnly } from '../support/pipeline-repository.mjs'
import { SKRAFT_COMMAND, SKRAFT_MJS, journal, skraft, tempFolder } from '../support/workspace.mjs'
import { conduct, loop, startAgents, tokenLineOf } from './simulated-conductor.mjs'

const RECORD = `${SKRAFT_COMMAND} record`
const NEXT = `${SKRAFT_COMMAND} next`

/** What a journal says happened, without what differs between two runs: times, hashes, paths, models, costs, and who answered. */
const facts = (events) => events
  .filter((event) => event.type !== 'tdd.replay-slow')
  .map(({ type, step, phase, visit, attempt, outcome, next, lens, verdict, key, answer, status }) =>
    JSON.stringify({ type, step, phase, visit, attempt, outcome, next, lens, verdict, key, answer, status }))

/** The Copilot dynamic workflow on the same repository and the same scripted LLM, each question answered with its first option. */
const copilotRun = async (cwd) => {
  const { ctx } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(scriptedLlm({ cwd })) })
  for (;;) {
    try {
      return await runSkraftPipelineWorkflow(ctx, copilotHost(cwd))
    } catch (error) {
      if (error.name !== 'AbortError') throw error
      const { question } = await createObserve(createNodeAdapters(copilotHost(cwd))).view()
      await createSkraftDecideTool(copilotHost(cwd)).handler({ key: question.key, answer: question.options[0] })
    }
  }
}

/** The agents of each dispatch step, `<agent>@<model>`. */
const dispatched = (steps) => steps.filter((step) => step.status === 'dispatch').map((step) => step.dispatches.map(({ agent, model }) => `${agent}@${model}`))

/** @param {string[]} lenses */
const lensesOn = (lenses) => lenses.map((lens) => `${lens}-lens@copilot-small`)

test('the loop conducts the four phases to the end, the lenses of a review handed over together, and writes the journal the Copilot workflow writes', async (t) => {
  const { cwd } = pipelineRepository(t, { models: FAMILY_MODELS })
  const reference = pipelineRepository(t, { models: FAMILY_MODELS })
  await skraft(cwd, ['init', SLUG])

  const { step, steps } = await conduct(cwd, scriptedLlm({ cwd }))

  assert.deepEqual(step, { status: 'done', slug: SLUG, phase: 'DELIVER', code: null, reason: 'DELIVER closed', dispatches: [], then: null })
  assert.deepEqual(dispatched(steps), [
    ['solution-researcher@copilot-medium'], ['solution-architect@copilot-large'], lensesOn(LENSES.design_review),
    ['acceptance-designer@copilot-medium'], lensesOn(LENSES.distill_review),
    ['software-engineer@copilot-medium'], lensesOn(LENSES.deliver_review),
  ])
  assert.deepEqual(steps.filter((each) => each.status !== 'dispatch'), [
    {
      status: 'waiting', slug: SLUG, phase: 'DESIGN', code: 'adr-ratification', dispatches: [], then: NEXT,
      reason: 'Ratify the Proposed ADRs docs/adr/adr-001-card-payment.md? RATIFIED marks them Accepted; REJECTED sends DESIGN back with your reason. Options: RATIFIED, REJECTED. Stop here and ask the human to answer it with skraft decide in their own terminal; then run next.',
    },
    step,
  ])
  assert.equal((await copilotRun(reference.cwd)).status, 'done')
  assert.deepEqual(facts(journal(cwd, SLUG)), facts(journal(reference.cwd, SLUG)))
  assert.deepEqual(journal(cwd, SLUG).filter((event) => event.type === 'question.answered').map(({ by }) => by), ['cli-tty'])
})

test('a dispatch step gives each agent its prompt, its brief, its reply file and its model, then the record to run', async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  const loopFolder = join(trackingDir(cwd, SLUG), 'results', 'loop')

  const { exit, step, progress } = await loop(cwd, ['next'])

  const brief = join(loopFolder, 'dispatch-1.brief.md')
  assert.equal(exit, 0)
  assert.deepEqual(step, {
    status: 'dispatch', slug: SLUG, phase: 'RESEARCH', code: null,
    reason: 'start this agent, save each final reply as it is to its reply file, then record',
    dispatches: [{
      agent: 'solution-researcher', model: null, brief, reply: join(loopFolder, 'dispatch-1.reply.md'),
      prompt: `Your brief is the file ${brief}. Read it whole and do what it asks. Your last message is the reply it asks for.`,
    }],
    then: RECORD,
  })
  assert.match(readFileSync(brief, 'utf8'), /^## Skraft dispatch: solution-researcher \(RESEARCH\)\n[\s\S]+\n\n## Reply token\nEnd your reply with this line, as it is: skraft-reply: [0-9a-f-]{36}\n$/)
  assert.equal(readFileSync(step.dispatches[0].reply, 'utf8'), '')
  assert.equal(progress, `phase RESEARCH\n${SLUG}: solution-researcher, attempt 1\n`)
  assert.deepEqual(journal(cwd, SLUG).map(({ type, step: id }) => `${type} ${id ?? ''}`.trim()), ['run.started', 'step.started research'])
})

test('next refuses while handed over agents are not recorded, record refuses when none is, and neither writes to the journal', async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  assert.deepEqual(await loop(cwd, ['record']), {
    exit: 1, progress: '',
    step: { status: 'refused', slug: SLUG, phase: null, code: 'nothing-to-record', reason: 'no agent was handed over; run next', dispatches: [], then: null },
  })
  const handed = (await loop(cwd, ['next'])).step
  const before = journal(cwd, SLUG)

  const again = await loop(cwd, ['next'])

  assert.deepEqual(again, {
    exit: 1, progress: '',
    step: { ...handed, status: 'refused', phase: null, code: 'not-recorded', reason: '1 handed over agents are not recorded yet: start each one, save its reply, then record' },
  })
  assert.deepEqual(journal(cwd, SLUG), before)
})

test('an agent that saved no reply and left its outputs to do stops the run; next hands the same attempt over again', async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  const handed = (await loop(cwd, ['next'])).step

  const stopped = await loop(cwd, ['record'])

  assert.deepEqual(stopped.step, {
    status: 'blocked', slug: SLUG, phase: 'RESEARCH', code: 'agent-failed', reason: 'solution-researcher stopped without finishing: no reply was saved', dispatches: [], then: null,
  })
  assert.equal(stopped.exit, 1)
  const resumed = await loop(cwd, ['next'])
  assert.deepEqual(resumed.step, handed)
  assert.deepEqual(journal(cwd, SLUG).map(({ type, step, attempt }) => [type, step ?? null, attempt ?? null]), [
    ['run.started', null, null], ['step.started', 'research', 1], ['run.stopped', null, null],
  ])
})

test('an agent that did its work is judged on it, whatever its reply', async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  startAgents((await loop(cwd, ['next'])).step, { act: (prompt) => { writesOnly()(briefOf(prompt)); return undefined } }, () => false)

  const { step } = await loop(cwd, ['record'])

  assert.deepEqual(step.dispatches.map(({ agent }) => agent), ['solution-architect'])
  assert.deepEqual(journal(cwd, SLUG).filter((event) => event.type === 'step.recorded').map(({ step: id, outcome }) => [id, outcome]), [['research', 'done']])
})

test('a lens whose reply was not saved is asked again with the reason, the lenses that answered are not', async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  const llm = scriptedLlm({ cwd, reviews: { consistency: [says('consistency', 'pass')] } })
  let step = (await loop(cwd, ['next'])).step
  while (step.dispatches[0]?.agent !== 'consistency-lens') {
    startAgents(step, llm)
    step = (await loop(cwd, ['record'])).step
  }
  startAgents(step, llm, ({ agent }) => agent !== 'consistency-lens')

  const asked = (await loop(cwd, ['record'])).step

  assert.deepEqual(asked.dispatches.map(({ agent }) => agent), ['consistency-lens'])
  assert.match(readFileSync(asked.dispatches[0].brief, 'utf8'), /no reply was saved/)
  startAgents(asked, llm)
  const { step: after } = await loop(cwd, ['record'])
  assert.equal(after.code, 'adr-ratification')
  assert.deepEqual(journal(cwd, SLUG).filter((event) => event.type === 'review.lens').map(({ lens, verdict }) => [lens, verdict]), [
    ['architecture-compliance', 'pass'], ['fitness', 'pass'], ['consistency', 'pass'],
  ])
})

test('a blocker a lens finds and the refuter confirms is handed over as the refuter, then sends DESIGN back', async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  const llm = scriptedLlm({ cwd, reviews: { consistency: [says('consistency', 'fail', [finding('F1', 'blocker', 'The ADR names no payment provider')])] } })
  let step = (await loop(cwd, ['next'])).step
  const seen = []
  let handedLenses
  for (;;) {
    seen.push(step.dispatches.map(({ agent }) => agent).join(','))
    if (seen.length === 3) handedLenses = step
    if (seen.length === 5) break
    startAgents(step, llm)
    step = (await loop(cwd, ['record'])).step
  }

  assert.equal(handedLenses.reason, 'start these 3 agents, one after the other, save each final reply as it is to its reply file, then record')
  assert.deepEqual(seen, ['solution-researcher', 'solution-architect', 'consistency-lens,architecture-compliance-lens,fitness-lens', 'finding-refuter', 'solution-architect'])
  assert.deepEqual(journal(cwd, SLUG).filter((event) => event.type === 'step.recorded' && event.step === 'design_review').map(({ outcome, next }) => [outcome, next]), [['needs-rework', 'design']])
})

test('a reply without the token of its brief is no answer: the lens is asked again with the reason, under a new token', async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  const llm = scriptedLlm({ cwd })
  let step = (await loop(cwd, ['next'])).step
  while (step.dispatches[0]?.agent !== 'consistency-lens') {
    startAgents(step, llm)
    step = (await loop(cwd, ['record'])).step
  }
  const firstToken = tokenLineOf(readFileSync(step.dispatches[0].brief, 'utf8'))
  startAgents(step, llm, () => true, ({ agent }) => agent !== 'consistency-lens')

  const asked = (await loop(cwd, ['record'])).step

  assert.deepEqual(asked.dispatches.map(({ agent }) => agent), ['consistency-lens'])
  const brief = readFileSync(asked.dispatches[0].brief, 'utf8')
  assert.match(brief, /the reply does not carry the token of its brief/)
  assert.notEqual(tokenLineOf(brief), firstToken)
})

test('a loop file that is not what skraft wrote refuses with a fixed reason; removing the pending list hands the agents over again', async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  const handed = (await loop(cwd, ['next'])).step
  const loopFile = (name) => join(trackingDir(cwd, SLUG), 'results', 'loop', name)
  const refusal = (name) => ({
    exit: 1, progress: '',
    step: {
      status: 'refused', slug: SLUG, phase: null, code: 'loop-file-unreadable', dispatches: [], then: null,
      reason: `${loopFile(name)} is not what skraft wrote; remove ${loopFile('pending.json')}, then run next to hand the agents over again`,
    },
  })
  writeFileSync(loopFile('replies.json'), '[]')
  assert.deepEqual(await loop(cwd, ['record']), refusal('replies.json'))
  writeFileSync(loopFile('replies.json'), '{ not json')
  assert.deepEqual(await loop(cwd, ['record']), refusal('replies.json'))
  rmSync(loopFile('replies.json'))
  assert.deepEqual(await loop(cwd, ['record']), refusal('replies.json'))

  for (const text of ['{ not json', '{}', 'null', '{ "dispatches": {} }']) {
    writeFileSync(loopFile('pending.json'), text)
    assert.deepEqual(await loop(cwd, ['next']), refusal('pending.json'), text)
    assert.deepEqual(await loop(cwd, ['record']), refusal('pending.json'), text)
  }
  rmSync(loopFile('pending.json'))
  assert.deepEqual((await loop(cwd, ['next'])).step.dispatches.map(({ agent }) => agent), handed.dispatches.map(({ agent }) => agent))
})

test('without --json the step reads as lines: the status, each agent with its prompt and reply file, then the command', async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  const { step } = await loop(cwd, ['next'])
  await skraft(cwd, ['record', '--json'])

  const run = await skraft(cwd, ['next'])

  assert.equal(run.status, 0)
  assert.equal(run.stdout, [
    `skraft ${SLUG}: dispatch in RESEARCH — start this agent, save each final reply as it is to its reply file, then record`,
    "agent 1: solution-researcher on the session's model",
    `  prompt: ${step.dispatches[0].prompt}`,
    `  reply: ${step.dispatches[0].reply}`,
    `then: ${RECORD}`,
    '',
  ].join('\n'))
  const blocked = await skraft(cwd, ['record'])
  assert.deepEqual(blocked, {
    status: 1,
    stdout: `skraft ${SLUG}: blocked (agent-failed) in RESEARCH — solution-researcher stopped without finishing: no reply was saved\n`,
    stderr: `phase RESEARCH\n${SLUG}: solution-researcher, attempt 1\n`,
  })
})

test('without an active pipeline next and record refuse; they take only --json, else the usage', async (t) => {
  const cwd = tempFolder(t)
  for (const command of ['next', 'record']) {
    const { exit, step } = await loop(cwd, [command])
    assert.deepEqual({ exit, status: step.status, code: step.code, then: step.then }, { exit: 1, status: 'refused', code: command === 'next' ? 'no-active-pipeline' : 'nothing-to-record', then: null })
  }
  assert.deepEqual(await skraft(cwd, ['record']), { status: 1, stdout: 'skraft: refused (nothing-to-record) — no agent was handed over; run next\n', stderr: '' })
  for (const args of [['next', '--all'], ['record', 'checkout'], ['next', '--json', '--json']]) {
    assert.equal((await skraft(cwd, args)).status, 2, args.join(' '))
  }
})

test('a hand-over the machine cannot write fails the command instead of handing over nothing', async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  mkdirSync(join(trackingDir(cwd, SLUG), 'results', 'loop', 'dispatch-1.brief.md'), { recursive: true })

  await assert.rejects(skraft(cwd, ['next']))

  assert.equal(existsSync(join(trackingDir(cwd, SLUG), 'results', 'loop', 'pending.json')), false)
})

test('started as a program, next tells how to record with the path of the program itself', async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  const home = tempFolder(t)

  const run = spawnSync(process.execPath, [SKRAFT_MJS, 'next', '--json'], { cwd, encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home } })

  assert.equal(run.status, 0, run.stderr)
  assert.equal(JSON.parse(run.stdout).then, `node "${SKRAFT_MJS}" record`)
  assert.ok(existsSync(join(trackingDir(cwd, SLUG), 'results', 'loop', 'pending.json')))
})
