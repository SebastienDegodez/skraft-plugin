import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryCodeHost } from '../support/in-memory-host.mjs'
import { createRunPipeline } from '../../../../plugins/skraft-framework/engine/application/pipeline/run-pipeline-usecase.mjs'
import { agent, API, scripted, SLUG } from '../support/pipeline-host.mjs'

const WORKFLOW = `digraph settled {
  start    [shape=Mdiamond]
  research [shape=box, agent="solution-researcher", phase="RESEARCH"]
  visuals  [shape=parallelogram, publish="playwright-visuals", when="frontend"]
  publish  [shape=parallelogram, publish="pull-request"]
  exit     [shape=Msquare]
  start -> research -> visuals -> publish -> exit
}`

const WEB = Object.freeze({ ...API, name: 'web', root: 'web', stack: 'react' })

/** A run of a workflow that publishes, on the configuration the files give, with no consent pre-answered. */
const starting = (options = {}) => scripted({ workflow: WORKFLOW, ...options }, (it) => [agent()(it)])

const SETTLED = { pullRequest: false, visuals: false, questionVersions: { pullRequest: 2, visuals: 1 } }

test('a working copy whose publication consents nobody settled starts nothing, and says what to run instead of asking', async () => {
  const host = starting({ config: { publish: {} } })

  const refused = await host.start()

  assert.deepEqual(refused, {
    status: 'refused',
    slug: SLUG,
    phase: null,
    code: 'configuration-incomplete',
    reason: 'skraft is not initialised: run /skraft-init (publish.pullRequest is unanswered)',
  })
  assert.deepEqual(host.agentRunner.dispatches, [])
  assert.deepEqual(host.human.questions, [])
})

test('a front end makes the screenshots consent part of what a run needs, named beside the others; without one it is not asked for', async () => {
  const front = starting({ components: [API, WEB], config: { publish: {} } })
  const one = starting({ components: [API, WEB], config: { publish: { pullRequest: true, questionVersions: { pullRequest: 2 } } } })
  const back = starting({ config: { publish: { pullRequest: true, questionVersions: { pullRequest: 2 } } } })

  assert.equal((await front.start()).reason, 'skraft is not initialised: run /skraft-init (publish.visuals is unanswered, publish.pullRequest is unanswered)')
  assert.equal((await one.start()).reason, 'skraft is not initialised: run /skraft-init (publish.visuals is unanswered)')
  assert.equal((await back.start()).status, 'done')
})

test('an acceptance kept for an earlier text of its question is not settled: a refusal of an earlier text still is', async () => {
  const outdated = starting({ config: { publish: { ...SETTLED, pullRequest: true, questionVersions: { pullRequest: 1, visuals: 1 } } } })
  const declined = starting({ config: { publish: { ...SETTLED, pullRequest: false, questionVersions: { pullRequest: 1, visuals: 1 } } } })

  assert.equal((await outdated.start()).code, 'configuration-incomplete')
  assert.equal((await declined.start()).status, 'done')
})

test('a settled configuration starts the first agent at once, with no question of any kind', async () => {
  const host = starting({ config: { publish: SETTLED } })

  assert.equal((await host.start()).status, 'done')
  assert.deepEqual(host.human.questions, [])
  assert.deepEqual(host.agentRunner.dispatches.length, 1)
})

const NO_GH = 'gh, the GitHub CLI, is not installed'
const ACCEPTED = { ...SETTLED, pullRequest: true }

test('a machine that cannot reach the forge the run would publish on starts nothing, and names what to fix', async () => {
  const host = starting({ config: { publish: ACCEPTED }, codeHost: new InMemoryCodeHost({ unavailable: NO_GH }) })

  const refused = await host.start()

  assert.deepEqual([refused.status, refused.code], ['refused', 'forge-unreachable'])
  assert.match(refused.reason, /gh, the GitHub CLI, is not installed/)
  assert.deepEqual(host.agentRunner.dispatches, [])
  assert.deepEqual(host.human.questions, [])
})

test('a run that publishes nothing asks the forge nothing: a declined consent starts on a machine with no forge at all', async () => {
  const host = starting({ config: { publish: SETTLED }, codeHost: new InMemoryCodeHost({ unavailable: NO_GH }) })

  assert.equal((await host.start()).status, 'done')
  assert.deepEqual(host.human.questions, [])
})

test('the person settles the consents where a driver asks them to confirm the configuration: the run then starts, and is refused when they do not', async () => {
  const settling = starting({ config: { publish: {} } })
  settling.human.answers.push(async () => {
    settling.workspace.files.set('skraft-config.json', JSON.stringify({ components: [API], publish: SETTLED }))
    return { answer: 'START' }
  })
  const leaving = starting({ config: { publish: {} } })
  leaving.human.answers.push(async () => ({ answer: 'START' }))

  assert.equal((await confirmed(settling)).status, 'done')
  assert.deepEqual([(await confirmed(leaving)).status, (await confirmed(leaving)).code], ['refused', 'configuration-incomplete'])
})

/** RunPipeline as a driver that asks the person to confirm the configuration starts it. */
const confirmed = async (host) => {
  assert.equal((await host.init()).ok, true)
  return createRunPipeline(host.deps).run({ slug: SLUG, confirmConfiguration: 'once' })
}
