// Unit — how the Claude Code mod names the caller of a tool call for G8, from what the mods
// engine says: the call's loop (agentId, absent on the main loop), $.agent.list() (id, type,
// parentId, spawnedBy) and the main loop's agent type under --agent. The mod itself is run
// in the engine by `claude plugin test` (hooks/skraft-mod.test.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { callerChain, lastSegment } from '../../../plugins/skraft-framework/src/adapters/infrastructure/claude-code-mod/mod-helpers.mjs'

const AGENTS = [
  { id: 'se', type: 'skraft:software-engineer', spawnedBy: 'skraft' },
  { id: 'w1', type: 'skraft:contract-testing-worker', parentId: 'se' },
  { id: 'ex', type: 'Explore', parentId: 'w1' },
  { id: 'gp', type: 'general-purpose' },
  { id: 'lost', type: 'general-purpose', parentId: 'gone' },
  { id: 'loop-a', type: 'a', parentId: 'loop-b' },
  { id: 'loop-b', type: 'b', parentId: 'loop-a' },
]

test('the main loop is its --agent type, or no agent', () => {
  assert.deepEqual(callerChain({ mainAgent: 'skraft:skraft-orchestrator' }), { chain: ['skraft:skraft-orchestrator'] })
  for (const mainAgent of [null, undefined, '']) assert.deepEqual(callerChain({ mainAgent }), { chain: [] })
  assert.deepEqual(callerChain(), { chain: [] })
})

test('a subagent is its type, then its spawners up to one the pipeline spawned', () => {
  const args = { agents: AGENTS, mainAgent: 'skraft:skraft-orchestrator', pluginName: 'skraft' }
  assert.deepEqual(callerChain({ ...args, agentId: 'se' }), { chain: ['skraft:software-engineer'] })
  assert.deepEqual(callerChain({ ...args, agentId: 'ex' }), { chain: ['Explore', 'skraft:contract-testing-worker', 'skraft:software-engineer'] })
})

test('a subagent the main loop spawned answers to the main loop\'s agent', () => {
  assert.deepEqual(callerChain({ agentId: 'gp', agents: AGENTS, mainAgent: 'skraft:skraft-orchestrator', pluginName: 'skraft' }), { chain: ['general-purpose', 'skraft:skraft-orchestrator'] })
  assert.deepEqual(callerChain({ agentId: 'se', agents: AGENTS, mainAgent: 'skraft:skraft-orchestrator' }), { chain: ['skraft:software-engineer', 'skraft:skraft-orchestrator'] }, 'without the plugin name, nothing marks the pipeline\'s spawns')
})

test('a parent the engine no longer lists ends the chain; a cycle is read once', () => {
  assert.deepEqual(callerChain({ agentId: 'lost', agents: AGENTS, mainAgent: 'm' }), { chain: ['general-purpose'] })
  assert.deepEqual(callerChain({ agentId: 'loop-a', agents: AGENTS }), { chain: ['a', 'b'] })
})

test('an agentId the engine does not list is an unidentified caller', () => {
  assert.equal(callerChain({ agentId: 'workflow-agent', agents: AGENTS }), null)
  assert.equal(callerChain({ agentId: 'x', agents: 'not a list' }), null)
})

test('lastSegment names the tracking directory, whatever the separator', () => {
  assert.equal(lastSegment('/repo/.copilot-tracking/skraft-plans'), 'skraft-plans')
  assert.equal(lastSegment('C:\\repo\\plans\\'), 'plans')
  assert.equal(lastSegment(undefined), '')
})
