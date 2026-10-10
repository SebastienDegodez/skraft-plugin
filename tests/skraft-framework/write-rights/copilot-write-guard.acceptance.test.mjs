// Acceptance — G8 on GitHub Copilot: the extension's onPreToolUse hook, fed by the session
// events the Copilot runtime sends the extension (subagent.started, subagent.selected) and
// the hook inputs it invokes the extension with. The SDK's shapes, simulated in memory:
//   - a sub-agent's tool call reaches the joined session's hook with the sub-agent's own
//     sessionId (invocation.sessionId stays the joined session's);
//   - subagent.started carries agentName / agentDisplayName, the tool call that started it
//     (toolCallId), parentId on runtimes that send it (not SDK 1.0.9), factoryRunId for an
//     agent a workflow (ctx.agent) started; the envelope's agentId names the sub-agent
//     that emitted the event.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCopilotCallerRegistry, createCopilotWriteGuard } from '../../../plugins/skraft-framework/src/adapters/api/copilot-workflow/copilot-write-guard.mjs'
import { createSkraftWriteGuard } from '../../../plugins/skraft-framework/src/adapters/api/copilot-workflow/skraft-pipeline-workflow.mjs'
import { createDispatchProvenanceService } from '../../../plugins/skraft-framework/src/application/dispatch-provenance-service.mjs'

const PLUGIN_ROOT = fileURLToPath(new URL('../../../plugins/skraft-framework/', import.meta.url))
const config = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'skraft-framework.config.json'), 'utf8'))
const ROOT = 'session-root'
const REVIEW = '.copilot-tracking/skraft-plans/checkout/reviews/2026-10-10/deliver-review-1.md'

const started = ({ toolCallId, agentId, agentName, agentDisplayName, parentId, factoryRunId }) => ({
  type: 'subagent.started', id: `e-${toolCallId}`, timestamp: '2026-10-10T10:00:00Z', parentId: null,
  ...(agentId ? { agentId } : {}),
  data: { toolCallId, agentName, agentDisplayName: agentDisplayName ?? agentName, agentDescription: '', ...(parentId ? { parentId } : {}), ...(factoryRunId ? { factoryRunId } : {}) },
})

const TRACKING_ROOT = '/repo/.copilot-tracking/skraft-plans'

const hookWorld = ({ events = [], selected, trackingRootOf = () => TRACKING_ROOT, audit } = {}) => {
  const registry = createCopilotCallerRegistry()
  if (selected !== undefined) registry.selectedAtJoin({ agent: selected })
  for (const event of events) registry.observe(event)
  const audited = []
  const dispatches = []
  const provenance = createDispatchProvenanceService({ config, auditWriter: { write: async (entry) => { dispatches.push(entry) } }, clock: { now: () => '2026-10-10T10:00:00Z' } })
  const onPreToolUse = createCopilotWriteGuard({ config, registry, trackingRootOf, provenance, audit: audit ?? (async (entry) => { audited.push(entry) }) })
  // The SDK's PreToolUseHookInput: toolName as Copilot spells it, toolArgs as it sends them.
  const call = (sessionId, toolName, toolArgs) => onPreToolUse(
    { sessionId, timestamp: new Date(), workingDirectory: '/repo', toolName, toolArgs },
    { sessionId: ROOT },
  )
  return { registry, call, audited, dispatches }
}

const create = (path) => ['create', JSON.stringify({ path, file_text: 'x' })]
const bash = (command) => ['bash', { command }]

const PIPELINE = [
  started({ toolCallId: 'toolu_se', agentName: 'skraft:software-engineer', agentDisplayName: 'Skraft - Software Engineer', factoryRunId: 'run-1' }),
  started({ toolCallId: 'toolu_worker', agentId: 'toolu_se', agentName: 'skraft:contract-testing-worker', parentId: 'toolu_se' }),
  started({ toolCallId: 'toolu_rev', agentName: 'skraft:software-engineer-reviewer', factoryRunId: 'run-1' }),
  started({ toolCallId: 'toolu_lens', agentId: 'toolu_rev', agentName: 'skraft:quality-gates-lens', parentId: 'toolu_rev' }),
  started({ toolCallId: 'toolu_gp', agentId: 'toolu_rev', agentName: 'general-purpose', parentId: 'toolu_rev' }),
  started({ toolCallId: 'toolu_report', agentName: 'general-purpose', factoryRunId: 'run-1' }),
]

test('AC3 (Copilot): the Software Engineer and its worker write src/ and tests/', async () => {
  const { call, audited } = hookWorld({ events: PIPELINE })
  for (const session of ['toolu_se', 'toolu_worker']) {
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
  assert.equal(await call('toolu_rev', ...create(REVIEW)), undefined)
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

test("the event's agentId names the sub-agent that emitted it: never the one it starts", async () => {
  const { call } = hookWorld({ events: PIPELINE })
  assert.equal((await call('toolu_rev', ...create('src/a.ts'))).permissionDecision, 'deny', 'toolu_rev stays the reviewer after starting a general-purpose agent')
  assert.equal(await call('toolu_se', ...create('src/a.ts')), undefined, 'toolu_se stays the Software Engineer after starting its worker')
})

test('AC5 (Copilot): a toolCalls batch is guarded call by call; one refusal refuses the batch', async () => {
  const registry = createCopilotCallerRegistry()
  for (const event of PIPELINE) registry.observe(event)
  const onPreToolUse = createCopilotWriteGuard({ config, registry, trackingRootOf: () => TRACKING_ROOT })
  const batch = (toolCalls) => onPreToolUse({ sessionId: 'toolu_se', workingDirectory: '/repo', toolCalls }, { sessionId: ROOT })
  assert.equal(await batch([{ id: 't1', name: 'create', args: { path: 'src/a.ts', file_text: '' } }, { id: 't2', name: 'edit', args: { path: 'tests/a.test.ts' } }]), undefined)
  const refused = await batch([{ id: 't1', name: 'create', args: { path: 'src/a.ts', file_text: '' } }, { id: 't2', name: 'create', args: { path: REVIEW, file_text: 'APPROVED' } }])
  assert.equal(refused.permissionDecision, 'deny')
  assert.match(refused.permissionDecisionReason, /transmission file of Skraft - Software Engineer Reviewer/)
})

test('a guard that cannot judge refuses a write and lets any other call pass', async () => {
  const { call } = hookWorld({ events: PIPELINE, trackingRootOf: () => { throw new Error('no tracking root') } })
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

test('a chain that stops before the main session is unidentified unless a governed agent starts it: the main session is never assumed', async () => {
  const selected = { name: 'skraft-orchestrator', displayName: 'Skraft - Orchestrator' }
  const orphan = started({ toolCallId: 'toolu_orphan', agentName: 'general-purpose', parentId: 'toolu_gone' })
  const child = started({ toolCallId: 'toolu_child', agentName: 'general-purpose' })
  const lens = started({ toolCallId: 'toolu_lens', agentName: 'skraft:quality-gates-lens' })
  const { call, audited } = hookWorld({ events: [orphan, child, lens], selected })
  assert.equal(await call('toolu_orphan', ...create('src/a.ts')), undefined, 'a spawner the registry never saw')
  assert.equal(await call('toolu_child', ...create('src/a.ts')), undefined, 'no parentId: SDK 1.0.9 never says who spawned it')
  assert.equal((await call('toolu_lens', ...create('src/a.ts'))).permissionDecision, 'deny', 'its own name governs it')
  assert.deepEqual(audited.map(({ agentName }) => agentName), ['quality-gates-lens'])
})

// ── Finding 7 and provenance: a closed role starts only the agents the tree gives it ─────

const task = (agent_type) => ['task', JSON.stringify({ agent_type, description: 'x', prompt: 'x' })]

test('provenance (Copilot): a closed role never starts an agent without a declared dispatcher; the tree it declares still runs', async () => {
  const { call, dispatches } = hookWorld({ events: PIPELINE, selected: { name: 'skraft-orchestrator', displayName: 'Skraft - Orchestrator' } })
  for (const [session, agent] of [[ROOT, 'general-purpose'], ['toolu_rev', 'general-purpose'], ['toolu_rev', 'explore'], ['toolu_lens', 'general-purpose']]) {
    const refused = await call(session, ...task(agent))
    assert.equal(refused?.permissionDecision, 'deny', `${session} → ${agent}`)
    assert.match(refused.permissionDecisionReason, /^skraft provenance: .* has no right on src\/ or tests\/ and starts only the agents the dispatch tree gives it/)
  }
  assert.match((await call(ROOT, ...task('skraft:software-engineer'))).permissionDecisionReason, /dispatched by the SKRAFT pipeline/)
  assert.equal(await call('toolu_rev', ...task('skraft:quality-gates-lens')), undefined, 'the reviewer dispatches its lenses')
  assert.equal(await call('toolu_se', ...task('general-purpose')), undefined, 'the Software Engineer writes src/ and tests/ itself')
  assert.equal(await call('toolu_unknown', ...task('general-purpose')), undefined, 'an unidentified caller is not judged')
  assert.deepEqual([...new Set(dispatches.map(({ code }) => code))], ['UNDECLARED_DISPATCH', 'PIPELINE_DISPATCH'])
})

// ── Copilot's own tools: apply_patch, str_replace_editor, write_bash, powershell ────────

test("Copilot's apply_patch, str_replace_editor, write_bash and powershell are judged as the writes they are", async () => {
  const { call } = hookWorld({ events: PIPELINE })
  const patch = (path) => ['apply_patch', `*** Begin Patch\n*** Add File: ${path}\n+x\n*** End Patch`]
  assert.equal((await call('toolu_rev', ...patch('src/a.ts'))).permissionDecision, 'deny')
  assert.equal(await call('toolu_se', ...patch('src/a.ts')), undefined)
  assert.equal((await call('toolu_se', ...patch(REVIEW))).permissionDecision, 'deny')
  assert.equal((await call('toolu_rev', 'str_replace_editor', { command: 'create', path: 'src/a.ts', file_text: 'x' })).permissionDecision, 'deny')
  assert.equal(await call('toolu_rev', 'str_replace_editor', { command: 'view', path: 'src/a.ts' }), undefined)
  assert.match((await call('toolu_rev', 'write_bash', { shellId: '1', input: 'ls\n' })).permissionDecisionReason, /types into a program already running/)
  assert.equal((await call('toolu_se', 'write_bash', { shellId: '1', input: `echo APPROVED > ${REVIEW}\n` })).permissionDecision, 'deny')
  const diff = REVIEW.replace('deliver-review-1.md', 'diff-s1.patch')
  assert.equal(await call('toolu_rev', 'powershell', { command: `git diff abc..HEAD 2>$null > ${diff}` }), undefined)
  assert.equal(await call('toolu_rev', 'powershell', { command: 'git fetch | Out-Null' }), undefined)
  assert.equal((await call('toolu_rev', 'powershell', { command: 'Remove-Item -Recurse src' })).permissionDecision, 'deny')
})
