import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  artifactPatternToRegExp,
  parseReviewVerdict,
} from '../../../plugins/skraft-framework/src/domain/artifact-policy.mjs'
import { renderArtifact } from '../../../plugins/skraft-framework/src/application/render-artifact.mjs'

test('artifactPatternToRegExp: {placeholder} matches a single path segment', () => {
  const re = artifactPatternToRegExp('.copilot-tracking/skraft-plans/{projectSlug}/research/{date}/triage-{date}.md')
  assert.equal(re.test('.copilot-tracking/skraft-plans/us8/research/2026-07-02/triage-2026-07-02.md'), true)
  assert.equal(re.test('.copilot-tracking/skraft-plans/us8/research/2026-07-02/other-file.md'), false)
})

test('artifactPatternToRegExp: {placeholder} does not cross path segments', () => {
  const re = artifactPatternToRegExp('reviews/{date}/deliver-review-{N}.md')
  assert.equal(re.test('reviews/2026-07-02/x/deliver-review-1.md'), false)
})

test('artifactPatternToRegExp: ** matches across path segments', () => {
  const re = artifactPatternToRegExp('tests/**/{Feature}AcceptanceTests.cs')
  assert.equal(re.test('tests/nested/dir/FooAcceptanceTests.cs'), true)
})

// parseReviewVerdict ———————————————————————————————————————————————————
//
// Asserted against the RENDERED artifact, never a hand-written string. A literal
// '**Verdict:** REJECTED\n' kept these tests green through the v1.6.0 template
// rewrite while every real verdict file became unparseable — the parser was
// never coupled to the template it exists to read. `renderVerdict` closes that
// gap: change the template and these fail.

const renderVerdict = (payload) =>
  renderArtifact('review-verdict', payload, {
    readTemplate: (templatePath) =>
      readFileSync(new URL(`../../../plugins/skraft-framework/${templatePath}`, import.meta.url), 'utf8')
  })

const LENSES = { coverage: { status: 'fail', findings: [] } }

test('parseReviewVerdict: extracts APPROVED from the rendered review artifact', () => {
  const content = renderVerdict({ verdict: 'APPROVED', lenses: LENSES, synthesis: 'all lenses pass' })
  assert.equal(parseReviewVerdict(content), 'APPROVED')
})

test('parseReviewVerdict: extracts NEEDS_REWORK from the rendered review artifact', () => {
  const content = renderVerdict({ verdict: 'NEEDS_REWORK', lenses: LENSES, synthesis: 'one blocker' })
  assert.equal(parseReviewVerdict(content), 'NEEDS_REWORK')
})

test('parseReviewVerdict: extracts REJECTED from the rendered review artifact', () => {
  const content = renderVerdict({ verdict: 'REJECTED', lenses: LENSES, synthesis: 'unsalvageable' })
  assert.equal(parseReviewVerdict(content), 'REJECTED')
})

test('parseReviewVerdict: reads the `status` alias the artifact registry accepts', () => {
  const content = renderVerdict({ status: 'NEEDS_REWORK', lens_results: LENSES, summary: 'one blocker' })
  assert.equal(parseReviewVerdict(content), 'NEEDS_REWORK')
})

test('parseReviewVerdict: ignores the status of a nested lens', () => {
  const content = renderVerdict({
    verdict: 'APPROVED',
    lenses: { coverage: { status: 'REJECTED', findings: [] } },
    synthesis: 'a lens status is not the verdict'
  })
  assert.equal(parseReviewVerdict(content), 'APPROVED')
})

test('parseReviewVerdict: returns null when no verdict line is present', () => {
  assert.equal(parseReviewVerdict('# Review verdict\nNo verdict here.'), null)
})

test('parseReviewVerdict: returns null for non-string content', () => {
  assert.equal(parseReviewVerdict(undefined), null)
  assert.equal(parseReviewVerdict(null), null)
})
