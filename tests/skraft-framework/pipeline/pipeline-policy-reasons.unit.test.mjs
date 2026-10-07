import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateDispatch,
  evaluateDispatchProvenance,
  isPipelineAgent,
} from '../../../plugins/skraft-framework/src/domain/pipeline-policy.mjs'

const CONFIG = {
  phaseOrder: ['RESEARCH', 'DESIGN'],
  phaseAgents: {
    RESEARCH: { specialist: 'researcher', reviewer: null },
    DESIGN: { specialist: 'architect', reviewer: 'architect-reviewer' },
  },
}

const at = (currentPhase, overrides = {}) => ({ currentPhase, specialistDone: false, reviewerVerdict: null, ...overrides })

test('isPipelineAgent: true for a declared specialist or reviewer', () => {
  assert.equal(isPipelineAgent('researcher', CONFIG), true)
  assert.equal(isPipelineAgent('architect-reviewer', CONFIG), true)
  assert.equal(isPipelineAgent('lens', CONFIG), false)
})

test('evaluateDispatch: an ungoverned agent carries its reason', () => {
  assert.deepEqual(evaluateDispatch('lens', at('DESIGN'), CONFIG), {
    ok: true,
    value: {
      requestedAgent: 'lens',
      expectedAgent: null,
      stage: 'UNGOVERNED',
      reason: 'lens is not a pipeline phase agent; dispatch is not governed by phase order',
    },
  })
})

test('evaluateDispatch: a DONE pipeline refuses every phase agent with its reason', () => {
  assert.deepEqual(evaluateDispatch('architect', at('DONE'), CONFIG).error, {
    code: 'PIPELINE_COMPLETE',
    requestedAgent: 'architect',
    expectedAgent: null,
    reason: 'the pipeline is DONE; no phase agent runs',
  })
})

test('evaluateDispatch: an ordered phase with no agents declared is an invalid state', () => {
  const config = { phaseOrder: ['A', 'B'], phaseAgents: { B: { specialist: 'b-agent' } } }
  assert.deepEqual(evaluateDispatch('b-agent', at('A'), config).error, {
    code: 'INVALID_STATE',
    requestedAgent: 'b-agent',
    expectedAgent: null,
    reason: 'phase A is not in the published phase order',
  })
})

const ALIASES = {
  agentAliases: {
    'skraft:architect': 'architect',
    architect: 'architect',
    engineer: 'engineer',
    researcher: 'researcher',
  },
}

test('evaluateDispatchProvenance: without a config the caller is not judged', () => {
  assert.deepEqual(evaluateDispatchProvenance('architect', 'engineer', undefined), { ok: true, value: { reason: 'caller not judged' } })
})

test('evaluateDispatchProvenance: a known caller with no requested agent is not judged', () => {
  const config = { ...ALIASES, agentDispatchers: { engineer: 'researcher' } }
  assert.deepEqual(evaluateDispatchProvenance('architect', undefined, config), { ok: true, value: { reason: 'caller not judged' } })
  assert.deepEqual(evaluateDispatchProvenance('architect', '', config), { ok: true, value: { reason: 'caller not judged' } })
})

test('evaluateDispatchProvenance: an agent dispatched by the pipeline is refused to every caller', () => {
  const config = { ...ALIASES, agentDispatchers: { engineer: 'skraft-pipeline' } }
  assert.deepEqual(evaluateDispatchProvenance('architect', 'engineer', config), {
    ok: false,
    error: {
      code: 'PIPELINE_DISPATCH',
      reason: 'engineer is dispatched by the SKRAFT pipeline, which runs as code: start or resume it (the skraft-pipeline workflow, /skraft <slug>) instead of dispatching a phase agent yourself',
    },
  })
})

test('evaluateDispatchProvenance: a declared or undeclared dispatcher passes with its reason', () => {
  const config = { ...ALIASES, agentDispatchers: { engineer: 'skraft:architect' } }
  assert.deepEqual(evaluateDispatchProvenance('architect', 'engineer', config), { ok: true, value: { reason: 'declared dispatch' } })
  assert.deepEqual(evaluateDispatchProvenance('architect', 'researcher', config), { ok: true, value: { reason: 'declared dispatch' } })
})
