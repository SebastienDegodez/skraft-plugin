// Unit — the PreToolUse session guard service: which payload `cwd` it hands G7, the exact
// fail-open reasons it audits, and how the monitored DELIVER agent set grows. Hand-written
// doubles only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPreToolUseSessionGuardService } from '../../../plugins/skraft-framework/src/application/pre-tool-use-session-guard-service.mjs'

const NOW = '2026-10-07T08:00:00.000Z'
const DELIVER = { phaseAgents: { DELIVER: { specialist: 'software-engineer', reviewer: 'software-engineer-reviewer' } } }

// `config: undefined` is passed on purpose: no framework config at all.
const serviceWith = (options = {}) => {
  const { read = async () => ({ currentPhase: 'DELIVER' }) } = options
  const config = 'config' in options ? options.config : DELIVER
  const entries = []
  const service = createPreToolUseSessionGuardService({
    stateReader: { read },
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

test('the fail-open reason quotes the reader error, whatever was thrown', async () => {
  const cases = [
    [new Error('disk gone'), 'disk gone'],
    ['plain text', 'plain text'],
    [undefined, 'undefined'],
    [null, 'null'],
    [{ code: 'EIO' }, '[object Object]'],
  ]
  for (const [thrown, shown] of cases) {
    const { service, entries } = serviceWith({ read: async () => { throw thrown } })
    const decision = await service.handle({ projectSlug: 'checkout', agentName: 'orchestrator', toolName: 'Write', toolInput: { filePath: 'src/a.cs' } })
    assert.deepEqual(decision, { decision: 'allow' }, shown)
    assert.deepEqual(entries, [{
      event: 'SessionGuardEvaluated', projectSlug: 'checkout', agentName: 'orchestrator', decision: 'ALLOW',
      code: 'UNREADABLE_STATE', reason: `recorded pipeline state unreadable; session guard fail-open: ${shown}`, evaluatedAt: NOW,
    }], shown)
  }
})

test('DELIVER without a monitored agent fails open with its own code and reason', async () => {
  for (const config of [undefined, {}, { phaseAgents: { DELIVER: {} } }, { phaseAgents: { DELIVER: { specialist: 3 } }, agentDispatchers: { worker: 'software-engineer' } }]) {
    const { service, entries } = serviceWith({ config })
    const decision = await service.handle({ projectSlug: 'checkout', toolName: 'Write', toolInput: { filePath: 'src/a.cs' } })
    assert.deepEqual(decision, { decision: 'allow' })
    assert.deepEqual(entries, [{
      event: 'SessionGuardEvaluated', projectSlug: 'checkout', agentName: null, decision: 'ALLOW',
      code: 'UNCONFIGURED_DELIVER_AGENTS', reason: 'no monitored DELIVER agents configured; session guard fail-open', evaluatedAt: NOW,
    }], JSON.stringify(config))
  }
})

test('the monitored set grows through dispatchers only from a configured DELIVER agent', async () => {
  const config = {
    phaseAgents: { DELIVER: { reviewer: 'reviewer' } },
    agentDispatchers: { c: 'b', b: 'reviewer', x: 'y', y: 'x' },
  }
  const write = (agentName) => ({ projectSlug: 'checkout', agentName, toolName: 'Edit', toolInput: { filePath: 'tests/a.test.mjs' } })
  const { service, entries } = serviceWith({ config })
  for (const agent of ['reviewer', 'b', 'c']) assert.equal((await service.handle(write(agent))).decision, 'allow', agent)
  for (const agent of ['x', 'y', 'software-engineer']) assert.equal((await service.handle(write(agent))).decision, 'deny', agent)
  assert.deepEqual(entries.slice(0, 3).map((e) => e.reason), ['reviewer', 'b', 'c'].map((a) => `workspace write by monitored DELIVER agent ${a}`))
})
