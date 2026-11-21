import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryGit } from '../support/in-memory-host.mjs'
import { API, SLUG, agent, scripted } from '../support/pipeline-host.mjs'
import { waitingOnEnvironment } from '../support/decisions.mjs'

const unavailable = () => ({ ok: false, unavailable: true, text: '' })
/** A workflow whose one agent commits whole TDD cycles, as a repository with no scenario to deliver runs it. */
const ONLY_DELIVER = 'digraph p {\n  start [shape=Mdiamond]\n  deliver [shape=box, agent="software-engineer", phase="DELIVER"]\n  exit [shape=Msquare]\n  start -> deliver -> exit\n}\n'
const recorded = (host, step) => host.events().filter((event) => event.type === 'step.recorded' && event.step === step)
const checked = (host) => host.events().filter((event) => event.type === 'commits.checked')
const NEIGHBOUR = { name: 'web', root: '../web', stack: 'react', bdd: false, mocking: { strategy: 'inprocess' }, paths: { src: ['src'], tests: ['src'] }, commands: { test: 'npx vitest run', mutation: 'npx stryker run' } }
const twoRepositories = () => new InMemoryGit({ repositories: { '.': { mergeBases: { main: 'root-0' } }, '../web': { mergeBases: { main: 'up-web-0' } } } })

test('the engine runs no command between DISTILL\'s red and the gates: the commits are judged from Git alone', async () => {
  let ranBeforeDeliver = null
  const host = scripted({}, (it) => [agent()(it), agent()(it), agent()(it), agent({ work: ({ git }) => { ranBeforeDeliver = it.machine.runs.length; git.commit('feat(checkout): S1 pay by card', ['src/Checkout.cs', 'tests/CheckoutTests.cs']) } })(it)])

  assert.equal((await host.start()).status, 'done')

  assert.equal(ranBeforeDeliver, 0, 'no test command ran at DISTILL\'s red')
  assert.deepEqual(checked(host).map((event) => [event.step, event.commits.map(({ sha, kind, verdict }) => [sha, kind, verdict])]), [['distill', [['root-1', 'red', 'ok']]], ['deliver', [['root-2', 'green', 'ok']]]])
  assert.deepEqual(Object.keys(checked(host)[0].commits[0]).sort(), ['kind', 'repository', 'sha', 'subject', 'verdict'])
})

test('a green commit with no red before it is refused, and so is the next green after a green, on the next attempt too', async () => {
  const host = scripted({ workflow: ONLY_DELIVER }, (it) => [agent({
    work: ({ git }) => {
      git.commit('feat(checkout): pay by card', ['src/Checkout.cs'])
      git.commit('test(checkout): refund', ['tests/RefundTests.cs'])
      git.commit('fix(checkout): refund', ['src/Refund.cs'])
      git.commit('refactor(checkout): name the refund', ['src/Refund.cs'])
      git.commit('fix(checkout): refund rounding', ['src/Refund.cs'])
    },
  })(it), agent()(it)])

  const outcome = await host.start()

  assert.match(outcome.reason.split('\n')[0], /^deliver stopped after 2 occurrences of failure signature [a-f0-9]+; evidence: unavailable$/)
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

  const outside = scripted({ components: [{ ...API, root: 'api' }] }, (it) => [agent()(it), agent({ work: ({ git }) => git.commit('test(checkout): ADR of the card payment', ['docs/adr/adr-001.md']) })(it), unavailable])
  await outside.start()
  assert.deepEqual(recorded(outside, 'design')[0].failures, ['commit root-1 "test(checkout): ADR of the card payment" changes no component: a test commit adds a failing test to a component'])
})

test('a refused commit stays refused on the next attempts of the pass', async () => {
  const host = scripted({ workflow: ONLY_DELIVER }, (it) => [
    agent({ work: ({ git }) => { git.commit('test(checkout): pay', ['tests/PayTests.cs']); git.commit('wip', ['tests/PayTests.cs']) } })(it),
    agent()(it),
  ])

  const outcome = await host.start()

  assert.equal(outcome.code, 'repeated-failure')
  assert.match(outcome.reason, /^deliver stopped after 2 occurrences of failure signature [a-f0-9]+; evidence: unavailable$/)
  assert.deepEqual(checked(host).map((event) => event.commits.map((commit) => `${commit.sha} ${commit.verdict}`)), [
    ['root-1 ok', 'root-2 not-conventional'], ['root-1 ok', 'root-2 not-conventional'],
  ])
})

test('a refused commit leaves the pass once the agent rewrites the history', async () => {
  const host = scripted({ workflow: ONLY_DELIVER, components: [API, NEIGHBOUR], git: twoRepositories() }, (it) => [
    agent({ work: ({ git }) => { git.commit('test(checkout): cart', ['../web/src/Cart.test.tsx']); git.change('docs/notes.md') } })(it),
    agent({ work: ({ git }) => { git.revert('docs/notes.md'); git.reset('../web', 'up-web-0'); git.commit('test(checkout): cart fails', ['../web/src/Cart.test.tsx']); git.commit('feat(checkout): cart', ['../web/src/Cart.tsx']) } })(it),
  ])

  assert.equal((await host.start()).status, 'done')
  assert.deepEqual(recorded(host, 'deliver').map((event) => [event.code, event.failures]), [
    ['write-scope', ['out of write scope: docs/notes.md']],
    [null, []],
  ])
  assert.deepEqual(checked(host).map((event) => event.commits.map((commit) => commit.sha)), [['up-web-1'], ['up-web-2', 'up-web-3']])
})

test('Git that cannot list a repository\'s commits waits for a human to fix the machine', async () => {
  const host = scripted({}, (it) => [agent({ work: ({ git }) => { git.commits = async () => null; git.changedFiles = async () => [] } })(it)])

  const outcome = await host.start()

  assert.deepEqual([outcome.status, outcome.slug, outcome.phase, outcome.code], ['waiting', SLUG, 'RESEARCH', 'environment'])
  assert.ok(outcome.reason.startsWith(waitingOnEnvironment('research', 'Git cannot list the commits of . since root-0').split('\nThe run so far')[0]))
  assert.deepEqual(host.types(), ['run.started', 'step.started', 'question.asked'])
})
