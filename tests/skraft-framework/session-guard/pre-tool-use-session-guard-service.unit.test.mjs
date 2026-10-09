// Unit — the PreToolUse session guard service around the pure G7/G8 policy: which payload
// fields it reads as a write, who counts as a DELIVER agent, when it fails open, and what
// it writes to the audit log.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPreToolUseSessionGuardService } from '../../../plugins/skraft-framework/src/application/pre-tool-use-session-guard-service.mjs'

const CONFIG = {
  phaseAgents: { DELIVER: { specialist: 'software-engineer', reviewer: 'software-engineer-reviewer' } },
}
const NOW = '2026-09-24T08:00:00.000Z'
const STATE = '.copilot-tracking/skraft-plans/checkout/state.json'

// `config` may be passed as undefined on purpose: no framework config at all.
const guard = async (payload, options = {}) => {
  const { phase = 'DELIVER', reader, clock = { now: () => NOW } } = options
  const entries = []
  const service = createPreToolUseSessionGuardService({
    stateReader: reader ?? { read: async () => ({ currentPhase: phase }) },
    auditWriter: { write: async (entry) => { entries.push(entry) } },
    config: 'config' in options ? options.config : CONFIG,
    clock,
  })
  const result = await service.handle({ projectSlug: 'checkout', ...payload })
  return { decision: result.decision, entries }
}

test('G7 holds for every file-writing tool, MultiEdit and NotebookEdit included', async () => {
  const multiEdit = await guard({ toolName: 'MultiEdit', toolInput: { filePath: STATE, edits: [] } })
  assert.equal(multiEdit.decision, 'deny')
  const notebook = await guard({ toolName: 'NotebookEdit', toolInput: { notebook_path: STATE } })
  assert.equal(notebook.decision, 'deny')
  assert.deepEqual(notebook.entries, [{
    event: 'SessionGuardEvaluated', projectSlug: 'checkout', agentName: null,
    decision: 'DENY', code: 'STATE_WRITE_FORBIDDEN', reason: notebook.entries[0].reason, evaluatedAt: NOW,
  }])
})

test('G8 denies a NotebookEdit into src/ from outside the DELIVER agents, and says so in the audit', async () => {
  const { decision, entries } = await guard({ toolName: 'NotebookEdit', toolInput: { notebook_path: 'src/analysis.ipynb' } })
  assert.equal(decision, 'deny')
  assert.equal(entries[0].decision, 'DENY')
  assert.equal(entries[0].code, 'UNMONITORED_WRITE')
})

test('only a Bash call carries a shell command', async () => {
  const stray = await guard({ toolName: 'Edit', toolInput: { filePath: 'docs/notes.md', command: `rm ${STATE}` } })
  assert.equal(stray.decision, 'allow', 'a command field on another tool is not run by a shell')
  const malformed = await guard({ toolName: 'Bash', toolInput: { command: ['rm', STATE] } })
  assert.equal(malformed.decision, 'allow', 'a Bash payload without a string command has nothing to judge')
})

test('agents dispatched by the DELIVER agents write the workspace, at any depth, in any listing order', async () => {
  const config = {
    ...CONFIG,
    agentDispatchers: { 'fixture-writer': 'contract-worker', 'contract-worker': 'software-engineer', 'lens': 'software-engineer-reviewer' },
  }
  for (const agentName of ['software-engineer', 'contract-worker', 'fixture-writer', 'skraft:lens']) {
    const { decision } = await guard({ toolName: 'Write', agentName, toolInput: { filePath: 'tests/Orders.Tests/OrderTests.cs' } }, { config })
    assert.equal(decision, 'allow', agentName)
  }
  const outsider = await guard({ toolName: 'Write', agentName: 'solution-architect', toolInput: { filePath: 'src/Orders/Order.cs' } }, { config })
  assert.equal(outsider.decision, 'deny')
})

test('DELIVER with no DELIVER agent configured fails open on G8, and records why', async () => {
  for (const config of [undefined, {}, { phaseAgents: { DELIVER: {} } }]) {
    const { decision, entries } = await guard({ toolName: 'Write', toolInput: { filePath: 'src/Orders/Order.cs' } }, { config })
    assert.equal(decision, 'allow')
    assert.deepEqual(entries.map(({ decision, code }) => ({ decision, code })), [{ decision: 'ALLOW', code: 'UNCONFIGURED_DELIVER_AGENTS' }])
  }
})

test('outside DELIVER the write conforms, configured agents or not', async () => {
  for (const config of [CONFIG, {}]) {
    const { decision, entries } = await guard({ toolName: 'Write', toolInput: { filePath: 'src/Orders/Order.cs' } }, { config, phase: 'DESIGN' })
    assert.equal(decision, 'allow')
    assert.equal(entries[0].code, 'CONFORMING')
  }
})

test('a pipeline with no recorded state is not in DELIVER', async () => {
  const { decision, entries } = await guard({ toolName: 'Write', toolInput: { filePath: 'src/Orders/Order.cs' } }, { reader: { read: async () => null } })
  assert.equal(decision, 'allow')
  assert.equal(entries[0].code, 'CONFORMING')
})

test('an unreadable state fails open on G8 with the reader error in the audit', async () => {
  for (const [thrown, cause] of [[new Error('state.json truncated'), 'state.json truncated'], ['disk gone', 'disk gone']]) {
    const reader = { read: async () => { throw thrown } }
    const { decision, entries } = await guard({ toolName: 'Write', toolInput: { filePath: 'src/Orders/Order.cs' } }, { reader })
    assert.equal(decision, 'allow')
    assert.deepEqual(entries.map(({ decision, code, reason }) => ({ decision, code, reason })), [{
      decision: 'ALLOW', code: 'UNREADABLE_STATE', reason: `recorded pipeline state unreadable; session guard fail-open: ${cause}`,
    }])
  }
})

test('without an active pipeline G8 has no phase to guard and writes no audit line', async () => {
  const { decision, entries } = await guard({ projectSlug: undefined, toolName: 'Write', toolInput: { filePath: 'src/Orders/Order.cs' } })
  assert.equal(decision, 'allow')
  assert.deepEqual(entries, [])
})

test('a failing clock still stamps the audit entry', async () => {
  const { decision, entries } = await guard({ toolName: 'Write', toolInput: { filePath: STATE } }, { clock: { now: () => { throw new Error('no clock') } } })
  assert.equal(decision, 'deny')
  assert.match(entries[0].evaluatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
})

// Copilot names no agent on a sub-agent's tool call, only its session: the registry
// resolves that session to the agent it runs.
const registryGuard = async (payload, agentRegistry) => {
  const entries = []
  const service = createPreToolUseSessionGuardService({
    stateReader: { read: async () => ({ currentPhase: 'DELIVER' }) },
    auditWriter: { write: async (entry) => { entries.push(entry) } },
    config: { ...CONFIG, agentAliases: { 'skraft:software-engineer': 'software-engineer' } },
    clock: { now: () => NOW },
    agentRegistry,
  })
  const result = await service.handle({ projectSlug: 'checkout', ...payload })
  return { decision: result.decision, entries }
}

test('G8 lets an unnamed sub-agent session write when the registry resolves it to a DELIVER agent', async () => {
  const asked = []
  const registry = { agentNameOf: async (sessionId) => { asked.push(sessionId); return sessionId === 'child' ? 'skraft:software-engineer' : null } }

  const engineer = await registryGuard({ sessionId: 'child', toolName: 'Write', filePath: 'src/Orders/Order.cs' }, registry)
  assert.equal(engineer.decision, 'allow')
  assert.equal(engineer.entries[0].agentName, 'skraft:software-engineer')
  assert.equal(engineer.entries[0].code, 'CONFORMING')

  const orchestrator = await registryGuard({ sessionId: 'parent', toolName: 'Write', filePath: 'src/Orders/Order.cs' }, registry)
  assert.equal(orchestrator.decision, 'deny')
  assert.equal(orchestrator.entries[0].agentName, null)
  assert.deepEqual(asked, ['child', 'parent'])
})

test('G8 asks the registry only for an unnamed write it would deny', async () => {
  const asked = []
  const registry = { agentNameOf: async (sessionId) => { asked.push(sessionId); return 'software-engineer' } }

  await registryGuard({ sessionId: 's', toolName: 'Write', filePath: 'docs/notes.md' }, registry)
  await registryGuard({ sessionId: 's', agentName: 'software-engineer', toolName: 'Write', filePath: 'src/A.cs' }, registry)
  const named = await registryGuard({ sessionId: 's', agentName: 'solution-architect', toolName: 'Write', filePath: 'src/A.cs' }, registry)
  assert.equal(named.decision, 'deny', 'a named agent is never renamed by the registry')
  assert.deepEqual(asked, [])
})

test('G8 still denies when the registry resolves nothing, an outsider, or fails', async () => {
  const write = { sessionId: 's', toolName: 'Write', filePath: 'src/A.cs' }
  for (const registry of [
    undefined,
    { agentNameOf: async () => null },
    { agentNameOf: async () => 'solution-architect' },
    { agentNameOf: async () => { throw new Error('boom') } },
  ]) {
    assert.equal((await registryGuard(write, registry)).decision, 'deny')
  }
  const noSession = await registryGuard({ toolName: 'Write', filePath: 'src/A.cs' }, { agentNameOf: async () => 'software-engineer' })
  assert.equal(noSession.decision, 'deny')
})
