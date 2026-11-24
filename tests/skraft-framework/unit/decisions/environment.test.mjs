import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryGit, ScriptedMachine } from '../support/in-memory-host.mjs'
import { API, SETTLED_PUBLISH, SLUG, TRACKING, agent, green, scenarioReview, scripted } from '../support/pipeline-host.mjs'
import { ADR_1, adrText, architect, environmentQuestion, eventsOf, waitingOnEnvironment } from '../support/decisions.mjs'

const BUILD = `api/build: command not found: dotnet; install it or change the command in skraft-config.json (evidence: ${TRACKING}/gates/api/build-1.log)`
const QUESTION = environmentQuestion('gates', BUILD, { owner: 'config', log: `${TRACKING}/gates/api/build-1.log` })
const toTheGates = (it) => [agent()(it), agent()(it), agent()(it), agent({ work: green() })(it)]
const noDotnet = () => new ScriptedMachine({ installed: ['git'] })
test('an agent step the machine cannot check asks the same question, and RETRY checks it again without running the agent', async () => {
  const host = scripted({}, (it) => [
    agent()(it), agent()(it), agent({ work: ({ git }) => { git.commit('test(checkout): pays', ['tests/PayTests.cs']); git.commits = async () => null } })(it), () => ({ ok: false, unavailable: true, text: '' }),
  ])

  const outcome = await host.start()

  assert.deepEqual({ status: outcome.status, code: outcome.code }, { status: 'waiting', code: 'environment' })
  assert.match((await host.view()).question.text, /^distill cannot run on this machine: Git cannot list what changed in \. since root-0/)
  delete host.git.commits
  assert.equal((await host.decide({ answer: 'RETRY' })).ok, true)
  assert.equal((await host.run()).code, 'agent-unavailable')
  assert.deepEqual(host.agentRunner.dispatches.map((dispatch) => dispatch.agent), ['solution-researcher', 'solution-architect', 'acceptance-designer', 'software-engineer'])
  assert.deepEqual(eventsOf(host, 'step.recorded').filter((event) => event.step === 'distill').map((event) => [event.group, event.outcome]), [[undefined, 'done']])
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

  const initial = await host.start()
  assert.ok(initial.reason.startsWith(waitingOnEnvironment('environment', 'git commit failed: index.lock exists', 2, { log: `${TRACKING}/logs/commit-environment.log` }).split('\nThe run so far')[0]))
  assert.match(initial.reason, /Incidents: environment signature .*1 occurrences; log .*commit-environment\.log\./)
  assert.deepEqual(host.human.questions.map(({ key, kind }) => [key, kind]), [['environment-1', 'adr-ratification'], ['environment-2', 'environment']])
  git.commitFails = null
  assert.equal((await host.decide({ answer: 'RETRY' })).ok, true)

  assert.equal((await host.run()).status, 'done')
  assert.deepEqual(git.engineCommits.map((commit) => commit.message), ['docs(adr): ratify ADR-001'])
  assert.deepEqual(host.human.questions.length, 2)
})
