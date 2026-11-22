import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryGit, InMemoryTracking, ScriptedMachine } from '../support/in-memory-host.mjs'
import { API, SLUG, TRACKING, agent, green, scripted, tddCycle } from '../support/pipeline-host.mjs'
import { waitingOnEnvironment } from '../support/decisions.mjs'
import { ownerOfCause } from '../../../../plugins/skraft-framework/engine/domain/pipeline/incidents.mjs'

const unavailable = () => ({ ok: false, unavailable: true, text: '' })
const upToDeliver = (it) => [agent()(it), agent()(it), agent()(it)]
const asked = (host) => host.events().filter(({ type }) => type === 'question.asked').at(-1)
const dispatched = (host, step) => host.agentRunner.dispatches.filter(({ label }) => label.includes(` · ${step} `)).length
/** A front end sharing the root of api: what changes there touches both. */
const LINTED = { name: 'web', root: '.', stack: 'react', bdd: false, mocking: { strategy: 'inprocess' }, paths: { src: ['web/src'], tests: ['web/src'] }, commands: { lint: 'npx eslint .' } }

test('a command the config cannot start is owned by config; an unclassified cause has no owner', () => {
  assert.deepEqual([ownerOfCause('config'), ownerOfCause('container-runtime-v3')], ['config', 'unknown'])
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
