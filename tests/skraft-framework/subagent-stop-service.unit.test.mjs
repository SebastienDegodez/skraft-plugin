import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSubagentStopService } from '../../plugins/skraft-framework/src/application/subagent-stop-service.mjs'

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

test('block audit entry has reason skill_absent; allow audit entry has reason all_present', async () => {
  // Kills ConditionalExpression mutant: missing.length === 0 ? 'all_present' : 'skill_absent'
  // (mutant cannot set both to all_present since block path must produce skill_absent)
  const blockAudit = collectingWriter()
  const blockService = createSubagentStopService({ config: CONFIG, transcriptReaderFactory: stringTranscriptReaderFactory, auditWriter: blockAudit, clock })
  await blockService.handle({ agentName: 'acceptance-designer', transcript: 'bdd-methodology/SKILL.md only' })
  assert.equal(blockAudit.entries[0].reason, 'skill_absent',
    `block audit must have reason skill_absent; got: ${JSON.stringify(blockAudit.entries[0].reason)}`)

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

// G4/G5 completion guard — only engaged when stateReader + projectSlug are supplied ————

const FW_CONFIG = {
  agentSkills: {},
  phaseAgents: {
    DISCOVER: { specialist: 'backlog-discoverer', reviewer: 'backlog-discoverer-reviewer' },
    DELIVER: { specialist: 'software-engineer', reviewer: 'software-engineer-reviewer' }
  },
  agentArtifacts: {
    'backlog-discoverer': { inputs: [], outputs: ['research/{date}/triage.md'] },
    'backlog-discoverer-reviewer': { inputs: [], outputs: ['reviews/{date}/discover-review-{N}.md'] },
    'software-engineer': { inputs: [], outputs: ['Source code commits (conventional commits)'] }
  }
}

const noSkillTranscriptFactory = () => ({ read: async () => '' })

const pipelineState = (overrides = {}) => ({
  currentPhase: 'DISCOVER',
  phasesCompleted: [],
  verdicts: {},
  retryCount: {},
  phaseArtifacts: {},
  reviewArtifacts: {},
  ...overrides
})

test('G4: allows when agent is not the current phase specialist/reviewer (nothing to complete)', async () => {
  const audit = collectingWriter()
  const stateReader = { read: async () => pipelineState({ currentPhase: 'DELIVER' }) }
  const service = createSubagentStopService({
    config: FW_CONFIG, transcriptReaderFactory: noSkillTranscriptFactory, auditWriter: audit, clock, stateReader
  })
  const result = await service.handle({ agentName: 'backlog-discoverer', transcript: '', projectSlug: 'us8' })
  assert.equal(result.decision, 'allow')
  assert.equal(audit.entries.length, 0)
})

test('G4: blocks when the current phase specialist finished without its expected artifact recorded', async () => {
  const audit = collectingWriter()
  const stateReader = { read: async () => pipelineState({ currentPhase: 'DISCOVER', phaseArtifacts: {} }) }
  const service = createSubagentStopService({
    config: FW_CONFIG, transcriptReaderFactory: noSkillTranscriptFactory, auditWriter: audit, clock, stateReader
  })
  const result = await service.handle({ agentName: 'backlog-discoverer', transcript: '', projectSlug: 'us8' })
  assert.equal(result.decision, 'block')
  assert.match(result.message, /missing expected artifact/)
  assert.equal(audit.entries[0].reason, 'artifact_missing')
})

test('G4: allows when the expected artifact was recorded', async () => {
  const audit = collectingWriter()
  const stateReader = { read: async () => pipelineState({ currentPhase: 'DISCOVER', phaseArtifacts: { DISCOVER: ['research/2026-07-02/triage.md'] } }) }
  const service = createSubagentStopService({
    config: FW_CONFIG, transcriptReaderFactory: noSkillTranscriptFactory, auditWriter: audit, clock, stateReader
  })
  const result = await service.handle({ agentName: 'backlog-discoverer', transcript: '', projectSlug: 'us8' })
  assert.equal(result.decision, 'allow')
  assert.equal(audit.entries[0].reason, 'complete')
})

test('G5: blocks when the reviewer verdict recorded in state does not match the review file on disk', async () => {
  const audit = collectingWriter()
  const stateReader = {
    read: async () => pipelineState({
      currentPhase: 'DISCOVER',
      verdicts: { DISCOVER: 'APPROVED' },
      reviewArtifacts: { DISCOVER: ['reviews/2026-07-02/discover-review-1.md'] }
    })
  }
  const filesystem = { readFile: async () => '**Verdict:** NEEDS_REWORK\n' }
  const service = createSubagentStopService({
    config: FW_CONFIG, transcriptReaderFactory: noSkillTranscriptFactory, auditWriter: audit, clock, stateReader, filesystem
  })
  const result = await service.handle({ agentName: 'backlog-discoverer-reviewer', transcript: '', projectSlug: 'us8' })
  assert.equal(result.decision, 'block')
  assert.equal(audit.entries[0].reason, 'verdict_mismatch')
})

test('G5: allows when the reviewer verdict on disk matches the recorded verdict', async () => {
  const audit = collectingWriter()
  const stateReader = {
    read: async () => pipelineState({
      currentPhase: 'DISCOVER',
      verdicts: { DISCOVER: 'APPROVED' },
      reviewArtifacts: { DISCOVER: ['reviews/2026-07-02/discover-review-1.md'] }
    })
  }
  const filesystem = { readFile: async () => '**Verdict:** APPROVED\n' }
  const service = createSubagentStopService({
    config: FW_CONFIG, transcriptReaderFactory: noSkillTranscriptFactory, auditWriter: audit, clock, stateReader, filesystem
  })
  const result = await service.handle({ agentName: 'backlog-discoverer-reviewer', transcript: '', projectSlug: 'us8' })
  assert.equal(result.decision, 'allow')
  assert.equal(audit.entries[0].reason, 'complete')
})

test('G5: DELIVER blocks without a commitVerifier port wired', async () => {
  const audit = collectingWriter()
  const stateReader = { read: async () => pipelineState({ currentPhase: 'DELIVER' }) }
  const service = createSubagentStopService({
    config: FW_CONFIG, transcriptReaderFactory: noSkillTranscriptFactory, auditWriter: audit, clock, stateReader
  })
  const result = await service.handle({ agentName: 'software-engineer', transcript: '', projectSlug: 'us8' })
  assert.equal(result.decision, 'block')
  assert.equal(audit.entries[0].reason, 'commit_verifier_unavailable')
})

test('G5: DELIVER blocks when the git working tree is not clean', async () => {
  const audit = collectingWriter()
  const stateReader = { read: async () => pipelineState({ currentPhase: 'DELIVER' }) }
  const commitVerifier = { verify: async () => ({ clean: false, headSha: '0'.repeat(40) }) }
  const service = createSubagentStopService({
    config: FW_CONFIG, transcriptReaderFactory: noSkillTranscriptFactory, auditWriter: audit, clock, stateReader, commitVerifier
  })
  const result = await service.handle({ agentName: 'software-engineer', transcript: '', projectSlug: 'us8' })
  assert.equal(result.decision, 'block')
  assert.equal(audit.entries[0].reason, 'commit_unverified')
})

test('G5: DELIVER allows when the git commit is verified clean', async () => {
  const audit = collectingWriter()
  const stateReader = { read: async () => pipelineState({ currentPhase: 'DELIVER' }) }
  const commitVerifier = { verify: async () => ({ clean: true, headSha: '0'.repeat(40) }) }
  const service = createSubagentStopService({
    config: FW_CONFIG, transcriptReaderFactory: noSkillTranscriptFactory, auditWriter: audit, clock, stateReader, commitVerifier
  })
  const result = await service.handle({ agentName: 'software-engineer', transcript: '', projectSlug: 'us8' })
  assert.equal(result.decision, 'allow')
  assert.equal(audit.entries[0].reason, 'complete')
})

test('G4/G5: fail-closed — blocks when recorded pipeline state cannot be read', async () => {
  const audit = collectingWriter()
  const stateReader = { read: async () => { throw new Error('ENOENT') } }
  const service = createSubagentStopService({
    config: FW_CONFIG, transcriptReaderFactory: noSkillTranscriptFactory, auditWriter: audit, clock, stateReader
  })
  const result = await service.handle({ agentName: 'software-engineer', transcript: '', projectSlug: 'us8' })
  assert.equal(result.decision, 'block')
  assert.equal(audit.entries[0].reason, 'state_unreadable')
})

test('G4/G5: fail-closed — blocks when recorded pipeline state is invalid', async () => {
  const audit = collectingWriter()
  const stateReader = { read: async () => ({ currentPhase: '' }) }
  const service = createSubagentStopService({
    config: FW_CONFIG, transcriptReaderFactory: noSkillTranscriptFactory, auditWriter: audit, clock, stateReader
  })
  const result = await service.handle({ agentName: 'software-engineer', transcript: '', projectSlug: 'us8' })
  assert.equal(result.decision, 'block')
  assert.equal(audit.entries[0].reason, 'state_invalid')
})

test('G4/G5: skips completion check entirely when stateReader is not wired', async () => {
  const audit = collectingWriter()
  const service = createSubagentStopService({ config: FW_CONFIG, transcriptReaderFactory: noSkillTranscriptFactory, auditWriter: audit, clock })
  const result = await service.handle({ agentName: 'software-engineer', transcript: '', projectSlug: 'us8' })
  assert.equal(result.decision, 'allow')
  assert.equal(audit.entries.length, 0)
})

test('G4/G5: skips completion check entirely when projectSlug is not given', async () => {
  const audit = collectingWriter()
  const stateReader = { read: async () => pipelineState({ currentPhase: 'DELIVER' }) }
  const service = createSubagentStopService({ config: FW_CONFIG, transcriptReaderFactory: noSkillTranscriptFactory, auditWriter: audit, clock, stateReader })
  const result = await service.handle({ agentName: 'software-engineer', transcript: '' })
  assert.equal(result.decision, 'allow')
  assert.equal(audit.entries.length, 0)
})

test('G4/G5: fail-closed — blocks on a malformed projectSlug (directory-traversal guard)', async () => {
  const audit = collectingWriter()
  const stateReader = { read: async () => { throw new Error('must not be called') } }
  const service = createSubagentStopService({
    config: FW_CONFIG, transcriptReaderFactory: noSkillTranscriptFactory, auditWriter: audit, clock, stateReader
  })
  const result = await service.handle({ agentName: 'software-engineer', transcript: '', projectSlug: '../../etc' })
  assert.equal(result.decision, 'block')
  assert.equal(audit.entries[0].reason, 'invalid_project_slug')
})

test('G2 skill block takes priority over G4/G5: a missing skill still blocks even with a passing completion state', async () => {
  const audit = collectingWriter()
  const stateReader = { read: async () => pipelineState({ currentPhase: 'DISCOVER', phaseArtifacts: { DISCOVER: ['research/2026-07-02/triage.md'] } }) }
  const service = createSubagentStopService({
    config: CONFIG, transcriptReaderFactory: stringTranscriptReaderFactory, auditWriter: audit, clock, stateReader
  })
  const result = await service.handle({ agentName: 'acceptance-designer', transcript: 'no skills here', projectSlug: 'us8' })
  assert.equal(result.decision, 'block')
  assert.ok(result.message.startsWith('Mandatory skill not loaded'))
})

