import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSubagentStopService } from '../../plugins/src/application/subagent-stop-service.mjs'

const CONFIG = {
  agentSkills: {
    'acceptance-designer': [
      { name: 'bdd-methodology', policy: 'verify' },
      { name: 'outside-in-tdd', policy: 'verify' }
    ],
    'skraft-orchestrator': []
  }
}

const FIXED_NOW = '2026-06-29T12:00:00.000Z'
const clock = { now: () => FIXED_NOW }

const collectingWriter = () => {
  const entries = []
  return { entries, write: async (e) => { entries.push(e) } }
}

// Per-invocation factory that wraps a string transcript (unit-test double)
const stringTranscriptReaderFactory = ({ transcript }) => ({
  read: async () => {
    if (typeof transcript !== 'string' || transcript.length === 0) {
      throw new Error('TRANSCRIPT_UNAVAILABLE')
    }
    return transcript
  }
})

// happy path — all skills present ————————————————————————————————————

test('allows when all mandatory skills were read', async () => {
  const audit = collectingWriter()
  const service = createSubagentStopService({ config: CONFIG, transcriptReaderFactory: stringTranscriptReaderFactory, auditWriter: audit, clock })
  const transcript = 'read bdd-methodology/SKILL.md and outside-in-tdd/SKILL.md'
  const result = await service.handle({ agentName: 'acceptance-designer', transcript })
  assert.equal(result.decision, 'allow')
  assert.equal(audit.entries[0].decision, 'ALLOW')
  assert.deepEqual(audit.entries[0].missingSkills, [])
})

// block path — missing skills ————————————————————————————————————————

test('blocks when a mandatory skill was not read', async () => {
  const audit = collectingWriter()
  const service = createSubagentStopService({ config: CONFIG, transcriptReaderFactory: stringTranscriptReaderFactory, auditWriter: audit, clock })
  const result = await service.handle({
    agentName: 'acceptance-designer',
    transcript: 'read bdd-methodology/SKILL.md only'
  })
  assert.equal(result.decision, 'block')
  assert.ok(result.message.includes('outside-in-tdd'))
})

test('block message names only the first missing skill', async () => {
  const audit = collectingWriter()
  const service = createSubagentStopService({ config: CONFIG, transcriptReaderFactory: stringTranscriptReaderFactory, auditWriter: audit, clock })
  // Transcript has neither skill → block on first missing (bdd-methodology)
  const result = await service.handle({ agentName: 'acceptance-designer', transcript: 'no skills here' })
  assert.ok(result.message.startsWith('Mandatory skill not loaded: bdd-methodology'),
    `message must name the first missing skill; got: "${result.message}"`)
})

// no-skill agent — always allow ———————————————————————————————————————

test('allows when agent has no mandatory skills without consulting transcript or writing audit', async () => {
  // Kills ConditionalExpression mutant: skillEntries.length === 0 → false
  // (mutant would call transcriptReaderFactory and write a transcript_unavailable audit)
  const audit = collectingWriter()
  const service = createSubagentStopService({ config: CONFIG, transcriptReaderFactory: stringTranscriptReaderFactory, auditWriter: audit, clock })
  const result = await service.handle({ agentName: 'skraft-orchestrator', transcript: '' })
  assert.equal(result.decision, 'allow')
  assert.equal(audit.entries.length, 0, 'no audit entry must be written when agent has no mandatory skills')
})

// audit contents ——————————————————————————————————————————————————————

test('writes SkillComplianceChecked audit entry', async () => {
  const audit = collectingWriter()
  const service = createSubagentStopService({ config: CONFIG, transcriptReaderFactory: stringTranscriptReaderFactory, auditWriter: audit, clock })
  await service.handle({ agentName: 'acceptance-designer', transcript: 'bdd-methodology/SKILL.md' })
  assert.equal(audit.entries.length, 1)
  assert.equal(audit.entries[0].eventType, 'SkillComplianceChecked')
  assert.equal(audit.entries[0].agentName, 'acceptance-designer')
  assert.equal(audit.entries[0].timestamp, FIXED_NOW)
})

test('block audit entry has no reason field; allow audit entry has reason all_present', async () => {
  // Kills ConditionalExpression mutant: missing.length === 0 && { reason } → true && { reason }
  // (mutant always adds reason: 'all_present' even when blocking)
  const blockAudit = collectingWriter()
  const blockService = createSubagentStopService({ config: CONFIG, transcriptReaderFactory: stringTranscriptReaderFactory, auditWriter: blockAudit, clock })
  await blockService.handle({ agentName: 'acceptance-designer', transcript: 'bdd-methodology/SKILL.md only' })
  assert.equal(blockAudit.entries[0].reason, undefined,
    `block audit must not have reason field; got: ${JSON.stringify(blockAudit.entries[0].reason)}`)

  const allowAudit = collectingWriter()
  const allowService = createSubagentStopService({ config: CONFIG, transcriptReaderFactory: stringTranscriptReaderFactory, auditWriter: allowAudit, clock })
  await allowService.handle({ agentName: 'acceptance-designer', transcript: 'bdd-methodology/SKILL.md outside-in-tdd/SKILL.md' })
  assert.equal(allowAudit.entries[0].reason, 'all_present',
    `allow audit must have reason all_present; got: ${JSON.stringify(allowAudit.entries[0].reason)}`)
})

// fail-open on unexpected errors ——————————————————————————————————————

test('allows (fail-open) when auditWriter throws', async () => {
  const throwingWriter = { write: async () => { throw new Error('disk full') } }
  const service = createSubagentStopService({ config: CONFIG, transcriptReaderFactory: stringTranscriptReaderFactory, auditWriter: throwingWriter, clock })
  const result = await service.handle({ agentName: 'acceptance-designer', transcript: 'bdd-methodology/SKILL.md outside-in-tdd/SKILL.md' })
  assert.equal(result.decision, 'allow')
})

test('allows (fail-open) when clock throws', async () => {
  const throwingClock = { now: () => { throw new Error('clock error') } }
  const audit = collectingWriter()
  const service = createSubagentStopService({ config: CONFIG, transcriptReaderFactory: stringTranscriptReaderFactory, auditWriter: audit, clock: throwingClock })
  const result = await service.handle({ agentName: 'acceptance-designer', transcript: 'bdd-methodology/SKILL.md' })
  assert.equal(result.decision, 'allow')
})

// array transcript ————————————————————————————————————————————————————

test('extracts skills from array transcript', async () => {
  const audit = collectingWriter()
  const arrayTranscriptReaderFactory = ({ transcript }) => ({
    read: async () => JSON.stringify(transcript)
  })
  const service = createSubagentStopService({ config: CONFIG, transcriptReaderFactory: arrayTranscriptReaderFactory, auditWriter: audit, clock })
  const transcript = [{ text: 'bdd-methodology/SKILL.md' }, { text: 'outside-in-tdd/SKILL.md' }]
  const result = await service.handle({ agentName: 'acceptance-designer', transcript })
  assert.equal(result.decision, 'allow')
})

