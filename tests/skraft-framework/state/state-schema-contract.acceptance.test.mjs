import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  STATE_SCHEMA,
  STATE_FIELDS,
  INVARIANT_FIELDS,
  validatePipelineState,
} from '../../../plugins/skraft-framework/src/domain/state-schema.mjs'
import { isOk } from '../../../plugins/skraft-framework/src/domain/result.mjs'
import { closeAllPhases, gitRepo, stateCli } from './phase-closure-fixture.mjs'

// state.schema.json is the contract of state.json; STATE_SCHEMA and validatePipelineState
// enforce it. These tests fail the build when the two disagree.
const schemaUrl = new URL('../../../plugins/skraft-framework/src/domain/state.schema.json', import.meta.url)
const schema = JSON.parse(readFileSync(schemaUrl, 'utf8'))

// ajv is a dev dependency of the framework package, resolved from its node_modules.
const requireFromFramework = createRequire(new URL('../../../plugins/skraft-framework/src/package.json', import.meta.url))
const Ajv2020 = requireFromFramework('ajv/dist/2020').default
const ajv = new Ajv2020({ allErrors: true })
ajv.addKeyword({ keyword: 'x-owner', schemaType: 'string' })
const validateAgainstSchema = ajv.compile(schema)

const schemaErrors = (state) => (validateAgainstSchema(state) ? [] : validateAgainstSchema.errors)

const withTrackingRoot = async (fn) => {
  const root = await mkdtemp(join(tmpdir(), 'skraft-schema-'))
  try { await fn(root) } finally { await rm(root, { recursive: true, force: true }) }
}

const readState = async (root, slug) => JSON.parse(await readFile(join(root, slug, 'state.json'), 'utf8'))

test('the schema declares exactly the STATE_SCHEMA fields', () => {
  assert.deepEqual(Object.keys(schema.properties).sort(), [...STATE_FIELDS].sort())
})

test('each schema field declares the owner STATE_SCHEMA gives it', () => {
  for (const field of STATE_FIELDS) {
    assert.equal(schema.properties[field]['x-owner'], STATE_SCHEMA[field].owner, field)
  }
})

test('every STATE_SCHEMA field declares a known owner', () => {
  for (const field of STATE_FIELDS) {
    assert.ok(['invariant', 'orchestrator'].includes(STATE_SCHEMA[field].owner), field)
  }
})

test('validatePipelineState normalizes exactly the invariant-owned fields', () => {
  const result = validatePipelineState({ currentPhase: 'DESIGN' })
  assert.ok(isOk(result))
  const normalized = Object.keys(result.value).filter((key) => result.value[key] !== undefined)
  assert.deepEqual(normalized.sort(), [...INVARIANT_FIELDS].sort())
})

test('a freshly initialized state writes every field and matches the schema', async () => {
  await withTrackingRoot(async (root) => {
    stateCli({ root })('init', '--slug', 'demo')
    const state = await readState(root, 'demo')
    assert.deepEqual(Object.keys(state).sort(), [...STATE_FIELDS].sort())
    assert.deepEqual(schemaErrors(state), [])
  })
})

test('a pipeline closed to DONE through the CLI still matches the schema', async () => {
  await withTrackingRoot(async (root) => {
    const repo = join(root, 'repo')
    const commits = gitRepo(repo)
    const cli = stateCli({ root, cwd: repo })
    cli('init', '--slug', 'demo')
    cli('incr-rework', '--slug', 'demo', '--phase', 'RESEARCH', '--findings', '2')
    closeAllPhases({ root, slug: 'demo', cli, repo: commits })
    const state = await readState(root, 'demo')
    assert.equal(state.currentPhase, 'DONE')
    assert.deepEqual(schemaErrors(state), [])
  })
})

test('the schema rejects an unknown field, a verdict outside its values and a flat artefact list', () => {
  const rejected = [
    { currentPhase: 'DESIGN', reviewerVerdicts: { RESEARCH: 'APPROVED' } },
    { currentPhase: 'DESIGN', verdicts: { RESEARCH: 'NEEDS_REWORK' } },
    { currentPhase: 'DESIGN', reviewArtifacts: ['reviews/2026-09-24/design-review-1.md'] },
  ]
  for (const state of rejected) {
    assert.notDeepEqual(schemaErrors(state), [], JSON.stringify(state))
  }
})
