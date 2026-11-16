import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { findShippedWorkflows } from '../../../eng/lib/shipped-workflows.mjs'

// Regression guard for the product/engineering layer separation. Pins the SHAPE of the
// shipped pipeline so a future workflow edit cannot silently re-merge the product layer
// (backlog discovery / refinement) back into the engineering pipeline.
const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const pipeline = findShippedWorkflows(root).find((workflow) => workflow.entry)

test('layer separation: the pipeline is RESEARCH -> DESIGN -> DISTILL -> DELIVER -> PUBLISH', () => {
  assert.equal(pipeline.pluginDir, 'skraft-framework')
  assert.deepEqual(pipeline.phases.map(({ phase }) => phase), ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER', 'PUBLISH'])
})

test('layer separation: DISCOVER / DISCUSS are NOT engineering phases', () => {
  const phases = pipeline.phases.map(({ phase }) => phase)
  assert.ok(!phases.includes('DISCOVER'))
  assert.ok(!phases.includes('DISCUSS'))
})

test('layer separation: RESEARCH dispatches the researcher first', () => {
  assert.deepEqual(pipeline.phases[0], { phase: 'RESEARCH', specialist: 'solution-researcher' })
})

test('layer separation: no shipped workflow names a backlog (product-layer) agent', () => {
  for (const workflow of findShippedWorkflows(root)) {
    assert.ok(!workflow.agents.some((id) => id.startsWith('backlog-')), `${workflow.path} must not name a backlog agent`)
  }
})
