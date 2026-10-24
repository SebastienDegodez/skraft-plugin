import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createCtxAgentRunner, refusalOf } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/ctx-agent-runner.mjs'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { PLUGIN_ROOT, copilotHost, fillsOutputs, simulatedContext, stops, workingCopy, ANSWERED } from './simulated-host.mjs'

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

// Copilot CLI 1.0.101: no refusal text is measured yet (docs/v2/host-verification.md); these are
// assumed, and the probe's copilot-model-refusal and copilot-effort-refusal checks record the real ones.
const MODEL_REFUSALS = ['Model "gpt-9" is not available. Available models: gpt-5.5, claude-sonnet-5.5', "model 'gpt-9' not found", 'Unknown model: gpt-9', 'Model gpt-9 is not supported for this account']
const EFFORT_REFUSALS = ['Reasoning effort "max" is not supported for model "gpt-5.5"', 'Invalid reasoningEffort: max. Must be one of low, medium, high, xhigh', 'Model gpt-5.5 does not support reasoning effort max', 'unsupported reasoning_effort for gpt-5.5']
const OTHER_FAILURES = ['quota exceeded', 'rate limit exceeded, retry after 30s', 'the model timed out', 'unknown agent skraft:solution-researcher', 'best effort delivery failed: connection reset']

test('a refusal is told apart: the model, the reasoning effort, or anything else', () => {
  assert.deepEqual([...MODEL_REFUSALS, ...EFFORT_REFUSALS, ...OTHER_FAILURES].map(refusalOf), [...MODEL_REFUSALS.map(() => 'model'), ...EFFORT_REFUSALS.map(() => 'effort'), ...OTHER_FAILURES.map(() => null)])
})

const rejects = (message) => async () => { throw new Error(message) }

test('a dispatch passes its Copilot effort as reasoningEffort, on each model and on the session; an effort Copilot refuses is asked again on the same model without it', async () => {
  const { ctx, calls } = simulatedContext({ behaviours: [rejects(MODEL_REFUSALS[0]), rejects(EFFORT_REFUSALS[0]), async () => 'reviewed'] })
  const dispatch = { ...DISPATCH, model: 'frontier', models: { copilot: ['gpt-9', 'gpt-5.5'] }, effort: { 'claude-code': 'low', copilot: 'max' } }
  assert.deepEqual(await createCtxAgentRunner({ ctx, pluginRoot: PLUGIN_ROOT }).run(dispatch), { ok: true, text: 'reviewed', model: 'gpt-5.5' })
  assert.deepEqual(calls.map(({ label, model, reasoningEffort }) => [label, model, reasoningEffort]), [
    [DISPATCH.label, 'gpt-9', 'max'], [`${DISPATCH.label} · gpt-5.5`, 'gpt-5.5', 'max'], [`${DISPATCH.label} · gpt-5.5 · without effort`, 'gpt-5.5', undefined],
  ])

  const session = simulatedContext({ behaviours: [rejects(EFFORT_REFUSALS[1]), rejects(MODEL_REFUSALS[1]), async () => 'done'] })
  assert.deepEqual(await createCtxAgentRunner({ ctx: session.ctx, pluginRoot: PLUGIN_ROOT }).run({ ...dispatch, models: { copilot: ['gpt-9'] } }), { ok: true, text: 'done', model: null })
  assert.deepEqual(session.calls.map(({ label, model, reasoningEffort }) => [label, model, reasoningEffort]), [
    [DISPATCH.label, 'gpt-9', 'max'], [`${DISPATCH.label} · without effort`, 'gpt-9', undefined], [`${DISPATCH.label} · session model`, undefined, 'max'],
  ])

  const effortOnly = simulatedContext({ behaviours: [rejects(EFFORT_REFUSALS[2]), async () => 'done'] })
  assert.deepEqual(await createCtxAgentRunner({ ctx: effortOnly.ctx, pluginRoot: PLUGIN_ROOT }).run({ ...DISPATCH, model: 'frontier', effort: { copilot: 'xhigh' } }), { ok: true, text: 'done', model: null })
  assert.deepEqual(effortOnly.calls.map(({ label, model, reasoningEffort }) => [label, model, reasoningEffort]), [[DISPATCH.label, undefined, 'xhigh'], [`${DISPATCH.label} · without effort`, undefined, undefined]])
})

test('without an effort for Copilot none is passed, and a failure that names an effort is not asked again', async () => {
  const options = []
  const ctx = { agent: async (_prompt, given) => { options.push(given); throw new Error(EFFORT_REFUSALS[0]) } }
  const answer = await createCtxAgentRunner({ ctx, pluginRoot: PLUGIN_ROOT, agentIds: { 'solution-researcher': 'skraft:solution-researcher' } }).run({ ...DISPATCH, model: 'frontier', models: { copilot: ['gpt-5.5'] }, effort: { 'claude-code': 'max' } })
  assert.deepEqual(answer, { ok: false, text: '', error: `skraft:solution-researcher failed: ${EFFORT_REFUSALS[0]}`, model: 'gpt-5.5' })
  assert.deepEqual(options, [{ label: DISPATCH.label, agent: 'skraft:solution-researcher', model: 'gpt-5.5' }])

  const failing = simulatedContext({ behaviours: [rejects(OTHER_FAILURES[2])] })
  assert.equal((await createCtxAgentRunner({ ctx: failing.ctx, pluginRoot: PLUGIN_ROOT }).run({ ...DISPATCH, model: 'frontier', models: { copilot: ['gpt-5.5', 'gpt-6.0'] }, effort: { copilot: 'high' } })).model, 'gpt-5.5')
  assert.equal(failing.calls.length, 1)
})

test('the workflow reads the developer\'s ~/.skraft/config.json from the home folder it is given, never from the one of the machine', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  const host = copilotHost(cwd)
  t.after(async () => { await cleanup(); await rm(host.home, { recursive: true, force: true }) })
  await mkdir(join(host.home, '.skraft'), { recursive: true })
  await writeFile(join(host.home, '.skraft', 'config.json'), JSON.stringify({ models: { standard: { copilot: { model: 'gpt-home', effort: 'low' } } } }), 'utf8')

  const { ctx, calls } = simulatedContext({ args: { slug: 'payments' }, behaviours: [fillsOutputs(), stops()] })
  await runSkraftPipelineWorkflow(ctx, host)

  assert.deepEqual(calls.map(({ model, reasoningEffort }) => [model, reasoningEffort]), [['gpt-home', 'low'], [undefined, undefined]])
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
  assert.equal((await runSkraftPipelineWorkflow(explicit.ctx, copilotHost(cwd))).code, 'agent-blocked')
  assert.deepEqual(explicit.calls.map((call) => call.agent), ['mine', 'skraft:solution-architect'])
  assert.deepEqual(explicit.calls.map((call) => call.model), [undefined, undefined])

  await writeFile(join(cwd, 'skraft-config.json'), JSON.stringify({ ...ANSWERED, models: { standard: { copilot: { model: 'copilot-medium' } }, frontier: { 'claude-code': { model: 'opus' }, copilot: { model: ['copilot-large-next', 'copilot-large'] } } } }), 'utf8')
  const mapped = simulatedContext({ args: { slug: 'payments', models: { sonnet: 'model-from-args', opus: 'model-from-args' } }, behaviours: [fillsOutputs(), stops()] })
  await runSkraftPipelineWorkflow(mapped.ctx, copilotHost(cwd))
  assert.deepEqual(mapped.calls.map((call) => call.model), ['copilot-medium', 'copilot-large-next'])

  const missing = simulatedContext({ args: { slug: 'billing' }, agents: [] })
  const outcome = await runSkraftPipelineWorkflow(missing.ctx, copilotHost(cwd))
  assert.equal(outcome.status, 'blocked')
  assert.equal(outcome.code, 'agent-unavailable')
  assert.equal(missing.calls.length, 0)
})

test('the Copilot workflow finds a repository agent in .github/agents/, never in .claude/agents/', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const workflow = (await readFile(join(PLUGIN_ROOT, 'workflows', 'skraft.dot'), 'utf8'))
    .replace('  exit     [shape=Msquare]', '  exit     [shape=Msquare]\n  security [shape=box, agent="acme-security-reviewer"]')
    .replace('adr -> distill   [label="RATIFIED"]', 'adr -> security  [label="RATIFIED"]\n  security -> distill')
  await writeFile(join(cwd, 'skraft-workflow.dot'), workflow, 'utf8')
  await writeFile(join(cwd, 'skraft-config.json'), JSON.stringify({ ...ANSWERED, workflow: 'skraft-workflow.dot' }), 'utf8')
  await mkdir(join(cwd, '.claude', 'agents'), { recursive: true })
  await writeFile(join(cwd, '.claude', 'agents', 'acme-security-reviewer.md'), '---\nname: acme-security-reviewer\n---\nReview.\n', 'utf8')

  const { ctx, calls } = simulatedContext({ args: { slug: 'checkout' } })
  const outcome = await runSkraftPipelineWorkflow(ctx, copilotHost(cwd))

  assert.deepEqual([outcome.code, calls.length], ['workflow-invalid', 0])
  assert.match(outcome.reason, /node security: agent acme-security-reviewer not found/)
})

test('an agent call the host rejects stops the run as agent-failed instead of throwing', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const rejects = async () => { throw new Error('unknown agent skraft:solution-researcher') }
  const { ctx, calls } = simulatedContext({ args: { slug: 'checkout' }, behaviours: [rejects] })

  const outcome = await runSkraftPipelineWorkflow(ctx, copilotHost(cwd))

  assert.equal(outcome.code, 'agent-failed')
  assert.equal(outcome.reason, 'solution-researcher stopped without finishing: skraft:solution-researcher failed: unknown agent skraft:solution-researcher')
  assert.deepEqual(calls.map(({ model }) => model), [undefined])
})
