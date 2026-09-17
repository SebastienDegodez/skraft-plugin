import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canonicalAgentName,
  companionInstructionsFor,
} from '../../../plugins/skraft-framework/src/domain/instruction-policy.mjs'

const CONFIG = {
  agentAliases: {
    'skraft-orchestrator': 'Skraft - Orchestrator',
    'Skraft - Orchestrator': 'Skraft - Orchestrator',
  },
  agentInstructions: {
    'Skraft - Orchestrator': ['com.github.copilot/rules/skraft-state.instructions.md'],
  },
}

test('instruction policy resolves filename, display and plugin-prefixed identities', () => {
  assert.equal(canonicalAgentName('skraft-orchestrator', CONFIG), 'Skraft - Orchestrator')
  assert.equal(canonicalAgentName('Skraft - Orchestrator', CONFIG), 'Skraft - Orchestrator')
  assert.equal(canonicalAgentName('skraft:skraft-orchestrator', CONFIG), 'Skraft - Orchestrator')
})

test('instruction policy returns a defensive copy of declared instructions', () => {
  const instructions = companionInstructionsFor('skraft:skraft-orchestrator', CONFIG)
  assert.deepEqual(instructions, ['com.github.copilot/rules/skraft-state.instructions.md'])
  instructions.push('tamper')
  assert.equal(CONFIG.agentInstructions['Skraft - Orchestrator'].length, 1)
})

test('instruction policy is empty for missing identities or declarations', () => {
  assert.deepEqual(companionInstructionsFor(undefined, CONFIG), [])
  assert.deepEqual(companionInstructionsFor('unknown', CONFIG), [])
})

test('instruction policy never borrows SKRAFT aliases from foreign namespaces', () => {
  for (const identity of ['other:skraft-orchestrator', 'other:skraft:skraft-orchestrator', 'skraft:other:skraft-orchestrator']) {
    assert.deepEqual(companionInstructionsFor(identity, CONFIG), [])
  }
  assert.equal(canonicalAgentName('other:skraft-orchestrator', CONFIG), 'other:skraft-orchestrator')
  assert.equal(canonicalAgentName('skraft:Skraft - Orchestrator', CONFIG), 'Skraft - Orchestrator')
  assert.equal(canonicalAgentName('skraft:software-engineer', {}), 'software-engineer')
})
