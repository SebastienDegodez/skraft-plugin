import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUILT_IN_WORKFLOW, InMemoryGit, InMemoryTracking, ScriptedMachine, failingAnotherTest } from '../support/in-memory-host.mjs'
import { agent, API, green, scripted, SLUG, tddCycle, TRACKING } from '../support/pipeline-host.mjs'

const WEB = { name: 'web', root: '../web', stack: 'react', bdd: false, mocking: { strategy: 'inprocess' }, paths: { src: ['src'], tests: ['src'] }, commands: { lint: 'npx eslint .' } }
const recorded = (host, step) => host.events().filter((event) => event.type === 'step.recorded' && event.step === step)
const upToDeliver = (it) => [agent()(it), agent()(it), agent()(it)]
/** The engineer's work on pass n: the green of the scenario on the first, a TDD cycle on a pass the gates sent back. */
const passOf = (n) => (n === 1 ? green(SLUG, `Pass${n}`) : tddCycle(SLUG, `Pass${n}`))

/**
 * dotnet test failing on the same test at every run, each run printing its own time, process,
 * duration and temporary folder; root: the working copy its stack trace names.
 */
const sameTestFailing = (root = '/work') => {
  let run = 0
  return () => {
    run += 1
    return [
      `Test run for /tmp/skraft-${run}f3a/Checkout.Tests/bin/Debug/net10.0/Checkout.Tests.dll`,
      `  at CheckoutTests.PaysByCard() in ${root}/tests/CheckoutTests.cs:line 12`,
      `Starting test execution at 2026-10-11T09:0${run}:00.000Z, process ${4000 + run}`,
      `  Failed CheckoutTests.PaysByCard [${run * 12} ms]`,
      `Failed!  - Failed: 1, Passed: 4, Total: 5, Duration: ${run}.42 s`,
    ].join('\n')
  }
}

const BLOCKED = `deliver is blocked: gates failed the same way 3 times since it last passed, so it does not send the work back again.\nLeft by gates (1):\n- api/test: exited 1 (evidence: ${TRACKING}/gates/api/test-3.log)\n An instruction runs deliver again on a new pass with what is left above and the instruction; STOP ends the run.`

/** A build that passes, printing something else at each run. */
const buildNumbered = () => {
  let build = 0
  return () => `Build #${(build += 1)} succeeded\n`
}

test('gates that fail the same way three times since they last passed ask a human, though each run prints its own time, process, duration and temporary folder, and the gates that pass print anything; an instruction sends the work back', async () => {
  const machine = new ScriptedMachine({ exits: { '. $ dotnet test': 1 }, outputs: { '. $ dotnet test': sameTestFailing(), '. $ dotnet build': buildNumbered() } })
  const host = scripted({ machine }, (it) => [...upToDeliver(it), ...[1, 2, 3, 4].map((n) => agent({ work: (h) => {
    if (n === 4) machine.exits['. $ dotnet test'] = 0
    passOf(n)(h)
  } })(it))])

  const waiting = await host.start()
  await host.decide({ answer: 'Charge the amount of the cart, not the unit price' })
  const outcome = await host.run()

  assert.deepEqual(waiting, { status: 'waiting', slug: SLUG, phase: 'DELIVER', code: 'blocked', reason: `${BLOCKED} Answer with skraft decide deliver-1 "<instruction>"|STOP.` })
  assert.equal(outcome.status, 'done', outcome.reason)
  const gates = recorded(host, 'gates')
  assert.deepEqual(gates.map(({ visit, outcome: result, code, next, ceiling }) => [visit, result, code, next, ceiling]), [
    [1, 'fail', null, 'deliver', undefined], [2, 'fail', null, 'deliver', undefined], [3, 'fail', 'repeated-failure', null, 'deliver'], [4, 'pass', null, 'deliver_review', undefined],
  ])
  assert.match(gates[0].signature, /^[0-9a-f]{8}$/)
  assert.deepEqual(gates.map(({ signature }) => signature), [gates[0].signature, gates[0].signature, gates[0].signature, undefined])
  const reopened = host.agentRunner.dispatches.find(({ label }) => label === `skraft ${SLUG} · deliver · pass 4 · attempt 1`)
  assert.ok(reopened.prompt.includes('Charge the amount of the cart, not the unit price'), reopened.prompt)
})

test('a run stopped after two failures of a gate counts them once resumed: the third asks a human', async () => {
  const machine = new ScriptedMachine({ exits: { '. $ dotnet test': 1 }, outputs: { '. $ dotnet test': sameTestFailing() } })
  const host = scripted({ machine }, (it) => [
    ...upToDeliver(it), agent({ work: passOf(1) })(it), agent({ work: passOf(2) })(it),
    async (dispatch) => { await agent({ work: passOf(3) })(it)(dispatch); throw new Error('host interrupted') },
  ])

  await assert.rejects(host.start(), /host interrupted/)
  const waiting = await host.run()

  assert.deepEqual([waiting.status, waiting.code, waiting.reason], ['waiting', 'blocked', `${BLOCKED} Answer with skraft decide deliver-1 "<instruction>"|STOP.`])
})

test('gates of two components, one failing on another test at each round, are sent back until their loop\'s max_visits: no two of their failures share a signature', async () => {
  const machine = new ScriptedMachine({ exits: { '. $ dotnet test': 1, '../web $ npx eslint .': 1 }, outputs: { '. $ dotnet test': failingAnotherTest() } })
  const git = new InMemoryGit({ repositories: { '.': { mergeBases: { main: 'root-0' } }, '../web': { mergeBases: { main: 'up-web-0' } } } })
  const host = scripted({ machine, git, components: [API, WEB], answers: [{ answer: 'STOP' }] }, (it) => [...upToDeliver(it), ...[1, 2, 3, 4].map((n) => agent({ work: (h) => {
    passOf(n)(h)
    if (n > 1) h.git.commit(`refactor(checkout): pass ${n} of the cart`, ['../web/src/Cart.tsx'])
  } })(it))])

  const outcome = await host.start()

  assert.deepEqual([outcome.status, outcome.code], ['blocked', 'loop-ceiling'])
  assert.equal(new Set(recorded(host, 'gates').map(({ signature }) => signature)).size, 4)
})

test('an agent refused twice the same way, its commit made again under another sha, trips the breaker on its second attempt', async () => {
  const git = new InMemoryGit({ hex: true, repositories: { '.': { mergeBases: { main: 'c0ffee0' } } } })
  const wip = ({ git: made }) => {
    made.reset('.', 'c0ffee0')
    made.commit('wip', ['tests/PayTests.cs'])
  }
  const host = scripted({ git }, (it) => [agent()(it), agent()(it), agent({ work: wip })(it), agent({ work: wip })(it), agent()(it)])

  const outcome = await host.start()

  assert.equal(outcome.code, 'commit-convention')
  assert.ok(outcome.reason.startsWith('acceptance-designer failed the same way on attempts 1 and 2: '), outcome.reason)
  assert.ok(outcome.reason.includes('commit c0ffee2 "wip" is not a conventional commit'), outcome.reason)
  assert.deepEqual(recorded(host, 'distill').map(({ attempt, failures }) => [attempt, failures.find((failure) => failure.includes('"wip"'))]), [
    [1, 'commit c0ffee1 "wip" is not a conventional commit (type(scope): subject); reword it'],
    [2, 'commit c0ffee2 "wip" is not a conventional commit (type(scope): subject); reword it'],
  ])
})

test('a human who stops gates that failed the same way three times ends the run with their failure', async () => {
  const machine = new ScriptedMachine({ exits: { '. $ dotnet test': 1 }, outputs: { '. $ dotnet test': sameTestFailing() } })
  const host = scripted({ machine, answers: [{ answer: 'STOP' }] }, (it) => [...upToDeliver(it), ...[1, 2, 3].map((n) => agent({ work: passOf(n) })(it))])

  const outcome = await host.start()

  assert.deepEqual(outcome, { status: 'blocked', slug: SLUG, phase: 'DELIVER', code: 'repeated-failure', reason: `gates failed the same way 3 times since it last passed; api/test: exited 1 (evidence: ${TRACKING}/gates/api/test-3.log)` })
})

test('gates whose loop reaches its max_visits as their failure comes back the third time stop at the ceiling', async () => {
  const workflow = BUILT_IN_WORKFLOW.replace('gates -> deliver [label="FAIL", max_visits=3]', 'gates -> deliver [label="FAIL", max_visits=2]')
  const machine = new ScriptedMachine({ exits: { '. $ dotnet test': 1 }, outputs: { '. $ dotnet test': sameTestFailing() } })
  const host = scripted({ machine, files: { '.skraft/pipeline.skraft.dot': workflow } }, (it) => [...upToDeliver(it), ...[1, 2, 3].map((n) => agent({ work: passOf(n) })(it))])

  const waiting = await host.start()

  assert.ok(waiting.reason.startsWith('deliver is blocked: gates -> deliver was taken as often as its max_visits allows.'), waiting.reason)
  assert.deepEqual(recorded(host, 'gates').map(({ code }) => code), [null, null, 'loop-ceiling'])
})

test('an agent that keeps coming back to the same failure, another one between, stops at the third time though it has attempts left', async () => {
  const workflow = BUILT_IN_WORKFLOW.replace('deliver  [shape=box, agent="software-engineer", phase="DELIVER", each="scenario"]', 'deliver  [shape=box, agent="software-engineer", phase="DELIVER", each="scenario", max_attempts=6]')
  const git = new InMemoryGit({ hex: true, repositories: { '.': { mergeBases: { main: 'c0ffee0' } } } })
  const again = (subject) => ({ git: made }) => {
    made.reset('.', 'c0ffee1')
    made.commit(subject, ['src/Checkout.cs'])
  }
  const host = scripted({ git, files: { '.skraft/pipeline.skraft.dot': workflow } }, (it) => [
    agent()(it), agent()(it), agent()(it),
    ...['wip', 'chore(checkout): tidy', 'wip', 'chore(checkout): tidy', 'wip', 'wip'].map((subject) => agent({ work: again(subject) })(it)),
  ])

  const outcome = await host.start()

  assert.equal(outcome.status, 'blocked')
  assert.ok(outcome.reason.startsWith('software-engineer failed the same way 3 times since it last passed: '), outcome.reason)
  assert.deepEqual(recorded(host, 'deliver').map(({ attempt, outcome: result }) => [attempt, result]), [[1, 'failed'], [2, 'failed'], [3, 'failed'], [4, 'failed'], [5, 'failed']])
})

test('the same failure on two machines, in two working copies, gets the same signature', async () => {
  const on = async (root) => {
    const machine = new ScriptedMachine({ exits: { '. $ dotnet test': 1 }, outputs: { '. $ dotnet test': sameTestFailing(root) } })
    const host = scripted({ machine, tracking: new InMemoryTracking({ root: `${root}/.copilot-tracking/skraft-plans` }), answers: [{ answer: 'STOP' }] }, (it) => [...upToDeliver(it), ...[1, 2, 3].map((n) => agent({ work: passOf(n) })(it))])
    await host.start()
    return recorded(host, 'gates').map(({ signature }) => signature)
  }

  const here = await on('/work')
  const there = await on('/home/ci/shop')

  assert.deepEqual(there, here)
})
