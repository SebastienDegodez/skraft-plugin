import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUILT_IN_WORKFLOW, InMemoryGit } from '../support/in-memory-host.mjs'
import { agent, API, scripted, SLUG, tddCycle } from '../support/pipeline-host.mjs'
import { waitingOnEnvironment } from '../support/decisions.mjs'

const unavailable = () => ({ ok: false, unavailable: true, text: '' })
const recorded = (host, step) => host.events().filter((event) => event.type === 'step.recorded' && event.step === step)

/** The durable design documents an architect keeps under docs/. */
const DESIGN_DOCUMENTS = Object.freeze(['docs/architecture/context-map.md', 'docs/architecture/payment.md', 'docs/domain/event-model/payment.md'])

test('the architect writing in src/ is refused with the files at fault, and told so; its ADRs and design documents under docs/ are not', async () => {
  const hack = agent({ work: ({ git }) => { git.change('src/Checkout.cs', 'docs/adr/adr-001.md', ...DESIGN_DOCUMENTS); git.commit('docs(checkout): sketch', ['src/Sketch.cs']) } })
  const host = scripted({}, (it) => [agent()(it), hack(it), agent()(it), unavailable])

  await host.start()

  const [refused] = recorded(host, 'design')
  assert.deepEqual([refused.outcome, refused.code, refused.failures], ['failed', 'write-scope', ['out of write scope: src/Sketch.cs', 'out of write scope: src/Checkout.cs']])
  assert.ok(host.agentRunner.dispatches[2].prompt.endsWith('\n\nRefused in attempt 1 of 3:\n- out of write scope: src/Sketch.cs\n- out of write scope: src/Checkout.cs'))
})

test('the researcher writing a design document under docs/ is refused: those are DESIGN\'s', async () => {
  const host = scripted({}, (it) => [agent({ work: ({ git }) => git.change('docs/architecture/context-map.md', 'docs/features/payment/pay-by-card.feature') })(it), unavailable])

  await host.start()

  assert.deepEqual(recorded(host, 'research')[0].failures, ['out of write scope: docs/architecture/context-map.md', 'out of write scope: docs/features/payment/pay-by-card.feature'])
})

test('files out of scope stay refused on the next attempt of the pass, resumed or not, until they are reverted', async () => {
  const host = scripted({}, (it) => [
    agent()(it),
    agent({ work: ({ git }) => git.change('src/Checkout.cs') })(it),
    agent()(it),
    agent({ work: ({ git }) => { git.revert('src/Checkout.cs') } })(it),
    unavailable,
  ])

  await host.start()

  assert.deepEqual(recorded(host, 'design').map((event) => [event.attempt, event.outcome, event.failures]), [
    [1, 'failed', ['out of write scope: src/Checkout.cs']],
    [2, 'failed', ['out of write scope: src/Checkout.cs']],
  ])
  assert.equal(host.agentRunner.dispatches.length, 3)

  const reverted = scripted({}, (it) => [
    agent()(it),
    agent({ work: ({ git }) => git.change('src/Checkout.cs') })(it),
    agent({ work: ({ git }) => { git.revert('src/Checkout.cs') } })(it),
    unavailable,
  ])
  await reverted.start()
  assert.deepEqual(recorded(reverted, 'design').map((event) => event.outcome), ['failed', 'done'])

  const interrupted = scripted({}, (it) => [
    agent()(it),
    agent({ work: ({ git }) => git.change('src/Checkout.cs') })(it),
    async (dispatch) => { await agent()(it)(dispatch); throw new Error('host interrupted') },
    unavailable,
  ])
  await assert.rejects(interrupted.start(), /host interrupted/)
  await interrupted.run()
  assert.deepEqual(recorded(interrupted, 'design').map((event) => [event.attempt, event.outcome, event.failures]), [
    [1, 'failed', ['out of write scope: src/Checkout.cs']],
    [2, 'failed', ['out of write scope: src/Checkout.cs']],
  ])
})

test('the software engineer writing the source and test paths of its components is accepted', async () => {
  const host = scripted({}, (it) => [agent()(it), agent()(it), agent()(it), agent({ work: (h) => { tddCycle()(h); h.git.change('tests/Fixtures/card.json', `.copilot-tracking/skraft-plans/${SLUG}/notes.md`) } })(it)])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(recorded(host, 'deliver').map((event) => [event.outcome, event.failures]), [['done', []]])
})

test('files already changed before the pass started are not held against the agent', async () => {
  const host = scripted({ files: { 'src/WorkInProgress.cs': 'class WorkInProgress {}\n', 'README.md': '# Draft\n' } }, (it) => [agent()(it), unavailable])
  host.git.change('src/WorkInProgress.cs', 'README.md')

  await host.start()

  assert.deepEqual(recorded(host, 'research').map((event) => [event.outcome, event.failures]), [['done', []]])
})

test('no agent may change skraft-config.json or the workflow file, even inside its paths', async () => {
  const everywhere = { ...API, paths: { src: ['.'], tests: ['.'] } }
  const host = scripted({ components: [everywhere], files: { '.skraft/pipeline.skraft.dot': BUILT_IN_WORKFLOW } }, (it) => [
    agent()(it), agent()(it), agent()(it),
    agent({ work: ({ git }) => { tddCycle()({ git }); git.change('skraft-config.json', '.skraft/pipeline.skraft.dot', 'README.md') } })(it),
    unavailable,
  ])

  await host.start()

  assert.deepEqual(recorded(host, 'deliver')[0].failures, ['out of write scope: skraft-config.json', 'out of write scope: .skraft/pipeline.skraft.dot'])
})

test('a component in a neighbour repository is checked in that repository, against its own paths', async () => {
  const WEB = { name: 'web', root: '../web', stack: 'react', mocking: { strategy: 'inprocess' }, paths: { src: ['src'], tests: ['src'] }, commands: { test: 'npx vitest run' } }
  const git = new InMemoryGit({ repositories: { '.': { mergeBases: { main: 'root-0' } }, '../web': { mergeBases: { main: 'up-web-0' } } } })
  const host = scripted({ components: [API, WEB], git }, (it) => [
    agent()(it), agent()(it), agent()(it),
    agent({ work: ({ git: repos }) => { repos.commit('test(checkout): cart', ['../web/src/Cart.test.tsx']); repos.commit('feat(checkout): cart', ['../web/src/Cart.tsx']); repos.change('../web/package.json', '../web/scripts/release.sh') } })(it),
    unavailable,
  ])

  await host.start()

  const started = host.events().find((event) => event.type === 'step.started' && event.step === 'deliver')
  assert.deepEqual(started.heads, [{ repository: '.', sha: 'root-0', dirty: [] }, { repository: '../web', sha: 'up-web-0', dirty: [] }])
  assert.deepEqual(recorded(host, 'deliver')[0].failures, ['out of write scope: ../web/scripts/release.sh'])
  assert.deepEqual(host.replay.lines(), ['up-web-1 ../web/. $ npx vitest run'])
})

test('Git that cannot list a repository\'s changes waits for a human; once retried, the step is checked again', async () => {
  const host = scripted({}, (it) => [agent()(it), unavailable])
  await host.init()
  const listing = host.git.changedFiles.bind(host.git)
  let broken = true
  host.git.changedFiles = async (dir, sha) => (broken && host.agentRunner.dispatches.length > 0 ? null : listing(dir, sha))

  const outcome = await host.run()

  assert.deepEqual(outcome, { status: 'waiting', slug: SLUG, phase: 'RESEARCH', code: 'environment', reason: waitingOnEnvironment('research', 'Git cannot list what changed in . since root-0') })
  assert.deepEqual(host.types(), ['run.started', 'step.started', 'step.recorded', 'step.started', 'step.recorded', 'step.started', 'question.asked'])
  broken = false
  await host.decide({ answer: 'RETRY' })
  assert.equal((await host.run()).code, 'agent-unavailable')
  assert.equal(host.agentRunner.dispatches.length, 2)
  assert.deepEqual(recorded(host, 'research').map((event) => event.outcome), ['done'])
})

test('a file already changed before the pass is held against the agent once it changes it again, or deletes it', async () => {
  for (const touch of [
    (workspace) => workspace.write('src/WorkInProgress.cs', 'class Draft { int x; }'),
    (workspace) => { workspace.files.delete('src/WorkInProgress.cs') },
  ]) {
    const host = scripted({ files: { 'src/WorkInProgress.cs': 'class Draft {}' } }, (it) => [agent({ work: () => touch(it.deps.workspace) })(it), unavailable])
    host.git.change('src/WorkInProgress.cs')

    await host.start()

    assert.deepEqual(recorded(host, 'research')[0].failures, ['out of write scope: src/WorkInProgress.cs'])
  }
})

test('the agents writing a component\'s paths may change the files right in its root, not those of its other folders; the others may not', async () => {
  const host = scripted({}, (it) => [
    agent()(it), agent()(it),
    agent({ work: ({ git }) => git.change('Checkout.sln', 'tests/Acceptance/Pay.cs', 'build/props.xml') })(it),
    unavailable,
  ])

  await host.start()

  assert.deepEqual(recorded(host, 'distill')[0].failures, ['out of write scope: build/props.xml'])

  const architect = scripted({}, (it) => [agent()(it), agent({ work: ({ git }) => git.change('Checkout.sln') })(it), unavailable])
  await architect.start()
  assert.deepEqual(recorded(architect, 'design')[0].failures, ['out of write scope: Checkout.sln'])
})

test('the acceptance designer writes the skeleton its failing test calls in the source paths, beside the test, and its scenarios under docs/features', async () => {
  const host = scripted({}, (it) => [
    agent()(it), agent()(it),
    agent({ work: ({ git }) => git.change('src/Checkout/Pay.cs', 'tests/Checkout.UnitTest/PayTests.cs', 'docs/features/payment/pay-by-card.feature') })(it),
    unavailable,
  ])

  await host.start()

  assert.deepEqual(recorded(host, 'distill').map((event) => [event.outcome, event.failures]), [['done', []]])

  const designing = scripted({}, (it) => [agent()(it), agent()(it), agent({ work: ({ git }) => git.change(...DESIGN_DOCUMENTS) })(it), unavailable])
  await designing.start()
  assert.deepEqual(recorded(designing, 'distill')[0].failures, DESIGN_DOCUMENTS.map((path) => `out of write scope: ${path}`))
})

test('a component whose paths list no folder (no tests folder yet) is written anywhere in its root', async () => {
  const host = scripted({ components: [{ ...API, paths: { src: [], tests: [] } }] }, (it) => [
    agent()(it), agent()(it), agent({ work: ({ git }) => git.change('Checkout.Tests/PayTests.cs') })(it), unavailable,
  ])

  await host.start()

  assert.deepEqual(recorded(host, 'distill').map((event) => [event.outcome, event.failures]), [['done', []]])
})
