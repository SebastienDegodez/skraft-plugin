import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUILT_IN_WORKFLOW, FixedClock, InMemoryGit, ScriptedMachine } from '../support/in-memory-host.mjs'
import { agent, API, scripted, SLUG, tddCycle, TRACKING } from '../support/pipeline-host.mjs'

const upToDeliver = (it) => [agent()(it), agent()(it), agent()(it)]
const deliver = (it) => agent({ work: tddCycle() })(it)
const recorded = (host, step) => host.events().filter((event) => event.type === 'step.recorded' && event.step === step)
const unavailable = () => ({ ok: false, unavailable: true, text: '' })
const WEB = { name: 'web', root: '../web', stack: 'react', mocking: { strategy: 'inprocess' }, paths: { src: ['src'], tests: ['src'] }, commands: { lint: 'npx eslint .' } }
const twoRepositories = () => new InMemoryGit({ repositories: { '.': { mergeBases: { main: 'root-0' } }, '../web': { mergeBases: { main: 'up-web-0' } } } })

test('DELIVER does not close while a gate fails: the engineer gets a new pass with the failures', async () => {
  const clock = new FixedClock('2026-10-11T09:00:00.000Z')
  const machine = new ScriptedMachine({ exits: { '. $ dotnet test': 1 }, clock, takesMs: 1_000 })
  const host = scripted({ machine, clock }, (it) => [...upToDeliver(it), deliver(it), agent({ work: (h) => { machine.exits['. $ dotnet test'] = 0; tddCycle('checkout', 'Refund')(h) } })(it)])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(host.events().filter((event) => event.type === 'phase.closed').map((event) => event.phase), ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER'])
  const failure = `api/test: exited 1 (evidence: ${TRACKING}/gates/api/test-1.log)`
  assert.deepEqual(recorded(host, 'gates').map(({ visit, outcome: result, failures, next, durationMs }) => [visit, result, failures, next, durationMs]), [
    [1, 'fail', [failure], 'deliver', 2_000],
    [2, 'pass', [], 'exit', 2_000],
  ])
  const second = host.agentRunner.dispatches[4]
  assert.equal(second.label, `skraft ${SLUG} · deliver · pass 2 · attempt 1`)
  assert.ok(second.prompt.includes([
    '- Pass: 2, after the gates sent the work back',
    '- Attempt: 1 of 3',
    '- Read first:',
    `- ${TRACKING}/research/2026-10-11/${SLUG}-research.md`,
    `- ${TRACKING}/details/2026-10-11/context-map.md`,
    `- ${TRACKING}/details/2026-10-11/test-plan-${SLUG}.md`,
    '- Fill each output in place; keep the path, create no other copy:',
  ].join('\n')), second.prompt)
  assert.ok(second.prompt.endsWith(`\n\nThe gates failed on pass 1:\n- ${failure}`))
  assert.deepEqual(host.events().filter((event) => event.type === 'step.started' && event.step === 'deliver').map(({ visit, attempt, feedback, outputs, result }) => [visit, attempt, feedback, outputs, result]), [
    [1, 1, [], ['changes/2026-10-11/change-log.md'], 'results/deliver-1-1.json'],
    [2, 1, [failure], ['changes/2026-10-11/change-log.md'], 'results/deliver-2-1.json'],
  ])
  assert.ok(host.progress.lines.includes(`${SLUG}: software-engineer, pass 2, attempt 1`))
  assert.ok(host.progress.lines.includes(`${SLUG}: gates (build, format, lint, test, architecture, coverage, mutation), pass 2`))
  assert.ok(!host.types().includes('tdd.replay-slow'))
})

test('gates that keep failing stop the run once the loop reached its max_visits', async () => {
  const machine = new ScriptedMachine({ exits: { '. $ dotnet test': 1 } })
  const host = scripted({ machine }, (it) => [...upToDeliver(it), ...[1, 2, 3, 4].map((n) => agent({ work: tddCycle('checkout', `Pass${n}`) })(it))])

  const outcome = await host.start()

  const failure = (n) => `api/test: exited 1 (evidence: ${TRACKING}/gates/api/test-${n}.log)`
  assert.deepEqual(outcome, {
    status: 'blocked', slug: SLUG, phase: 'DELIVER', code: 'loop-ceiling',
    reason: `gates -> deliver was already taken 3 times, its max_visits; ${failure(4)}`,
  })
  assert.equal(host.agentRunner.dispatches.length, 7)
  assert.deepEqual(recorded(host, 'gates').map(({ visit, outcome: result, code, next }) => [visit, result, code, next]), [
    [1, 'fail', null, 'deliver'], [2, 'fail', null, 'deliver'], [3, 'fail', null, 'deliver'], [4, 'fail', 'loop-ceiling', null],
  ])
  assert.ok(!host.events().some((event) => event.type === 'phase.closed' && event.phase === 'DELIVER'))
  assert.deepEqual(host.events().at(-1), { ...host.events().at(-1), type: 'run.finished', status: 'blocked', code: 'loop-ceiling', reason: outcome.reason })
})

test('a max_visits on the engineer\'s edge stops the run once the engineer used it up, with its reason', async () => {
  const workflow = BUILT_IN_WORKFLOW
    .replace('distill -> deliver -> gates', 'distill -> deliver\n  deliver -> gates [max_visits=2]')
    .replace('gates -> deliver [label="FAIL", max_visits=3]', 'gates -> deliver [label="FAIL"]')
  const machine = new ScriptedMachine({ exits: { '. $ dotnet test': 1 } })
  const host = scripted({ machine, config: { workflow: 'skraft-workflow.dot' }, files: { 'skraft-workflow.dot': workflow } }, (it) => [...upToDeliver(it), ...[1, 2, 3].map((n) => agent({ work: tddCycle('checkout', `Pass${n}`) })(it))])

  const outcome = await host.start()

  const reason = 'deliver -> gates was already taken 2 times, its max_visits'
  assert.deepEqual(outcome, { status: 'blocked', slug: SLUG, phase: 'DELIVER', code: 'loop-ceiling', reason })
  assert.deepEqual(recorded(host, 'deliver').map(({ visit, outcome: result, code, next, reason: why }) => [visit, result, code, next, why]), [
    [1, 'done', null, 'gates', undefined],
    [2, 'done', null, 'gates', undefined],
    [3, 'done', 'loop-ceiling', null, reason],
  ])
})

test('a gate the machine cannot run stops the run; the next run runs the same gate node again', async () => {
  const machine = new ScriptedMachine({ installed: ['git'] })
  const host = scripted({ machine }, (it) => [...upToDeliver(it), deliver(it)])

  const outcome = await host.start()

  assert.deepEqual(outcome, {
    status: 'blocked', slug: SLUG, phase: 'DELIVER', code: 'environment',
    reason: `api/build: command not found: dotnet; install it or change the command in skraft-config.json (evidence: ${TRACKING}/gates/api/build-1.log)`,
  })
  assert.deepEqual(host.types().slice(-3), ['step.started', 'gate.ran', 'run.stopped'])
  assert.equal((await host.view()).current.gates.length, 7)

  machine.installed.add('dotnet')
  assert.equal((await host.run()).status, 'done')
  assert.equal(host.events().filter((event) => event.type === 'step.started' && event.step === 'gates').length, 1)
  assert.deepEqual(recorded(host, 'gates').map((event) => [event.visit, event.attempt, event.outcome]), [[1, 1, 'pass']])

  const front = { ...WEB, root: 'web', commands: { lint: 'npx eslint .', test: 'npx vitest run' } }
  const both = scripted({ components: [API, front], machine: new ScriptedMachine({ installed: ['git'] }) }, (it) => [...upToDeliver(it), agent({
    work: ({ git }) => {
      git.commit('test(checkout): cart', ['tests/CartTests.cs', 'web/src/Cart.test.tsx'])
      git.commit('feat(checkout): cart', ['src/Cart.cs', 'web/src/Cart.tsx'])
    },
  })(it)])
  assert.equal((await both.start()).reason, [
    `api/build: command not found: dotnet; install it or change the command in skraft-config.json (evidence: ${TRACKING}/gates/api/build-1.log)`,
    `web/lint: command not found: npx; install it or change the command in skraft-config.json (evidence: ${TRACKING}/gates/web/lint-1.log)`,
  ].join('; '))
})

test('the goal gate runs the gates of the components the story touched, then those of every other one', async () => {
  const web = { ...WEB, commands: { lint: 'npx eslint .', test: 'npx vitest run', e2e: 'npx playwright test' } }
  const machine = new ScriptedMachine({ exits: { '. $ dotnet test': 1 } })
  const host = scripted({ components: [API, web], git: twoRepositories(), machine }, (it) => [...upToDeliver(it), agent({ work: ({ git: repos }) => { repos.commit('test(checkout): cart', ['../web/src/Cart.test.tsx']); repos.commit('feat(checkout): cart', ['../web/src/Cart.tsx']) } })(it), unavailable])

  await host.start()

  assert.deepEqual(host.events().filter((event) => event.type === 'gate.ran').map(({ scope, component, gate }) => `${scope} ${component}/${gate}`), [
    'touched web/lint', 'touched web/test', 'all api/build', 'all api/test',
  ])
  assert.deepEqual(recorded(host, 'gates').map(({ outcome: result, failures }) => [result, failures]), [['fail', [`api/test: exited 1 (evidence: ${TRACKING}/gates/api/test-1.log)`]]])
})

test('a gate node that is not a goal gate runs its own gates on the touched components only; the goal gate then runs the others', async () => {
  const workflow = BUILT_IN_WORKFLOW
    .replace('gates    [shape=parallelogram', 'quick [shape=parallelogram, gate="build"]\n  gates    [shape=parallelogram')
    .replace('deliver -> gates', 'deliver -> quick -> gates')
  const WEB = { name: 'web', root: '../web', stack: 'react', mocking: { strategy: 'inprocess' }, paths: { src: ['src'], tests: ['src'] }, commands: { lint: 'npx eslint .' } }
  const git = new InMemoryGit({ repositories: { '.': { mergeBases: { main: 'root-0' } }, '../web': { mergeBases: { main: 'up-web-0' } } } })
  const host = scripted({ components: [API, WEB], git, config: { workflow: 'skraft-workflow.dot' }, files: { 'skraft-workflow.dot': workflow } }, (it) => [...upToDeliver(it), deliver(it)])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(host.events().filter((event) => event.type === 'gate.ran').map(({ scope, component, gate, status }) => `${scope} ${component}/${gate} ${status}`), [
    'touched api/build pass', 'touched api/build pass', 'touched api/test pass', 'all web/lint pass',
  ])
})

test('a component with none of a gate node\'s gates fails it as environment', async () => {
  const workflow = BUILT_IN_WORKFLOW
    .replace('gates    [shape=parallelogram', 'quick [shape=parallelogram, gate="lint"]\n  gates    [shape=parallelogram')
    .replace('deliver -> gates', 'deliver -> quick -> gates')
  const host = scripted({ config: { workflow: 'skraft-workflow.dot' }, files: { 'skraft-workflow.dot': workflow } }, (it) => [...upToDeliver(it), deliver(it)])

  const outcome = await host.start()

  assert.deepEqual([outcome.code, outcome.reason], ['environment', `api/none: no gate command; give it at least one of lint in skraft-config.json (evidence: ${TRACKING}/gates/api)`])
})

test('a failing gate with no FAIL edge stops the run with the gate failures', async () => {
  const workflow = BUILT_IN_WORKFLOW
    .replace('gates    [shape=parallelogram', 'quick [shape=parallelogram, gate="build"]\n  gates    [shape=parallelogram')
    .replace('deliver -> gates', 'deliver -> quick -> gates')
  const machine = new ScriptedMachine({ exits: { '. $ dotnet build': 2 } })
  const host = scripted({ machine, config: { workflow: 'skraft-workflow.dot' }, files: { 'skraft-workflow.dot': workflow } }, (it) => [...upToDeliver(it), deliver(it)])

  const outcome = await host.start()

  assert.deepEqual(outcome, {
    status: 'blocked', slug: SLUG, phase: 'DELIVER', code: 'gates-failed',
    reason: `quick failed and the workflow has no FAIL edge out of it; api/build: exited 2 (evidence: ${TRACKING}/gates/api/build-1.log)`,
  })
})

test('a run without components stops at the gates and says how to get them', async () => {
  const host = scripted({ components: [] }, (it) => [...upToDeliver(it), agent()(it)])

  const outcome = await host.start()

  assert.deepEqual(outcome, {
    status: 'blocked', slug: SLUG, phase: 'DELIVER', code: 'no-components',
    reason: 'skraft-config.json lists no component, so gates has nothing to run; run skraft init to detect them',
  })
})

test('another writer of the journal during the gates stops the run as a conflict', async () => {
  const machine = new ScriptedMachine()
  const host = scripted({ components: [API, WEB], git: twoRepositories(), machine }, (it) => [...upToDeliver(it), deliver(it)])
  machine.meanwhile['. $ dotnet test'] = () => host.tracking.append(SLUG, JSON.stringify({ type: 'other' }))

  const outcome = await host.start()

  assert.deepEqual([outcome.code, outcome.phase], ['journal-changed', null])
  assert.deepEqual(machine.lines(), ['. $ dotnet build', '. $ dotnet test'])

  const closing = new ScriptedMachine()
  const all = scripted({ components: [API, WEB], git: twoRepositories(), machine: closing }, (it) => [...upToDeliver(it), deliver(it)])
  closing.meanwhile['../web $ npx eslint .'] = () => all.tracking.append(SLUG, JSON.stringify({ type: 'other' }))
  assert.equal((await all.start()).code, 'journal-changed')
  assert.deepEqual(closing.lines(), ['. $ dotnet build', '. $ dotnet test', '../web $ npx eslint .'])
})

test('on a pass the gates sent back, their failure is the red of the first fix, on every attempt of the pass, resumed or not', async () => {
  const machine = new ScriptedMachine({ exits: { '. $ dotnet test': 1 } })
  const host = scripted({ machine }, (it) => [
    ...upToDeliver(it),
    deliver(it),
    agent({ result: null, work: ({ git }) => { machine.exits['. $ dotnet test'] = 0; git.commit('fix(checkout): round the card amount', ['src/Checkout.cs']) } })(it),
    agent()(it),
  ])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(recorded(host, 'deliver').map(({ visit, attempt, outcome: result, failures }) => [visit, attempt, result, failures]), [
    [1, 1, 'done', []], [2, 1, 'failed', ['result is missing']], [2, 2, 'done', []],
  ])
  assert.deepEqual(host.events().filter((event) => event.type === 'commits.checked').at(-1).commits.map((commit) => `${commit.subject} ${commit.verdict}`), ['fix(checkout): round the card amount ok'])

  const blanked = new ScriptedMachine({ exits: { '. $ dotnet test': 1 } })
  const resumed = scripted({ machine: blanked }, (it) => [
    ...upToDeliver(it),
    deliver(it),
    agent({ fill: false, work: ({ git }) => { blanked.exits['. $ dotnet test'] = 0; it.tracking.write(SLUG, 'changes/2026-10-11/change-log.md', ''); git.commit('fix(checkout): round the card amount', ['src/Checkout.cs']) } })(it),
    async (dispatch) => { await agent()(it)(dispatch); throw new Error('host interrupted') },
  ])
  await assert.rejects(resumed.start(), /host interrupted/)
  assert.equal((await resumed.run()).status, 'done')
  assert.deepEqual(recorded(resumed, 'deliver').map(({ visit, attempt, outcome: result, code }) => [visit, attempt, result, code]), [
    [1, 1, 'done', null], [2, 1, 'failed', 'missing-outputs'], [2, 2, 'done', null],
  ])
})
