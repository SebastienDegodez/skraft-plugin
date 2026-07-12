import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ARTIFACTS, validate } from '../../plugins/src/domain/artifact-registry.mjs'
import { renderArtifact } from '../../plugins/src/application/render-artifact.mjs'

// Mirrors how plugins/src/cli/artifact.mjs resolves templates at runtime: relative
// to the plugin root (this repo's plugins/ directory), so this test exercises the
// exact shipped codepath an agent hits via `${CLAUDE_PLUGIN_ROOT}/src/cli/artifact.mjs`.
const pluginRoot = fileURLToPath(new URL('../../plugins', import.meta.url))
const readTemplate = (templatePath) => readFileSync(join(pluginRoot, templatePath), 'utf8')

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
