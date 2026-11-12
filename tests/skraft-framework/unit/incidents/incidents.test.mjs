import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryGit, ScriptedMachine, ScriptedReplay, hexSha, judgeAnswer } from '../support/in-memory-host.mjs'
import { API, SLUG, TRACKING, agent, green, scripted, tddCycle } from '../support/pipeline-host.mjs'
import { waitingOnEnvironment } from '../support/decisions.mjs'
import { ownerOfCause } from '../../../../plugins/skraft-framework/engine/domain/pipeline/incidents.mjs'

const unavailable = () => ({ ok: false, unavailable: true, text: '' })
const upToDeliver = (it) => [agent()(it), agent()(it), agent()(it)]
const asked = (host) => host.events().filter(({ type }) => type === 'question.asked').at(-1)
const dispatched = (host, step) => host.agentRunner.dispatches.filter(({ label }) => label.includes(` · ${step} `)).length
const replayLog = (sha, command = 'test') => `${TRACKING}/logs/replay-${sha}-api-${command}.log`
/** A front end sharing the root of api: what changes there touches both. */
const LINTED = { name: 'web', root: '.', stack: 'react', bdd: false, mocking: { strategy: 'inprocess' }, paths: { src: ['web/src'], tests: ['web/src'] }, commands: { lint: 'npx eslint .' } }

test('a command the config cannot start is owned by config; an unclassified cause has no owner', () => {
  assert.deepEqual([ownerOfCause('config'), ownerOfCause('container-runtime-v3')], ['config', 'unknown'])
})

test('a missing configured test command is escalated to config; a second identical failure stops with its incident', async () => {
  const machine = new ScriptedMachine({ installed: ['git'] })
  const host = scripted({ machine }, (it) => [...upToDeliver(it), agent({ work: green() })(it)])

  const first = await host.start()
  const initial = asked(host)
  assert.equal(first.status, 'waiting')
  assert.equal(initial.incident.owner, 'config')
  assert.match(initial.text, /skraft doctor/)
  assert.equal(initial.incidents[0].attempts, 1)

  await host.decide({ answer: 'RETRY' })
  const stopped = await host.run()
  const repeated = host.events().filter(({ type, step }) => type === 'step.recorded' && step === 'gates').at(-1)

  assert.equal(stopped.status, 'blocked')
  assert.deepEqual([repeated.code, repeated.next, repeated.incidents[0].owner, repeated.incidents[0].attempts], ['repeated-failure', null, 'config', 2])
  assert.equal(dispatched(host, 'deliver'), 1)
  assert.match(stopped.reason, /stopped after 2 occurrences of failure signature .*; evidence: .*build-2\.log/)
})

test('a missing Docker runtime is escalated as an environment issue and points to doctor', async () => {
  const component = { ...API, commands: { ...API.commands, build: 'docker build .' } }
  const host = scripted({ machine: new ScriptedMachine({ installed: ['git'] }), components: [component] }, (it) => [...upToDeliver(it), agent({ work: green() })(it)])

  await host.start()

  assert.deepEqual(asked(host).incident.owner, 'environment')
  assert.match(asked(host).text, /docker/)
  assert.match(asked(host).text, /skraft doctor/)
})

test('a permission denied by a gate is escalated to the environment with its log and no engineer retry', async () => {
  const machine = new ScriptedMachine()
  const run = machine.run.bind(machine)
  machine.run = async (request) => {
    const result = await run(request)
    if (request.argv[0] === 'dotnet' && request.argv[1] === 'test') {
      return { ...result, exitCode: 1, stderr: 'EACCES: permission denied: tests/PaymentTests.cs' }
    }
    return result
  }
  const host = scripted({ machine }, (it) => [...upToDeliver(it), agent({ work: green() })(it)])

  const outcome = await host.start()

  assert.equal(outcome.status, 'waiting')
  const log = `${TRACKING}/gates/api/test-1.log`
  assert.deepEqual(asked(host).incident, { owner: 'environment', log })
  assert.ok(host.tracking.files.get(`${SLUG}/gates/api/test-1.log`).includes('EACCES: permission denied: tests/PaymentTests.cs'))
  assert.ok(outcome.reason.includes(log))
  assert.equal(dispatched(host, 'deliver'), 1)
})

test('a gate stopped by a signal or a crash, on POSIX or on Windows, stops as unknown with its evidence and no engineer retry', async () => {
  for (const exit of [137, 139, 3221225477]) {
    const machine = new ScriptedMachine({ exits: { '. $ dotnet test': exit } })
    const host = scripted({ machine }, (it) => [...upToDeliver(it), agent({ work: green() })(it), agent({ work: (h) => { machine.exits['. $ dotnet test'] = 0; tddCycle(SLUG, 'Again')(h) } })(it)])

    const outcome = await host.start()

    const evidence = `${TRACKING}/gates/api/test-1.log`
    assert.deepEqual([outcome.status, outcome.code], ['waiting', 'unforeseen'], String(exit))
    assert.deepEqual(asked(host).incident, { owner: 'unknown', log: evidence }, String(exit))
    assert.equal(host.events().some(({ type, step }) => type === 'step.recorded' && step === 'gates'), false, String(exit))
    assert.equal(dispatched(host, 'deliver'), 1, String(exit))
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

test('two gate failures with attempt-specific evidence paths stop before another engineer dispatch', async () => {
  const machine = new ScriptedMachine({ exits: { '. $ dotnet test': 1 } })
  const host = scripted({ machine }, (it) => [
    ...upToDeliver(it),
    agent({ work: green() })(it),
    agent({ work: green() })(it),
    agent({ work: green() })(it),
    agent({ work: green() })(it),
  ])

  await host.start()

  const failures = host.events().filter(({ type, step, outcome }) => type === 'step.recorded' && step === 'gates' && outcome === 'fail')
  assert.equal(failures.length, 2)
  assert.notEqual(failures[0].failures[0], failures[1].failures[0])
  assert.equal(dispatched(host, 'deliver'), 2)
  const [first, second] = failures.map(({ incidents }) => incidents[0])
  assert.equal(first.signature, second.signature)
  assert.deepEqual([first.owner, first.category, first.argv, first.exitCode, first.attempts], ['agent', 'deterministic', ['dotnet', 'test'], 1, 1])
  assert.deepEqual([second.attempts, second.log], [2, `${TRACKING}/gates/api/test-2.log`])
  assert.equal(JSON.stringify(failures).includes('it failed'), false)
})

test('agent failures with attempt-specific log paths share a signature and stop before a third dispatch', async () => {
  let attempt = 0
  const outsideScope = (host) => {
    if (attempt > 0) host.git.revert(`command-${attempt}.log`)
    host.git.change(`command-${++attempt}.log`)
  }
  const host = scripted({}, (it) => [agent({ work: outsideScope })(it), agent({ work: outsideScope })(it), agent({ work: outsideScope })(it)])

  await host.start()

  const failures = host.events().filter(({ type, step, outcome }) => type === 'step.recorded' && step === 'research' && outcome === 'failed')
  assert.equal(failures[0].incidents[0].signature, failures[1].incidents[0].signature)
  assert.equal(failures.length, 2)
  assert.deepEqual(failures.map(({ incidents }) => incidents[0].attempts), [1, 2])
  assert.equal(failures[1].code, 'repeated-failure')
  assert.equal(dispatched(host, 'research'), 2)
})

test('an unknown gate failure stops before a later unavailable gate, naming the first log', async () => {
  const machine = new ScriptedMachine({ installed: ['git', 'dotnet'], exits: { '. $ dotnet test': 137 } })
  const host = scripted({ machine, components: [API, LINTED] }, (it) => [...upToDeliver(it), agent({ work: green() })(it)])

  await host.start()

  assert.deepEqual(asked(host).incident, { owner: 'unknown', log: `${TRACKING}/gates/api/test-1.log` })
})

test('a mutation run stopped by a signal, or by its time running out, is not judged by its stale report: a host judgment is requested', async () => {
  for (const exit of [137, null]) {
    const machine = new ScriptedMachine({ exits: { '. $ dotnet stryker': exit } })
    const host = scripted({ machine }, (it) => [...upToDeliver(it), agent({ work: green() })(it)])

    const outcome = await host.start()

    assert.equal(outcome.code, 'unforeseen', String(exit))
    assert.ok(outcome.reason.startsWith('mutation stopped on an unforeseen incident. Read '), outcome.reason)
    assert.equal(host.events().findLast(({ type }) => type === 'gate.ran').failure, 'unknown')
    assert.deepEqual(asked(host).incident, { owner: 'unknown', log: `${TRACKING}/gates/api/mutation-1.log` })
  }
})

test('a replay stopped by a signal or a crash goes to the judge with what it printed; the judge asking a human, the designer keeps its attempts', async () => {
  const host = scripted({ replay: new ScriptedReplay({ exits: { 'root-1': 139 }, outputs: { 'root-1 dotnet test': 'Segmentation fault (core dumped)\n' } }) }, (it) => [agent()(it), agent()(it), agent()(it), unavailable])
  host.agentRunner.judge = () => judgeAnswer('ask-human', 'the test runner crashed before any test ran')

  const outcome = await host.start()

  const answer = `${TRACKING}/logs/judge-root-1-red.md`
  assert.equal(outcome.status, 'waiting')
  assert.ok(outcome.reason.startsWith(waitingOnEnvironment('distill', `the replay judge asks a human about the red commit root-1: read ${answer}`, 1, { owner: 'judge', log: answer }).split('The run so far')[0]))
  assert.ok(outcome.reason.includes('Commits: root-1 distill ok.'))
  assert.ok(host.tracking.files.get(`${SLUG}/logs/replay-root-1-api-test.log`).includes('\nexit: 139\n--- stdout\nSegmentation fault (core dumped)\n'))
  assert.ok(host.agentRunner.judged[0].prompt.includes(`\n- api: \`dotnet test\` at the commit root-1: exit 139; printed to ${replayLog('root-1')}\n`), host.agentRunner.judged[0].prompt)
  assert.equal(dispatched(host, 'distill'), 1)
})

test('a replay names its commit by its short sha, in the question and in the names of its logs', async () => {
  const git = new InMemoryGit({ hex: true, repositories: { '.': { mergeBases: { main: hexSha(0) } } } })
  const host = scripted({ git }, (it) => [agent()(it), agent()(it), agent()(it), unavailable])
  host.agentRunner.judge = () => judgeAnswer('ask-human', 'Docker does not answer')

  const outcome = await host.start()

  const answer = `${TRACKING}/logs/judge-c0ffee1-red.md`
  assert.ok(outcome.reason.startsWith(waitingOnEnvironment('distill', `the replay judge asks a human about the red commit c0ffee1: read ${answer}`, 1, { owner: 'judge', log: answer }).split('The run so far')[0]))
  assert.ok(outcome.reason.includes('Commits: c0ffee1 distill ok.'))
  assert.ok(host.progress.lines.includes(`${SLUG}: distill judges the red commit c0ffee1 — standard · sonnet`), host.progress.lines.join('\n'))
  assert.ok(host.agentRunner.judged[0].prompt.includes(`printed to ${replayLog('c0ffee1')}\n`), host.agentRunner.judged[0].prompt)
})

test('a gate a person interrupts with Ctrl-C, on POSIX or on Windows, stops the run without a question; the next run runs the gates again', async () => {
  for (const exit of [130, 0xC000013A]) {
    const machine = new ScriptedMachine({ exits: { '. $ dotnet test': exit } })
    const host = scripted({ machine }, (it) => [...upToDeliver(it), agent({ work: green() })(it)])

    const outcome = await host.start()

    const evidence = `${TRACKING}/gates/api/test-1.log`
    assert.deepEqual(outcome, { status: 'blocked', slug: SLUG, phase: 'DELIVER', code: 'interrupted', reason: `api/test: was interrupted by a person (exit ${exit}) (evidence: ${evidence}); run the pipeline again to go on` }, String(exit))
    assert.equal(host.events().filter(({ type, kind }) => type === 'question.asked' && kind === 'environment').length, 0)
    assert.equal(dispatched(host, 'deliver'), 1)
    machine.exits['. $ dotnet test'] = 0
    const resumed = await host.run()
    assert.equal(resumed.status, 'done', resumed.reason)
    assert.equal(dispatched(host, 'deliver'), 1)
  }
})

test('gates of two components a person interrupts stop the run naming both', async () => {
  const machine = new ScriptedMachine({ installed: ['git', 'dotnet', 'npx'], exits: { '. $ dotnet test': 130, '. $ npx eslint .': 130 } })
  const host = scripted({ machine, components: [API, LINTED] }, (it) => [...upToDeliver(it), agent({ work: green() })(it)])

  const outcome = await host.start()

  assert.equal(outcome.reason, `api/test: was interrupted by a person (exit 130) (evidence: ${TRACKING}/gates/api/test-1.log); web/lint: was interrupted by a person (exit 130) (evidence: ${TRACKING}/gates/web/lint-1.log); run the pipeline again to go on`)
})

test('a mutation run a person interrupts is not judged by its report: the run stops there', async () => {
  const host = scripted({ machine: new ScriptedMachine({ exits: { '. $ dotnet stryker': 130 } }) }, (it) => [...upToDeliver(it), agent({ work: green() })(it)])

  const outcome = await host.start()

  assert.deepEqual([outcome.code, outcome.reason], ['interrupted', `api/mutation: was interrupted by a person (exit 130) (evidence: ${TRACKING}/gates/api/mutation-1.log); run the pipeline again to go on`])
})

test('a replay a person interrupts stops the run without a question and without a refusal; the next run replays the commit', async () => {
  const replay = new ScriptedReplay({ exits: { 'root-1': 130 } })
  const host = scripted({ replay }, (it) => [agent()(it), agent()(it), agent()(it), unavailable])

  const outcome = await host.start()

  assert.deepEqual([outcome.status, outcome.code, outcome.reason], ['blocked', 'interrupted', 'replaying root-1 for api: dotnet test was interrupted by a person (exit 130); run the pipeline again to go on'])
  assert.deepEqual(host.events().filter(({ type, step }) => type === 'step.recorded' && step === 'distill'), [])
  replay.exits['root-1'] = 1
  await host.run()
  assert.deepEqual(host.replay.lines().filter((line) => line.startsWith('root-1 ')), ['root-1 ./. $ dotnet test', 'root-1 ./. $ dotnet test'])
  assert.equal(dispatched(host, 'distill'), 1)
})

test('a replay a person interrupts names its commit by its short sha', async () => {
  const git = new InMemoryGit({ hex: true, repositories: { '.': { mergeBases: { main: hexSha(0) } } } })
  const host = scripted({ git, replay: new ScriptedReplay({ exits: { [hexSha(1)]: 130 } }) }, (it) => [agent()(it), agent()(it), agent()(it), unavailable])

  const outcome = await host.start()

  assert.equal(outcome.reason, 'replaying c0ffee1 for api: dotnet test was interrupted by a person (exit 130); run the pipeline again to go on')
})
