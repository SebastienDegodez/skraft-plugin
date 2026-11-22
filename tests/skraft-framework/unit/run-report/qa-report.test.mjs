import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, API, finding, lenses, nominal, REFS_42, refutes, says, scripted, SLUG } from '../support/pipeline-host.mjs'
import { InMemoryGit, ScriptedMachine } from '../support/in-memory-host.mjs'

/** A front end in a repository of its own, which the story does not change. */
const WEB = Object.freeze({ name: 'web', root: '../web', stack: 'react', bdd: false, mocking: { strategy: 'inprocess' }, paths: { src: ['src'], tests: ['src'] }, commands: { lint: 'npx eslint .', mutation: 'npx stryker run' } })
const twoRepositories = () => new InMemoryGit({ repositories: { '.': { mergeBases: { main: 'root-0' } }, '../web': { mergeBases: { main: 'up-web-0' } } } })

const QA = 'qa-report.md'
const REPORT = 'StrykerOutput/reports/mutation-report.json'
const TEST_PLAN = 'details/2026-10-11/test-plan-checkout.md'

/** The sha of the red commit whose subject is given, short. @param {ReturnType<typeof scripted>} host @param {string} subject */
const shaOf = (host, subject) => host.events().filter((event) => event.type === 'commits.checked').flatMap((event) => event.commits).find((commit) => commit.subject === subject).sha.slice(0, 7)
test('before DISTILL the QA report has no test plan, no scenario, no red commit and no gate; a run blocked by an agent frames its reason', async () => {
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
    '## Scenarios',
    '',
    'No scenario yet: DISTILL lists them.',
    '',
    '## Quality evidence',
    '',
    'No traced run has been checked yet.',
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

test('a red commit of a check the machine could not finish is no TDD red commit of the QA report while the run waits for a human', async () => {
  const host = scripted({}, (it) => [agent()(it), agent()(it), agent({ work: ({ git }) => { git.commit('test(checkout): acceptance', ['tests/AcceptanceTests.cs']); git.changedFiles = async () => null } })(it)])

  const outcome = await host.start()

  assert.deepEqual([outcome.status, outcome.code], ['waiting', 'environment'])
  const qa = await host.tracking.read(SLUG, QA)
  assert.ok(qa.includes('\n## TDD red commits\n\nNo red commit yet.\n'), qa)
})
test('a review a lens the host could not start left open is in progress, with what the other lenses said', async () => {
  const host = scripted({}, (it) => [agent()(it), agent()(it)])
  host.agentRunner.review = lenses({ fitness: [{ ok: false, text: '', unavailable: true, error: 'fitness-lens is not installed' }] })

  assert.equal((await host.start()).code, 'agent-unavailable')

  const qa = await host.tracking.read(SLUG, QA)
  assert.ok(qa.includes('\n| design_review | 1 | in progress | 0 | consistency pass, architecture-compliance pass |\n'), qa)
})
