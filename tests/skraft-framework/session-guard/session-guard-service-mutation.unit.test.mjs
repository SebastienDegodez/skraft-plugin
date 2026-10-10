// Unit — the PreToolUse session guard service: which payload `cwd` it hands G7, and whom
// it names the orchestrator for G8. Hand-written doubles only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPreToolUseSessionGuardService } from '../../../plugins/skraft-framework/src/application/pre-tool-use-session-guard-service.mjs'

const NOW = '2026-10-07T08:00:00.000Z'
const DELIVER = { phaseAgents: { DELIVER: { specialist: 'software-engineer', reviewer: 'software-engineer-reviewer' } } }

// `config: undefined` is passed on purpose: no framework config at all.
const serviceWith = (options = {}) => {
  const config = 'config' in options ? options.config : DELIVER
  const entries = []
  const service = createPreToolUseSessionGuardService({
    auditWriter: { write: async (entry) => { entries.push(entry) } },
    config,
    clock: { now: () => NOW },
  })
  return { service, entries }
}

// Removing the parent of the session directory removes the tracking directory with it —
// but only a known session directory makes `/tmp` that parent.
const RM_PARENT = { toolName: 'Bash', toolInput: { command: 'rm -rf /tmp' } }

test('a string session directory resolves the command; an empty or non-string one is ignored', async () => {
  const { service, entries } = serviceWith()
  assert.equal((await service.handle({ ...RM_PARENT, cwd: '/tmp/work' })).decision, 'deny')
  assert.equal((await service.handle({ ...RM_PARENT })).decision, 'allow')
  assert.equal((await service.handle({ ...RM_PARENT, cwd: '' })).decision, 'allow')
  assert.equal((await service.handle({ ...RM_PARENT, cwd: ['/tmp/work'] })).decision, 'allow', 'an array is not a directory')
  assert.equal((await service.handle({ ...RM_PARENT, cwd: { length: 1, toString: () => '/tmp/work' } })).decision, 'allow')
  assert.deepEqual(entries.map((e) => e.decision), ['DENY'], 'without a project slug only the G7 denial is audited')
})

test('the session directory turns a relative path into the tracked state', async () => {
  const { service } = serviceWith()
  const payload = { toolName: 'Bash', toolInput: { command: 'rm ../.copilot-tracking/skraft-plans/checkout/state.json' } }
  assert.equal((await service.handle({ ...payload, cwd: '/repo/sub' })).decision, 'deny')
  assert.equal((await service.handle({ ...payload, cwd: 7 })).decision, 'deny', 'unresolved, the path still names a protected file')
})

test('a command field on a tool other than Bash is never read as a shell command', async () => {
  const { service } = serviceWith()
  const decision = await service.handle({ toolName: 'Read', toolInput: { command: 'rm .copilot-tracking/skraft-plans/checkout/state.json' } })
  assert.deepEqual(decision, { decision: 'allow' })
  const bash = await service.handle({ toolName: 'Bash', toolInput: { command: 'rm .copilot-tracking/skraft-plans/checkout/state.json' } })
  assert.equal(bash.decision, 'deny')
})

test('a Bash call whose command is not a string carries no command', async () => {
  const { service, entries } = serviceWith()
  for (const command of [42, { rm: 'state.json' }, ['rm', 'src/a.cs'], null]) {
    assert.deepEqual(await service.handle({ projectSlug: 'checkout', toolName: 'Bash', toolInput: { command } }), { decision: 'allow' })
  }
  assert.deepEqual(entries.map((e) => [e.code, e.reason]), Array(4).fill(['CONFORMING', 'no src/ or tests/ write']))
})

test('without a phase agent dispatched by a named agent, nobody is the orchestrator', async () => {
  const configs = [
    undefined, {}, { phaseAgents: { DELIVER: {} } }, { phaseAgents: { DELIVER: null } },
    { phaseAgents: { DELIVER: { specialist: 3 } }, agentDispatchers: { 3: 'lead', worker: 'software-engineer' } },
    { phaseAgents: { DELIVER: { specialist: 'software-engineer' } }, agentDispatchers: { 'software-engineer': 7 } },
  ]
  for (const config of configs) {
    const { service, entries } = serviceWith({ config })
    const decision = await service.handle({ projectSlug: 'checkout', agentName: 'lead', toolName: 'Write', toolInput: { filePath: 'src/a.cs' } })
    assert.deepEqual(decision, { decision: 'allow' }, JSON.stringify(config))
    assert.deepEqual(entries, [{
      event: 'SessionGuardEvaluated', projectSlug: 'checkout', agentName: 'lead', decision: 'ALLOW',
      code: 'CONFORMING', reason: 'workspace write by lead', evaluatedAt: NOW,
    }], JSON.stringify(config))
  }
})

test('the orchestrator is the dispatcher of a phase agent; when the pipeline dispatches, the launcher agent', async () => {
  const config = {
    phaseAgents: { DESIGN: { specialist: 'architect', reviewer: 'architect-reviewer' }, DELIVER: { specialist: 'engineer', reviewer: null } },
    agentDispatchers: { architect: 'skraft-pipeline', 'architect-reviewer': 'skraft-pipeline', engineer: 'lead', worker: 'engineer' },
  }
  const write = (agentName) => ({ projectSlug: 'checkout', agentName, toolName: 'Edit', toolInput: { filePath: 'tests/a.test.mjs' } })
  const { service, entries } = serviceWith({ config })
  for (const agent of ['skraft-orchestrator', 'lead']) assert.equal((await service.handle(write(agent))).decision, 'deny', agent)
  for (const agent of ['skraft-pipeline', 'engineer', 'worker', 'architect']) assert.equal((await service.handle(write(agent))).decision, 'allow', agent)
  assert.deepEqual(entries.map((e) => e.code), [
    'ORCHESTRATOR_WRITE_FORBIDDEN', 'ORCHESTRATOR_WRITE_FORBIDDEN', 'CONFORMING', 'CONFORMING', 'CONFORMING', 'CONFORMING',
  ])
})
