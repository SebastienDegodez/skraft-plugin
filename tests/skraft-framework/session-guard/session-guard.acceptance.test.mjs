import { test } from 'node:test'
import assert from 'node:assert/strict'

// Outer-loop boundary (US#11 — G7/G8). Exercises the PreToolUse session guard end-to-end
// through the service handle(payload) entry, with in-memory driven adapters
// (audit-writer as the observable seam).
import { createPreToolUseSessionGuardService } from '../../../plugins/skraft-framework/src/application/pre-tool-use-session-guard-service.mjs'

const PROJECT_SLUG = 'us11-g7-g8-session-guard'
const CONFIG = {
  phaseAgents: { DELIVER: { specialist: 'software-engineer', reviewer: 'software-engineer-reviewer' } },
  agentDispatchers: { 'software-engineer': 'skraft-orchestrator', 'software-engineer-reviewer': 'skraft-orchestrator' },
}
const FIXED_NOW = '2026-07-12T12:00:00.000Z'
const fixedClock = { now: () => FIXED_NOW }
const STATE = ['.copilot-tracking', 'skraft-plans', 'us11', 'state.json'].join('/')

const collectingAuditWriter = () => {
  const entries = []
  return { entries, write: async (entry) => { entries.push(entry) } }
}

const runGuard = async ({ payload }) => {
  const audit = collectingAuditWriter()
  const service = createPreToolUseSessionGuardService({ auditWriter: audit, config: CONFIG, clock: fixedClock })
  const result = await service.handle({ projectSlug: PROJECT_SLUG, ...payload })
  return { result, entries: audit.entries }
}

// ── AC-01 — a shell command modifying state.json is blocked; the read stays allowed.
test('AC-01: a shell command modifying state.json is denied', async () => {
  const { result, entries } = await runGuard({
    payload: { toolName: 'Bash', toolInput: { command: `echo "{}" > ${STATE}` } }
  })
  assert.equal(result.decision, 'deny')
  assert.equal(entries.length, 1)
  assert.equal(entries[0].code, 'STATE_WRITE_FORBIDDEN')
  assert.equal(entries[0].decision, 'DENY')
})

test('AC-01: reading state.json stays allowed', async () => {
  const { result } = await runGuard({
    payload: { toolName: 'Bash', toolInput: { command: `cat ${STATE}` } }
  })
  assert.equal(result.decision, 'allow')
})

test('AC-01: a Write tool targeting state.json is denied', async () => {
  const { result } = await runGuard({
    payload: { toolName: 'Write', toolInput: { filePath: STATE, content: '{}' } }
  })
  assert.equal(result.decision, 'deny')
})

// ── AC-02 — the orchestrator never writes src/ or tests/; any other caller may.
test('AC-02: a src/ write by the orchestrator is denied', async () => {
  const { result, entries } = await runGuard({
    payload: { toolName: 'Edit', agentName: 'skraft-orchestrator', toolInput: { filePath: 'src/app.mjs' } }
  })
  assert.equal(result.decision, 'deny')
  assert.equal(entries[0].code, 'ORCHESTRATOR_WRITE_FORBIDDEN')
})

test('AC-02: a src/ write by a sub-agent or an unnamed caller is allowed', async () => {
  for (const agentName of [undefined, 'software-engineer']) {
    const { result } = await runGuard({ payload: { toolName: 'Edit', agentName, toolInput: { filePath: 'src/app.mjs' } } })
    assert.equal(result.decision, 'allow')
  }
})
