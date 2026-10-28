import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, scripted, SLUG, TRACKING } from '../support/pipeline-host.mjs'
import { eventsOf } from '../support/decisions.mjs'

const NO_PROVIDER = 'The story names no payment provider.'
const blockedAgent = (it) => agent({ result: { status: 'blocked', summary: NO_PROVIDER } })(it)
const RESEARCH_BLOCKED = `research is blocked: solution-researcher says it cannot go on; its reason is in ${TRACKING}/results/research-1-1.json. An instruction runs research again on a new pass with it; STOP ends the run.`

test('an agent that says it is blocked asks a human what to do instead of ending the run', async () => {
  const host = scripted({}, (it) => [blockedAgent(it)])

  const outcome = await host.start()

  assert.deepEqual(outcome, { status: 'waiting', slug: SLUG, phase: 'RESEARCH', code: 'blocked', reason: `${RESEARCH_BLOCKED} Answer with skraft decide research-1 "<instruction>"|STOP.` })
  assert.deepEqual(host.human.questions, [{ key: 'research-1', kind: 'blocked', text: RESEARCH_BLOCKED, options: ['STOP'], refusals: [], header: 'Blocked' }])
  const [{ key, kind, step, visit, subjects }] = eventsOf(host, 'question.asked')
  assert.deepEqual({ key, kind, step, visit, subjects }, { key: 'research-1', kind: 'blocked', step: 'research', visit: 1, subjects: [] })
  assert.equal(host.types().at(-1), 'question.asked')
  assert.equal((await host.view()).status, 'waiting')
})
