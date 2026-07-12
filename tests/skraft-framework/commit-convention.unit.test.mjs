import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isConventionalCommitSubject, scanCommitConvention } from '../../plugins/src/domain/commit-convention.mjs'

test('isConventionalCommitSubject: true for a well-formed type(scope): subject', () => {
  assert.equal(isConventionalCommitSubject('test(harness): assert OverfittingJudge detects keyword stuffing'), true)
})

test('isConventionalCommitSubject: true for a type without scope', () => {
  assert.equal(isConventionalCommitSubject('fix: correct off-by-one error'), true)
})

test('isConventionalCommitSubject: false for a generic auto-commit-hook message', () => {
  assert.equal(isConventionalCommitSubject('Copilot CLI session abc123 changes'), false)
})

test('isConventionalCommitSubject: false for an unknown type prefix', () => {
  assert.equal(isConventionalCommitSubject('bogus(scope): subject'), false)
})

test('isConventionalCommitSubject: false for non-string input', () => {
  assert.equal(isConventionalCommitSubject(undefined), false)
  assert.equal(isConventionalCommitSubject(null), false)
})

test('scanCommitConvention: annotates each commit with a conventional flag', () => {
  const result = scanCommitConvention([
    { sha: 'a1', subject: 'feat(cli): add scan-commits subcommand' },
    { sha: 'b2', subject: 'Copilot CLI session xyz changes' },
  ])
  assert.deepEqual(result, [
    { sha: 'a1', subject: 'feat(cli): add scan-commits subcommand', conventional: true },
    { sha: 'b2', subject: 'Copilot CLI session xyz changes', conventional: false },
  ])
})

test('scanCommitConvention: empty/undefined input yields an empty list', () => {
  assert.deepEqual(scanCommitConvention([]), [])
  assert.deepEqual(scanCommitConvention(undefined), [])
})
