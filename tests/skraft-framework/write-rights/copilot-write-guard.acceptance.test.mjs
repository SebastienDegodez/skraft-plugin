// Acceptance — G8 on GitHub Copilot: the extension's onPreToolUse hook, fed by the session
// events the Copilot runtime sends the extension (subagent.started, subagent.selected) and
// the hook inputs it invokes the extension with. The SDK's shapes, simulated in memory:
//   - a sub-agent's tool call reaches the joined session's hook with the sub-agent's own
//     sessionId (invocation.sessionId stays the joined session's);
//   - subagent.started carries agentName / agentDisplayName, the parent tool call id
//     (toolCallId), the instance id (agentId), parentId, and factoryRunId for an agent a
//     workflow (ctx.agent) started.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCopilotCallerRegistry, createCopilotWriteGuard } from '../../../plugins/skraft-framework/src/adapters/api/copilot-workflow/copilot-write-guard.mjs'
import { createSkraftWriteGuard } from '../../../plugins/skraft-framework/src/adapters/api/copilot-workflow/skraft-pipeline-workflow.mjs'

const PLUGIN_ROOT = fileURLToPath(new URL('../../../plugins/skraft-framework/', import.meta.url))
const config = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'skraft-framework.config.json'), 'utf8'))
const ROOT = 'session-root'
const REVIEW = '.copilot-tracking/skraft-plans/checkout/reviews/2026-10-10/deliver-review-1.md'

const started = ({ toolCallId, agentId, agentName, agentDisplayName, parentId, factoryRunId }) => ({
  type: 'subagent.started', id: `e-${toolCallId}`, timestamp: '2026-10-10T10:00:00Z', parentId: null,
  ...(agentId ? { agentId } : {}),
  data: { toolCallId, agentName, agentDisplayName: agentDisplayName ?? agentName, agentDescription: '', ...(parentId ? { parentId } : {}), ...(factoryRunId ? { factoryRunId } : {}) },
})

const hookWorld = ({ events = [], selected, trackingDirOf = () => 'skraft-plans', audit } = {}) => {
  const registry = createCopilotCallerRegistry()
  if (selected !== undefined) registry.selectedAtJoin({ agent: selected })
  for (const event of events) registry.observe(event)
  const audited = []
  const onPreToolUse = createCopilotWriteGuard({ config, registry, trackingDirOf, audit: audit ?? (async (entry) => { audited.push(entry) }) })
  // The SDK's PreToolUseHookInput: toolName as Copilot spells it, toolArgs as it sends them.
  const call = (sessionId, toolName, toolArgs) => onPreToolUse(
    { sessionId, timestamp: new Date(), workingDirectory: '/repo', toolName, toolArgs },
    { sessionId: ROOT },
  )
  return { registry, call, audited }
}

const create = (path) => ['create', JSON.stringify({ path, file_text: 'x' })]
const bash = (command) => ['bash', { command }]

const PIPELINE = [
  started({ toolCallId: 'toolu_se', agentId: 'agent-se', agentName: 'skraft:software-engineer', agentDisplayName: 'Skraft - Software Engineer', factoryRunId: 'run-1' }),
  started({ toolCallId: 'toolu_worker', agentName: 'skraft:contract-testing-worker', parentId: 'toolu_se' }),
  started({ toolCallId: 'toolu_rev', agentId: 'agent-rev', agentName: 'skraft:software-engineer-reviewer', factoryRunId: 'run-1' }),
  started({ toolCallId: 'toolu_lens', agentName: 'skraft:quality-gates-lens', parentId: 'toolu_rev' }),
  started({ toolCallId: 'toolu_gp', agentName: 'general-purpose', parentId: 'agent-rev' }),
  started({ toolCallId: 'toolu_report', agentName: 'general-purpose', factoryRunId: 'run-1' }),
]

test('AC3 (Copilot): the Software Engineer and its worker write src/ and tests/, by either id the runtime uses', async () => {
  const { call, audited } = hookWorld({ events: PIPELINE })
  for (const session of ['toolu_se', 'agent-se', 'toolu_worker']) {
    assert.equal(await call(session, ...create('src/Orders/Order.cs')), undefined, session)
    assert.equal(await call(session, ...bash('echo ok > tests/Orders/OrderTests.cs')), undefined, session)
  }
  assert.deepEqual(audited, [])
})

test('AC1 (Copilot): the orchestrator, selected in the main session, writes neither src/ nor tests/', async () => {
  const { call, registry, audited } = hookWorld({ events: PIPELINE, selected: { id: 'skraft:skraft-orchestrator', name: 'skraft-orchestrator', displayName: 'Skraft - Orchestrator' } })
  const refused = await call(ROOT, ...create('src/Orders/Order.cs'))
  assert.equal(refused.permissionDecision, 'deny')
  assert.match(refused.permissionDecisionReason, /^skraft G8: Skraft - Orchestrator \(orchestrator\) writes nothing/)
  assert.equal((await call(ROOT, ...bash('git checkout -- tests/'))).permissionDecision, 'deny')
  assert.deepEqual(audited.map(({ event, source, decision, code, agentName }) => ({ event, source, decision, code, agentName })),
    Array(2).fill({ event: 'SessionGuardEvaluated', source: 'copilot-extension', decision: 'DENY', code: 'WRITE_RIGHT_DENIED', agentName: 'Skraft - Orchestrator' }))

  registry.observe({ type: 'subagent.deselected', data: {} })
  assert.equal(await call(ROOT, ...create('src/Orders/Order.cs')), undefined, 'the default agent is no pipeline agent')
  registry.observe({ type: 'subagent.selected', data: { agentName: 'skraft-orchestrator', agentDisplayName: 'Skraft - Orchestrator', tools: null } })
  assert.equal((await call(ROOT, ...create('src/Orders/Order.cs'))).permissionDecision, 'deny')
  registry.observe({ type: 'subagent.deselected', agentId: 'agent-se', data: {} })
  assert.equal((await call(ROOT, ...create('src/Orders/Order.cs'))).permissionDecision, 'deny', "a sub-agent's selection is not the main session's")
})

test('AC2 (Copilot): the reviewer writes its review only; its lens and what it spawned write nothing', async () => {
  const { call } = hookWorld({ events: PIPELINE })
  assert.equal(await call('toolu_rev', ...bash(`git diff abc..HEAD > ${REVIEW.replace('deliver-review-1.md', 'diff-s1.patch')}`)), undefined)
  assert.equal(await call('agent-rev', ...create(REVIEW)), undefined)
  assert.equal((await call('toolu_rev', ...create('src/a.ts'))).permissionDecision, 'deny')
  assert.equal((await call('toolu_lens', ...create(REVIEW))).permissionDecision, 'deny')
  const delegated = await call('toolu_gp', ...create('src/a.ts'))
  assert.match(delegated.permissionDecisionReason, /Skraft - Software Engineer Reviewer \(reviewer\)/, 'a general-purpose agent the reviewer spawned writes as the reviewer')
  assert.equal(await call('toolu_report', ...create('src/a.ts')), undefined, 'an agent the workflow started is nobody else\'s')
})

test('AC4 (Copilot): a session nothing announced, or a main session whose selection is unknown, passes unjudged', async () => {
  const { call, audited } = hookWorld({ events: PIPELINE })
  assert.equal(await call('toolu_unknown', ...create('src/a.ts')), undefined)
  assert.equal(await call(ROOT, ...create('src/a.ts')), undefined)
  assert.equal(await call(undefined, ...create('src/a.ts')), undefined)
  assert.deepEqual(audited, [])
})

test('a selection seen after the join is newer than the join\'s own read', async () => {
  const { registry, call } = hookWorld()
  registry.observe({ type: 'subagent.selected', data: { agentName: 'skraft-orchestrator', agentDisplayName: 'Skraft - Orchestrator' } })
  registry.selectedAtJoin({ agent: null })
  assert.equal((await call(ROOT, ...create('src/a.ts'))).permissionDecision, 'deny')
})

test('an agentId the registry already knows is never taken over by a later start', async () => {
  const { call } = hookWorld({ events: [...PIPELINE, started({ toolCallId: 'toolu_x', agentId: 'agent-se', agentName: 'skraft:quality-gates-lens' })] })
  assert.equal(await call('agent-se', ...create('src/a.ts')), undefined, 'agent-se stays the Software Engineer')
  assert.equal((await call('toolu_x', ...create('src/a.ts'))).permissionDecision, 'deny')
})

test('AC5 (Copilot): a toolCalls batch is guarded call by call; one refusal refuses the batch', async () => {
  const registry = createCopilotCallerRegistry()
  for (const event of PIPELINE) registry.observe(event)
  const onPreToolUse = createCopilotWriteGuard({ config, registry, trackingDirOf: () => 'skraft-plans' })
  const batch = (toolCalls) => onPreToolUse({ sessionId: 'toolu_se', workingDirectory: '/repo', toolCalls }, { sessionId: ROOT })
  assert.equal(await batch([{ id: 't1', name: 'create', args: { path: 'src/a.ts', file_text: '' } }, { id: 't2', name: 'edit', args: { path: 'tests/a.test.ts' } }]), undefined)
  const refused = await batch([{ id: 't1', name: 'create', args: { path: 'src/a.ts', file_text: '' } }, { id: 't2', name: 'create', args: { path: REVIEW, file_text: 'APPROVED' } }])
  assert.equal(refused.permissionDecision, 'deny')
  assert.match(refused.permissionDecisionReason, /transmission file of Skraft - Software Engineer Reviewer/)
})

test('a guard that cannot judge refuses a write and lets any other call pass', async () => {
  const { call } = hookWorld({ events: PIPELINE, trackingDirOf: () => { throw new Error('no tracking root') } })
  const refused = await call('toolu_se', ...create('src/a.ts'))
  assert.equal(refused.permissionDecision, 'deny')
  assert.match(refused.permissionDecisionReason, /could not judge this call \(no tracking root\)/)
  assert.equal(await call('toolu_se', 'view', { path: 'src/a.ts' }), undefined)
})

test('a refusal stands when the audit fails', async () => {
  const { call } = hookWorld({ events: PIPELINE, audit: async () => { throw new Error('disk full') } })
  assert.equal((await call('toolu_lens', ...create('notes.md'))).permissionDecision, 'deny')
})

test('the extension composition: the registry follows the joined session, a refusal is audited in the project log', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'skraft-copilot-g8-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const auditLog = join(dir, 'audit.jsonl')
  const listeners = new Map()
  const session = {
    on: (type, handler) => { listeners.set(type, handler); return () => {} },
    rpc: { agent: { getCurrent: async () => ({ agent: { id: 'skraft:skraft-orchestrator', name: 'skraft-orchestrator', displayName: 'Skraft - Orchestrator' } }) } },
  }
  const guard = createSkraftWriteGuard({ pluginRoot: PLUGIN_ROOT, env: { SKRAFT_AUDIT_LOG: auditLog }, cwd: () => dir })
  await guard.attach(session)
  assert.deepEqual([...listeners.keys()], ['subagent.started', 'subagent.selected', 'subagent.deselected'])
  listeners.get('subagent.started')(started({ toolCallId: 'toolu_se', agentName: 'skraft:software-engineer', factoryRunId: 'run-1' }))

  const input = (sessionId, path) => ({ sessionId, workingDirectory: dir, toolName: 'create', toolArgs: { path, file_text: '' } })
  assert.equal(await guard.onPreToolUse(input('toolu_se', 'src/a.ts'), { sessionId: ROOT }), undefined)
  assert.equal((await guard.onPreToolUse(input(ROOT, 'src/a.ts'), { sessionId: ROOT })).permissionDecision, 'deny')
  const lines = readFileSync(auditLog, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  assert.deepEqual(lines.map(({ code, agentName }) => ({ code, agentName })), [{ code: 'WRITE_RIGHT_DENIED', agentName: 'Skraft - Orchestrator' }])
  assert.match(lines[0].evaluatedAt, /^\d{4}-\d{2}-\d{2}T/)

  const unread = createSkraftWriteGuard({ pluginRoot: PLUGIN_ROOT, env: { SKRAFT_AUDIT_LOG: auditLog }, cwd: () => dir })
  await unread.attach({ on: () => () => {}, rpc: { agent: { getCurrent: async () => { throw new Error('not supported') } } } })
  assert.equal(await unread.onPreToolUse(input(ROOT, 'src/a.ts'), { sessionId: ROOT }), undefined, 'an unknown selection is an unidentified caller')
})

test('the registry keeps the latest thousand sub-agents of a long session', async () => {
  const many = Array.from({ length: 1001 }, (_, k) => started({ toolCallId: `toolu_${k}`, agentName: 'skraft:quality-gates-lens' }))
  const { call } = hookWorld({ events: many })
  assert.equal(await call('toolu_0', ...create('notes.md')), undefined, 'the oldest is forgotten: unidentified')
  assert.equal((await call('toolu_1', ...create('notes.md'))).permissionDecision, 'deny')
  assert.equal((await call('toolu_1000', ...create('notes.md'))).permissionDecision, 'deny')
})

test('a spawner the registry never saw ends the chain: the main session is not assumed', async () => {
  const orphan = started({ toolCallId: 'toolu_orphan', agentName: 'general-purpose', parentId: 'toolu_gone' })
  const { call } = hookWorld({ events: [orphan], selected: { name: 'skraft-orchestrator', displayName: 'Skraft - Orchestrator' } })
  assert.equal(await call('toolu_orphan', ...create('src/a.ts')), undefined)
  const child = started({ toolCallId: 'toolu_child', agentName: 'general-purpose' })
  const { call: callChild } = hookWorld({ events: [child], selected: { name: 'skraft-orchestrator', displayName: 'Skraft - Orchestrator' } })
  assert.equal((await callChild('toolu_child', ...create('src/a.ts'))).permissionDecision, 'deny', 'one the main session spawned writes as its agent')
})
