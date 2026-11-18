import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseDot } from '../../../../plugins/skraft-framework/engine/domain/workflow/dot.mjs'
import { agent, scripted, SLUG } from '../support/pipeline-host.mjs'
import { eventsOf } from '../support/decisions.mjs'
import { green } from '../support/pipeline-host.mjs'

const EPIC_STORY_PATH = new URL('../../../../plugins/skraft-framework/workflows/epic-story.skraft.dot', import.meta.url)
const EPIC_STORY_WORKFLOW = readFileSync(EPIC_STORY_PATH, 'utf8')

const CONSENTED = { publish: { pullRequest: true, questionVersions: { pullRequest: 2 } } }
const STORY = { story: { issue: 42, title: 'Pay by card' } }

/** The acceptance designer and the software engineer: one green scenario commit, as pipeline does. */
const scenarioDelivery = (host) => [
  agent({ work: ({ git }) => git.commit('test(checkout): acceptance of the card payment', ['tests/Acceptance/CheckoutAcceptanceTests.cs'], 'Refs: #42') })(host),
  agent({ work: green(SLUG, 'Checkout', 'Refs: #42') })(host),
]

test('epic-story is a well-formed DOT workflow with the inputs architecture and story declared required', () => {
  const parsed = parseDot(EPIC_STORY_WORKFLOW)
  assert.equal(parsed.ok, true, parsed.reason)
  const graphAttrs = parsed.graph.attributes
  assert.equal(graphAttrs.input_architecture, 'required')
  assert.equal(graphAttrs.input_story, 'required')
})

test('epic-story holds the delivery tail of the pipeline, starting at DISTILL: distill, scenario_review, deliver, gates, deliver_review, visuals, pr_writer, publish', () => {
  const parsed = parseDot(EPIC_STORY_WORKFLOW)
  assert.equal(parsed.ok, true)
  const nodeNames = parsed.graph.nodes.map((node) => node.id).sort()
  for (const expected of ['distill', 'distill_review', 'scenario_review', 'deliver', 'gates', 'deliver_review', 'visuals', 'pr_writer', 'publish']) {
    assert.ok(nodeNames.includes(expected), `missing node ${expected} in ${nodeNames.join(', ')}`)
  }
})

test('epic-story runs the delivery tail end to end on its own when scripted agents hold the architecture brief for the story', async () => {
  const host = scripted({ workflow: EPIC_STORY_WORKFLOW, config: CONSENTED, answers: [] }, scenarioDelivery)

  const outcome = await host.start(STORY)

  assert.ok(['done', 'waiting'].includes(outcome.status), `unexpected outcome: ${JSON.stringify(outcome)}`)
  const steps = eventsOf(host, 'step.recorded').map(({ step }) => step)
  assert.ok(steps.includes('distill'), `distill not run: ${steps.join(', ')}`)
})
