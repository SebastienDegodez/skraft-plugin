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
import {
  SUPPORTED_KEYWORDS,
  SUPPORTED_TYPES,
  schemaViolations,
} from '../../../plugins/skraft-framework/src/domain/schema-validator.mjs'
import { isOk } from '../../../plugins/skraft-framework/src/domain/result.mjs'
import { closeAllPhases, gitRepo, stateCli } from './phase-closure-fixture.mjs'

// state.schema.json is the contract of state.json and the runtime enforces it through
// schema-validator.mjs. ajv, a reference implementation, checks that enforcement.
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

// Every keyword and type the schema uses, found by walking it.
const keywordsAndTypes = (node, found = { keywords: new Set(), types: new Set() }) => {
  if (Array.isArray(node)) node.forEach((item) => keywordsAndTypes(item, found))
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return found
  for (const [key, value] of Object.entries(node)) {
    found.keywords.add(key)
    if (key === 'type') found.types.add(value)
    if (key === 'properties' || key === '$defs') Object.values(value).forEach((sub) => keywordsAndTypes(sub, found))
    else if (key !== 'enum' && key !== 'const' && key !== 'required') keywordsAndTypes(value, found)
  }
  return found
}

test('the schema uses only keywords and types the runtime validator enforces', () => {
  const { keywords, types } = keywordsAndTypes(schema)
  assert.deepEqual([...keywords].filter((keyword) => !SUPPORTED_KEYWORDS.includes(keyword)), [])
  assert.deepEqual([...types].filter((type) => !SUPPORTED_TYPES.includes(type)), [])
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

// One sample per rule of the schema, each on its own; the runtime and ajv must agree.
const SAMPLES = [
  { currentPhase: 'DESIGN' },
  { currentPhase: '' },
  { currentPhase: 7 },
  {},
  { currentPhase: 'DESIGN', unknown: true },
  { currentPhase: 'DESIGN', projectSlug: null },
  { currentPhase: 'DESIGN', projectSlug: '' },
  { currentPhase: 'DESIGN', phasesCompleted: ['RESEARCH'] },
  { currentPhase: 'DESIGN', phasesCompleted: [''] },
  { currentPhase: 'DESIGN', phasesCompleted: {} },
  { currentPhase: 'DESIGN', phaseArtifacts: { DESIGN: ['a.md'] } },
  { currentPhase: 'DESIGN', phaseArtifacts: { DESIGN: 'a.md' } },
  { currentPhase: 'DESIGN', phaseArtifacts: [] },
  { currentPhase: 'DESIGN', verdicts: { DESIGN: null, RESEARCH: 'APPROVED' } },
  { currentPhase: 'DESIGN', verdicts: { DESIGN: 'REJECTED' } },
  { currentPhase: 'DESIGN', retryCount: { DESIGN: 0 } },
  { currentPhase: 'DESIGN', retryCount: { DESIGN: -1 } },
  { currentPhase: 'DESIGN', retryCount: { DESIGN: 0.5 } },
  { currentPhase: 'DESIGN', phaseHistory: { DESIGN: { status: 'inProgress', startedAt: 't', baseSha: null } } },
  { currentPhase: 'DESIGN', phaseHistory: { DESIGN: { status: 'done', completedAt: 't', baseSha: 'abc' } } },
  { currentPhase: 'DESIGN', phaseHistory: { DESIGN: { startedAt: 't' } } },
  { currentPhase: 'DESIGN', phaseHistory: { DESIGN: { status: 'done', completedAt: null } } },
  { currentPhase: 'DESIGN', phaseHistory: { DESIGN: { status: 'done', note: 'x' } } },
  { currentPhase: 'DESIGN', userPreferences: { maxRetriesPerPhase: 3 } },
  { currentPhase: 'DESIGN', userPreferences: { maxRetriesPerPhase: -1 } },
  { currentPhase: 'DESIGN', userPreferences: { reporting: { confirmed: true } } },
  { currentPhase: 'DESIGN', userPreferences: { reporting: [] } },
  { currentPhase: 'DESIGN', userPreferences: { language: 'fr' } },
  { currentPhase: 'DESIGN', adrRatification: { checkpointStatus: 'none', pending: [], ratified: [] } },
  { currentPhase: 'DESIGN', adrRatification: { checkpointStatus: 'pending', pending: [], ratified: [] } },
  { currentPhase: 'DESIGN', adrRatification: { checkpointStatus: 'none', pending: [] } },
  { currentPhase: 'DESIGN', adrRatification: { checkpointStatus: 'none', pending: [], ratified: [], note: '' } },
  { currentPhase: 'DESIGN', adrRatification: { checkpointStatus: 'awaiting_human', pending: [{ adr: '1', title: 't', recommended: 'accept', status: 'Proposed' }], ratified: [] } },
  { currentPhase: 'DESIGN', adrRatification: { checkpointStatus: 'awaiting_human', pending: [{ adr: '1', title: 't', recommended: 'amend', status: 'Proposed' }], ratified: [] } },
  { currentPhase: 'DESIGN', adrRatification: { checkpointStatus: 'awaiting_human', pending: [{ adr: '1', title: 't', recommended: 'accept', status: 'Accepted' }], ratified: [] } },
  { currentPhase: 'DESIGN', adrRatification: { checkpointStatus: 'resolved', pending: [], ratified: [{ adr: '1', verdict: 'Rejected', by: 'owner' }] } },
  { currentPhase: 'DESIGN', adrRatification: { checkpointStatus: 'resolved', pending: [], ratified: [{ adr: '1', verdict: 'Accepted' }] } },
  { currentPhase: 'DESIGN', adrRatification: { checkpointStatus: 'resolved', pending: [], ratified: ['ADR-1'] } },
]

test('the runtime validator and ajv agree on every sample', () => {
  for (const sample of SAMPLES) {
    const runtime = schemaViolations(schema, sample).length === 0
    const reference = validateAgainstSchema(sample)
    assert.equal(runtime, reference, JSON.stringify(sample))
    assert.equal(isOk(validatePipelineState(sample)), reference, JSON.stringify(sample))
  }
})

test('the samples exercise both verdicts', () => {
  const verdicts = SAMPLES.map((sample) => validateAgainstSchema(sample))
  assert.ok(verdicts.includes(true) && verdicts.includes(false))
})

test('a keyword or type the validator does not know is refused, never skipped', () => {
  assert.throws(() => schemaViolations({ type: 'boolean' }, true), /unsupported type: boolean/)
  assert.throws(() => schemaViolations({ $ref: 'other.json#/x' }, {}), /unsupported \$ref/)
})
