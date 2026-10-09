// Unit — the PreToolUse session guard service around the pure G7/G8 policy: which payload
// fields it reads as a write, whom it names the orchestrator, and what it audits.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPreToolUseSessionGuardService } from '../../../plugins/skraft-framework/src/application/pre-tool-use-session-guard-service.mjs'

const NOW = '2026-09-24T08:00:00.000Z'
const STATE = '.copilot-tracking/skraft-plans/checkout/state.json'
const CONFIG = {
  phaseAgents: { DELIVER: { specialist: 'Skraft - Software Engineer', reviewer: null } },
  agentDispatchers: { 'Skraft - Software Engineer': 'Skraft - Orchestrator' },
  agentAliases: { 'skraft-orchestrator': 'Skraft - Orchestrator', 'software-engineer': 'Skraft - Software Engineer' },
}

const guard = async (payload, { clock = { now: () => NOW } } = {}) => {
  const entries = []
  const service = createPreToolUseSessionGuardService({
    auditWriter: { write: async (entry) => { entries.push(entry) } },
    clock,
    config: CONFIG,
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

test('only a Bash call carries a shell command', async () => {
  const stray = await guard({ toolName: 'Edit', toolInput: { filePath: 'docs/notes.md', command: `rm ${STATE}` } })
  assert.equal(stray.decision, 'allow', 'a command field on another tool is not run by a shell')
  const malformed = await guard({ toolName: 'Bash', toolInput: { command: ['rm', STATE] } })
  assert.equal(malformed.decision, 'allow', 'a Bash payload without a string command has nothing to judge')
})

test('G8 refuses a workspace write by the orchestrator, under any of its names', async () => {
  for (const agentName of ['skraft:skraft-orchestrator', 'skraft-orchestrator', 'Skraft - Orchestrator']) {
    const { decision, entries } = await guard({ agentName, toolName: 'Write', toolInput: { filePath: 'src/Orders/Order.cs' } })
    assert.equal(decision, 'deny', agentName)
    assert.deepEqual(entries.map(({ decision, code, agentName: name }) => ({ decision, code, name })),
      [{ decision: 'DENY', code: 'ORCHESTRATOR_WRITE_FORBIDDEN', name: agentName }])
  }
  const outside = await guard({ projectSlug: undefined, agentName: 'skraft-orchestrator', toolName: 'Bash', toolInput: { command: 'rm tests/a.test.mjs' } })
  assert.equal(outside.decision, 'deny', 'the orchestrator never writes the workspace, pipeline or not')
})

test('G8 lets an unnamed caller or a sub-agent write the workspace, audited only inside a pipeline', async () => {
  for (const agentName of [undefined, 'skraft:software-engineer']) {
    const { decision, entries } = await guard({ agentName, toolName: 'Write', toolInput: { filePath: 'src/Orders/Order.cs' } })
    assert.equal(decision, 'allow')
    assert.deepEqual(entries.map(({ decision, code }) => ({ decision, code })), [{ decision: 'ALLOW', code: 'CONFORMING' }])
  }
  const outside = await guard({ projectSlug: undefined, toolName: 'Write', toolInput: { filePath: 'src/Orders/Order.cs' } })
  assert.equal(outside.decision, 'allow')
  assert.deepEqual(outside.entries, [])
})

test('G8 names no orchestrator without a config', async () => {
  const service = createPreToolUseSessionGuardService({ auditWriter: { write: async () => {} }, clock: { now: () => NOW } })
  const result = await service.handle({ agentName: 'skraft-orchestrator', toolName: 'Write', toolInput: { filePath: 'src/a.mjs' } })
  assert.equal(result.decision, 'allow')
})

test('G7 denies without an active pipeline and records the caller', async () => {
  const { decision, entries } = await guard({ projectSlug: undefined, agentName: 'skraft:software-engineer', toolName: 'Bash', toolInput: { command: `echo {} > ${STATE}` } })
  assert.equal(decision, 'deny')
  assert.equal(entries[0].projectSlug, null)
  assert.equal(entries[0].agentName, 'skraft:software-engineer')
})

test('a denial survives an audit-writer failure', async () => {
  const service = createPreToolUseSessionGuardService({
    auditWriter: { write: async () => { throw new Error('disk full') } },
    clock: { now: () => NOW },
  })
  assert.equal((await service.handle({ toolName: 'Write', filePath: STATE })).decision, 'deny')
})

test('a failing clock still stamps the audit entry', async () => {
  const { decision, entries } = await guard({ toolName: 'Write', toolInput: { filePath: STATE } }, { clock: { now: () => { throw new Error('no clock') } } })
  assert.equal(decision, 'deny')
  assert.match(entries[0].evaluatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
})
