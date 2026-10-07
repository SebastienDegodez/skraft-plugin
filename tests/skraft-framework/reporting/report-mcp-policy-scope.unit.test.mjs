import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeProviderScope, normalizeMcpTarget, reportMarker, markReportBody,
  trustedMcpDigest, validateMcpCommentUrl, prPointerBody,
} from '../../../plugins/skraft-framework/src/domain/report-mcp-policy.mjs'

// Unit contract of the pure provider-scope and URL rules behind MCP report publication.

const HOST_MSG = /^Error: Provider host must be an HTTPS hostname without credentials, port or path$/
const LOOPBACK_MSG = /^Error: Provider host must be a non-loopback hostname$/
const REPO_MSG = /^Error: Repository must match the provider scope without traversal, encoding or credentials$/
const AZURE_MSG = /^Error: Azure organization and project scope are required$/
const NOT_AZURE_MSG = /^Error: Organization and project fields require an Azure provider$/
const URL_MSG = /^Error: Invalid report comment URL$/
const ID_MSG = /^Error: Invalid report comment or thread ID$/
const HOST_MISMATCH = /^Error: Report URL host does not match target scope$/
const COMMENT_SCOPE = /^Error: Report URL comment scope mismatch$/
const THREAD_SCOPE = /^Error: Report URL thread scope mismatch$/
const PATH_SCOPE = /^Error: Report URL does not match the confirmed target scope$/

const gitlab = (host, repo = 'group/shop') => normalizeProviderScope({ provider: 'gitlab', host, repo })
const azure = (overrides = {}) => normalizeProviderScope({
  provider: 'azure-devops', organization: 'team', project: 'Shop', repo: 'repo1', ...overrides,
})
const ghTarget = (overrides = {}) => ({ provider: 'github', host: 'github.com', repo: 'owner/repo', type: 'pr', number: 42, ...overrides })
const glTarget = (overrides = {}) => ({ provider: 'gitlab', host: 'gitlab.com', repo: 'group/shop', type: 'pr', number: 42, ...overrides })
const azTarget = (overrides = {}) => ({
  provider: 'azure-devops', host: 'dev.azure.com', organization: 'team', project: 'Shop', repo: 'repo1', type: 'pr', number: 42, ...overrides,
})
const GH_URL = 'https://github.com/owner/repo/pull/42#issuecomment-101'
const AZ_PR = 'https://dev.azure.com/team/Shop/_git/repo1/pullrequest/42'
const AZ_ITEM = 'https://dev.azure.com/team/Shop/_workitems/edit/42'

test('default hosts are applied for each provider', () => {
  assert.equal(normalizeProviderScope({ repo: 'owner/repo' }).host, 'github.com')
  assert.equal(normalizeProviderScope({ provider: 'gitlab', repo: 'g/r' }).host, 'gitlab.com')
  assert.deepEqual(azure(), {
    provider: 'azure-devops', host: 'dev.azure.com', repo: 'repo1', organization: 'team', project: 'Shop',
  })
})

test('unsupported providers are refused with their reason', () => {
  assert.throws(() => normalizeProviderScope({ provider: 'bitbucket', repo: 'a/b' }), /^Error: Unsupported report provider$/)
})

test('hostname length boundary is 253 characters', () => {
  const at253 = ['a'.repeat(63), 'a'.repeat(63), 'a'.repeat(63), 'a'.repeat(61)].join('.')
  assert.equal(at253.length, 253)
  assert.equal(gitlab(at253).host, at253)
  const at254 = ['a'.repeat(63), 'a'.repeat(63), 'a'.repeat(63), 'a'.repeat(62)].join('.')
  assert.throws(() => gitlab(at254), HOST_MSG)
  const longLabels = Array.from({ length: 5 }, () => 'b'.repeat(60)).join('.')
  assert.throws(() => gitlab(longLabels), HOST_MSG)
})

test('non-string hosts are refused before parsing', () => {
  assert.throws(() => gitlab(['gitlab.com']), HOST_MSG)
  assert.throws(() => gitlab(42), HOST_MSG)
})

test('every host label must be a valid DNS label', () => {
  assert.throws(() => gitlab('good.-bad'), HOST_MSG)
  assert.throws(() => gitlab('-a.com'), HOST_MSG)
  assert.throws(() => gitlab('a-.com'), HOST_MSG)
  assert.throws(() => gitlab('git_lab.com'), HOST_MSG)
  assert.equal(gitlab('a.com').host, 'a.com')
  assert.equal(gitlab('x.b-c.io').host, 'x.b-c.io')
})

test('numeric and loopback hosts are refused, other hosts pass', () => {
  assert.throws(() => gitlab('10.0.0.10'), LOOPBACK_MSG)
  assert.throws(() => gitlab('127'), LOOPBACK_MSG)
  assert.throws(() => gitlab('localhost'), LOOPBACK_MSG)
  assert.throws(() => gitlab('app.localhost'), LOOPBACK_MSG)
  assert.equal(gitlab('1abc.com').host, '1abc.com')
  assert.equal(gitlab('ci1').host, 'ci1')
  assert.equal(gitlab('localhost.example').host, 'localhost.example')
  assert.equal(gitlab('GitLab.Example.com').host, 'gitlab.example.com')
})

test('a repository is required by default and optional on request', () => {
  assert.throws(() => normalizeProviderScope({ provider: 'github' }), REPO_MSG)
  assert.deepEqual(normalizeProviderScope({ provider: 'github' }, { requireRepo: false }),
    { provider: 'github', host: 'github.com', repo: undefined })
  assert.deepEqual(normalizeProviderScope({ repo: null }, { requireRepo: false }),
    { provider: 'github', host: 'github.com', repo: null })
  assert.throws(() => normalizeProviderScope({ repo: 'bad' }, { requireRepo: false }), REPO_MSG)
})

test('non-string repositories are refused with the scope reason', () => {
  assert.throws(() => normalizeProviderScope({ repo: 42 }), REPO_MSG)
  assert.throws(() => normalizeProviderScope({ provider: 'gitlab', repo: 42 }), REPO_MSG)
  assert.throws(() => azure({ repo: 42 }), REPO_MSG)
})

test('organization and project fields belong only to Azure', () => {
  assert.throws(() => normalizeProviderScope({ repo: 'o/r', organization: 'x' }), NOT_AZURE_MSG)
  assert.throws(() => normalizeProviderScope({ repo: 'o/r', project: 'x' }), NOT_AZURE_MSG)
  assert.throws(() => normalizeProviderScope({ provider: 'gitlab', repo: 'g/r', organization: 'x', project: 'y' }), NOT_AZURE_MSG)
})

test('Azure segments must be trimmed text without traversal or reserved characters', () => {
  for (const bad of ['.', '..', ' team', 'team ', '   ', '', 'a/b', 'a%b', 'a\\b', 'a?b', 'a#b', 'a:b', 'a@b', 'a\tb', 42]) {
    assert.throws(() => azure({ organization: bad }), AZURE_MSG, `organization ${JSON.stringify(bad)}`)
    assert.throws(() => azure({ project: bad }), AZURE_MSG, `project ${JSON.stringify(bad)}`)
  }
  assert.equal(azure({ organization: 'a.b', project: '...' }).project, '...')
  assert.throws(() => azure({ repo: '..' }), REPO_MSG)
  assert.throws(() => azure({ repo: ' r' }), REPO_MSG)
  assert.equal(azure({ repo: 'my repo' }).repo, 'my repo')
})

test('GitHub owner and repository syntax', () => {
  assert.equal(normalizeProviderScope({ repo: 'a/repo' }).repo, 'a/repo')
  assert.equal(normalizeProviderScope({ repo: 'a-b/r.e_p-o' }).repo, 'a-b/r.e_p-o')
  for (const bad of ['-abc/repo', 'abc-/repo', 'a_b/repo', 'owner/x!abc', 'owner/abc!', 'owner/b c', 'owner', 'a/b/c', 'owner/..']) {
    assert.throws(() => normalizeProviderScope({ repo: bad }), REPO_MSG, bad)
  }
})

test('GitLab repositories need at least two slug segments', () => {
  assert.equal(gitlab('gitlab.com', 'group/sub/shop').repo, 'group/sub/shop')
  for (const bad of ['single', 'group/b c', 'g/x!abc', 'g/abc!', 'g//r', 'g/../r']) {
    assert.throws(() => gitlab('gitlab.com', bad), REPO_MSG, bad)
  }
})

test('MCP target type and number validation', () => {
  assert.deepEqual(normalizeMcpTarget({ repo: 'o/r' }, 'issue', 1),
    { provider: 'github', host: 'github.com', repo: 'o/r', type: 'issue', number: 1 })
  assert.throws(() => normalizeMcpTarget({ repo: 'o/r' }, 'commit', 1), /^Error: Invalid report destination target type$/)
  for (const bad of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '3']) {
    assert.throws(() => normalizeMcpTarget({ repo: 'o/r' }, 'pr', bad), /^Error: Target number must be a positive safe integer$/)
  }
})

test('report markers require trimmed-nonempty story text and a known kind', () => {
  assert.equal(reportMarker('S-1', 'forecast'), '<!-- skraft-report:forecast:00005300002d000031 -->')
  const reason = /^Error: Report requires a story and forecast or outcome kind$/
  assert.throws(() => reportMarker('   ', 'forecast'), reason)
  assert.throws(() => reportMarker('S\n1', 'outcome'), reason)
  assert.throws(() => reportMarker('S-1', 'draft'), reason)
})

test('report bodies must be nonblank Markdown without an existing marker', () => {
  const reason = /^Error: Report body must contain Markdown without a publication marker$/
  assert.throws(() => markReportBody('   \n', 'S', 'forecast'), reason)
  assert.throws(() => markReportBody(42, 'S', 'forecast'), reason)
  assert.throws(() => markReportBody('text <!--skraft-report:x', 'S', 'forecast'), reason)
  assert.throws(() => markReportBody('text <!--   SKRAFT-REPORT:x', 'S', 'forecast'), reason)
})

test('marked body length boundary is the comment limit', () => {
  const marker = reportMarker('S', 'forecast')
  const room = 65_536 - marker.length - 2
  const fit = markReportBody('x'.repeat(room), 'S', 'forecast')
  assert.equal(fit.body.length, 65_536)
  assert.equal(fit.marker, marker)
  assert.throws(() => markReportBody('x'.repeat(room + 1), 'S', 'forecast'), /^Error: Marked report body exceeds comment limit$/)
})

test('trusted digests need a matching receipt, scope and a 64-hex digest string', () => {
  const target = ghTarget()
  const digest = 'a'.repeat(64)
  const receipt = (renderedBodyDigest) => ({ story: 'S', kind: 'forecast', targets: { pr: { target, renderedBodyDigest } } })
  assert.equal(trustedMcpDigest(receipt(digest), { story: 'S', kind: 'forecast', target }), digest)
  assert.equal(trustedMcpDigest(undefined, { story: undefined, kind: 'forecast', target }), undefined)
  assert.equal(trustedMcpDigest({ story: 'S', kind: 'forecast' }, { story: 'S', kind: 'forecast', target }), undefined)
  assert.equal(trustedMcpDigest(receipt('zz'), { story: 'S', kind: 'forecast', target }), undefined)
  assert.equal(trustedMcpDigest(receipt(`x${digest}`), { story: 'S', kind: 'forecast', target }), undefined)
  assert.equal(trustedMcpDigest(receipt(`${digest}x`), { story: 'S', kind: 'forecast', target }), undefined)
  assert.equal(trustedMcpDigest(receipt([digest]), { story: 'S', kind: 'forecast', target }), undefined)
  assert.equal(trustedMcpDigest(receipt(digest), { story: 'S', kind: 'forecast', target: ghTarget({ number: 7 }) }), undefined)
})

test('comment URL needs a positive ID before anything else', () => {
  assert.throws(() => validateMcpCommentUrl(undefined, ghTarget()), ID_MSG)
  assert.throws(() => validateMcpCommentUrl({ id: 0, url: GH_URL }, ghTarget()), ID_MSG)
  assert.equal(validateMcpCommentUrl({ id: 101 }, ghTarget()), undefined)
})

test('comment URL must be an https string without whitespace or controls', () => {
  const t = ghTarget()
  assert.throws(() => validateMcpCommentUrl({ id: 101, url: 'http://github.com/owner/repo/pull/42#issuecomment-101' }, t), URL_MSG)
  assert.throws(() => validateMcpCommentUrl({ id: 101, url: `${GH_URL} ` }, t), URL_MSG)
  assert.throws(() => validateMcpCommentUrl({ id: 101, url: `${GH_URL}\\` }, t), URL_MSG)
  assert.throws(() => validateMcpCommentUrl({ id: 101, url: 42 }, t), URL_MSG)
  assert.throws(() => validateMcpCommentUrl({ id: 101, url: 'https://[' }, t), URL_MSG)
  assert.equal(validateMcpCommentUrl({ id: 101, url: GH_URL }, t), GH_URL)
})

test('comment URL host must match the target without credentials', () => {
  const t = ghTarget()
  assert.throws(() => validateMcpCommentUrl({ id: 101, url: 'https://gitlab.com/owner/repo/pull/42#issuecomment-101' }, t), HOST_MISMATCH)
  assert.throws(() => validateMcpCommentUrl({ id: 101, url: 'https://github.com:8443/owner/repo/pull/42#issuecomment-101' }, t), HOST_MISMATCH)
  assert.throws(() => validateMcpCommentUrl({ id: 101, url: 'https://user@github.com/owner/repo/pull/42#issuecomment-101' }, t), HOST_MISMATCH)
  assert.throws(() => validateMcpCommentUrl({ id: 101, url: 'https://:pw@github.com/owner/repo/pull/42#issuecomment-101' }, t), HOST_MISMATCH)
})

test('GitHub comment URLs need no query and the exact comment anchor', () => {
  const t = ghTarget()
  assert.throws(() => validateMcpCommentUrl({ id: 101, url: 'https://github.com/owner/repo/pull/42?x=1#issuecomment-101' }, t), COMMENT_SCOPE)
  assert.throws(() => validateMcpCommentUrl({ id: 101, url: 'https://github.com/owner/repo/pull/42#issuecomment-102' }, t), COMMENT_SCOPE)
  const issue = 'https://github.com/owner/repo/issues/42#issuecomment-101'
  assert.equal(validateMcpCommentUrl({ id: 101, url: issue }, ghTarget({ type: 'issue' })), issue)
})

test('raw URL must equal the canonical path, not merely parse to it', () => {
  assert.throws(() => validateMcpCommentUrl({ id: 101, url: 'https://GitHub.com/owner/repo/pull/42#issuecomment-101' }, ghTarget()), PATH_SCOPE)
  assert.throws(() => validateMcpCommentUrl({ id: 101, url: 'https://github.com/owner/repo/pull/43#issuecomment-101' }, ghTarget()), PATH_SCOPE)
  // A dot-segment target is collapsed by URL parsing: the parsed path must still match.
  const dotted = ghTarget({ repo: 'o/../r' })
  assert.throws(() => validateMcpCommentUrl({ id: 5, url: 'https://github.com/o/../r/pull/42#issuecomment-5' }, dotted), PATH_SCOPE)
})

test('GitLab comment URLs use merge requests or issues with a note anchor', () => {
  const mr = 'https://gitlab.com/group/shop/-/merge_requests/42#note_101'
  const issue = 'https://gitlab.com/group/shop/-/issues/42#note_101'
  assert.equal(validateMcpCommentUrl({ id: 101, url: mr }, glTarget()), mr)
  assert.equal(validateMcpCommentUrl({ id: 101, url: issue }, glTarget({ type: 'issue' })), issue)
  assert.throws(() => validateMcpCommentUrl({ id: 101, url: mr }, glTarget({ type: 'issue' })), PATH_SCOPE)
  assert.throws(() => validateMcpCommentUrl({ id: 101, url: 'https://gitlab.com/group/shop/-/merge_requests/42?x=1#note_101' }, glTarget()), COMMENT_SCOPE)
  assert.throws(() => validateMcpCommentUrl({ id: 101, url: 'https://gitlab.com/group/shop/-/merge_requests/42#note_9' }, glTarget()), COMMENT_SCOPE)
})

test('Azure PR URLs are scoped to the thread', () => {
  const t = azTarget()
  assert.equal(validateMcpCommentUrl({ id: 101, threadId: 7, url: `${AZ_PR}?discussionId=7` }, t), `${AZ_PR}?discussionId=7`)
  assert.equal(validateMcpCommentUrl({ id: 101, threadId: 7, url: AZ_PR }, t), AZ_PR)
  assert.throws(() => validateMcpCommentUrl({ id: 101, threadId: 7, url: `${AZ_PR}?discussionId=8` }, t), THREAD_SCOPE)
  assert.throws(() => validateMcpCommentUrl({ id: 101, threadId: 7, url: `${AZ_PR}#x` }, t), THREAD_SCOPE)
  assert.throws(() => validateMcpCommentUrl({ id: 101, url: AZ_PR }, t), ID_MSG)
})

test('Azure PR pointers may take the thread from the URL only when it is canonical', () => {
  const t = azTarget()
  const ok = `${AZ_PR}?discussionId=17`
  assert.equal(validateMcpCommentUrl({ id: 101, url: ok }, t, { pointer: true }), ok)
  // A confirmed thread ID wins over the URL.
  assert.throws(() => validateMcpCommentUrl({ id: 101, threadId: 7, url: `${AZ_PR}?discussionId=8` }, t, { pointer: true }), THREAD_SCOPE)
  // An explicit invalid thread ID is refused before the URL is considered.
  assert.throws(() => validateMcpCommentUrl({ id: 101, threadId: 0 }, t, { pointer: true }), ID_MSG)
  assert.throws(() => validateMcpCommentUrl({ id: 101, url: `${AZ_PR}?discussionId=07` }, t, { pointer: true }), ID_MSG)
  assert.throws(() => validateMcpCommentUrl({ id: 101, url: `${AZ_PR}?discussionId=7e1` }, t, { pointer: true }), ID_MSG)
  assert.throws(() => validateMcpCommentUrl({ id: 101, url: AZ_PR }, t, { pointer: true }), ID_MSG)
  // Pointers always need a URL.
  assert.throws(() => validateMcpCommentUrl({ id: 101 }, ghTarget(), { pointer: true }), URL_MSG)
})

test('Azure work item URLs accept no query and an optional comment anchor', () => {
  const t = azTarget({ type: 'issue' })
  assert.equal(validateMcpCommentUrl({ id: 101, url: AZ_ITEM }, t), AZ_ITEM)
  assert.equal(validateMcpCommentUrl({ id: 101, url: `${AZ_ITEM}#101` }, t), `${AZ_ITEM}#101`)
  assert.throws(() => validateMcpCommentUrl({ id: 101, url: `${AZ_ITEM}#999` }, t), COMMENT_SCOPE)
  assert.throws(() => validateMcpCommentUrl({ id: 101, url: `${AZ_ITEM}?x=1` }, t), COMMENT_SCOPE)
  assert.throws(() => validateMcpCommentUrl({ id: 101, url: `${AZ_ITEM}?x=1#101` }, t), COMMENT_SCOPE)
})

test('PR pointer bodies need a matching, published receipt in scope', () => {
  const target = ghTarget()
  const published = { status: 'published', target, id: 101, url: GH_URL }
  const ctx = { story: 'S', kind: 'forecast', target }
  assert.equal(prPointerBody({ story: 'S', kind: 'forecast', targets: { pr: published } }, ctx), `Report: ${GH_URL}\n`)
  const matching = /^Error: PR pointer requires a matching report receipt$/
  const scoped = /^Error: PR pointer requires a published receipt in the same target scope$/
  assert.throws(() => prPointerBody(undefined, ctx), matching)
  assert.throws(() => prPointerBody(undefined, { ...ctx, story: undefined }), matching)
  assert.throws(() => prPointerBody({ story: 'S', kind: 'outcome', targets: { pr: published } }, ctx), matching)
  assert.throws(() => prPointerBody({ story: 'S', kind: 'forecast' }, ctx), scoped)
  assert.throws(() => prPointerBody({ story: 'S', kind: 'forecast', targets: {} }, ctx), scoped)
  assert.throws(() => prPointerBody({ story: 'S', kind: 'forecast', targets: { pr: { ...published, status: 'pending' } } }, ctx), scoped)
  assert.throws(() => prPointerBody({ story: 'S', kind: 'forecast', targets: { pr: { ...published, target: ghTarget({ number: 1 }) } } }, ctx), scoped)
})
