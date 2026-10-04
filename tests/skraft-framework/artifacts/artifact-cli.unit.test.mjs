import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ARTIFACTS, normalize, validate } from '../../../plugins/skraft-framework/src/domain/artifact-registry.mjs'
import { parseReviewVerdict } from '../../../plugins/skraft-framework/src/domain/artifact-policy.mjs'
import { renderArtifact } from '../../../plugins/skraft-framework/src/application/render-artifact.mjs'

// Mirrors how plugins/skraft-framework/src/cli/artifact.mjs resolves templates at runtime: relative
// to the plugin root (this repo's skraft-framework plugin directory), so this test exercises the
// exact shipped codepath an agent hits via `${CLAUDE_PLUGIN_ROOT}/src/cli/artifact.mjs`.
const pluginRoot = fileURLToPath(new URL('../../../plugins/skraft-framework/', import.meta.url))
const readTemplate = (templatePath) => readFileSync(join(pluginRoot, templatePath), 'utf8')
const cliPath = join(pluginRoot, 'src/cli/artifact.mjs')

const fullComment = () => ({
  phase: 'DISCUSS',
  icon: '✅',
  status: 'APPROVED',
  artefacts: ['`plans/2026-07-01/stories-demo.md` — 3 stories, DoR 8/8'],
  verdictLabel: 'APPROVED (attempt 1)',
  nextPhase: 'DESIGN → dispatch `solution-architect`',
})

test('artifact-registry: template paths are relative to the plugin root (no "plugins/" prefix)', () => {
  for (const spec of Object.values(ARTIFACTS)) {
    assert.ok(!spec.template.startsWith('plugins/'), `unexpected prefix in ${spec.template}`)
  }
})

test('artifact-registry: every registered template path resolves to a real file under the plugin root', () => {
  for (const [type, spec] of Object.entries(ARTIFACTS)) {
    assert.doesNotThrow(() => readTemplate(spec.template), `${type}: cannot read ${spec.template}`)
  }
})

test('validate + renderArtifact: full review-comment payload renders via the shipped templates dir', () => {
  const result = validate('review-comment', fullComment())
  assert.equal(result.ok, true)
  const output = renderArtifact('review-comment', fullComment(), { readTemplate })
  assert.match(output, /## Phase DISCUSS ✅ APPROVED/)
  assert.match(output, /\*\*Reviewer verdict:\*\* APPROVED \(attempt 1\)/)
})

test('validate: review-comment reports missing required keys', () => {
  const data = fullComment()
  delete data.verdictLabel
  delete data.nextPhase
  const result = validate('review-comment', data)
  assert.equal(result.ok, false)
  assert.deepEqual(result.missing, ['verdictLabel', 'nextPhase'])
})

test('renderArtifact: throws on unknown artifact type', () => {
  assert.throws(() => renderArtifact('frobnicate', {}, { readTemplate }), /unknown artifact type/)
})

test('validate: unknown artifact type is flagged, not thrown', () => {
  const result = validate('frobnicate', {})
  assert.equal(result.ok, false)
  assert.equal(result.unknownType, true)
})

const reviewVerdict = (verdict) => ({
  verdict,
  lenses: { coverage: { status: 'fail', findings: [] } },
  synthesis: { blocking_findings: [], recommendations: [], dissent: 'None.' },
})

test('normalize: a review verdict differing only by case, spaces or hyphens takes its canonical spelling', () => {
  for (const [given, canonical] of [['rejected', 'REJECTED'], ['Needs rework', 'NEEDS_REWORK'], ['needs-rework', 'NEEDS_REWORK'], [' approved ', 'APPROVED']]) {
    assert.equal(normalize('review-verdict', reviewVerdict(given)).verdict, canonical)
  }
  assert.equal(normalize('review-verdict', { status: 'rejected' }).status, 'REJECTED')
})

test('normalize: leaves non-enum fields and other artifact types untouched', () => {
  const data = reviewVerdict('rejected')
  assert.equal(normalize('review-verdict', data).lenses, data.lenses)
  assert.equal(normalize('adr', { status: 'proposed' }).status, 'proposed')
})

test('validate: a review verdict outside APPROVED, NEEDS_REWORK and REJECTED is invalid', () => {
  const result = validate('review-verdict', normalize('review-verdict', reviewVerdict('maybe')))
  assert.equal(result.ok, false)
  assert.deepEqual(result.missing, [])
  assert.deepEqual(result.invalid, [{ field: 'verdict', value: 'maybe', allowed: ['APPROVED', 'NEEDS_REWORK', 'REJECTED'] }])
})

test('artifact CLI: a lower-case verdict is written in the spelling the phase gate reads', () => {
  const dir = mkdtempSync(join(tmpdir(), 'artifact-cli-'))
  const out = join(dir, 'distill-review-1.md')
  const run = spawnSync(process.execPath, [cliPath, 'review-verdict', '--out', out], {
    input: JSON.stringify(reviewVerdict('rejected')),
    encoding: 'utf8',
  })
  assert.equal(run.status, 0, run.stderr)
  assert.equal(parseReviewVerdict(readFileSync(out, 'utf8')), 'REJECTED')
})

test('artifact CLI: an unknown verdict exits 2 and names the allowed values', () => {
  const run = spawnSync(process.execPath, [cliPath, 'review-verdict'], {
    input: JSON.stringify(reviewVerdict('maybe')),
    encoding: 'utf8',
  })
  assert.equal(run.status, 2)
  const error = JSON.parse(run.stderr)
  assert.equal(error.error, 'invalid_field_values')
  assert.deepEqual(error.invalid[0].allowed, ['APPROVED', 'NEEDS_REWORK', 'REJECTED'])
})
