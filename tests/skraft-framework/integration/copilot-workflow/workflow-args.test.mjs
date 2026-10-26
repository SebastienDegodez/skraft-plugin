import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { copilotHost, fillsOutputs, simulatedContext, stops, workingCopy } from './simulated-host.mjs'
import { SENTINEL } from './simulated-sdk.mjs'

const INVALID_ARGS = 'the workflow takes only slug, issue, title, base, fromArtifacts and agentIds; nothing was started'
const INVALID_AGENT_IDS = 'agentIds may only choose, for an agent file id, one of the session agents listed for that same agent; nothing was started'
const SESSION_AGENTS = [{ id: 'acme:solution-researcher' }, { id: 'skraft:solution-researcher' }, { id: 'skraft:solution-architect' }, { id: 'repo:helpful-agent' }]

/** Runs the workflow with these arguments in a fresh working copy; what it returned, logged, started and wrote. agents null: a session with no agent list. */
const runWith = async (t, args, agents = SESSION_AGENTS) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const { ctx, calls, logs } = simulatedContext({ args, agents: agents ?? undefined, behaviours: [fillsOutputs(), stops()] })
  const outcome = await runSkraftPipelineWorkflow(ctx, copilotHost(cwd))
  return { outcome, calls, logs, tracked: existsSync(join(cwd, '.copilot-tracking')) }
}

const refusal = (code, reason) => ({ status: 'refused', slug: null, phase: null, code, reason })

test('an argument the workflow does not declare is refused before anything starts, without echoing it', async (t) => {
  for (const args of [{ slug: 'checkout', [SENTINEL]: true }, { slug: 'checkout', models: { standard: SENTINEL } }, [SENTINEL], [], SENTINEL, 5]) {
    const { outcome, calls, logs, tracked } = await runWith(t, args)

    assert.deepEqual(outcome, refusal('invalid-args', INVALID_ARGS))
    assert.deepEqual([calls, tracked], [[], false])
    assert.equal(logs.join('\n').includes(SENTINEL), false)
  }
})

test('agentIds that pick one of the session agents listed for the same agent, by id or by name, choose it', async (t) => {
  const plain = await runWith(t, { slug: 'checkout' })
  const chosen = await runWith(t, { slug: 'checkout', agentIds: { 'solution-researcher': 'skraft:solution-researcher', 'solution-architect': 'skraft:solution-architect' } })
  const named = await runWith(t, { slug: 'checkout', agentIds: { 'solution-researcher': 'solution-researcher' } }, [{ id: 'acme:solution-researcher' }, { name: 'solution-researcher' }, { id: 'skraft:solution-architect' }])

  assert.deepEqual(plain.calls.map((call) => call.agent), ['acme:solution-researcher', 'skraft:solution-architect'])
  assert.deepEqual(chosen.calls.map((call) => call.agent), ['skraft:solution-researcher', 'skraft:solution-architect'])
  assert.deepEqual(named.calls.map((call) => call.agent), ['solution-researcher', 'skraft:solution-architect'])
  assert.equal(chosen.outcome.code, 'agent-blocked')
})

test('a run with no arguments at all resumes the active pipeline', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const { ctx } = simulatedContext()
  delete ctx.args

  const outcome = await runSkraftPipelineWorkflow(ctx, copilotHost(cwd))

  assert.deepEqual([outcome.status, outcome.code], ['refused', 'no-active-pipeline'])
})

test('agentIds naming an agent the session does not list, another agent, or anything but a name are refused before anything starts', async (t) => {
  const cases = [
    [{ 'solution-researcher': `my:${SENTINEL}` }, SESSION_AGENTS],
    [{ 'solution-researcher': 'repo:helpful-agent' }, SESSION_AGENTS],
    [{ 'solution-researcher': 'skraft:solution-researcher' }, 'fails'],
    [{ 'solution-researcher': 'skraft:solution-researcher' }, null],
    [{ 'solution-researcher': 7 }, SESSION_AGENTS],
    [{ 'solution-researcher': 'skraft:solution-researcher', 'solution-architect': 'repo:helpful-agent' }, SESSION_AGENTS],
    [['skraft:solution-researcher'], SESSION_AGENTS],
    [[], SESSION_AGENTS],
    [SENTINEL, SESSION_AGENTS],
    [7, SESSION_AGENTS],
  ]
  for (const [agentIds, agents] of cases) {
    const { outcome, calls, logs, tracked } = await runWith(t, { slug: 'checkout', agentIds }, agents)

    assert.deepEqual(outcome, refusal('invalid-agent-ids', INVALID_AGENT_IDS), JSON.stringify(agentIds))
    assert.deepEqual([calls, tracked], [[], false])
    assert.equal(logs.join('\n').includes(SENTINEL), false)
  }
})

test('empty agentIds need no session list', async (t) => {
  const { calls } = await runWith(t, { slug: 'checkout', agentIds: {} }, null)

  assert.deepEqual(calls.map((call) => call.agent), ['skraft:solution-researcher', 'skraft:solution-architect'])
})
