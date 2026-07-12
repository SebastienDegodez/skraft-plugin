import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  STATE_SCHEMA,
  STATE_FIELDS,
  INVARIANT_FIELDS,
  validatePipelineState,
} from '../../plugins/src/domain/state-schema.mjs'
import { isOk } from '../../plugins/src/domain/result.mjs'

// SoC (#15): the schema of state.json has ONE authority — STATE_SCHEMA in
// plugins/src/domain/state-schema.mjs. The prose instructions document the same fields;
// this test fails the build if the two diverge, so drift is impossible.
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '../..')
const instructionsPath = join(repoRoot, 'plugins/instructions/skraft-state.instructions.md')

// Extract the top-level field names from the ```json``` block under the `## Schema` heading.
const instructionSchemaFields = () => {
  const md = readFileSync(instructionsPath, 'utf8')
  const match = md.match(/^## Schema[\s\S]*?```json\r?\n([\s\S]*?)\r?\n```/m)
  assert.ok(match, 'skraft-state.instructions.md must contain a ```json``` schema block under `## Schema`')
  return Object.keys(JSON.parse(match[1]))
}

test('SoC: instructions schema block lists exactly the STATE_SCHEMA fields', () => {
  const documented = instructionSchemaFields().sort()
  const canonical = [...STATE_FIELDS].sort()
  assert.deepEqual(
    documented,
    canonical,
    'plugins/instructions/skraft-state.instructions.md schema block has drifted from STATE_SCHEMA ' +
      '(plugins/src/domain/state-schema.mjs). Update the instruction JSON block or STATE_SCHEMA so the ' +
      'two agree — the code descriptor is the single source of truth.'
  )
})

test('SoC: STATE_SCHEMA is the single authority — invariant subset matches validatePipelineState', () => {
  // validatePipelineState normalizes exactly the invariant-owned fields. Feeding a raw
  // object with every field undefined, the coerced (non-undefined) keys it produces must
  // equal INVARIANT_FIELDS, tying the code's behaviour to the STATE_SCHEMA descriptor.
  const result = validatePipelineState({ currentPhase: 'DISCOVER' })
  assert.ok(isOk(result))
  const normalized = Object.keys(result.value).filter((k) => result.value[k] !== undefined)
  assert.deepEqual(
    normalized.sort(),
    [...INVARIANT_FIELDS].sort(),
    'validatePipelineState no longer normalizes exactly the invariant-owned fields declared in STATE_SCHEMA'
  )
})

test('SoC: every STATE_SCHEMA field declares a known owner', () => {
  for (const field of STATE_FIELDS) {
    assert.ok(
      ['invariant', 'orchestrator'].includes(STATE_SCHEMA[field].owner),
      `STATE_SCHEMA.${field} must declare owner 'invariant' or 'orchestrator'`
    )
  }
})
