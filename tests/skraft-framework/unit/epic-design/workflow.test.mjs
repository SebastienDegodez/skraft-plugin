import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { agent, scripted, SLUG } from '../support/pipeline-host.mjs'
import { ADR_1, adrText, architect, eventsOf } from '../support/decisions.mjs'

const EPIC_DESIGN_WORKFLOW = readFileSync(new URL('../../../../plugins/skraft-framework/workflows/epic-design.skraft.dot', import.meta.url), 'utf8')

const CONSENTED = { publish: { pullRequest: true, questionVersions: { pullRequest: 2 } } }
const STORY = { story: { issue: 42, title: 'Pay by card' } }

/** A nominal epic-design run: researcher writes its result, architect writes ADR-1, a human
 * ratifies, pr-writer writes the prose. */
const nominalArchitecture = (host) => [
  agent()(host),
  architect({ [ADR_1]: adrText() }, 'Refs: #42')(host),
]

test('epic-design opens a PR for the architecture brief: research → design → review → ADR ratification → pr-writer → publish ends done', async () => {
  const host = scripted({ workflow: EPIC_DESIGN_WORKFLOW, config: CONSENTED, answers: [{ answer: 'RATIFIED' }] }, nominalArchitecture)

  const outcome = await host.start(STORY)

  assert.equal(outcome.status, 'done', outcome.reason)
  const steps = eventsOf(host, 'step.recorded').map(({ step }) => step)
  assert.deepEqual(steps.filter((s) => ['research', 'design', 'adr', 'pr_writer', 'publish'].includes(s)), ['research', 'design', 'adr', 'pr_writer', 'publish'])
  assert.equal(eventsOf(host, 'question.answered').at(0).answer, 'RATIFIED')
})

test('epic-design pauses on the ADR ratification question, nothing records an answer on its own', async () => {
  const host = scripted({ workflow: EPIC_DESIGN_WORKFLOW, config: CONSENTED }, nominalArchitecture)

  const outcome = await host.start(STORY)

  assert.equal(outcome.status, 'waiting')
  assert.equal(outcome.code, 'adr-ratification')
  assert.deepEqual(eventsOf(host, 'question.answered'), [])
})
