import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  remoteScopeOf, consentQuestion, CONSENT_OPTIONS, CONSENT_KEY, interpretConsent,
} from '../../../plugins/skraft-framework/src/domain/reporting-consent-policy.mjs'

// Unit contract of the pure reporting consent checkpoint.

const github = { provider: 'github', host: 'github.com', repo: 'owner/repo' }

test('origin URLs map to provider scopes', () => {
  assert.deepEqual(remoteScopeOf('https://github.com/owner/repo.git'), github)
  assert.deepEqual(remoteScopeOf('  https://github.com/owner/repo  '), github)
  assert.deepEqual(remoteScopeOf('https://github.com:443/owner/repo'), github)
  assert.deepEqual(remoteScopeOf('git@github.com:owner/repo.git'), github)
  assert.deepEqual(remoteScopeOf('https://gitlab.com///group/sub/repo'), { provider: 'gitlab', host: 'gitlab.com', repo: 'group/sub/repo' })
  assert.deepEqual(remoteScopeOf('git@ssh.dev.azure.com:v3/org/proj/repo'),
    { provider: 'azure-devops', host: 'dev.azure.com', organization: 'org', project: 'proj', repo: 'repo' })
  assert.deepEqual(remoteScopeOf('https://dev.azure.com/org/proj/_git/repo'),
    { provider: 'azure-devops', host: 'dev.azure.com', organization: 'org', project: 'proj', repo: 'repo' })
})

test('unknown or malformed origins have no scope', () => {
  for (const url of [undefined, 42, '', '   ', 'nohostpath', ':github.com:owner/repo', 'git@gitlab.ssh.com:g/r.git',
    'https://example.com/a/b', 'https://github.com/owner', 'https://github.com/a/b/c',
    'https://dev.azure.com/a/b/c/d', 'https://dev.azure.com/org/proj/_git/repo/extra']) {
    assert.equal(remoteScopeOf(url), null, String(url))
  }
})

test('the consent question shows the scope, branch and issue', () => {
  const lines = consentQuestion({ scope: github, branch: 'feat/x', issueNumber: 12 }).split('\n')
  assert.deepEqual(lines, [
    'Reporting for this pipeline: where should the forecast (after DISTILL) and outcome (after DELIVER) reports go?',
    'Scope: github github.com owner/repo, branch feat/x, issue #12.',
    'Answer with destinations: "local" (Markdown only), "chat" (a summary here), "pr" (a comment on the pull request),',
    '"issue" (a link on the issue when beside pr, the full report otherwise) — combine with "+", e.g. "pr+issue+chat".',
    'Add "pr=#N" to name the pull request, "issue=#N" for another issue, "media=N" to embed N screenshots, "draft" to allow a draft PR.',
    'Each remote destination adds tool calls and tokens.',
  ])
})

test('the consent question handles Azure scope, no remote, detached head and no issue', () => {
  const azure = { provider: 'azure-devops', host: 'dev.azure.com', organization: 'org', project: 'proj', repo: 'repo' }
  assert.equal(consentQuestion({ scope: azure, branch: 'main', issueNumber: null }).split('\n')[1],
    'Scope: azure-devops dev.azure.com org/proj/repo, branch main.')
  assert.equal(consentQuestion({ scope: null, branch: null }).split('\n')[1],
    'Scope: no recognised remote (origin) — only local or chat reports are possible, branch (detached).')
})

test('consent constants', () => {
  assert.equal(CONSENT_KEY, 'reporting:consent')
  assert.deepEqual([...CONSENT_OPTIONS], ['local', 'chat', 'pr+issue+chat', 'pr+chat'])
  assert.equal(Object.isFrozen(CONSENT_OPTIONS), true)
})

test('an empty or missing answer is refused', () => {
  assert.deepEqual(interpretConsent(undefined, { scope: github, branch: 'b' }), { ok: false, reason: 'no destination named' })
  assert.deepEqual(interpretConsent(' , + ', { scope: github, branch: 'b' }), { ok: false, reason: 'no destination named' })
})

test('local-only consent needs no remote and keeps an empty branch', () => {
  const result = interpretConsent('chat', { scope: null })
  assert.equal(result.ok, true)
  assert.deepEqual(result.preferences, {
    confirmed: true, repo: null, branch: '', prNumber: null, issueNumber: null,
    destinations: { pr: false, issue: 'none', chat: true }, maxMedia: 0, allowDraftPr: false,
  })
  assert.equal(interpretConsent('local', { scope: github, branch: 'b', issueNumber: 5 }).preferences.issueNumber, 5)
})

test('pr and issue numbers are parsed with or without a hash', () => {
  const pr = interpretConsent('pr=5', { scope: github, branch: 'b' })
  assert.equal(pr.ok, true)
  assert.equal(pr.preferences.prNumber, 5)
  assert.equal(pr.preferences.maxMedia, 0)
  assert.equal(pr.preferences.destinations.pr, true)
  assert.equal(interpretConsent('pr=#12', { scope: github, branch: 'b' }).preferences.prNumber, 12)
  const issue = interpretConsent('issue=7', { scope: github, branch: 'b' })
  assert.equal(issue.ok, true)
  assert.equal(issue.preferences.issueNumber, 7)
  assert.equal(issue.preferences.destinations.issue, 'full')
})

test('malformed numbers and keys are not understood', () => {
  for (const word of ['pr=x5', 'pr=5x', 'foo=5', 'media=5x', 'media=x5', 'pr=']) {
    assert.deepEqual(interpretConsent(word, { scope: github, branch: 'b' }), { ok: false, reason: `"${word}" is not understood` })
  }
})

test('zero target numbers are refused', () => {
  assert.deepEqual(interpretConsent('pr=0', { scope: github, branch: 'b' }), { ok: false, reason: 'pr number must be positive' })
  assert.deepEqual(interpretConsent('issue=#0', { scope: github, branch: 'b' }), { ok: false, reason: 'issue number must be positive' })
})

test('media accepts multi-digit counts and draft is a flag', () => {
  const result = interpretConsent('PR + chat media=12 draft', { scope: github, branch: 'b' })
  assert.equal(result.ok, true)
  assert.equal(result.preferences.maxMedia, 12)
  assert.equal(result.preferences.allowDraftPr, true)
  assert.deepEqual(result.preferences.destinations, { pr: true, issue: 'none', chat: true })
})

test('refusals report ok false with their reasons', () => {
  assert.deepEqual(interpretConsent('slack', { scope: github, branch: 'b' }), { ok: false, reason: '"slack" is not a destination' })
  assert.deepEqual(interpretConsent('local+chat', { scope: github, branch: 'b' }), { ok: false, reason: '"local" excludes every other destination' })
  assert.deepEqual(interpretConsent('pr', { scope: null, branch: 'b' }), { ok: false, reason: 'a remote destination needs a recognised origin remote' })
  assert.deepEqual(interpretConsent('pr', { scope: github, branch: null }), { ok: false, reason: 'Branch must be valid, and nonempty for a PR destination' })
})
