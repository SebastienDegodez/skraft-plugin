import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  artifactPatternToRegExp,
  parseReviewVerdict,
} from '../../../plugins/skraft-framework/skills/qa-reporting/scripts/report/domain/artifact-policy.mjs'

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

test('parseReviewVerdict: returns null when no verdict line is present', () => {
  assert.equal(parseReviewVerdict('# Review verdict\nNo verdict here.'), null)
})

test('parseReviewVerdict: returns null for non-string content', () => {
  assert.equal(parseReviewVerdict(undefined), null)
  assert.equal(parseReviewVerdict(null), null)
})
