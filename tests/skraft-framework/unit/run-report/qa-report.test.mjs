import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, API, finding, lenses, nominal, REFS_42, says, scripted, SLUG } from '../support/pipeline-host.mjs'
import { InMemoryGit, ScriptedMachine } from '../support/in-memory-host.mjs'
import { ALL_KILLED, strykerReport } from '../support/mutation-reports.mjs'

/** A front end in a repository of its own, which the story does not change. */
const WEB = Object.freeze({ name: 'web', root: '../web', stack: 'react', mocking: { strategy: 'inprocess' }, paths: { src: ['src'], tests: ['src'] }, commands: { lint: 'npx eslint .', mutation: 'npx stryker run' } })
const twoRepositories = () => new InMemoryGit({ repositories: { '.': { mergeBases: { main: 'root-0' } }, '../web': { mergeBases: { main: 'up-web-0' } } } })

const QA = 'qa-report.md'
const REPORT = 'StrykerOutput/reports/mutation-report.json'
const TEST_PLAN = 'details/2026-10-11/test-plan-checkout.md'

/** The sha of the red commit whose subject is given, short. @param {ReturnType<typeof scripted>} host @param {string} subject */
const shaOf = (host, subject) => host.events().filter((event) => event.type === 'commits.checked').flatMap((event) => event.commits).find((commit) => commit.subject === subject).sha.slice(0, 7)

test('after each step the tracking folder holds qa-report.md: the test plan, each component\'s last gates with its mutation score, the TDD red commits, the acceptance test of DISTILL first, and each review\'s verdict with its findings', async () => {
  const host = scripted({ components: [API, WEB], git: twoRepositories() }, (it) => nominal(it, REFS_42))
  host.agentRunner.review = lenses({ consistency: [says('consistency', 'pass', [finding('F1', 'low', 'the context map names no owner')])] })
  const seen = []
  host.machine.meanwhile['. $ dotnet build'] = async () => { seen.push(await host.tracking.read(SLUG, QA)) }

  const outcome = await host.start({ story: { issue: 42, title: "Pay by card" } })
  assert.equal(outcome.status, "done", outcome.reason)

  assert.ok(seen[0].includes('\n## Gates\n\nNo gate has run yet.\n'), seen[0])
  const acceptance = 'test(checkout): acceptance of the card payment'
  const red = 'test(checkout): Checkout pays by card'
  assert.equal(await host.tracking.read(SLUG, QA), [
    '<!-- markdownlint-disable-file -->',
    `# QA report — ${SLUG}`,
    '',
    'Status: `done: PUBLISH closed`',
    '',
    '## Test plan',
    '',
    `[${TEST_PLAN}](${TEST_PLAN}), written in DISTILL.`,
    '',
    '## Gates',
    '',
    '### api',
    '',
    '| Gate | Status | Time | Evidence |',
    '| --- | --- | ---: | --- |',
    '| build | pass | 0 s | [gates/api/build-1.log](gates/api/build-1.log) |',
    '| test | pass | 0 s | [gates/api/test-1.log](gates/api/test-1.log) |',
    '| mutation | pass | 0 s | [gates/api/mutation-1.log](gates/api/mutation-1.log) |',
    '',
    'Mutation score: boundary 100 % (bar 80 %, 2 mutants).',
    '',
    'No surviving mutant.',
    '',
    '### web',
    '',
    '| Gate | Status | Time | Evidence |',
    '| --- | --- | ---: | --- |',
    '| lint | pass | 0 s | [gates/web/lint-1.log](gates/web/lint-1.log) |',
    '| mutation | pass | 0 s | [gates/web/mutation-1.log](gates/web/mutation-1.log) |',
    '',
    'Mutation score: no mutant in the files the story changed.',
    '',
    '## TDD red commits',
    '',
    '| Commit | Subject | Replay exit code |',
    '| --- | --- | ---: |',
    `| \`${shaOf(host, acceptance)}\` | \`${acceptance}\` | 1 |`,
    `| \`${shaOf(host, red)}\` | \`${red}\` | 1 |`,
    '',
    '## Reviews',
    '',
    '| Review | Pass | Verdict | Findings | Lenses |',
    '| --- | ---: | --- | ---: | --- |',
    '| design_review | 1 | approved | 1 | consistency pass (1), architecture-compliance pass, fitness pass |',
    '| distill_review | 1 | approved | 0 | coverage pass, business-alignment pass, testability pass, boundary-enforcement pass |',
    '| deliver_review | 1 | approved | 0 | test-integrity pass, architecture-boundaries pass, cold-reader pass |',
    '',
  ].join('\n'))
})

test('before DISTILL the QA report has no test plan, no red commit and no gate; a run blocked by an agent frames its reason', async () => {
  const host = scripted({ answers: [{ answer: 'STOP' }] }, (it) => [agent({ result: { status: 'blocked', summary: 'Fixes #12 | ask @team <b>now</b>' } })(it)])

  await host.start()

  assert.equal(await host.tracking.read(SLUG, QA), [
    '<!-- markdownlint-disable-file -->',
    `# QA report — ${SLUG}`,
    '',
    'Status: `blocked: solution-researcher is blocked: Fixes #12 | ask @team <b>now</b>`',
    '',
    '## Test plan',
    '',
    'No test plan yet: DISTILL writes it.',
    '',
    '## Gates',
    '',
    'No gate has run yet.',
    '',
    '## TDD red commits',
    '',
    'No red commit yet.',
    '',
    '## Reviews',
    '',
    'No review has run yet.',
    '',
  ].join('\n'))
})

test('a mutation score names each scope with every survivor, a commit subject with backticks or a pipe stays one code span in its cell, a failed gate shows fail, and a test that kills mutants has no replayed exit code', async () => {
  const report = strykerReport({
    'src/Checkout.Domain/Order.cs': [[10, 'Equality', '!=', 'Survived'], [11, 'Equality', '==', 'Killed']],
    'src/Checkout.Api/Endpoints.cs': [[3, 'String', null, 'Killed'], [4, 'Boolean', 'false', 'Killed'], [5, 'Boolean', 'true', 'Killed'], [6, 'Boolean', 'true', 'Killed'], [9, 'Equality', '!=', 'NoCoverage']],
  })
  const machine = new ScriptedMachine()
  const subject = 'test(checkout): `Order` pays by card | refund'
  const kill = 'test(checkout): kill the mutants of Order'
  const work = ({ git }) => {
    git.commit(subject, ['tests/OrderTests.cs'])
    git.commit('feat(checkout): Order pays by card', ['src/Checkout.Domain/Order.cs', 'src/Checkout.Api/Endpoints.cs'])
  }
  const seen = []
  const killer = (it) => async (dispatch) => {
    seen.push(await it.tracking.read(SLUG, QA))
    await agent({ work: ({ git }) => git.commit(kill, ['tests/OrderKillTests.cs']) })(it)(dispatch)
  }
  const host = scripted({ machine }, (it) => [agent()(it), agent()(it), agent()(it), agent({ work })(it), killer(it)])
  const reports = [report, ALL_KILLED]
  machine.meanwhile['. $ dotnet stryker'] = async () => {
    const next = reports.shift()
    machine.exits['. $ dotnet stryker'] = next === report ? 1 : 0
    if (next !== undefined) await host.workspace.write(REPORT, next)
  }

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.ok(seen[0].includes('\n| mutation | fail | 0 s | [gates/api/mutation-1.log](gates/api/mutation-1.log) |\n'), seen[0])
  assert.ok(seen[0].includes([
    '',
    'Mutation score: core 50 % (bar 100 %, 2 mutants), boundary 80 % (bar 80 %, 5 mutants).',
    '',
    'Surviving mutants:',
    '',
    '- `src/Checkout.Domain/Order.cs:10 Equality (!=) survived`',
    '- `src/Checkout.Api/Endpoints.cs:9 Equality (!=) has no test covering it`',
    '',
  ].join('\n')), seen[0])
  const qa = await host.tracking.read(SLUG, QA)
  assert.ok(qa.includes('\n| mutation | pass | 0 s | [gates/api/mutation-2.log](gates/api/mutation-2.log) |\n'), qa)
  assert.ok(qa.includes([
    `| \`${shaOf(host, subject)}\` | \`\` ${subject.replace('|', '\\|')} \`\` | 1 |`,
    `| \`${shaOf(host, kill)}\` | \`${kill}\` | - |`,
  ].join('\n')), qa)
})

test('a review a lens the host could not start left open is in progress, with what the other lenses said', async () => {
  const host = scripted({}, (it) => [agent()(it), agent()(it)])
  host.agentRunner.review = lenses({ fitness: [{ ok: false, text: '', unavailable: true, error: 'fitness-lens is not installed' }] })

  assert.equal((await host.start()).code, 'agent-unavailable')

  const qa = await host.tracking.read(SLUG, QA)
  assert.ok(qa.includes('\n| design_review | 1 | in progress | 0 | consistency pass, architecture-compliance pass |\n'), qa)
})

test('a component whose gates stopped before mutation shows its gates alone', async () => {
  const machine = new ScriptedMachine({ exits: { '. $ dotnet test': 1 } })
  const deliver = (it) => agent({ work: ({ git }) => { git.commit('test(checkout): pay', ['tests/PayTests.cs']); git.commit('feat(checkout): pay', ['src/Pay.cs']) } })(it)
  const host = scripted({ machine }, (it) => [agent()(it), agent()(it), agent()(it), deliver(it), () => ({ ok: false, unavailable: true, text: '' })])

  await host.start()

  const qa = await host.tracking.read(SLUG, QA)
  assert.ok(qa.includes([
    '| build | pass | 0 s | [gates/api/build-1.log](gates/api/build-1.log) |',
    '| test | fail | 0 s | [gates/api/test-1.log](gates/api/test-1.log) |',
    '',
    '## TDD red commits',
  ].join('\n')), qa)
})

test('a mutation run whose report was not read says so, and shows no score or survivor of an earlier run', async () => {
  const machine = new ScriptedMachine()
  const work = ({ git }) => {
    git.commit('test(checkout): Order pays by card', ['tests/OrderTests.cs'])
    git.commit('feat(checkout): Order pays by card', ['src/Checkout.Domain/Order.cs'])
  }
  const seen = []
  const kill = ({ git, tracking }) => {
    seen.push(tracking.files.get(`${SLUG}/${QA}`))
    git.commit('test(checkout): kill the mutants of Order', ['tests/OrderKillTests.cs'])
  }
  const host = scripted({ machine }, (it) => [agent()(it), agent()(it), agent()(it), agent({ work })(it), agent({ work: kill })(it)])
  const reports = [strykerReport({ 'src/Checkout.Domain/Order.cs': [[10, 'Equality', '!=', 'Survived']] })]
  machine.meanwhile['. $ dotnet stryker'] = async () => {
    machine.exits['. $ dotnet stryker'] = 1
    const next = reports.shift()
    if (next !== undefined) await host.workspace.write(REPORT, next)
  }

  assert.equal((await host.start()).code, 'environment')
  assert.ok(seen[0].includes('\nMutation score: core 0 % (bar 100 %, 1 mutant).\n'), seen[0])

  const qa = await host.tracking.read(SLUG, QA)
  assert.ok(qa.includes([
    '| mutation | fail | 0 s | [gates/api/mutation-2.log](gates/api/mutation-2.log) |',
    '',
    'Mutation score: mutation report not read.',
    '',
    '## TDD red commits',
  ].join('\n')), qa)
})
