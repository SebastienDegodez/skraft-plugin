import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryGit, ScriptedMachine } from '../support/in-memory-host.mjs'
import { agent, API, scripted, SLUG, tddCycle, TRACKING } from '../support/pipeline-host.mjs'
import { ADR_1, adrText, architect, eventsOf, waitingOnEnvironment } from '../support/decisions.mjs'

const BUILD = `api/build: command not found: dotnet; install it or change the command in skraft-config.json (evidence: ${TRACKING}/gates/api/build-1.log)`
const QUESTION = `gates cannot run on this machine: ${BUILD}. Fix it, then RETRY; or ABORT the run.`
const toTheGates = (it) => [agent()(it), agent()(it), agent()(it), agent({ work: tddCycle() })(it)]
const noDotnet = () => new ScriptedMachine({ installed: ['git'] })

test('a gate the machine cannot run asks the human to fix it; the run waits, and RETRY runs the same gate node again', async () => {
  const machine = noDotnet()
  const host = scripted({ machine }, toTheGates)

  const outcome = await host.start()

  assert.deepEqual(outcome, { status: 'waiting', slug: SLUG, phase: 'DELIVER', code: 'environment', reason: `${QUESTION} Answer with skraft decide gates-1 RETRY|ABORT.` })
  assert.deepEqual(host.human.questions, [{ key: 'gates-1', kind: 'environment', text: QUESTION, options: ['RETRY', 'ABORT'], refusals: [], header: 'Environment' }])
  assert.deepEqual(host.types().slice(-3), ['step.started', 'gate.ran', 'question.asked'])
  assert.equal((await host.view()).current.step, 'gates')

  assert.equal((await host.run()).status, 'waiting')
  machine.installed.add('dotnet')
  assert.equal((await host.decide({ answer: 'retry' })).ok, true)
  assert.equal((await host.run()).status, 'done')

  assert.equal(eventsOf(host, 'step.started').filter((event) => event.step === 'gates').length, 1)
  assert.deepEqual(eventsOf(host, 'step.recorded').filter((event) => event.step === 'gates').map((event) => [event.visit, event.attempt, event.outcome]), [[1, 1, 'pass']])
  assert.equal(host.agentRunner.dispatches.length, 5)
})

test('a host that asks in a dialog retries at once; the same failure again asks a new question', async () => {
  const host = scripted({ machine: noDotnet(), answers: [{ answer: 'RETRY' }] }, toTheGates)

  const outcome = await host.start()

  assert.deepEqual({ status: outcome.status, code: outcome.code }, { status: 'waiting', code: 'environment' })
  assert.deepEqual(host.human.questions.map((question) => question.key), ['gates-1', 'gates-2'])
  assert.deepEqual(eventsOf(host, 'question.answered').map(({ key, answer, by }) => [key, answer, by]), [['gates-1', 'RETRY', 'host']])
})

test('ABORT ends the run blocked on the environment, and it stays blocked', async () => {
  const host = scripted({ machine: noDotnet(), answers: [{ answer: 'ABORT' }] }, toTheGates)

  const outcome = await host.start()

  assert.deepEqual(outcome, { status: 'blocked', slug: SLUG, phase: 'DELIVER', code: 'environment', reason: `aborted by a human: ${QUESTION}` })
  assert.deepEqual(host.types().slice(-4), ['question.asked', 'question.answered', 'step.recorded', 'run.finished'])
  const aborted = eventsOf(host, 'step.recorded').at(-1)
  assert.deepEqual({ step: aborted.step, visit: aborted.visit, attempt: aborted.attempt, outcome: aborted.outcome, code: aborted.code, next: aborted.next }, { step: 'gates', visit: 1, attempt: 1, outcome: 'aborted', code: 'environment', next: null })
  assert.deepEqual((await host.run()).code, 'environment')
  assert.equal((await host.view()).status, 'blocked')
})

test('an agent step the machine cannot check asks the same question, and RETRY checks it again without running the agent', async () => {
  const bare = { ...API, commands: { build: 'dotnet build' } }
  const host = scripted({ components: [bare] }, (it) => [
    agent()(it), agent()(it), agent({ work: ({ git }) => git.commit('test(checkout): pays', ['tests/PayTests.cs']) })(it), () => ({ ok: false, unavailable: true, text: '' }),
  ])

  const outcome = await host.start()

  assert.deepEqual({ status: outcome.status, code: outcome.code }, { status: 'waiting', code: 'environment' })
  assert.match((await host.view()).question.text, /^distill cannot run on this machine: component api has no test command/)
  await host.workspace.write('skraft-config.json', JSON.stringify({ components: [API] }))
  assert.equal((await host.decide({ answer: 'RETRY' })).ok, true)
  assert.equal((await host.run()).code, 'agent-unavailable')
  assert.deepEqual(host.agentRunner.dispatches.map((dispatch) => dispatch.agent), ['solution-researcher', 'solution-architect', 'acceptance-designer', 'software-engineer'])
  assert.deepEqual(eventsOf(host, 'step.recorded').filter((event) => event.step === 'distill').map((event) => event.outcome), ['done'])
})

test('a configuration the human leaves invalid in the dialog refuses to go on and runs no command; fixed, the run goes on without running an agent again', async () => {
  const machine = noDotnet()
  let host
  let ranBeforeRetry = null
  const breaksTheConfig = async () => {
    machine.installed.add('dotnet')
    await host.workspace.write('skraft-config.json', '{ invalid JSON')
    ranBeforeRetry = machine.runs.length
    return { answer: 'RETRY' }
  }
  host = scripted({ machine, answers: [breaksTheConfig] }, toTheGates)

  const outcome = await host.start()

  assert.deepEqual({ status: outcome.status, phase: outcome.phase, code: outcome.code }, { status: 'blocked', phase: 'DELIVER', code: 'config-invalid' })
  assert.match(outcome.reason, /^skraft-config\.json is invalid: /)
  assert.equal(machine.runs.length, ranBeforeRetry)
  assert.equal(host.types().at(-1), 'question.answered')

  await host.workspace.write('skraft-config.json', JSON.stringify({ components: [API] }))
  assert.equal((await host.run()).status, 'done')
  assert.deepEqual(eventsOf(host, 'step.recorded').filter((event) => event.step === 'gates').map((event) => event.outcome), ['pass'])
  assert.equal(host.agentRunner.dispatches.length, 5)
})

test('ABORT in the dialog ends the run blocked on the environment, whatever the human left in skraft-config.json', async () => {
  let host
  const breaksThenAborts = async () => {
    await host.workspace.write('skraft-config.json', '{ invalid JSON')
    return { answer: 'ABORT' }
  }
  host = scripted({ machine: noDotnet(), answers: [breaksThenAborts] }, toTheGates)

  const outcome = await host.start()

  assert.deepEqual({ status: outcome.status, code: outcome.code }, { status: 'blocked', code: 'environment' })
})

test('each node counts its own questions: a ratification, then a gate the machine cannot run, asks adr-1 then gates-1', async () => {
  const host = scripted({ machine: noDotnet(), answers: [{ answer: 'RATIFIED' }] }, (it) => [
    agent()(it), architect({ [ADR_1]: adrText() })(it), agent()(it), agent({ work: tddCycle() })(it),
  ])

  await host.start()

  assert.deepEqual(host.human.questions.map(({ key }) => key), ['adr-1', 'gates-1'])
})

test('every question is keyed by the node that asks it and its rank there: a node named environment keeps its answer when Git fails, and RETRY ratifies', async () => {
  const workflow = `digraph decision {
    start [shape=Mdiamond]
    design [shape=box, agent="solution-architect", phase="DESIGN"]
    environment [shape=hexagon, question="adr-ratification"]
    exit [shape=Msquare]
    start -> design -> environment
    environment -> exit [label="RATIFIED"]
    environment -> design [label="REJECTED", max_visits=3]
  }`
  const git = new InMemoryGit({ commitFails: 'git commit failed: index.lock exists' })
  const host = scripted({ workflow, git, answers: [{ answer: 'RATIFIED' }] }, (it) => [architect({ [ADR_1]: adrText() })(it)])

  assert.deepEqual((await host.start()).reason, waitingOnEnvironment('environment', 'git commit failed: index.lock exists', 2))
  assert.deepEqual(host.human.questions.map(({ key, kind }) => [key, kind]), [['environment-1', 'adr-ratification'], ['environment-2', 'environment']])
  git.commitFails = null
  assert.equal((await host.decide({ answer: 'RETRY' })).ok, true)

  assert.equal((await host.run()).status, 'done')
  assert.deepEqual(git.engineCommits.map((commit) => commit.message), ['docs(adr): ratify ADR-001'])
  assert.deepEqual(host.human.questions.length, 2)
})

test('a human who fixes skraft-config.json in the dialog, then answers RETRY, gets the gates run with the fixed configuration', async () => {
  const npmBuilt = { ...API, commands: { build: 'npm run build', mutation: 'npm run mutate' } }
  let host
  const fixesTheConfig = async () => {
    await host.workspace.write('skraft-config.json', JSON.stringify({ components: [npmBuilt] }))
    return { answer: 'RETRY' }
  }
  host = scripted({ components: [{ ...API, commands: { build: 'dotnet build', mutation: 'dotnet stryker' } }], machine: new ScriptedMachine({ installed: ['git', 'npm'] }), answers: [fixesTheConfig] }, toTheGates)

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(host.human.questions.map((question) => question.key), ['deliver-1'])
  assert.deepEqual(host.machine.lines(), ['. $ npm run build', '. $ npm run mutate'])
})
