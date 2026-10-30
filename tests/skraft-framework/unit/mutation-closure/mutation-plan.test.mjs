import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ScriptedMachine } from '../support/in-memory-host.mjs'
import { agent, scripted, SLUG, TRACKING } from '../support/pipeline-host.mjs'
import { ALL_KILLED, strykerReport } from '../support/mutation-reports.mjs'

const REPORT = 'StrykerOutput/reports/mutation-report.json'
const STRYKER = '. $ dotnet stryker'
const CHECKOUT = ['src/Checkout.cs:12 Equality (!=) survived', 'src/Checkout.cs:20 Boolean (false) has no test covering it']
const REFUND = ['src/Refund.cs:7 Arithmetic (-) survived']
const PROPOSALS = [`.copilot-tracking/skraft-plans/${SLUG}/proposals/kill_proposal-1-g1.md`, `.copilot-tracking/skraft-plans/${SLUG}/proposals/kill_proposal-1-g2.md`]
const twoFiles = strykerReport({
  '/work/src/Checkout.cs': [[12, 'Equality', '!=', 'Survived'], [20, 'Boolean', 'false', 'NoCoverage'], [31, 'String', null, 'Killed']],
  '/work/src/Refund.cs': [[7, 'Arithmetic', '-', 'Survived']],
}, { projectRoot: '/work/src' })

const delivering = (it) => agent({
  work: ({ git }) => {
    git.commit(`test(${SLUG}): checkout pays by card`, ['tests/CheckoutTests.cs'])
    git.commit(`feat(${SLUG}): checkout pays by card`, ['src/Checkout.cs', 'src/Refund.cs'])
  },
})(it)
const upToDeliver = (it) => [agent()(it), agent()(it), agent()(it), delivering(it)]
const proposer = (it) => agent()(it)
const killer = (it) => agent({ work: ({ git }) => git.commit(`test(${SLUG}): kill the checkout mutants`, ['tests/CheckoutTests.cs']) })(it)
const recorded = (host, steps) => host.events().filter((event) => event.type === 'step.recorded' && steps.includes(event.step))

/** The first mutation run fails on twoFiles, every later one passes. */
const failsOnce = (host) => {
  let runs = 0
  host.machine.meanwhile[STRYKER] = async () => {
    runs += 1
    host.machine.exits[STRYKER] = runs === 1 ? 1 : 0
    await host.workspace.write(REPORT, runs === 1 ? twoFiles : ALL_KILLED)
  }
}

/** The dispatches after DELIVER's own, the pr-writer's left out. */
const afterDeliver = (host) => host.agentRunner.dispatches.slice(4).filter(({ agent: id }) => id !== 'pr-writer')

test('a failing mutation run gets a proposal per file of survivors, then one question to the developer naming them; APPLY sends them to kill_mutants, then test-integrity, the gates and mutation, which passes', async () => {
  const host = scripted({ machine: new ScriptedMachine(), answers: [{ answer: 'apply' }] }, (it) => [...upToDeliver(it), proposer(it), proposer(it), killer(it)])
  host.human.by = 'host-confirmed'
  failsOnce(host)

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(afterDeliver(host).map(({ agent: name, label }) => [name, label]), [
    ['software-engineer', `skraft ${SLUG} · kill_proposal · group 1 of 2 · attempt 1`],
    ['software-engineer', `skraft ${SLUG} · kill_proposal · group 2 of 2 · attempt 1`],
    ['software-engineer', `skraft ${SLUG} · kill_mutants · attempt 1`],
  ])
  const [first, second, kill] = afterDeliver(host)
  assert.ok(first.prompt.includes(['Propose how to treat the surviving mutants of src/Checkout.cs (group 1 of 2):', ...CHECKOUT.map((line) => `- ${line}`)].join('\n')), first.prompt)
  assert.ok(first.prompt.includes(`- Fill each output in place; keep the path, create no other copy:\n- ${TRACKING}/proposals/kill_proposal-1-g1.md\n`), first.prompt)
  assert.ok(first.prompt.includes('- Propose, change nothing: for each mutant of your output, replace its `outcome` line with one of `test: …`, `delete: …`, `equivalent: …`;'), first.prompt)
  assert.ok(!first.prompt.includes('Commit each') && !first.prompt.includes('Kill each mutant') && !first.prompt.includes('/src'), first.prompt)
  assert.ok(second.prompt.includes(`Propose how to treat the surviving mutants of src/Refund.cs (group 2 of 2):\n- ${REFUND[0]}`), second.prompt)
  const proposal = await host.tracking.read(SLUG, 'proposals/kill_proposal-1-g1.md')
  assert.ok(proposal.startsWith([
    '# Mutation proposal: src/Checkout.cs (group 1 of 2)',
    '',
    'For each surviving mutant, replace its outcome line with one of:',
    '- `test: <the test that kills it: its file, its input, what it asserts>`',
    '- `delete: <the code no behaviour asks for: its file and lines>`',
    '- `equivalent: <why no test can tell the mutant from the code>`',
    '',
    `## ${CHECKOUT[0]}`,
    '',
    'filled in',
    '',
    `## ${CHECKOUT[1]}`,
    '',
    'filled in',
  ].join('\n')), proposal)

  assert.deepEqual(host.human.questions.map(({ key, kind, options, header, text }) => [key, kind, options, header, text]), [[
    'mutation_plan-1', 'mutation-plan', ['APPLY', 'STOP'], 'Mutation plan',
    `The mutation gate failed; a proposal for its surviving mutants is in ${PROPOSALS.join(', ')}. APPLY applies it; or write how to treat them instead; STOP ends the run.`,
  ]])
  const asked = host.events().find((event) => event.type === 'question.asked')
  assert.deepEqual([asked.step, asked.subjects], ['mutation_plan', PROPOSALS])
  const answered = host.events().filter((event) => event.type === 'question.answered')
  assert.deepEqual(answered.map(({ key, answer, by }) => [key, answer, by]), [['mutation_plan-1', 'APPLY', 'host-confirmed']])

  assert.ok(kill.prompt.includes(['A human chose how to go on:', `- Apply the proposals in ${PROPOSALS.map((path) => `/work/${path}`).join(', ')}`].join('\n')), kill.prompt)
  assert.ok(kill.prompt.includes('- Kill each mutant with a `test(<story>): …` commit whose test passes on the code as it is.'), kill.prompt)
  const steps = ['mutation', 'kill_proposal', 'mutation_plan', 'kill_mutants', 'mutation_review', 'mutation_gates']
  assert.deepEqual(recorded(host, steps).map(({ step, group, outcome: result, next }) => [step, group, result, next]), [
    ['mutation', undefined, 'fail', 'kill_proposal'],
    ['kill_proposal', 1, 'done', null],
    ['kill_proposal', 2, 'done', 'mutation_plan'],
    ['mutation_plan', undefined, 'answered', 'kill_mutants'],
    ['kill_mutants', undefined, 'done', 'mutation_review'],
    ['mutation_review', undefined, 'approved', 'mutation_gates'],
    ['mutation_gates', undefined, 'pass', 'mutation'],
    ['mutation', undefined, 'pass', 'visuals'],
  ])
})

test('an instruction instead of APPLY reaches kill_mutants as what the developer chose, with the proposals', async () => {
  const instruction = 'Delete the dead branch of Checkout instead of testing it'
  const host = scripted({ machine: new ScriptedMachine(), answers: [{ answer: instruction }] }, (it) => [...upToDeliver(it), proposer(it), proposer(it), killer(it)])
  failsOnce(host)

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(afterDeliver(host).map(({ label }) => label).at(-1), `skraft ${SLUG} · kill_mutants · attempt 1`)
  const kill = afterDeliver(host)[2]
  assert.ok(kill.prompt.includes([
    'A human chose how to go on:',
    `- ${instruction}`,
    `- The proposals it departs from: ${PROPOSALS.map((path) => `/work/${path}`).join(', ')}`,
  ].join('\n')), kill.prompt)
  assert.deepEqual(recorded(host, ['mutation_plan']).map(({ answer, next }) => [answer, next]), [[instruction, 'kill_mutants']])
})

test('the kill the developer chose names no failing test: a fix it commits needs its failing test first', async () => {
  const fixing = (it) => agent({ work: ({ git }) => git.commit(`fix(${SLUG}): refund the right amount`, ['src/Refund.cs']) })(it)
  const host = scripted({ machine: new ScriptedMachine(), answers: [{ answer: 'APPLY' }] }, (it) => [...upToDeliver(it), proposer(it), proposer(it), fixing(it), agent({ work: ({ git }) => { git.reset('.', 'root-2'); git.commit(`test(${SLUG}): kill the checkout mutants`, ['tests/CheckoutTests.cs']) } })(it)])
  failsOnce(host)

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(recorded(host, ['kill_mutants']).map(({ attempt, outcome: result, code }) => [attempt, result, code]), [[1, 'failed', 'tdd'], [2, 'done', null]])
  assert.ok(afterDeliver(host)[3].prompt.includes(`fix(${SLUG}): refund the right amount" makes code pass with no test commit since the last feat or fix`), afterDeliver(host)[3].prompt)
})

test('with no answer at the host, the run waits on the mutation plan; skraft decide answers it with an instruction, in any words but STOP and APPLY', async () => {
  const host = scripted({ machine: new ScriptedMachine() }, (it) => [...upToDeliver(it), proposer(it), proposer(it), killer(it)])
  failsOnce(host)

  const waiting = await host.start()

  const text = `The mutation gate failed; a proposal for its surviving mutants is in ${PROPOSALS.join(', ')}. APPLY applies it; or write how to treat them instead; STOP ends the run.`
  assert.deepEqual(waiting, { status: 'waiting', slug: SLUG, phase: 'DELIVER', code: 'mutation-plan', reason: `${text} Answer with skraft decide mutation_plan-1 APPLY|"<instruction>"|STOP.` })
  assert.equal((await host.decide({ answer: '  ' })).ok, false)
  assert.equal((await host.decide({ answer: 'Keep', reason: 'the guard, mark it equivalent' })).ok, true)
  assert.deepEqual(await host.decide({ answer: 'APPLY' }), { ok: false, slug: SLUG, key: null, code: 'already-answered', reason: 'mutation_plan-1 was already answered' })
  assert.equal((await host.run()).status, 'done')
  assert.deepEqual(host.events().filter((event) => event.type === 'question.answered').map(({ answer, by }) => [answer, by]), [['Keep the guard, mark it equivalent', 'decide']])
  assert.ok(afterDeliver(host)[2].prompt.includes('A human chose how to go on:\n- Keep the guard, mark it equivalent\n'), afterDeliver(host)[2].prompt)
})

test('STOP to the mutation plan ends the run blocked, the proposals kept, nothing applied', async () => {
  const host = scripted({ machine: new ScriptedMachine(), answers: [{ answer: 'STOP' }] }, (it) => [...upToDeliver(it), proposer(it), proposer(it)])
  failsOnce(host)

  const outcome = await host.start()

  const reason = `a human stopped the run at mutation_plan; the proposals are in ${PROPOSALS.join(', ')}`
  assert.deepEqual(outcome, { status: 'blocked', slug: SLUG, phase: 'DELIVER', code: 'stopped', reason })
  assert.equal(afterDeliver(host).length, 2)
  assert.deepEqual(recorded(host, ['mutation_plan']).map(({ answer, next, code }) => [answer, next, code]), [['STOP', null, 'stopped']])
  assert.deepEqual(host.events().at(-1), { ...host.events().at(-1), type: 'run.finished', status: 'blocked', code: 'stopped', reason })
})
