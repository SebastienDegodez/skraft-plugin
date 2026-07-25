import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Regression guard for the product/engineering layer separation. Pins the SHAPE of the
// committed framework config so a future frontmatter edit cannot silently re-merge the
// product layer (backlog discovery / refinement) back into the engineering orchestrator.
const here = dirname(fileURLToPath(import.meta.url))
const configPath = join(here, '../..', 'plugins/skraft-framework.config.json')
const config = JSON.parse(readFileSync(configPath, 'utf8'))

test('layer separation: orchestrator pipeline is RESEARCH -> DESIGN -> DISTILL -> DELIVER', () => {
  assert.deepEqual(config.phaseOrder, ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER'])
})

test('layer separation: DISCOVER / DISCUSS are NOT engineering phases', () => {
  assert.ok(!config.phaseOrder.includes('DISCOVER'))
  assert.ok(!config.phaseOrder.includes('DISCUSS'))
})

test('layer separation: RESEARCH has a specialist and NO reviewer (evidence is citation-verifiable, not adversarially reviewed)', () => {
  assert.deepEqual(config.phaseAgents.RESEARCH, {
    specialist: 'Skraft - Solution Researcher',
    reviewer: null,
  })
})

test('layer separation: no phase agent is a backlog (product-layer) agent', () => {
  const wired = JSON.stringify(config.phaseAgents).toLowerCase()
  assert.ok(!wired.includes('backlog'), 'backlog agents must not appear in phaseAgents')
})

test('layer separation: backlog agents still exist as standalone product agents', () => {
  // They remain in the agent catalogue (agentSkills) — just no longer pipeline-dispatched.
  for (const a of [
    'Skraft - Backlog Discoverer',
    'Skraft - Backlog Discoverer Reviewer',
    'Skraft - Backlog Planner',
    'Skraft - Backlog Planner Reviewer',
  ]) {
    assert.ok(a in config.agentSkills, `${a} should still be a known agent`)
  }
})

test('layer separation: the RESEARCH specialist declares a research output and no reviewer agent exists in the catalogue', () => {
  const specialist = config.agentArtifacts['Skraft - Solution Researcher']
  assert.ok(specialist.outputs.some((o) => o.includes('research/')), 'researcher writes a research doc')
  assert.ok(!('Skraft - Solution Researcher Reviewer' in config.agentSkills), 'no reviewer agent for RESEARCH')
})
