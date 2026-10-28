import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FixedClock, InMemoryGit, ScriptedReplay } from '../support/in-memory-host.mjs'
import { agent, API, scripted, SLUG, tddCycle } from '../support/pipeline-host.mjs'
import { waitingOnEnvironment } from '../support/decisions.mjs'

const unavailable = () => ({ ok: false, unavailable: true, text: '' })
const upToDeliver = (it) => [agent()(it), agent()(it), agent()(it)]
const recorded = (host, step) => host.events().filter((event) => event.type === 'step.recorded' && event.step === step)
const checked = (host) => host.events().filter((event) => event.type === 'commits.checked')
const NEIGHBOUR = { name: 'web', root: '../web', stack: 'react', mocking: { strategy: 'inprocess' }, paths: { src: ['src'], tests: ['src'] }, commands: { test: 'npx vitest run', mutation: 'npx stryker run' } }
const PLAYED = { name: 'web', root: 'web', stack: 'react', mocking: { strategy: 'inprocess' }, paths: { src: ['src'], tests: ['src', 'e2e'] }, commands: { test: 'npx vitest run', e2e: 'npx playwright test', mutation: 'npx stryker run' } }
const twoRepositories = () => new InMemoryGit({ repositories: { '.': { mergeBases: { main: 'root-0' } }, '../web': { mergeBases: { main: 'up-web-0' } } } })

test('each test commit is replayed with its component\'s test command, and confirmed red', async () => {
  const host = scripted({}, (it) => [...upToDeliver(it), agent({ work: (h) => { tddCycle()(h); h.git.commit('test(checkout): Checkout refunds', ['tests/RefundTests.cs']); h.git.commit('feat(checkout): Checkout refunds', ['src/Refund.cs']) } })(it)])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(host.replay.lines(), ['root-1 ./. $ dotnet test', 'root-4 ./. $ dotnet test'])
  assert.deepEqual(checked(host).map((event) => [event.step, event.visit, event.attempt, event.commits.map(({ repository, sha, subject, kind, verdict, replay }) => [repository, sha, subject, kind, verdict, replay])]), [[
    'deliver', 1, 1, [
      ['.', 'root-1', 'test(checkout): Checkout pays by card', 'red', 'ok', { component: 'api', command: 'test', exitCode: 1, durationMs: 0 }],
      ['.', 'root-2', 'feat(checkout): Checkout pays by card', 'green', 'ok', null],
      ['.', 'root-3', 'refactor(checkout): name the card payment', 'refactor', 'ok', null],
      ['.', 'root-4', 'test(checkout): Checkout refunds', 'red', 'ok', { component: 'api', command: 'test', exitCode: 1, durationMs: 0 }],
      ['.', 'root-5', 'feat(checkout): Checkout refunds', 'green', 'ok', null],
    ],
  ]])
})

test('a red commit whose tests pass is refused', async () => {
  const replay = new ScriptedReplay({ exits: { 'root-1': 0 } })
  const host = scripted({ replay }, (it) => [...upToDeliver(it), agent({ work: tddCycle() })(it), unavailable])

  await host.start()

  const [refused] = recorded(host, 'deliver')
  assert.deepEqual([refused.outcome, refused.code, refused.failures], ['failed', 'tdd', ['commit root-1 "test(checkout): Checkout pays by card" is not red: the tests of api pass at it; a test commit must fail before the code that makes it pass']])
  assert.equal(checked(host)[0].commits[0].verdict, 'not-red')
  assert.deepEqual(host.replay.lines(), ['root-1 ./. $ dotnet test'])
})

test('a green commit with no red before it is refused, and so is the next green after a green, on the next attempt too', async () => {
  const host = scripted({}, (it) => [...upToDeliver(it), agent({
    work: ({ git }) => {
      git.commit('feat(checkout): pay by card', ['src/Checkout.cs'])
      git.commit('test(checkout): refund', ['tests/RefundTests.cs'])
      git.commit('fix(checkout): refund', ['src/Refund.cs'])
      git.commit('refactor(checkout): name the refund', ['src/Refund.cs'])
      git.commit('fix(checkout): refund rounding', ['src/Refund.cs'])
    },
  })(it), agent()(it)])

  const outcome = await host.start()

  assert.equal(outcome.reason.split(':')[0], 'software-engineer failed the same way on attempts 1 and 2')
  assert.deepEqual(recorded(host, 'deliver')[0].failures, [
    'commit root-1 "feat(checkout): pay by card" makes code pass with no test commit since the last feat or fix; rewrite it after a failing test commit',
    'commit root-5 "fix(checkout): refund rounding" makes code pass with no test commit since the last feat or fix; rewrite it after a failing test commit',
  ])
})

test('a commit that is not type(scope): subject is refused; every conventional type is accepted', async () => {
  const host = scripted({}, (it) => [agent({ work: ({ git }) => {
    git.commit('wip', ['.copilot-tracking/skraft-plans/checkout/a.md'])
    git.commit('Docs: research', ['.copilot-tracking/skraft-plans/checkout/b.md'])
    git.commit('docs(checkout)!: research', ['.copilot-tracking/skraft-plans/checkout/c.md'])
    git.commit('docs: research done', ['.copilot-tracking/skraft-plans/checkout/d.md'])
    for (const type of ['chore', 'build', 'ci', 'perf', 'style', 'revert']) git.commit(`${type}(checkout): tidy`, ['.copilot-tracking/skraft-plans/checkout/e.md'])
    git.commit('wip test: notes', ['.copilot-tracking/skraft-plans/checkout/f.md'])
  } })(it), unavailable])

  await host.start()

  assert.deepEqual(recorded(host, 'research')[0].failures, [
    'commit root-1 "wip" is not a conventional commit (type(scope): subject); reword it',
    'commit root-2 "Docs: research" is not a conventional commit (type(scope): subject); reword it',
    'commit root-11 "wip test: notes" is not a conventional commit (type(scope): subject); reword it',
  ])
  assert.equal(recorded(host, 'research')[0].code, 'commit-convention')
})

test('a red commit that changes no component is refused', async () => {
  const host = scripted({}, (it) => [agent({ work: ({ git }) => git.commit('test(checkout): notes', ['.copilot-tracking/skraft-plans/checkout/notes.md']) })(it), unavailable])

  await host.start()

  assert.deepEqual(recorded(host, 'research')[0].failures, ['commit root-1 "test(checkout): notes" changes no component: a test commit adds a failing test to a component'])
  assert.equal(checked(host)[0].commits[0].verdict, 'no-component')
  assert.deepEqual(host.replay.replays, [])

  const outside = scripted({ components: [{ ...API, root: 'api' }] }, (it) => [agent()(it), agent({ work: ({ git }) => git.commit('test(checkout): ADR of the card payment', ['docs/adr/adr-001.md']) })(it), unavailable])
  await outside.start()
  assert.deepEqual(recorded(outside, 'design')[0].failures, ['commit root-1 "test(checkout): ADR of the card payment" changes no component: a test commit adds a failing test to a component'])
})

test('a refused commit stays refused on the next attempts of the pass, and a red replayed once is not replayed again', async () => {
  const host = scripted({}, (it) => [
    ...upToDeliver(it),
    agent({ work: ({ git }) => { git.commit('test(checkout): pay', ['tests/PayTests.cs']); git.commit('wip', ['tests/PayTests.cs']) } })(it),
    agent()(it),
  ])

  const outcome = await host.start()

  assert.deepEqual([outcome.code, outcome.reason], [
    'commit-convention',
    'software-engineer failed the same way on attempts 1 and 2: commit root-2 "wip" is not a conventional commit (type(scope): subject); reword it',
  ])
  assert.deepEqual(checked(host).map((event) => event.commits.map((commit) => `${commit.sha} ${commit.verdict} ${commit.replay?.exitCode}`)), [
    ['root-1 ok 1', 'root-2 not-conventional undefined'], ['root-1 ok 1', 'root-2 not-conventional undefined'],
  ])
  assert.deepEqual(host.replay.lines(), ['root-1 ./. $ dotnet test'])
})

test('a refused commit leaves the pass once the agent rewrites the history', async () => {
  const replay = new ScriptedReplay({ exits: { 'up-web-1': 0 } })
  const host = scripted({ components: [API, NEIGHBOUR], git: twoRepositories(), replay }, (it) => [
    ...upToDeliver(it),
    agent({ work: ({ git }) => { git.commit('test(checkout): cart', ['../web/src/Cart.test.tsx']); git.change('docs/notes.md') } })(it),
    agent({ work: ({ git }) => { git.revert('docs/notes.md'); git.reset('../web', 'up-web-0'); git.commit('test(checkout): cart fails', ['../web/src/Cart.test.tsx']); git.commit('feat(checkout): cart', ['../web/src/Cart.tsx']) } })(it),
  ])

  assert.equal((await host.start()).status, 'done')
  assert.deepEqual(recorded(host, 'deliver').map((event) => [event.code, event.failures]), [
    ['write-scope', ['out of write scope: docs/notes.md', 'commit up-web- "test(checkout): cart" is not red: the tests of web pass at it; a test commit must fail before the code that makes it pass']],
    [null, []],
  ])
  assert.deepEqual(checked(host).map((event) => event.commits.map((commit) => commit.sha)), [['up-web-1'], ['up-web-2', 'up-web-3']])
  assert.deepEqual(host.replay.lines(), ['up-web-1 ../web/. $ npx vitest run', 'up-web-2 ../web/. $ npx vitest run'])
})

test('a component without a test command waits for a human until it gets one', async () => {
  const bare = { ...API, commands: { build: 'dotnet build' } }
  const host = scripted({ components: [bare] }, (it) => [...upToDeliver(it).slice(0, 2), agent({ work: ({ git }) => git.commit('test(checkout): acceptance', ['tests/AcceptanceTests.cs']) })(it), unavailable])

  const outcome = await host.start()

  assert.deepEqual(outcome, {
    status: 'waiting', slug: SLUG, phase: 'DISTILL', code: 'environment',
    reason: waitingOnEnvironment('distill', 'component api has no test command; add commands.test to it in skraft-config.json so test commits can be replayed'),
  })
  assert.deepEqual(host.types().slice(-3), ['step.started', 'commits.checked', 'question.asked'])

  await host.deps.workspace.write('skraft-config.json', JSON.stringify({ components: [API] }))
  await host.decide({ answer: 'RETRY' })
  assert.equal((await host.run()).code, 'agent-unavailable')
  assert.equal(host.agentRunner.dispatches.length, 4)
  assert.deepEqual(recorded(host, 'distill').map((event) => event.outcome), ['done'])
})

test('a replay the machine cannot run, or a test command with shell syntax, waits for a human to fix the machine', async () => {
  const replay = new ScriptedReplay({ exits: { 'root-1': null } })
  const host = scripted({ replay }, (it) => [...upToDeliver(it).slice(0, 2), agent({ work: ({ git }) => git.commit('test(checkout): acceptance', ['tests/AcceptanceTests.cs']) })(it)])
  const outcome = await host.start()
  assert.deepEqual([outcome.code, outcome.reason], ['environment', waitingOnEnvironment('distill', 'replaying root-1 for api: could not start dotnet')])
  assert.deepEqual(checked(host)[0].commits[0].replay, { component: 'api', command: 'test', exitCode: null, durationMs: 0 })

  const killed = new ScriptedReplay({ exits: { 'root-1': 127 } })
  const missing = scripted({ replay: killed }, (it) => [...upToDeliver(it).slice(0, 2), agent({ work: ({ git }) => git.commit('test(checkout): acceptance', ['tests/AcceptanceTests.cs']) })(it)])
  assert.equal((await missing.start()).reason, waitingOnEnvironment('distill', 'replaying root-1 for api: dotnet test exited 127'))

  const neighbour = scripted({ components: [API, NEIGHBOUR], git: twoRepositories(), replay: new ScriptedReplay({ exits: { 'up-web-1': null } }) }, (it) => [...upToDeliver(it).slice(0, 2), agent({ work: ({ git }) => git.commit('test(checkout): cart', ['../web/src/Cart.test.tsx']) })(it)])
  assert.equal((await neighbour.start()).reason, waitingOnEnvironment('distill', 'replaying up-web- for web: could not start npx'))

  const piped = scripted({ components: [{ ...API, commands: { test: 'dotnet test | tee out.log' } }] }, (it) => [...upToDeliver(it).slice(0, 2), agent({ work: ({ git }) => git.commit('test(checkout): acceptance', ['tests/AcceptanceTests.cs']) })(it)])
  assert.equal((await piped.start()).reason, waitingOnEnvironment('distill', 'api command "dotnet test | tee out.log" uses shell syntax (|); put the steps in a script and call the script'))

  const e2e = scripted({ components: [API, PLAYED], replay: new ScriptedReplay({ exits: { 'root-1 npx vitest run': 0, 'root-1 npx playwright test': 127 } }) }, (it) => [...upToDeliver(it).slice(0, 2), agent({ work: ({ git }) => git.commit('test(checkout): a won game', ['web/e2e/game.spec.ts']) })(it), unavailable])
  assert.equal((await e2e.start()).reason, waitingOnEnvironment('distill', 'replaying root-1 for web: npx playwright test exited 127'))
  assert.equal(checked(e2e)[0].commits[0].verdict, 'ok')

  const untested = scripted({ components: [API, PLAYED], replay: new ScriptedReplay({ exits: { 'root-1 npx vitest run': null } }) }, (it) => [...upToDeliver(it).slice(0, 2), agent({ work: ({ git }) => git.commit('test(checkout): a won game', ['web/e2e/game.spec.ts']) })(it), unavailable])
  assert.equal((await untested.start()).reason, waitingOnEnvironment('distill', 'replaying root-1 for web: could not start npx'))
  assert.deepEqual(untested.replay.lines(), ['root-1 ./web $ npx vitest run'])
})

test('a Python component\'s test commits are replayed with the interpreter of its virtual environment, as its gates run, its source folders first on the import path', async () => {
  const PYTHON = { name: 'api', root: '.', stack: 'python', paths: { src: ['src', 'lib'], tests: ['tests'] }, commands: { test: 'python -m pytest -q' } }
  const host = scripted({ components: [PYTHON], replay: new ScriptedReplay({ exits: { 'root-2 .venv/bin/python -m pytest -q': null } }) }, (it) => [...upToDeliver(it).slice(0, 2), agent({
    work: ({ git }) => {
      git.commit('test(checkout): pay', ['tests/test_pay.py'])
      git.commit('test(checkout): refund', ['tests/test_refund.py'])
    },
  })(it), unavailable])

  const outcome = await host.start()

  assert.equal(outcome.code, 'agent-unavailable', outcome.reason)
  assert.deepEqual(host.replay.lines(), ['root-1 ./. $ .venv/bin/python -m pytest -q [import src, lib]', 'root-2 ./. $ .venv/bin/python -m pytest -q [import src, lib]', 'root-2 ./. $ .venv/Scripts/python.exe -m pytest -q [import src, lib]'])
  assert.deepEqual(checked(host)[0].commits.map(({ verdict, replay }) => [verdict, replay?.exitCode]), [['ok', 1], ['ok', 1]])

  const none = scripted({ components: [PYTHON], replay: new ScriptedReplay({ exits: { 'root-1': null } }) }, (it) => [...upToDeliver(it).slice(0, 2), agent({ work: ({ git }) => git.commit('test(checkout): pay', ['tests/test_pay.py']) })(it)])
  assert.equal((await none.start()).reason, waitingOnEnvironment('distill', 'replaying root-1 for api: could not start .venv/bin/python nor .venv/Scripts/python.exe nor python nor python3'))
})

test('a test command that installs dependencies is not replayed: through the replay\'s links it would change the working copy\'s, so a human is asked to take the install out', async () => {
  const installs = { ...PLAYED, commands: { ...PLAYED.commands, test: 'npm cit' } }
  const host = scripted({ components: [API, installs] }, (it) => [...upToDeliver(it).slice(0, 2), agent({ work: ({ git }) => git.commit('test(checkout): the score', ['web/tests/Score.test.tsx']) })(it), unavailable])

  assert.equal((await host.start()).reason, waitingOnEnvironment('distill', 'web command "npm cit" runs npm cit: replayed at a commit, it would change through the replay\'s links the dependencies the working copy installed; take the install out of it'))
  assert.deepEqual(host.replay.lines(), [])

  const plain = scripted({ components: [API, { ...PLAYED, commands: { ...PLAYED.commands, test: 'npm run ci' } }] }, (it) => [...upToDeliver(it).slice(0, 2), agent({ work: ({ git }) => git.commit('test(checkout): the score', ['web/tests/Score.test.tsx']) })(it), unavailable])
  assert.equal((await plain.start()).code, 'agent-unavailable')
  assert.deepEqual(plain.replay.lines(), ['root-1 ./web $ npm run ci'])
})

test('Git that cannot list a repository\'s commits waits for a human to fix the machine', async () => {
  const host = scripted({}, (it) => [agent({ work: ({ git }) => { git.commits = async () => null; git.changedFiles = async () => [] } })(it)])

  const outcome = await host.start()

  assert.deepEqual(outcome, { status: 'waiting', slug: SLUG, phase: 'RESEARCH', code: 'environment', reason: waitingOnEnvironment('research', 'Git cannot list the commits of . since root-0') })
  assert.deepEqual(host.types(), ['run.started', 'step.started', 'step.recorded', 'step.started', 'step.recorded', 'step.started', 'question.asked'])
})

test('a component added after the run started has its test commits replayed without a base', async () => {
  const FRONT = { name: 'web', root: 'web', stack: 'react', mocking: { strategy: 'inprocess' }, paths: { src: ['src'], tests: ['src'] }, commands: { test: 'npx vitest run', mutation: 'npx stryker run' } }
  const host = scripted({}, (it) => [...upToDeliver(it), agent({ work: ({ git }) => git.commit('test(checkout): cart', ['web/src/Cart.test.tsx']) })(it)])
  await host.init()
  await host.deps.workspace.write('skraft-config.json', JSON.stringify({ publish: { pullRequest: false, visuals: false }, components: [API, FRONT] }))

  const outcome = await host.run()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(host.replay.lines(), ['root-1 ./web $ npx vitest run'])

  const placeholder = scripted({}, (it) => [...upToDeliver(it), unavailable])
  await placeholder.init()
  await placeholder.deps.workspace.write('skraft-config.json', JSON.stringify({ publish: { pullRequest: false, visuals: false }, components: [API, { ...FRONT, commands: { test: 'npx vitest run --since {baseSha}', mutation: 'npx stryker run' } }] }))
  await placeholder.run()
  assert.ok(placeholder.agentRunner.dispatches[3].prompt.includes('- web: web (react), mocking: inprocess, contract testing: off, tests: npx vitest run --since {baseSha}\n'), placeholder.agentRunner.dispatches[3].prompt)
})

test('a red commit is replayed for each component it touches, is red when one of them fails, and reports the first replay that fails', async () => {
  const WEB = { name: 'web', root: 'web', stack: 'react', mocking: { strategy: 'inprocess' }, paths: { src: ['src'], tests: ['src'] }, commands: { test: 'npx vitest run --since {baseSha}', mutation: 'npx stryker run' } }
  const host = scripted({ components: [API, WEB] }, (it) => [
    ...upToDeliver(it),
    agent({ work: ({ git }) => {
      git.commit('test(checkout): both', ['tests/BothTests.cs', 'web/src/Both.test.tsx'])
      git.commit('feat(checkout): both', ['src/Both.cs'])
      git.commit('test(checkout): both again', ['tests/BothTests.cs', 'web/src/Both.test.tsx'])
      git.commit('feat(checkout): both again', ['src/Both.cs'])
    } })(it),
    unavailable,
  ])
  host.replay.exits['root-1 dotnet test'] = 0

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(host.replay.lines(), ['root-1 ./. $ dotnet test', 'root-1 ./web $ npx vitest run --since root-0', 'root-3 ./. $ dotnet test', 'root-3 ./web $ npx vitest run --since root-0'])
  assert.deepEqual([checked(host)[0].commits[0].replay, checked(host)[0].commits[2].replay], [
    { component: 'web', command: 'test', exitCode: 1, durationMs: 0 },
    { component: 'api', command: 'test', exitCode: 1, durationMs: 0 },
  ])
})

test('a red commit whose tests pass in every component it touches names them all', async () => {
  const WEB = { name: 'web', root: 'web', stack: 'react', mocking: { strategy: 'inprocess' }, paths: { src: ['src'], tests: ['src'] }, commands: { test: 'npx vitest run', mutation: 'npx stryker run' } }
  const replay = new ScriptedReplay({ exits: { 'root-1': 0 } })
  const host = scripted({ components: [API, WEB], replay }, (it) => [...upToDeliver(it), agent({ work: ({ git }) => git.commit('test(checkout): both', ['web/src/Both.test.tsx', 'tests/BothTests.cs']) })(it), unavailable])

  await host.start()

  assert.deepEqual(recorded(host, 'deliver')[0].failures, ['commit root-1 "test(checkout): both" is not red: the tests of web, api pass at it; a test commit must fail before the code that makes it pass'])
})

test('a red commit whose tests pass is replayed with its component\'s e2e command, and is red when the e2e tests fail there and pass at its parent', async () => {
  const replay = new ScriptedReplay({ exits: { 'root-1 npx vitest run': 0, 'root-0 npx playwright test': 0 } })
  const host = scripted({ components: [API, PLAYED], replay }, (it) => [...upToDeliver(it), agent({
    work: ({ git }) => {
      git.commit('test(checkout): a won game', ['web/e2e/game.spec.ts'])
      git.commit('feat(checkout): a won game', ['web/src/Game.tsx'])
      git.commit('test(checkout): the score', ['web/src/Score.test.tsx'])
      git.commit('feat(checkout): the score', ['web/src/Score.tsx'])
    },
  })(it), unavailable])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(host.replay.lines(), ['root-1 ./web $ npx vitest run', 'root-1 ./web $ npx playwright test', 'root-0 ./web $ npx playwright test', 'root-3 ./web $ npx vitest run'])
  assert.deepEqual(checked(host)[0].commits.map(({ verdict, replay }) => [verdict, replay]), [
    ['ok', { component: 'web', command: 'e2e', exitCode: 1, durationMs: 0 }], ['ok', null],
    ['ok', { component: 'web', command: 'test', exitCode: 1, durationMs: 0 }], ['ok', null],
  ])
})

test('e2e tests that fail at the parent of a red commit too prove nothing, and wait for a human to fix the machine', async () => {
  const replay = new ScriptedReplay({ exits: { 'up-web-1 npx vitest run': 0 } })
  const host = scripted({ components: [API, { ...PLAYED, root: '../web' }], git: twoRepositories(), replay }, (it) => [...upToDeliver(it), agent({ work: ({ git }) => git.commit('test(checkout): a won game', ['../web/e2e/game.spec.ts']) })(it), unavailable])

  const outcome = await host.start()

  assert.deepEqual([outcome.code, outcome.reason], ['environment', waitingOnEnvironment('deliver', 'replaying up-web- for web: npx playwright test fails at the parent of up-web- too, so its failure proves nothing; make npx playwright test pass at that parent on this machine, then retry')])
  assert.deepEqual(host.replay.lines(), ['up-web-1 ../web/. $ npx vitest run', 'up-web-1 ../web/. $ npx playwright test', 'up-web-0 ../web/. $ npx playwright test'])
  assert.deepEqual(checked(host)[0].commits.map(({ verdict, replay }) => [verdict, replay]), [['ok', { component: 'web', command: 'e2e', exitCode: 1, durationMs: 0 }]])

  const unstarted = scripted({ components: [API, PLAYED], replay: new ScriptedReplay({ exits: { 'root-1 npx vitest run': 0, 'root-0 npx playwright test': null } }) }, (it) => [...upToDeliver(it), agent({ work: ({ git }) => git.commit('test(checkout): a won game', ['web/e2e/game.spec.ts']) })(it), unavailable])
  assert.equal((await unstarted.start()).reason, waitingOnEnvironment('deliver', 'replaying root-1 for web: npx playwright test could not run at the parent of root-1, so its failure proves nothing; fix the machine, then retry'))
})

test('e2e tests that fail after a red commit of the pass whose e2e tests fail too prove nothing; the agent is told how to commit them', async () => {
  const replay = new ScriptedReplay({ exits: { 'root-1 npx vitest run': 0, 'root-2 npx vitest run': 0, 'root-0 npx playwright test': 0 } })
  const host = scripted({ components: [API, PLAYED], replay }, (it) => [...upToDeliver(it).slice(0, 2), agent({
    work: ({ git }) => {
      git.commit('test(checkout): a won game', ['web/e2e/game.spec.ts'])
      git.commit('test(checkout): a lost game', ['web/e2e/lost.spec.ts'])
    },
  })(it), unavailable])

  await host.start()

  assert.deepEqual(recorded(host, 'distill')[0].failures, ['commit root-2 "test(checkout): a lost game" is not red: its failing e2e tests prove nothing alone: they fail at its parent too, a test commit of this pass or one with no e2e test yet; commit them all in one commit, or with a failing unit test, or with the code that makes them pass; a test commit must fail before the code that makes it pass'])
  assert.deepEqual(host.replay.lines(), ['root-1 ./web $ npx vitest run', 'root-1 ./web $ npx playwright test', 'root-0 ./web $ npx playwright test', 'root-2 ./web $ npx vitest run', 'root-2 ./web $ npx playwright test'])

  const after = scripted({ components: [API, PLAYED], replay: new ScriptedReplay({ exits: { 'root-1': 0, 'root-2 npx vitest run': 0 } }) }, (it) => [...upToDeliver(it).slice(0, 2), agent({
    work: ({ git }) => {
      git.commit('test(checkout): a won game', ['web/e2e/game.spec.ts'])
      git.commit('test(checkout): a lost game', ['web/e2e/lost.spec.ts'])
    },
  })(it), unavailable])
  await after.start()
  assert.deepEqual(checked(after)[0].commits.map(({ verdict }) => verdict), ['not-red', 'ok'])
  assert.deepEqual(after.replay.lines(), ['root-1 ./web $ npx vitest run', 'root-1 ./web $ npx playwright test', 'root-2 ./web $ npx vitest run', 'root-2 ./web $ npx playwright test'])

  const unit = scripted({ components: [API, PLAYED], replay: new ScriptedReplay({ exits: { 'root-2 npx vitest run': 0, 'root-1 npx playwright test': 0 } }) }, (it) => [...upToDeliver(it).slice(0, 2), agent({
    work: ({ git }) => {
      git.commit('test(checkout): the score', ['web/tests/Score.test.tsx'])
      git.commit('test(checkout): a won game', ['web/e2e/game.spec.ts'])
    },
  })(it), unavailable])
  await unit.start()
  assert.deepEqual(checked(unit)[0].commits.map(({ verdict }) => verdict), ['ok', 'ok'])
  assert.deepEqual(unit.replay.lines(), ['root-1 ./web $ npx vitest run', 'root-2 ./web $ npx vitest run', 'root-2 ./web $ npx playwright test', 'root-1 ./web $ npx playwright test'])

  const ADMIN = { ...PLAYED, name: 'admin', root: 'admin', commands: { ...PLAYED.commands, e2e: 'npx playwright test --project admin' } }
  const neighbour = scripted({ components: [API, PLAYED, ADMIN], replay: new ScriptedReplay({ exits: { 'root-1 npx vitest run': 0, 'root-2 npx vitest run': 0, 'root-0 npx playwright test --project admin': 0, 'root-1 npx playwright test': 0 } }) }, (it) => [...upToDeliver(it).slice(0, 2), agent({
    work: ({ git }) => {
      git.commit('test(checkout): an admin page', ['admin/e2e/admin.spec.ts'])
      git.commit('test(checkout): a won game', ['web/e2e/game.spec.ts'])
    },
  })(it), unavailable])
  await neighbour.start()
  assert.deepEqual(checked(neighbour)[0].commits.map(({ verdict }) => verdict), ['ok', 'ok'])
  assert.deepEqual(neighbour.replay.lines().slice(-1), ['root-1 ./web $ npx playwright test'])
})

test('the first e2e tests of a component prove nothing alone when the parent has none to run; the agent is told how to commit them', async () => {
  const replay = new ScriptedReplay({ exits: { 'root-1 npx vitest run': 0 }, outputs: { 'root-0 npx playwright test': 'Error: No tests found.\nMake sure that arguments are regular expressions matching test files.\n' } })
  const host = scripted({ components: [API, PLAYED], replay }, (it) => [...upToDeliver(it).slice(0, 2), agent({ work: ({ git }) => git.commit('test(checkout): a won game', ['web/e2e/game.spec.ts']) })(it), agent()(it)])

  await host.start()

  assert.deepEqual(recorded(host, 'distill')[1].failures, recorded(host, 'distill')[0].failures)
  assert.deepEqual(recorded(host, 'distill')[0].failures, ['commit root-1 "test(checkout): a won game" is not red: its failing e2e tests prove nothing alone: they fail at its parent too, a test commit of this pass or one with no e2e test yet; commit them all in one commit, or with a failing unit test, or with the code that makes them pass; a test commit must fail before the code that makes it pass'])
})

test('a red commit whose tests fail in one component runs no e2e command', async () => {
  const replay = new ScriptedReplay({ exits: { 'root-1 npx vitest run': 0 } })
  const host = scripted({ components: [API, PLAYED], replay }, (it) => [...upToDeliver(it), agent({
    work: ({ git }) => {
      git.commit('test(checkout): a won game', ['web/e2e/game.spec.ts', 'tests/GameTests.cs'])
      git.commit('feat(checkout): a won game', ['src/Game.cs'])
    },
  })(it), unavailable])

  assert.equal((await host.start()).status, 'done')
  assert.deepEqual(host.replay.lines(), ['root-1 ./web $ npx vitest run', 'root-1 ./. $ dotnet test'])
  assert.deepEqual(checked(host)[0].commits[0].replay, { component: 'api', command: 'test', exitCode: 1, durationMs: 0 })
})

test('a red commit whose tests and e2e tests pass is refused, naming the components whose e2e tests ran', async () => {
  const replay = new ScriptedReplay({ exits: { 'root-1': 0 } })
  const host = scripted({ components: [API, PLAYED], replay }, (it) => [...upToDeliver(it), agent({ work: ({ git }) => git.commit('test(checkout): a won game', ['web/e2e/game.spec.ts', 'tests/GameTests.cs']) })(it), unavailable])

  await host.start()

  assert.deepEqual(recorded(host, 'deliver')[0].failures, ['commit root-1 "test(checkout): a won game" is not red: the tests of web, api pass at it, and so do the e2e tests of web; a test commit must fail before the code that makes it pass'])
  assert.deepEqual(host.replay.lines(), ['root-1 ./web $ npx vitest run', 'root-1 ./. $ dotnet test', 'root-1 ./web $ npx playwright test'])
  assert.deepEqual(checked(host)[0].commits[0].replay, { component: 'web', command: 'e2e', exitCode: 0, durationMs: 0 })
})

test('with "tdd": { "replay": "last-red" }, only the last red commit of each story is replayed', async () => {
  const clock = new FixedClock('2026-10-11T09:00:00.000Z')
  const replay = new ScriptedReplay({ clock, takesMs: 30_000 })
  const host = scripted({ config: { tdd: { replay: 'last-red' } }, clock, replay }, (it) => [...upToDeliver(it), agent({
    work: ({ git }) => {
      git.commit('test(pay): first', ['tests/PayTests.cs'])
      git.commit('feat(pay): first', ['src/Pay.cs'])
      git.commit('test(pay): second', ['tests/PayTests.cs'])
      git.commit('feat(pay): second', ['src/Pay.cs'])
      git.commit('test(refund): first', ['tests/RefundTests.cs'])
      git.commit('feat(refund): first', ['src/Refund.cs'])
    },
  })(it)])

  await host.start()

  assert.deepEqual(host.replay.lines(), ['root-3 ./. $ dotnet test', 'root-5 ./. $ dotnet test'])
  assert.ok(!host.types().includes('tdd.replay-slow'))
})

test('replays above a fifth of the phase are reported once, with the way to replay less, every red being replayed by default', async () => {
  const clock = new FixedClock('2026-10-11T09:00:00.000Z')
  const replay = new ScriptedReplay({ clock, takesMs: 30_000 })
  const host = scripted({ config: { tdd: {} }, clock, replay }, (it) => [...upToDeliver(it), agent({ work: (h) => { it.clock.advance(100_000); tddCycle()(h) } })(it)])
  host.machine.clock = null

  await host.start()

  const slow = host.events().filter((event) => event.type === 'tdd.replay-slow')
  assert.deepEqual(slow.map(({ phase, replayMs, phaseMs }) => [phase, replayMs, phaseMs]), [['DELIVER', 30_000, 130_000]])
  assert.ok(host.progress.lines.includes(`${SLUG}: replaying test commits took 23% of DELIVER; set "tdd": { "replay": "last-red" } in skraft-config.json to replay only the last test commit of each story`))
  assert.deepEqual(recorded(host, 'deliver').map((event) => event.replayMs), [30_000])
})

test('a replay share at a fifth of the phase or below is not reported, and a phase is reported only once', async () => {
  const clock = new FixedClock('2026-10-11T09:00:00.000Z')
  const replay = new ScriptedReplay({ clock, takesMs: 20_000 })
  const host = scripted({ clock, replay }, (it) => [
    agent()(it), agent()(it),
    agent({ work: ({ git }) => { it.clock.advance(80_000); git.commit('test(checkout): acceptance', ['tests/AcceptanceTests.cs']) } })(it),
    agent({ work: ({ git }) => { git.commit('test(checkout): a', ['tests/A.cs']); git.commit('feat(checkout): a', ['src/A.cs']) } })(it),
  ])
  host.machine.clock = null

  await host.start()

  assert.deepEqual(host.events().filter((event) => event.type === 'tdd.replay-slow').map((event) => event.phase), ['DELIVER'])

  const twice = scripted({ clock: new FixedClock('2026-10-11T09:00:00.000Z') }, (it) => [
    agent()(it), agent()(it), agent()(it),
    agent({ fill: false, work: (h) => tddCycle('a', 'A')(h) })(it),
    agent({ work: (h) => tddCycle('b', 'B')(h) })(it),
  ])
  twice.replay.clock = twice.clock
  twice.replay.takesMs = 10_000
  await twice.start()
  assert.deepEqual(twice.events().filter((event) => event.type === 'tdd.replay-slow').map((event) => event.phase), ['DELIVER'])
})
