import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isFileArtifactPattern,
  expectedArtifactsFor,
  artifactPatternToRegExp,
  missingArtifacts,
  parseReviewVerdict,
  isApprovedVerdict,
  requiresVerifiedCommit
} from '../../plugins/src/domain/artifact-policy.mjs'

// isFileArtifactPattern ————————————————————————————————————————————————

test('isFileArtifactPattern: true for a plain path', () => {
  assert.equal(isFileArtifactPattern('.copilot-tracking/skraft-plans/{projectSlug}/plans/{date}/stories.md'), true)
})

test('isFileArtifactPattern: false for a prose description containing whitespace', () => {
  assert.equal(isFileArtifactPattern('GitHub repository issues (via MCP tools)'), false)
})

test('isFileArtifactPattern: false for empty string', () => {
  assert.equal(isFileArtifactPattern(''), false)
})

test('isFileArtifactPattern: false for non-string', () => {
  assert.equal(isFileArtifactPattern(null), false)
  assert.equal(isFileArtifactPattern(undefined), false)
})

// expectedArtifactsFor ————————————————————————————————————————————————

const CONFIG = {
  agentArtifacts: {
    'acceptance-designer': {
      inputs: [],
      outputs: [
        '.copilot-tracking/skraft-plans/{projectSlug}/features/{feature}.feature',
        'tests/**/{Feature}AcceptanceTests.cs'
      ]
    },
    'backlog-discoverer': {
      inputs: ['GitHub repository issues (via MCP tools)'],
      outputs: ['.copilot-tracking/skraft-plans/{projectSlug}/research/{date}/triage-{date}.md']
    },
    'software-engineer': {
      inputs: [],
      outputs: ['Source code commits (conventional commits)']
    }
  }
}

test('expectedArtifactsFor: returns only file-like outputs for the agent', () => {
  const result = expectedArtifactsFor('acceptance-designer', CONFIG)
  assert.deepEqual(result, [
    '.copilot-tracking/skraft-plans/{projectSlug}/features/{feature}.feature',
    'tests/**/{Feature}AcceptanceTests.cs'
  ])
})

test('expectedArtifactsFor: filters out prose (non-file) outputs', () => {
  const result = expectedArtifactsFor('software-engineer', CONFIG)
  assert.deepEqual(result, [])
})

test('expectedArtifactsFor: returns [] for unknown agent', () => {
  assert.deepEqual(expectedArtifactsFor('nobody', CONFIG), [])
})

test('expectedArtifactsFor: returns [] when config is missing/undefined', () => {
  assert.deepEqual(expectedArtifactsFor('acceptance-designer', undefined), [])
})

// artifactPatternToRegExp / missingArtifacts —————————————————————————————

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

test('missingArtifacts: returns [] when every pattern has a recorded match', () => {
  const expected = ['.copilot-tracking/skraft-plans/{projectSlug}/features/{feature}.feature']
  const recorded = ['.copilot-tracking/skraft-plans/us8/features/login.feature']
  assert.deepEqual(missingArtifacts(expected, recorded), [])
})

test('missingArtifacts: returns the unmatched patterns', () => {
  const expected = [
    '.copilot-tracking/skraft-plans/{projectSlug}/features/{feature}.feature',
    'tests/**/{Feature}AcceptanceTests.cs'
  ]
  const recorded = ['.copilot-tracking/skraft-plans/us8/features/login.feature']
  assert.deepEqual(missingArtifacts(expected, recorded), ['tests/**/{Feature}AcceptanceTests.cs'])
})

test('missingArtifacts: treats an absent recordedPaths argument as empty', () => {
  assert.deepEqual(missingArtifacts(['a/b.md']), ['a/b.md'])
})

// parseReviewVerdict ———————————————————————————————————————————————————

test('parseReviewVerdict: extracts APPROVED from the review template', () => {
  const content = '# DELIVER Review — us8\n\n**Verdict:** APPROVED\n**Depth tier:** deep\n'
  assert.equal(parseReviewVerdict(content), 'APPROVED')
})

test('parseReviewVerdict: extracts NEEDS_REWORK', () => {
  assert.equal(parseReviewVerdict('**Verdict:** NEEDS_REWORK\n'), 'NEEDS_REWORK')
})

test('parseReviewVerdict: extracts REJECTED', () => {
  assert.equal(parseReviewVerdict('**Verdict:** REJECTED\n'), 'REJECTED')
})

test('parseReviewVerdict: returns null when no verdict line is present', () => {
  assert.equal(parseReviewVerdict('# Review\nNo verdict here.'), null)
})

test('parseReviewVerdict: returns null for non-string content', () => {
  assert.equal(parseReviewVerdict(undefined), null)
  assert.equal(parseReviewVerdict(null), null)
})

// isApprovedVerdict ———————————————————————————————————————————————————

test('isApprovedVerdict: true only for APPROVED', () => {
  assert.equal(isApprovedVerdict('APPROVED'), true)
  assert.equal(isApprovedVerdict('NEEDS_REWORK'), false)
  assert.equal(isApprovedVerdict('REJECTED'), false)
  assert.equal(isApprovedVerdict(null), false)
})

// requiresVerifiedCommit ————————————————————————————————————————————————

test('requiresVerifiedCommit: true only for DELIVER', () => {
  assert.equal(requiresVerifiedCommit('DELIVER'), true)
  assert.equal(requiresVerifiedCommit('DISCOVER'), false)
  assert.equal(requiresVerifiedCommit('DISCUSS'), false)
})
