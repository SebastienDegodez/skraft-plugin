import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canonicalAgentName,
} from '../../../plugins/skraft-framework/src/domain/instruction-policy.mjs'

const CONFIG = {
  agentAliases: {
    'skraft-orchestrator': 'Skraft - Orchestrator',
    'Skraft - Orchestrator': 'Skraft - Orchestrator',
  },
}

test('instruction policy resolves filename, display and plugin-prefixed identities', () => {
  assert.equal(canonicalAgentName('skraft-orchestrator', CONFIG), 'Skraft - Orchestrator')
  assert.equal(canonicalAgentName('Skraft - Orchestrator', CONFIG), 'Skraft - Orchestrator')
  assert.equal(canonicalAgentName('skraft:skraft-orchestrator', CONFIG), 'Skraft - Orchestrator')
})

test('instruction policy never borrows SKRAFT aliases from foreign namespaces', () => {
  for (const identity of ['other:skraft-orchestrator', 'other:skraft:skraft-orchestrator']) {
    assert.equal(canonicalAgentName(identity, CONFIG), identity)
  }
  assert.equal(canonicalAgentName('other:skraft-orchestrator', CONFIG), 'other:skraft-orchestrator')
  assert.equal(canonicalAgentName('skraft:Skraft - Orchestrator', CONFIG), 'Skraft - Orchestrator')
  assert.equal(canonicalAgentName('skraft:software-engineer', {}), 'software-engineer')
})

test('canonicalAgentName: resolves the plugin-scoped agent_type Claude Code reports', () => {
  const config = { agentAliases: { 'software-engineer': 'Skraft - Software Engineer' } }
  assert.equal(canonicalAgentName('plugin:skraft:software-engineer', config), 'Skraft - Software Engineer')
  assert.equal(canonicalAgentName('skraft:software-engineer', config), 'Skraft - Software Engineer')
  assert.equal(canonicalAgentName('plugin:other:software-engineer', config), 'plugin:other:software-engineer')
})
