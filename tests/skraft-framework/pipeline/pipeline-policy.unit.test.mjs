import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateDispatch,
  evaluateDispatchProvenance,
  isPipelineAgent,
  nextPhaseAfter,
  phaseRoleOf,
} from '../../../plugins/skraft-framework/src/domain/pipeline-policy.mjs'

// Inner-loop tests for the dispatch policy branches the acceptance suite cannot reach
// through the state CLI (malformed config, reviewer-less phases, every stage name).
const CONFIG = {
  phaseOrder: ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER'],
  phaseAgents: {
    RESEARCH: { specialist: 'solution-researcher', reviewer: null },
    DESIGN: { specialist: 'solution-architect', reviewer: 'solution-architect-reviewer' },
    DISTILL: { specialist: 'acceptance-designer', reviewer: 'acceptance-designer-reviewer' },
    DELIVER: { specialist: 'software-engineer', reviewer: 'software-engineer-reviewer' },
  },
}

const at = (currentPhase, overrides = {}) => ({
  currentPhase, specialistDone: false, reviewerVerdict: null, retries: 0, maxRetries: 2, ...overrides,
})

// ─── nextPhaseAfter / phaseRoleOf / isPipelineAgent ────────────────────────────

test('nextPhaseAfter: follows the published order and ends with null', () => {
  assert.equal(nextPhaseAfter('RESEARCH', CONFIG), 'DESIGN')
  assert.equal(nextPhaseAfter('DISTILL', CONFIG), 'DELIVER')
  assert.equal(nextPhaseAfter('DELIVER', CONFIG), null)
})

test('phaseRoleOf: locates specialists and reviewers, and nothing else', () => {
  assert.deepEqual(phaseRoleOf('solution-researcher', CONFIG), { phase: 'RESEARCH', role: 'specialist' })
  assert.deepEqual(phaseRoleOf('acceptance-designer-reviewer', CONFIG), { phase: 'DISTILL', role: 'reviewer' })
  assert.equal(phaseRoleOf('contract-testing-worker', CONFIG), null)
  assert.equal(phaseRoleOf(undefined, CONFIG), null)
})

test('isPipelineAgent: survives a config without phaseAgents or with a phase missing', () => {
  assert.equal(isPipelineAgent('solution-architect', { phaseOrder: ['DESIGN'] }), false)
  assert.equal(isPipelineAgent('solution-architect', { phaseOrder: ['DESIGN'], phaseAgents: {} }), false)
  assert.equal(isPipelineAgent('solution-architect', {}), false)
})

// ─── evaluateDispatch ───────────────────────────────────────────────────────────

test('evaluateDispatch: an ungoverned agent is allowed whatever the phase', () => {
  const r = evaluateDispatch('cold-reader-lens', at('DONE'), CONFIG)
  assert.equal(r.ok, true)
  assert.equal(r.value.stage, 'UNGOVERNED')
  assert.equal(r.value.expectedAgent, null)
})

test('evaluateDispatch: names each conforming stage', () => {
  const stageOf = (agent, state) => evaluateDispatch(agent, state, CONFIG).value.stage
  assert.equal(stageOf('solution-architect', at('DESIGN')), 'SPECIALIST')
  assert.equal(stageOf('solution-architect', at('DESIGN', { specialistDone: true, reviewerVerdict: 'CHANGES_REQUESTED' })), 'RETRY')
  assert.equal(stageOf('solution-architect', at('DESIGN', { specialistDone: true, reviewerVerdict: 'APPROVED' })), 'SPECIALIST')
  assert.equal(stageOf('solution-architect-reviewer', at('DESIGN', { specialistDone: true })), 'REVIEWER')
})

test('evaluateDispatch: an allowed dispatch reports the configured agent for its role', () => {
  const r = evaluateDispatch('solution-architect-reviewer', at('DESIGN', { specialistDone: true }), CONFIG)
  assert.equal(r.value.expectedAgent, 'solution-architect-reviewer')
  assert.equal(r.value.reason, 'solution-architect-reviewer runs as DESIGN reviewer')
})

test('evaluateDispatch: an agent of another phase is out of order and names the pending step', () => {
  const r = evaluateDispatch('software-engineer', at('DESIGN'), CONFIG)
  assert.equal(r.error.code, 'OUT_OF_ORDER')
  assert.equal(r.error.expectedAgent, 'solution-architect')
  assert.equal(
    r.error.reason,
    'out-of-order dispatch of software-engineer: it belongs to DELIVER while DESIGN is open; DESIGN must run its specialist (solution-architect) first',
  )
})

test('evaluateDispatch: after the reviewer approved, the next phase waits for the transition', () => {
  const r = evaluateDispatch('acceptance-designer', at('DESIGN', { specialistDone: true, reviewerVerdict: 'APPROVED' }), CONFIG)
  assert.equal(r.error.expectedAgent, null)
  assert.match(r.error.reason, /DESIGN must advance it with state\.mjs transition first$/)
})

test('evaluateDispatch: after the specialist recorded an artefact, the next phase waits for the reviewer', () => {
  const r = evaluateDispatch('acceptance-designer', at('DESIGN', { specialistDone: true }), CONFIG)
  assert.equal(r.error.expectedAgent, 'solution-architect-reviewer')
  assert.match(r.error.reason, /DESIGN must run its reviewer \(solution-architect-reviewer\) first$/)
})

test('evaluateDispatch: a reviewer-less phase moves to its transition once the specialist recorded', () => {
  const r = evaluateDispatch('solution-architect', at('RESEARCH', { specialistDone: true }), CONFIG)
  assert.equal(r.error.expectedAgent, null)
  assert.match(r.error.reason, /RESEARCH must advance it with state\.mjs transition first$/)
})

test('evaluateDispatch: a reviewer before its specialist is out of order', () => {
  const r = evaluateDispatch('solution-architect-reviewer', at('DESIGN'), CONFIG)
  assert.equal(r.error.code, 'OUT_OF_ORDER')
  assert.match(r.error.reason, /its specialist has recorded no artefact yet/)
})

test('evaluateDispatch: DONE blocks every phase agent', () => {
  const r = evaluateDispatch('software-engineer', at('DONE'), CONFIG)
  assert.equal(r.error.code, 'PIPELINE_COMPLETE')
  assert.equal(r.error.expectedAgent, null)
})

test('evaluateDispatch: a phase outside the published order or without a specialist is invalid', () => {
  assert.equal(evaluateDispatch('software-engineer', at('DISCOVER'), CONFIG).error.code, 'INVALID_STATE')
  const noSpecialist = { ...CONFIG, phaseAgents: { ...CONFIG.phaseAgents, DESIGN: { specialist: 7, reviewer: 'solution-architect-reviewer' } } }
  const r = evaluateDispatch('solution-architect-reviewer', at('DESIGN'), noSpecialist)
  assert.equal(r.error.code, 'INVALID_STATE')
  assert.equal(r.error.reason, 'phase DESIGN is not in the published phase order')
})

// ─── evaluateDispatchProvenance ─────────────────────────────────────────────────

const TREE = {
  agentAliases: { lead: 'Lead', 'lead-reviewer': 'Lead Reviewer', lens: 'lens', Lead: 'Lead', 'Lead Reviewer': 'Lead Reviewer' },
  agentDispatchers: { 'Lead Reviewer': 'Lead', lens: 'lead-reviewer' },
}

test('evaluateDispatchProvenance: the declared tree passes, by id or display name', () => {
  assert.equal(evaluateDispatchProvenance('lead', 'lead-reviewer', TREE).ok, true)
  assert.equal(evaluateDispatchProvenance('Lead Reviewer', 'skraft:lens', TREE).ok, true)
})

test('evaluateDispatchProvenance: a known agent dispatching itself is refused', () => {
  const r = evaluateDispatchProvenance('skraft:lead', 'Lead', TREE)
  assert.equal(r.error.code, 'SELF_DISPATCH')
  assert.equal(r.error.reason, 'Lead dispatches itself; do the work, or dispatch the agent that owns it')
})

test('evaluateDispatchProvenance: a dispatch outside the declared tree names the declared dispatcher', () => {
  const r = evaluateDispatchProvenance('lead', 'lens', TREE)
  assert.equal(r.error.code, 'FOREIGN_DISPATCHER')
  assert.equal(r.error.reason, 'lens is dispatched by Lead Reviewer, not Lead')
})

test('evaluateDispatchProvenance: an unknown or absent caller, or an undeclared agent, is not judged', () => {
  assert.equal(evaluateDispatchProvenance(undefined, 'lens', TREE).ok, true)
  assert.equal(evaluateDispatchProvenance('general-purpose', 'lens', TREE).ok, true)
  assert.equal(evaluateDispatchProvenance('general-purpose', 'general-purpose', TREE).ok, true)
  assert.equal(evaluateDispatchProvenance('lens', 'Explore', TREE).ok, true)
  assert.equal(evaluateDispatchProvenance('lead', undefined, TREE).ok, true)
  assert.equal(evaluateDispatchProvenance('lead', 'lens', {}).ok, true)
})

test('evaluateDispatchProvenance: an agent with no right on src/ and tests/ starts no agent without a declared dispatcher', () => {
  const rights = {
    ...TREE,
    writeRights: {
      Lead: { role: 'specialist', phase: 'DELIVER', workspace: true },
      'Lead Reviewer': { role: 'reviewer', phase: 'DELIVER', files: [] },
      lens: { role: 'lens', phase: 'DELIVER', files: [] },
      Architect: { role: 'specialist', phase: 'DESIGN', workspace: false },
    },
  }
  for (const caller of ['lead-reviewer', 'skraft:lens', 'Architect']) {
    const r = evaluateDispatchProvenance(caller, 'general-purpose', { ...rights, agentAliases: { ...rights.agentAliases, Architect: 'Architect' } })
    assert.equal(r.error.code, 'UNDECLARED_DISPATCH', caller)
  }
  assert.equal(evaluateDispatchProvenance('lead-reviewer', 'general-purpose', rights).error.reason,
    'Lead Reviewer has no right on src/ or tests/ and starts only the agents the dispatch tree gives it; general-purpose declares no dispatcher: do the work yourself within your write rights')
  assert.equal(evaluateDispatchProvenance('lead', 'general-purpose', rights).ok, true, 'an agent with the workspace')
  assert.equal(evaluateDispatchProvenance('Lead Reviewer', 'skraft:lens', rights).ok, true, 'the declared tree')
})
