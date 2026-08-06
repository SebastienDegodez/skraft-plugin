import { test } from 'node:test'
import assert from 'node:assert/strict'

// Outer-loop boundary (US#11 — G7/G8). Exercises the PreToolUse session guard
// end-to-end through the service handle(payload) entry, with in-memory driven
// adapters (audit-writer as the observable seam).
import { createPreToolUseSessionGuardService } from '../../plugins/skraft-framework/src/application/pre-tool-use-session-guard-service.mjs'

const CONFIG = {
  phaseOrder: ['DISCOVER', 'DISCUSS', 'DESIGN', 'DISTILL', 'DELIVER'],
  phaseAgents: {
    DELIVER: { specialist: 'software-engineer', reviewer: 'software-engineer-reviewer' }
  }
}

const PROJECT_SLUG = 'us11-g7-g8-session-guard'
const FIXED_NOW = '2026-07-12T12:00:00.000Z'
const fixedClock = { now: () => FIXED_NOW }

const stateReaderReturning = (raw) => ({ read: async (_slug) => raw })
const stateReaderThrowing = (err) => ({ read: async (_slug) => { throw err } })
const collectingAuditWriter = () => {
  const entries = []
  return { entries, write: async (entry) => { entries.push(entry) } }
}

const runGuard = async ({ reader, payload }) => {
  const audit = collectingAuditWriter()
  const service = createPreToolUseSessionGuardService({
    stateReader: reader ?? stateReaderReturning({ currentPhase: 'DELIVER' }),
    auditWriter: audit,
    config: CONFIG,
    clock: fixedClock
  })
  const result = await service.handle({ projectSlug: PROJECT_SLUG, ...payload })
  return { result, entries: audit.entries }
}

// ── AC-01 — a shell command modifying state.json is blocked; the read stays allowed.
test('AC-01: a shell command modifying state.json is denied', async () => {
  const { result, entries } = await runGuard({
    payload: { toolName: 'Bash', toolInput: { command: 'echo "{}" > .copilot-tracking/skraft-plans/us11/state.json' } }
  })
  assert.equal(result.decision, 'deny')
  assert.equal(entries.length, 1)
  assert.equal(entries[0].code, 'STATE_WRITE_FORBIDDEN')
  assert.equal(entries[0].decision, 'DENY')
})

test('AC-01: reading state.json stays allowed', async () => {
  const { result, entries } = await runGuard({
    payload: { toolName: 'Bash', toolInput: { command: 'cat .copilot-tracking/skraft-plans/us11/state.json' } }
  })
  assert.equal(result.decision, 'allow')
  assert.equal(entries[0].decision, 'ALLOW')
})

test('AC-01: a Write tool targeting state.json is denied', async () => {
  const { result } = await runGuard({
    payload: { toolName: 'Write', toolInput: { filePath: 'us11/state.json', content: '{}' } }
  })
  assert.equal(result.decision, 'deny')
})

// ── AC-02 — a src/ write outside a monitored DELIVER sub-agent is blocked.
test('AC-02: a src/ write outside a monitored DELIVER sub-agent is denied', async () => {
  const { result, entries } = await runGuard({
    payload: { toolName: 'Edit', toolInput: { filePath: 'src/app.mjs' } }
  })
  assert.equal(result.decision, 'deny')
  assert.equal(entries[0].code, 'UNMONITORED_WRITE')
})

test('AC-02: a src/ write by the monitored DELIVER specialist is allowed', async () => {
  const { result } = await runGuard({
    payload: { toolName: 'Edit', agentName: 'software-engineer', toolInput: { filePath: 'src/app.mjs' } }
  })
  assert.equal(result.decision, 'allow')
})

test('AC-02: a src/ write outside DELIVER is allowed', async () => {
  const { result } = await runGuard({
    reader: stateReaderReturning({ currentPhase: 'DESIGN' }),
    payload: { toolName: 'Edit', toolInput: { filePath: 'src/app.mjs' } }
  })
  assert.equal(result.decision, 'allow')
})

// ── Fail-open on unreadable state: G8 cannot be evaluated, so the tool is allowed
//    (a hook bug must never freeze the pipeline). G7 already ran on the payload.
test('unreadable state fails open (allow) after G7 has run', async () => {
  const { result, entries } = await runGuard({
    reader: stateReaderThrowing(new Error('missing state')),
    payload: { toolName: 'Edit', toolInput: { filePath: 'src/app.mjs' } }
  })
  assert.equal(result.decision, 'allow')
  assert.equal(entries[0].code, 'UNREADABLE_STATE')
})

test('G7 still denies a protected-artifact write even when state is unreadable', async () => {
  const { result } = await runGuard({
    reader: stateReaderThrowing(new Error('missing state')),
    payload: { toolName: 'Bash', toolInput: { command: 'rm us11/state.json' } }
  })
  assert.equal(result.decision, 'deny')
})

// ── Decision is unchanged when the audit writer throws (audit is a non-blocking seam).
test('a denial survives an audit-writer failure', async () => {
  const throwingWriter = { write: async () => { throw new Error('disk full') } }
  const service = createPreToolUseSessionGuardService({
    stateReader: stateReaderReturning({ currentPhase: 'DELIVER' }),
    auditWriter: throwingWriter,
    config: CONFIG,
    clock: fixedClock
  })
  const result = await service.handle({
    projectSlug: PROJECT_SLUG,
    toolName: 'Edit',
    toolInput: { filePath: 'src/app.mjs' }
  })
  assert.equal(result.decision, 'deny')
})
