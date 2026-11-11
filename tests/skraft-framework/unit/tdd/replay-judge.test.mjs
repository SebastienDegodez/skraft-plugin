import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ScriptedReplay, judgeAnswer } from '../support/in-memory-host.mjs'
import { SLUG, TRACKING, agent, scripted } from '../support/pipeline-host.mjs'
import { waitingOnEnvironment } from '../support/decisions.mjs'

const unavailable = () => ({ ok: false, unavailable: true, text: '' })
const research = (it) => [agent()(it), agent()(it)]
/** Where the engine keeps what the replay of a commit printed. */
const logOf = (sha, label = 'test') => `${TRACKING}/logs/replay-${sha}-api-${label}.log`
/** Where the engine keeps the judge's answer on a commit, as the judge wrote it. */
const answerOf = (sha, kind) => `${TRACKING}/logs/judge-${sha}-${kind}.md`
const recorded = (host, step) => host.events().filter((event) => event.type === 'step.recorded' && event.step === step)
const checked = (host, step) => host.events().filter((event) => event.type === 'commits.checked' && event.step === step)
const judged = (host) => host.agentRunner.judged
/** The judge answering from a queue (an answer, or what a function does then answers), then accepting. @param {Array<string | object | (() => string | object)>} answers */
const judging = (...answers) => () => {
  const next = answers.shift() ?? judgeAnswer('accept')
  return typeof next === 'function' ? next() : next
}
const SHAPE = ['End your final message with this YAML document, in a fenced block:', '```yaml', 'decision: send-back    # accept | send-back | retry | ask-human', 'note: "<what the logs show, and what the agent or the human has to do>"', '```']
const asksAbout = (sha, kind, why = `read ${answerOf(sha, kind)}`) => `the replay judge asks a human about the ${kind} commit ${sha}: ${why}`

test('a red whose tests fail is replayed at its parent too, and the replay judge reads both: accepted, the red is its scenario\'s oracle', async () => {
  const host = scripted({}, (it) => [...research(it), agent({ work: ({ git }) => git.commit('test(checkout): scenario 1', ['tests/Acceptance/S1AcceptanceTests.cs', 'src/PayOrder.cs']) })(it), unavailable])

  await host.start()

  assert.deepEqual(host.replay.lines(), ['root-1 ./. $ dotnet test', 'root-0 ./. $ dotnet test'])
  const [dispatch] = judged(host)
  assert.deepEqual([dispatch.agent, dispatch.source, dispatch.label, dispatch.model], ['replay-judge', 'plugin', `skraft ${SLUG} · distill · judge red root-1 of attempt 1 · attempt 1`, 'standard'])
  assert.equal(dispatch.prompt, [
    'Judge the red commit root-1 "test(checkout): scenario 1", for scenario 1 "Customer pays by card".',
    'Its repository: .',
    'Its files: tests/Acceptance/S1AcceptanceTests.cs, src/PayOrder.cs',
    'The engine replayed, each in a throwaway checkout, from the component root:',
    `- api: \`dotnet test\` at the commit root-1: exit 1; printed to ${logOf('root-1')}`,
    `- api: \`dotnet test\` at its parent root-0: exit 1; printed to ${logOf('root-1', 'test-parent')}`,
    ...SHAPE,
  ].join('\n'))
  assert.equal(host.tracking.files.get(`${SLUG}/logs/judge-root-1-red.md`), judgeAnswer('accept'))
  const [replay] = checked(host, 'distill')[0].commits.map((commit) => commit.replay)
  assert.deepEqual([replay.exitCode, replay.log, replay.judge.decision, replay.judge.answer, replay.judge.model, replay.judge.assignment.family], [1, logOf('root-1'), 'accept', answerOf('root-1', 'red'), null, 'standard'])
  assert.deepEqual(recorded(host, 'distill').at(-1).oracle, { scenario: 1, sha: 'root-1', subject: 'test(checkout): scenario 1', component: 'api', files: ['tests/Acceptance/S1AcceptanceTests.cs', 'src/PayOrder.cs'], command: 'test' })
})

test('a replay that could not start, or that ran out of time, goes to the judge with what stopped it', async () => {
  const host = scripted({ replay: new ScriptedReplay({ exits: { 'root-1': null, 'root-0': 'timeout' } }) }, (it) => [...research(it), agent()(it), unavailable])

  await host.start()

  const lines = judged(host)[0].prompt.split('\n')
  assert.deepEqual(lines.filter((line) => line.startsWith('- api:')), [
    `- api: \`dotnet test\` at the commit root-1: could not start dotnet; printed to ${logOf('root-1')}`,
    `- api: \`dotnet test\` at its parent root-0: dotnet did not finish within 600 s; printed to ${logOf('root-1', 'test-parent')}`,
  ])
})

test('a red the judge sends back is refused, naming its answer for the agent to read; the decision is read in any case', async () => {
  const host = scripted({}, (it) => [...research(it), agent()(it), unavailable])
  host.agentRunner.judge = judging(judgeAnswer('Send-Back', 'the test fails on a missing class, not on its assertion'))

  await host.start()

  assert.deepEqual(recorded(host, 'distill').map(({ outcome, code, failures }) => [outcome, code, failures]), [['failed', 'tdd', [`commit root-1 "test(checkout): scenario 1" is not red: the replay judge sends it back: read ${answerOf('root-1', 'red')}; a test commit must fail on an assertion before the code that makes it pass`]]])
  assert.match(host.tracking.files.get(`${SLUG}/logs/judge-root-1-red.md`), /a missing class/)
  assert.equal(checked(host, 'distill')[0].commits[0].verdict, 'not-red')
})

test('a judge that asks for a retry has the commands replayed once more, then is asked again; asking a second time, it waits on a human', async () => {
  const host = scripted({}, (it) => [...research(it), agent()(it), unavailable])
  host.agentRunner.judge = judging(judgeAnswer('retry', 'the network dropped'))

  await host.start()

  assert.deepEqual(host.replay.lines(), ['root-1 ./. $ dotnet test', 'root-0 ./. $ dotnet test', 'root-1 ./. $ dotnet test', 'root-0 ./. $ dotnet test'])
  assert.deepEqual(judged(host).slice(0, 2).map(({ label }) => label), [`skraft ${SLUG} · distill · judge red root-1 of attempt 1 · attempt 1`, `skraft ${SLUG} · distill · judge red root-1 again of attempt 1 · attempt 1`])
  assert.ok(judged(host)[1].prompt.includes('\nThese replays ran again after your retry: a second retry asks a human.\n'), judged(host)[1].prompt)
  assert.deepEqual(recorded(host, 'distill').map(({ outcome }) => outcome), ['done'])

  const twice = scripted({}, (it) => [...research(it), agent()(it), unavailable])
  twice.agentRunner.judge = () => judgeAnswer('retry', 'still dropping')
  const outcome = await twice.start()
  assert.deepEqual([outcome.status, outcome.reason], ['waiting', waitingOnEnvironment('distill', asksAbout('root-1', 'red'), 1, { owner: 'judge', log: answerOf('root-1', 'red') })])
})

test('a judge that finds nothing an agent can fix waits on a human, its answer the output to read; RETRY replays and judges the red again, using no new attempt', async () => {
  const host = scripted({}, (it) => [...research(it), agent()(it), unavailable])
  host.agentRunner.judge = judging(judgeAnswer('ask-human', 'Docker does not answer: start it'))

  const outcome = await host.start()

  assert.deepEqual([outcome.status, outcome.reason], ['waiting', waitingOnEnvironment('distill', asksAbout('root-1', 'red'), 1, { owner: 'judge', log: answerOf('root-1', 'red') })])
  assert.deepEqual(recorded(host, 'distill'), [])
  assert.deepEqual(host.events().filter(({ type }) => type === 'question.asked').at(-1).incident, { owner: 'judge', log: answerOf('root-1', 'red') })
  await host.decide({ answer: 'RETRY' })
  await host.run()
  assert.deepEqual(recorded(host, 'distill').map(({ attempt, outcome: done }) => [attempt, done]), [[1, 'done']])
  assert.equal(judged(host).filter(({ label }) => label.includes('judge red')).length, 2)
})

test('a judge whose answer the engine cannot read is asked once more, told why; unreadable twice, or not started at all, the judge waits on a human', async () => {
  const host = scripted({}, (it) => [...research(it), agent()(it), unavailable])
  host.agentRunner.judge = judging('It looks fine to me.')

  await host.start()

  assert.deepEqual(judged(host).slice(0, 2).map(({ label }) => label), [`skraft ${SLUG} · distill · judge red root-1 of attempt 1 · attempt 1`, `skraft ${SLUG} · distill · judge red root-1 of attempt 1 · attempt 2`])
  assert.ok(judged(host)[1].prompt.includes('\nYour last answer could not be read: the answer is not the YAML document the brief shows.\n'), judged(host)[1].prompt)
  assert.deepEqual(recorded(host, 'distill').map(({ outcome }) => outcome), ['done'])

  const cases = [
    [() => judgeAnswer('maybe'), 'replay-judge answered 2 times with no verdict the engine reads (decision is not one of accept, send-back, retry, ask-human)', 2],
    [() => ['```yaml', 'decision: accept', '```'].join('\n'), 'replay-judge answered 2 times with no verdict the engine reads (a verdict needs its note: what the logs show)', 2],
    [() => ['```yaml', 'decision: accept', 'note: "   "', '```'].join('\n'), 'replay-judge answered 2 times with no verdict the engine reads (a verdict needs its note: what the logs show)', 2],
    [() => ['```yaml', 'decision: accept', 'note: []', '```'].join('\n'), 'replay-judge answered 2 times with no verdict the engine reads (a verdict needs its note: what the logs show)', 2],
    [() => ['```yaml', 'decision: accept', 'note: fine', 'tests: Pays', '```'].join('\n'), 'replay-judge answered 2 times with no verdict the engine reads (the key tests is not in the contract; the keys are decision, note)', 2],
    [() => ({ ok: false, text: '' }), 'replay-judge answered 2 times with no verdict the engine reads (it ended with no answer)', 2],
    [() => unavailable(), 'the host could not start replay-judge', 1],
  ]
  for (const [judge, why, asked] of cases) {
    const stuck = scripted({}, (it) => [...research(it), agent()(it), unavailable])
    stuck.agentRunner.judge = judge
    const outcome = await stuck.start()
    assert.deepEqual([outcome.status, outcome.reason], ['waiting', waitingOnEnvironment('distill', asksAbout('root-1', 'red', why), 1, { owner: 'judge' })], why)
    assert.equal(stuck.agentRunner.judged.length, asked, why)
    const recordedJudge = checked(stuck, 'distill')[0].commits[0].replay.judge
    assert.deepEqual([recordedJudge.decision, recordedJudge.answer, recordedJudge.model], ['ask-human', null, null], why)
  }
})

test('what the judge costs counts in the cost of the step it judges, and the model it ran on is journaled with its decision', async () => {
  const host = scripted({}, (it) => [...research(it), agent({ answer: { ok: true, text: 'done', costUsd: 0.5 } })(it), unavailable])
  host.agentRunner.judge = () => ({ ok: true, text: judgeAnswer('accept'), costUsd: 0.25, model: 'claude-sonnet' })

  await host.start()

  assert.equal(recorded(host, 'distill')[0].cost, 0.75)
  const { judge } = checked(host, 'distill')[0].commits[0].replay
  assert.deepEqual([judge.cost, judge.model], [0.25, 'claude-sonnet'])
})

test('a green is judged with the red of its scenario: its brief names where that red printed, at the red and at its parent, and its acceptance tests; sent back, the green is refused naming the answer', async () => {
  const host = scripted({}, (it) => [...research(it), agent({ work: ({ git }) => git.commit('test(checkout): scenario 1', ['tests/Acceptance/S1AcceptanceTests.cs', 'tests/Acceptance/S1Steps.cs', 'src/PayOrder.cs']) })(it), agent()(it), unavailable])
  host.agentRunner.judge = judging(judgeAnswer('accept'), judgeAnswer('send-back', 'the acceptance test is skipped at it'))

  await host.start()

  const green = judged(host)[1]
  assert.equal(green.label, `skraft ${SLUG} · deliver · judge green root-2 of attempt 1 · attempt 1`)
  assert.equal(green.prompt, [
    'Judge the green commit root-2 "feat(checkout): scenario 1", for scenario 1 "Customer pays by card".',
    'Its repository: .',
    'Its files: src/Scenario1.cs',
    `The red of its scenario is root-1; its replay printed to ${logOf('root-1')}, and at its parent to ${logOf('root-1', 'test-parent')}`,
    'The acceptance tests of its scenario: tests/Acceptance/S1AcceptanceTests.cs, tests/Acceptance/S1Steps.cs',
    'The engine replayed, each in a throwaway checkout, from the component root:',
    `- api: \`dotnet test\` at the commit root-2: exit 0; printed to ${logOf('root-2')}`,
    ...SHAPE,
  ].join('\n'))
  assert.ok(host.tracking.files.has(`${SLUG}/logs/replay-root-1-api-test-parent.log`), 'the red\'s parent log the green brief names exists')
  assert.match(host.tracking.files.get(`${SLUG}/logs/replay-root-1-api-test-parent.log`), /\ncommit: root-0\n/)
  assert.deepEqual(recorded(host, 'deliver')[0].failures, [`commit root-2 "feat(checkout): scenario 1" does not make the scenario pass: the replay judge sends it back: read ${answerOf('root-2', 'green')}`])
  assert.equal(checked(host, 'deliver')[0].commits[0].verdict, 'not-green')
})

test('a green whose tests fail is judged too, never refused without the judge', async () => {
  const host = scripted({ replay: new ScriptedReplay({ exits: { 'root-2': 3 } }) }, (it) => [...research(it), agent()(it), agent()(it), unavailable])

  await host.start()

  assert.ok(judged(host)[1].prompt.includes(`\n- api: \`dotnet test\` at the commit root-2: exit 3; printed to ${logOf('root-2')}\n`), judged(host)[1].prompt)
  assert.deepEqual(recorded(host, 'deliver').map(({ outcome }) => outcome), ['done'])
})

test('a green the judge asks to retry is replayed once more and judged again', async () => {
  const host = scripted({}, (it) => [...research(it), agent()(it), agent()(it), unavailable])
  host.agentRunner.judge = judging(judgeAnswer('accept'), judgeAnswer('retry', 'a port was busy'))

  await host.start()

  assert.deepEqual(host.replay.lines().filter((line) => line.startsWith('root-2')), ['root-2 ./. $ dotnet test', 'root-2 ./. $ dotnet test'])
  assert.deepEqual(judged(host).map(({ label }) => label.split(' · ')[2]), ['judge red root-1 of attempt 1', 'judge green root-2 of attempt 1', 'judge green root-2 again of attempt 1'])
  assert.deepEqual(recorded(host, 'deliver').map(({ outcome }) => outcome), ['done'])
})

test('a red the judge sent back stays refused on the next attempt of the pass, naming the same answer, and the judge is not asked again', async () => {
  const host = scripted({}, (it) => [...research(it), agent()(it), agent({ work: () => {} })(it), unavailable])
  host.agentRunner.judge = judging(judgeAnswer('send-back', 'it fails on a missing class'))

  await host.start()

  const [first, second] = recorded(host, 'distill')
  assert.deepEqual(first.failures, [`commit root-1 "test(checkout): scenario 1" is not red: the replay judge sends it back: read ${answerOf('root-1', 'red')}; a test commit must fail on an assertion before the code that makes it pass`])
  assert.deepEqual(second.failures, first.failures)
  assert.equal(judged(host).length, 1)
})

test('a green whose replay a person interrupts stops the run before the judge is asked about it', async () => {
  const host = scripted({ replay: new ScriptedReplay({ exits: { 'root-2': 130 } }) }, (it) => [...research(it), agent()(it), agent()(it), unavailable])

  const outcome = await host.start()

  assert.deepEqual([outcome.code, outcome.reason], ['interrupted', 'replaying root-2 for api: dotnet test was interrupted by a person (exit 130); run the pipeline again to go on'])
  assert.deepEqual(judged(host).map(({ label }) => label.split(' · ')[2]), ['judge red root-1 of attempt 1'])
})

test('what the engine writes in the tracking folder while the judge works is no change of the judge\'s', async () => {
  const host = scripted({}, (it) => [...research(it), agent()(it), unavailable])
  host.agentRunner.judge = () => {
    host.git.change('.copilot-tracking/skraft-plans/checkout/logs/replay-root-1-api-test.log')
    return judgeAnswer('accept')
  }

  await host.start()

  assert.deepEqual(recorded(host, 'distill').map(({ outcome }) => outcome), ['done'])
})

test('a judge that changes the working copy while it judges stops the step for a human, whatever it answers', async () => {
  for (const change of [(git) => git.change('src/Injected.cs'), (git) => git.commit('chore(checkout): sneak', ['src/Injected.cs'])]) {
    const host = scripted({}, (it) => [...research(it), agent()(it), unavailable])
    host.agentRunner.judge = () => {
      change(host.git)
      return judgeAnswer('accept')
    }

    const outcome = await host.start()

    assert.deepEqual([outcome.status, outcome.reason], ['waiting', waitingOnEnvironment('distill', 'the replay judge changed the working copy (a commit or a file) while it judged; undo that change, then retry', 1, { owner: 'judge' })])
    assert.deepEqual(recorded(host, 'distill'), [])
  }
})

test('a red that fails, then passes once the judge asks for a retry, is no red: the replay that settles it is the one it reports', async () => {
  const host = scripted({}, (it) => [...research(it), agent()(it), unavailable])
  host.agentRunner.judge = () => {
    host.replay.exits['root-1'] = 0
    return judgeAnswer('retry', 'the network dropped')
  }

  await host.start()

  assert.deepEqual(recorded(host, 'distill')[0].failures, [`commit root-1 "test(checkout): scenario 1" is not red: the tests of api pass at it; the replay's output is in ${logOf('root-1')}; a test commit must fail on an assertion before the code that makes it pass`])
  const { replay } = checked(host, 'distill')[0].commits[0]
  assert.deepEqual([replay.exitCode, replay.judge], [0, undefined])
})

test('a green that fails, then passes once the judge asks for a retry, reports the passing replay with the judge\'s last word', async () => {
  const host = scripted({ replay: new ScriptedReplay({ exits: { 'root-2': 3 } }) }, (it) => [...research(it), agent()(it), agent()(it), unavailable])
  host.agentRunner.judge = judging(judgeAnswer('accept'), () => {
    host.replay.exits['root-2'] = 0
    return judgeAnswer('retry', 'a port was busy')
  })

  await host.start()

  const { replay } = checked(host, 'deliver')[0].commits[0]
  assert.deepEqual([replay.exitCode, replay.judge.decision], [0, 'accept'])
  assert.deepEqual(recorded(host, 'deliver').map(({ outcome }) => outcome), ['done'])
})

test('every ask of the judge counts in its cost, an unreadable one included', async () => {
  const host = scripted({}, (it) => [...research(it), agent()(it), unavailable])
  host.agentRunner.judge = judging({ ok: true, text: 'not a verdict', costUsd: 0.25 }, { ok: true, text: judgeAnswer('accept'), costUsd: 0.5 })

  await host.start()

  assert.equal(checked(host, 'distill')[0].commits[0].replay.judge.cost, 0.75)
})
