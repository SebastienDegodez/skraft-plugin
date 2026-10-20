import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createCtxAgentRunner } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/ctx-agent-runner.mjs'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { PLUGIN_ROOT, fillsOutputs, simulatedContext, stops, workingCopy } from './simulated-host.mjs'

const DISPATCH = { agent: 'solution-researcher', source: 'plugin', label: 'skraft checkout · research · attempt 1', prompt: 'brief' }
const REPOSITORY_DISPATCH = { agent: 'acme-security-reviewer', source: 'repository', label: 'skraft checkout · security · attempt 1', prompt: 'brief' }
const answering = (text) => [async () => text]

/** The agent name ctx.agent received for the researcher. */
const dispatchedAs = async (options, pluginRoot = PLUGIN_ROOT, dispatch = DISPATCH) => {
  const { ctx, calls } = simulatedContext({ behaviours: answering('ok'), ...options })
  const answer = await createCtxAgentRunner({ ctx, pluginRoot, agentIds: options.agentIds }).run(dispatch)
  return { answer, agent: calls[0]?.agent }
}

test('an explicit agentIds entry wins over the session list', async () => {
  const { agent } = await dispatchedAs({ agentIds: { 'solution-researcher': 'my:researcher' }, agents: [{ id: 'skraft:solution-researcher' }] })
  assert.equal(agent, 'my:researcher')
})

test('the session list resolves the agent by id, name or display name, or by an id ending in :<file id>', async () => {
  assert.equal((await dispatchedAs({ agents: [{ id: 'a1', name: 'solution-researcher' }] })).agent, 'a1')
  assert.equal((await dispatchedAs({ agents: [{ id: 'a2', displayName: 'solution-researcher' }] })).agent, 'a2')
  assert.equal((await dispatchedAs({ agents: [{ id: 'solution-researcher' }] })).agent, 'solution-researcher')
  assert.equal((await dispatchedAs({ agents: [{ name: 'solution-researcher' }] })).agent, 'solution-researcher')
  assert.equal((await dispatchedAs({ agents: [{ id: 'other:x' }, { id: 'acme:solution-researcher' }] })).agent, 'acme:solution-researcher')
})

test('a session that cannot list its agents gets the plugin-prefixed id', async () => {
  assert.equal((await dispatchedAs({})).agent, 'skraft:solution-researcher')
  assert.equal((await dispatchedAs({ agents: 'fails' })).agent, 'skraft:solution-researcher')
})

test('a session that cannot list its agents calls a repository agent by its bare id; a list or agentIds still decide', async () => {
  assert.equal((await dispatchedAs({}, PLUGIN_ROOT, REPOSITORY_DISPATCH)).agent, 'acme-security-reviewer')
  assert.equal((await dispatchedAs({ agents: 'fails' }, PLUGIN_ROOT, REPOSITORY_DISPATCH)).agent, 'acme-security-reviewer')
  assert.equal((await dispatchedAs({ agents: [{ id: 'repo:acme-security-reviewer' }] }, PLUGIN_ROOT, REPOSITORY_DISPATCH)).agent, 'repo:acme-security-reviewer')
  assert.equal((await dispatchedAs({ agentIds: { 'acme-security-reviewer': 'mine' } }, PLUGIN_ROOT, REPOSITORY_DISPATCH)).agent, 'mine')
})

test('without a readable plugin manifest the file id is used as is', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  assert.equal((await dispatchedAs({}, cwd)).agent, 'solution-researcher')
  await mkdir(join(cwd, 'plugin'), { recursive: true })
  await writeFile(join(cwd, 'plugin', 'plugin.json'), '{"name":"acme"}', 'utf8')
  assert.equal((await dispatchedAs({}, join(cwd, 'plugin'))).agent, 'acme:solution-researcher')
})

test('an agent the session does not list is reported unavailable without starting it', async () => {
  const { answer, agent } = await dispatchedAs({ agents: [{ id: 'skraft:solution-architect' }, { name: 'reviewer' }] })
  assert.equal(agent, undefined)
  assert.deepEqual(answer, {
    ok: false,
    unavailable: true,
    text: '',
    error: 'agent "solution-researcher" is not available in this Copilot session (agents: skraft:solution-architect, reviewer); install or enable the skraft plugin, or pass agentIds',
  })
  assert.match((await dispatchedAs({ agents: [] })).answer.error, /\(agents: none\)/)
})

test('the agent final text is the answer; no text is no answer, and no cost is invented', async () => {
  assert.deepEqual((await dispatchedAs({ behaviours: answering('done') })).answer, { ok: true, text: 'done', model: null })
  for (const text of [undefined, '', '  ']) {
    assert.deepEqual((await dispatchedAs({ behaviours: answering(text) })).answer, { ok: false, text: '', error: 'skraft:solution-researcher answered nothing', model: null })
  }
})

test('a dispatch passes ctx.agent the first Copilot model skraft-config.json names for its family, the answer naming it; without one it runs on the session model', async () => {
  const { ctx, calls } = simulatedContext({ behaviours: answering('ok') })
  const sonnet = { 'claude-code': ['sonnet'], copilot: ['copilot-medium', 'copilot-medium-old'] }
  assert.deepEqual(await createCtxAgentRunner({ ctx, pluginRoot: PLUGIN_ROOT }).run({ ...DISPATCH, model: 'sonnet', models: sonnet }), { ok: true, text: 'ok', model: 'copilot-medium' })
  assert.deepEqual(calls.map(({ label, model }) => [label, model]), [[DISPATCH.label, 'copilot-medium']])

  for (const dispatch of [DISPATCH, { ...DISPATCH, model: 'sonnet' }, { ...DISPATCH, model: 'sonnet', models: { 'claude-code': ['sonnet'] } }]) {
    const plain = simulatedContext({ behaviours: answering('ok') })
    assert.deepEqual(await createCtxAgentRunner({ ctx: plain.ctx, pluginRoot: PLUGIN_ROOT }).run(dispatch), { ok: true, text: 'ok', model: null })
    assert.deepEqual(plain.calls.map(({ label, model }) => [label, model]), [[DISPATCH.label, undefined]])
  }
})

test('the Copilot models of a family are tried in order while Copilot rejects the model, then the session model', async () => {
  const rejected = (name) => async () => { throw new Error(`Model "${name}" is not available. Available models: copilot-medium`) }
  const { ctx, calls } = simulatedContext({ behaviours: [rejected('copilot-medium-next'), async () => 'reviewed'] })
  const runner = createCtxAgentRunner({ ctx, pluginRoot: PLUGIN_ROOT })
  assert.deepEqual((await runner.runMany([{ ...DISPATCH, model: 'sonnet', models: { copilot: ['copilot-medium-next', 'copilot-medium'] } }])).answers, [{ ok: true, text: 'reviewed', model: 'copilot-medium' }])
  assert.deepEqual(calls.map(({ label, model }) => [label, model]), [[DISPATCH.label, 'copilot-medium-next'], [`${DISPATCH.label} · copilot-medium`, 'copilot-medium']])

  const none = simulatedContext({ behaviours: [rejected('copilot-medium'), async () => 'done'] })
  assert.deepEqual(await createCtxAgentRunner({ ctx: none.ctx, pluginRoot: PLUGIN_ROOT }).run({ ...DISPATCH, model: 'sonnet', models: { copilot: ['copilot-medium'] } }), { ok: true, text: 'done', model: null })
  assert.deepEqual(none.calls.map(({ label, model }) => [label, model]), [[DISPATCH.label, 'copilot-medium'], [`${DISPATCH.label} · session model`, undefined]])

  const quota = simulatedContext({ behaviours: [async () => { throw new Error('quota exceeded') }] })
  assert.deepEqual(await createCtxAgentRunner({ ctx: quota.ctx, pluginRoot: PLUGIN_ROOT }).run({ ...DISPATCH, model: 'opus', models: { copilot: ['copilot-large'] } }), { ok: false, text: '', error: 'skraft:solution-researcher failed: quota exceeded', model: 'copilot-large' })
  assert.equal(quota.calls.length, 1)

  const silent = simulatedContext({ behaviours: answering('') })
  assert.equal((await createCtxAgentRunner({ ctx: silent.ctx, pluginRoot: PLUGIN_ROOT }).run({ ...DISPATCH, model: 'haiku', models: { copilot: ['copilot-small'] } })).error, 'skraft:solution-researcher answered nothing')
  assert.equal(silent.calls.length, 1)
})

test('the session is listed once per run', async () => {
  let lists = 0
  const { ctx } = simulatedContext({ behaviours: [async () => 'a', async () => 'b'] })
  ctx.session = { rpc: { agent: { list: async () => { lists += 1; return { agents: [{ id: 'skraft:solution-researcher' }] } } } } }
  const runner = createCtxAgentRunner({ ctx, pluginRoot: PLUGIN_ROOT })
  await runner.run(DISPATCH)
  await runner.run(DISPATCH)
  assert.equal(lists, 1)
})

test('the workflow passes agentIds through, takes each Copilot model from skraft-config.json and never from its arguments, and blocks when the session lacks the agent', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const explicit = simulatedContext({ args: { slug: 'checkout', agentIds: { 'solution-researcher': 'mine' } }, behaviours: [fillsOutputs(), stops()] })
  assert.equal((await runSkraftPipelineWorkflow(explicit.ctx, { cwd, pluginRoot: PLUGIN_ROOT })).code, 'agent-blocked')
  assert.deepEqual(explicit.calls.map((call) => call.agent), ['mine', 'skraft:solution-architect'])
  assert.deepEqual(explicit.calls.map((call) => call.model), [undefined, undefined])

  await writeFile(join(cwd, 'skraft-config.json'), JSON.stringify({ models: { sonnet: { copilot: 'copilot-medium' }, opus: { 'claude-code': 'opus', copilot: ['copilot-large-next', 'copilot-large'] } } }), 'utf8')
  const mapped = simulatedContext({ args: { slug: 'payments', models: { sonnet: 'model-from-args', opus: 'model-from-args' } }, behaviours: [fillsOutputs(), stops()] })
  await runSkraftPipelineWorkflow(mapped.ctx, { cwd, pluginRoot: PLUGIN_ROOT })
  assert.deepEqual(mapped.calls.map((call) => call.model), ['copilot-medium', 'copilot-large-next'])

  const missing = simulatedContext({ args: { slug: 'billing' }, agents: [] })
  const outcome = await runSkraftPipelineWorkflow(missing.ctx, { cwd, pluginRoot: PLUGIN_ROOT })
  assert.equal(outcome.status, 'blocked')
  assert.equal(outcome.code, 'agent-unavailable')
  assert.equal(missing.calls.length, 0)
})

test('an agent call the host rejects stops the run as agent-failed instead of throwing', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const rejects = async () => { throw new Error('unknown agent skraft:solution-researcher') }
  const { ctx, calls } = simulatedContext({ args: { slug: 'checkout' }, behaviours: [rejects] })

  const outcome = await runSkraftPipelineWorkflow(ctx, { cwd, pluginRoot: PLUGIN_ROOT })

  assert.equal(outcome.code, 'agent-failed')
  assert.equal(outcome.reason, 'solution-researcher stopped without finishing: skraft:solution-researcher failed: unknown agent skraft:solution-researcher')
  assert.deepEqual(calls.map(({ model }) => model), [undefined])
})
