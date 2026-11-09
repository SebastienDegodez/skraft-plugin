import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryGit, ScriptedMachine, ScriptedReplay, hexSha } from '../support/in-memory-host.mjs'
import { API, SLUG, TRACKING, agent, green, scripted, tddCycle } from '../support/pipeline-host.mjs'
import { waitingOnEnvironment } from '../support/decisions.mjs'

const unavailable = () => ({ ok: false, unavailable: true, text: '' })
const upToDeliver = (it) => [agent()(it), agent()(it), agent()(it)]
const asked = (host) => host.events().filter(({ type }) => type === 'question.asked').at(-1)
const dispatched = (host, step) => host.agentRunner.dispatches.filter(({ label }) => label.includes(` · ${step} `)).length
const replayLog = (sha, command = 'test') => `${TRACKING}/logs/replay-${sha}-api-${command}.log`
/** A front end sharing the root of api: what changes there touches both. */
const LINTED = { name: 'web', root: '.', stack: 'react', bdd: false, mocking: { strategy: 'inprocess' }, paths: { src: ['web/src'], tests: ['web/src'] }, commands: { lint: 'npx eslint .' } }

test('a gate stopped by a signal or a crash, on POSIX or on Windows, asks a human, its cause unknown: no pass goes back to the engineer', async () => {
  for (const exit of [137, 139, 3221225477]) {
    const host = scripted({ machine: new ScriptedMachine({ exits: { '. $ dotnet test': exit } }) }, (it) => [...upToDeliver(it), agent({ work: green() })(it)])

    const outcome = await host.start()

    const evidence = `${TRACKING}/gates/api/test-1.log`
    assert.deepEqual([outcome.status, outcome.code, outcome.reason], ['waiting', 'environment', waitingOnEnvironment('gates', `api/test: was stopped by a signal or crashed (exit ${exit}), not by a failing check (evidence: ${evidence})`, 1, { owner: 'unknown', log: evidence })], String(exit))
    assert.deepEqual(asked(host).incident, { owner: 'unknown', log: evidence })
    assert.deepEqual(asked(host).subjects, [])
    assert.equal(dispatched(host, 'deliver'), 1)
  }
})

test('a gate exiting 128, as Git does on a fatal error, failed a check: the engineer gets the work back', async () => {
  const machine = new ScriptedMachine({ exits: { '. $ dotnet test': 128 } })
  const host = scripted({ machine }, (it) => [...upToDeliver(it), agent({ work: green() })(it), agent({ work: (h) => {
    machine.exits['. $ dotnet test'] = 0
    tddCycle(SLUG, 'Again')(h)
  } })(it)])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.equal(dispatched(host, 'deliver'), 2)
  assert.deepEqual(host.events().filter(({ type, step }) => type === 'step.recorded' && step === 'gates')[0].failures, [`api/test: exited 128 (evidence: ${TRACKING}/gates/api/test-1.log)`])
})

test('a gate a signal stopped, beside one the machine cannot start, is the machine\'s first: its log is the one named', async () => {
  const machine = new ScriptedMachine({ installed: ['git', 'dotnet'], exits: { '. $ dotnet test': 137 } })
  const host = scripted({ machine, components: [API, LINTED] }, (it) => [...upToDeliver(it), agent({ work: green() })(it)])

  await host.start()

  assert.deepEqual(asked(host).incident, { owner: 'environment', log: `${TRACKING}/gates/web/lint-1.log` })
})

test('a mutation run stopped by a signal is not judged by its report: a human is asked, its cause unknown', async () => {
  const machine = new ScriptedMachine({ exits: { '. $ dotnet stryker': 137 } })
  const host = scripted({ machine }, (it) => [...upToDeliver(it), agent({ work: green() })(it)])

  const outcome = await host.start()

  assert.equal(outcome.code, 'environment')
  assert.ok(outcome.reason.startsWith('mutation cannot run on this machine: api/mutation: was stopped by a signal or crashed (exit 137), not by a failing check'), outcome.reason)
  assert.deepEqual(asked(host).incident, { owner: 'unknown', log: `${TRACKING}/gates/api/mutation-1.log` })
})

test('a replay stopped by a signal or a crash asks a human, its cause unknown, with what it printed: the designer keeps its attempts', async () => {
  const host = scripted({ replay: new ScriptedReplay({ exits: { 'root-1': 139 }, outputs: { 'root-1 dotnet test': 'Segmentation fault (core dumped)\n' } }) }, (it) => [agent()(it), agent()(it), agent()(it), unavailable])

  const outcome = await host.start()

  assert.deepEqual([outcome.status, outcome.reason], ['waiting', waitingOnEnvironment('distill', 'replaying root-1 for api: dotnet test was stopped by a signal or crashed (exit 139)', 1, { owner: 'unknown', log: replayLog('root-1') })])
  assert.ok(host.tracking.files.get(`${SLUG}/logs/replay-root-1-api-test.log`).includes('\nexit: 139\n--- stdout\nSegmentation fault (core dumped)\n'))
  assert.equal(dispatched(host, 'distill'), 1)
})

test('a green with no report from a test command that writes none where the engine reads it waits for a human to fix the configuration', async () => {
  const host = scripted({ replay: new ScriptedReplay({ reports: { 'root-2': null } }) }, (it) => [agent()(it), agent()(it), agent()(it), agent()(it), unavailable])

  const outcome = await host.start()

  assert.deepEqual([outcome.status, outcome.reason], ['waiting', waitingOnEnvironment('deliver', 'replaying root-2 for api: its test command "dotnet test" writes no JUnit report where testReports looks; add --logger trx (VSTest) or --report-trx (Microsoft.Testing.Platform) to it in skraft-config.json, then retry', 1, { owner: 'config', log: replayLog('root-2') })])
  assert.equal(dispatched(host, 'deliver'), 1)
})

test('a replay names its commit by its short sha, in the question and in the name of its log', async () => {
  const git = new InMemoryGit({ hex: true, repositories: { '.': { mergeBases: { main: hexSha(0) } } } })
  const host = scripted({ git, replay: new ScriptedReplay({ reports: { [hexSha(1)]: null } }) }, (it) => [agent()(it), agent()(it), agent()(it), unavailable])

  const outcome = await host.start()

  assert.equal(outcome.reason, waitingOnEnvironment('distill', 'replaying c0ffee1 for api: its test command "dotnet test" writes no JUnit report where testReports looks; add --logger trx (VSTest) or --report-trx (Microsoft.Testing.Platform) to it in skraft-config.json, then retry', 1, { owner: 'config', log: replayLog('c0ffee1') }))
})
