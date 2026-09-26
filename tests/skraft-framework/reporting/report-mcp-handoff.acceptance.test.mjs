import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  preparePublication, decidePublication, recordPublication,
} from '../../../plugins/skraft-framework/src/application/report-publication-handoff.mjs'

// Application-boundary contract only. Snapshots model normalized HOST MCP output;
// provenance values are opaque fixture labels, not names of installed tools.
// No transport, network fake, rendering policy, or publication algorithm in fixtures.
const hashText = (text) => createHash('sha256').update(text).digest('hex')
const ports = { hashText }
const markdown = '# Forecast\n\n| Criterion | State |\n| --- | --- |\n| Café ☕ | Planned |\n\n```js\nconst x = "{{literal}}"\n```\n'
const marker = '<!-- skraft-report:forecast:00005300002d000031 -->'
const marked = `${marker}\n\n${markdown}`
const provenance = { server: 'fixture-host-server', tool: 'fixture-observation-operation' }
const readProvenance = { server: 'fixture-host-server', tool: 'fixture-readback-operation' }
const scopes = [
  {
    provider: 'github', host: 'github.com', repo: 'owner/repo',
    url: 'https://github.com/owner/repo/pull/42#issuecomment-101',
  },
  {
    provider: 'azure-devops', host: 'dev.azure.com', organization: 'team', project: 'Shop',
    repo: '12345678-1234-1234-1234-123456789abc', threadId: 7,
    url: 'https://dev.azure.com/team/Shop/_git/12345678-1234-1234-1234-123456789abc/pullrequest/42?discussionId=7',
  },
  {
    provider: 'gitlab', host: 'gitlab.com', repo: 'group/subgroup/shop',
    url: 'https://gitlab.com/group/subgroup/shop/-/merge_requests/42#note_101',
  },
]
function target(scope = scopes[0], overrides = {}) {
  const { url, threadId, ...identity } = scope
  return { ...identity, number: 42, type: 'pr', ...overrides }
}
function preferences(overrides = {}) {
  return {
    confirmed: true, repo: 'owner/repo', branch: 'feature/report', prNumber: 42,
    issueNumber: 23, destinations: { pr: true, issue: 'link', chat: true },
    maxMedia: 0, allowDraftPr: false, ...overrides,
  }
}
function input(overrides = {}) {
  return {
    preferences: preferences(), story: 'S-1', kind: 'forecast', body: markdown,
    destination: 'pr', currentBranch: 'feature/report', ...overrides,
  }
}
// Literal packet permits decide/record to fail on their own observable contracts
// while prepare remains an empty stub. End-to-end case below joins all three.
function packet(overrides = {}) {
  return {
    status: 'ready', story: 'S-1', kind: 'forecast', destination: 'pr',
    target: target(), branch: 'feature/report', marker, body: marked,
    digest: hashText(marked), ...overrides,
  }
}
function comment(overrides = {}) {
  return { id: 101, body: marked, author: 'reporter', url: scopes[0].url, ...overrides }
}
function observation(p = packet(), overrides = {}) {
  return {
    target: p.target, branch: p.branch, viewer: 'reporter', comments: [], complete: true,
    capabilities: { read: true, create: true, update: true }, provenance, ...overrides,
  }
}
function decision(p = packet(), overrides = {}) {
  return { action: 'create', body: p.body, digest: p.digest, viewer: 'reporter', ...overrides }
}
function readback(p = packet(), overrides = {}) {
  return {
    target: p.target, branch: p.branch, viewer: 'reporter', provenance: readProvenance,
    writeResult: { id: 101 }, comment: comment({ body: p.body }), ...overrides,
  }
}
function previous(p = packet(), overrides = {}) {
  return {
    story: p.story, kind: p.kind,
    targets: { [p.destination]: {
      target: p.target, status: 'published', id: 101, url: scopes[0].url,
      renderedBodyDigest: p.digest, verification: 'host-mcp-readback',
      localValidation: 'body-target-match', provenance: readProvenance,
    } }, ...overrides,
  }
}
function assertPending(value, reason) {
  assert.equal(value.action ?? value.status, 'pending', 'must retain pending instead of authorizing a write')
  assert.match(value.reason, reason)
}
function assertPublished(receipt, p, expectedComment) {
  assert.equal(receipt.story, p.story)
  assert.equal(receipt.kind, p.kind)
  assert.ok(receipt.targets?.[p.destination], 'receipt must identify its destination')
  const entry = receipt.targets[p.destination]
  assert.deepEqual(entry.target, p.target)
  assert.equal(entry.status, 'published')
  assert.equal(entry.id, expectedComment.id)
  assert.equal(entry.url, expectedComment.url)
  assert.equal(entry.renderedBodyDigest, hashText(p.body))
  assert.equal(entry.verification, 'host-mcp-readback')
  assert.equal(entry.localValidation, 'body-target-match')
  assert.deepEqual(entry.provenance, readProvenance)
  if (expectedComment.threadId !== undefined) assert.equal(entry.threadId, expectedComment.threadId)
}

test('prepare legacy GitHub preference into exact marked Markdown and SHA-256 without rewriting content', () => {
  const request = input()
  const before = structuredClone(request)
  const result = preparePublication(request, ports)
  assert.deepEqual(result, packet())
  assert.deepEqual(request, before, 'preparation must not rewrite consent or report input')
})

for (const scope of scopes.slice(1)) {
  test(`prepare ${scope.provider} scoped target without applying GitHub owner/repo restrictions`, () => {
    const { number, type, ...providerPreferences } = target(scope)
    const result = preparePublication(input({ preferences: preferences(providerPreferences) }), ports)
    assert.deepEqual(result, packet({ target: target(scope) }))
  })
}

test('prepare rejects missing consent, unselected destination, and changed or missing local PR branch', () => {
  for (const prefs of [
    preferences({ confirmed: false }), preferences({ confirmed: 'true' }),
    preferences({ confirmed: undefined }), preferences({ destinations: { pr: false, issue: 'full', chat: true } }),
  ]) assert.throws(() => preparePublication(input({ preferences: prefs }), ports), /consent|confirm|select|destination/i)
  for (const currentBranch of ['other-branch', undefined, '']) {
    assert.throws(() => preparePublication(input({ currentBranch }), ports), /branch|scope/i)
  }
  assert.throws(() => preparePublication(input({ destination: 'chat' }), ports), /destination/i)
})

test('prepare rejects unsafe target identifiers, non-public hosts, and forged report bodies', () => {
  for (const overrides of [
    { prNumber: 0 }, { prNumber: '42' }, { prNumber: 1.5 }, { prNumber: Number.MAX_SAFE_INTEGER + 1 },
    { repo: 'owner/../repo' }, { provider: 'unknown' }, { host: '127.0.0.1' },
    { provider: 'azure-devops', host: 'dev.azure.com', organization: '../team', project: 'Shop', repo: 'shop' },
    { provider: 'gitlab', host: 'gitlab.com', repo: 'group/%2e%2e/shop' },
  ]) assert.throws(() => preparePublication(input({ preferences: preferences(overrides) }), ports))
  for (const overrides of [
    { body: '' }, { body: marked }, { body: '<!-- SKRAFT-REPORT:forged -->' },
    { story: '' }, { kind: 'review' }, { body: 'x'.repeat(65_537) },
  ]) assert.throws(() => preparePublication(input(overrides), ports))
})

test('prepare missing PR number stays pending even when draft creation was consented', () => {
  const result = preparePublication(input({ preferences: preferences({ prNumber: null, allowDraftPr: true }) }), ports)
  assertPending(result, /target|number|PR/i)
})

test('prepare imports last trusted digest only for identical story, kind, provider and complete target scope', () => {
  const p = packet({ target: target(scopes[1]) })
  const { type, number, ...providerPreferences } = p.target
  const request = input({ preferences: preferences(providerPreferences), previousReceipt: previous(p) })
  assert.equal(preparePublication(request, ports).previousDigest, p.digest)
  const variants = [
    previous(p, { story: 'another-story' }), previous(p, { kind: 'outcome' }),
    ...['provider', 'host', 'organization', 'project', 'repo', 'type', 'number'].map((key) => {
      const receipt = previous(p)
      receipt.targets.pr.target = { ...p.target, [key]: key === 'number' ? 99 : 'different' }
      return receipt
    }),
  ]
  for (const previousReceipt of variants) {
    const result = preparePublication({ ...request, previousReceipt }, ports)
    assert.equal(result.status, 'ready')
    assert.equal(result.previousDigest, undefined, 'foreign receipt must not authorize overwriting')
  }
  const pendingReceipt = previous(p)
  pendingReceipt.targets.pr.status = 'pending'
  assert.equal(preparePublication({ ...request, previousReceipt: pendingReceipt }, ports).previousDigest, p.digest,
    'an unsuccessful retry must retain last trusted published digest')
})

test('prepare issue pointer waits for published PR receipt with same story, kind and provider scope', () => {
  const p = packet()
  const receipts = [undefined, previous(p, { story: 'other' }), previous(p, { kind: 'outcome' })]
  for (const key of ['provider', 'host', 'repo', 'number', 'type']) {
    const receipt = previous(p)
    receipt.targets.pr.target = { ...p.target, [key]: key === 'number' ? 99 : 'different' }
    receipts.push(receipt)
  }
  const pendingReceipt = previous(p)
  pendingReceipt.targets.pr.status = 'pending'
  receipts.push(pendingReceipt)
  for (const previousReceipt of receipts) {
    assertPending(preparePublication(input({ destination: 'issue', previousReceipt }), ports), /PR|receipt|scope|pointer/i)
  }
})

test('prepare issue pointer uses prior PR readback URL verbatim, not full Markdown or guessed URL', () => {
  for (const scope of scopes) {
    const p = packet({ target: target(scope) })
    const receipt = previous(p)
    receipt.targets.pr.url = scope.url
    const { type, number, ...providerPreferences } = p.target
    const result = preparePublication(input({
      destination: 'issue', previousReceipt: receipt, preferences: preferences(providerPreferences),
    }), ports)
    assert.equal(result.status, 'ready')
    assert.deepEqual(result.target, target(scope, { type: 'issue', number: 23 }))
    assert.equal(result.body, `${marker}\n\nReport: ${scope.url}\n`)
    assert.equal(result.digest, hashText(result.body))
    const unsafeReceipt = structuredClone(receipt)
    unsafeReceipt.targets.pr.url = 'https://attacker.example/report'
    assertPending(preparePublication(input({
      destination: 'issue', previousReceipt: unsafeReceipt, preferences: preferences(providerPreferences),
    }), ports), /URL|scope|PR|receipt/i)
  }
})

test('decide creates without adopting foreign author marker or unrelated latest comment', () => {
  const p = packet()
  const observed = observation(p, { comments: [comment({ author: 'someone-else' }), comment({ id: 102, body: 'Unrelated' })] })
  const before = structuredClone(observed)
  const result = decidePublication(p, observed, ports)
  assert.equal(result.action, 'create')
  assert.equal(result.commentId, undefined)
  assert.equal(result.body, p.body)
  assert.equal(result.digest, p.digest)
  assert.equal(result.viewer, 'reporter', 'decision binds readback to observed current identity')
  assert.deepEqual(observed, before)
})

test('decide updates only owned trusted prior content and preserves Azure thread identity', () => {
  const oldBody = `${marker}\n\nOld forecast\n`
  const p = packet({ target: target(scopes[1]), previousDigest: hashText(oldBody) })
  const result = decidePublication(p, observation(p, { comments: [
    comment({ body: oldBody, url: scopes[1].url, threadId: 7 }),
    comment({ id: 102, body: 'Unrelated latest comment', url: scopes[1].url, threadId: 8 }),
  ] }), ports)
  assert.equal(result.action, 'update')
  assert.equal(result.commentId, 101)
  assert.equal(result.threadId, 7)
  assert.equal(result.body, p.body)
  assert.equal(result.digest, p.digest)
})

test('decide recovers exact retry without previous receipt as unchanged and requires no write capability', () => {
  const p = packet()
  const result = decidePublication(p, observation(p, {
    comments: [comment()], capabilities: { read: true, create: false, update: false },
  }), ports)
  assert.equal(result.action, 'unchanged')
  assert.equal(result.commentId, 101)
  assert.equal(result.body, marked)
  assert.equal(result.digest, hashText(marked))
})

test('decide missing trusted history never overwrites a different owned report', () => {
  const p = packet()
  assertPending(decidePublication(p, observation(p, { comments: [comment({ body: `${marker}\n\nOld report` })] }), ports),
    /digest|history|reconcil|previous/i)
})

test('decide protects manual edits against trusted digest even if new desired body matches remote edit', () => {
  const oldBody = `${marker}\n\nOld report`
  const edited = `${oldBody}\nHuman edit`
  for (const body of [marked, edited]) {
    const p = packet({ previousDigest: hashText(oldBody), body, digest: hashText(body) })
    assertPending(decidePublication(p, observation(p, { comments: [comment({ body: edited })] }), ports),
      /conflict|digest|changed|edit/i)
    assert.equal(p.previousDigest, hashText(oldBody), 'conflict must not replace trusted digest')
  }
})

test('decide duplicate owned report markers block instead of choosing a comment', () => {
  const p = packet()
  assertPending(decidePublication(p, observation(p, { comments: [comment(), comment({ id: 102 })] }), ports),
    /duplicate|ambiguous/i)
})

test('decide requires exact normalized scope, PR branch, viewer, complete pagination and tool provenance', () => {
  const p = packet({ target: target(scopes[1]) })
  for (const overrides of [
    ...['provider', 'host', 'repo', 'number', 'type', 'organization', 'project'].map((key) => ({
      target: { ...p.target, [key]: key === 'number' ? 99 : 'different' },
    })),
    { branch: 'wrong' }, { branch: undefined }, { viewer: '' }, { viewer: undefined },
    { complete: false }, { complete: undefined }, { comments: undefined },
    { provenance: undefined }, { provenance: { server: 'fixture-host-server' } },
    { provenance: { server: '', tool: 'fixture-observation-operation' } },
  ]) assertPending(decidePublication(p, observation(p, overrides), ports), /target|scope|branch|identity|viewer|complete|pagin|comment|provenance|tool|server/i)
})

test('decide missing read or appropriate write capability remains pending without create fallback', () => {
  const oldBody = `${marker}\n\nOld report`
  const p = packet({ previousDigest: hashText(oldBody) })
  for (const overrides of [
    { capabilities: { read: false, create: true, update: true } },
    { capabilities: { read: true, create: false, update: true } },
    { capabilities: undefined },
    { comments: [comment({ body: oldBody })], capabilities: { read: true, create: true, update: false } },
  ]) assertPending(decidePublication(p, observation(p, overrides), ports), /capabilit|read|create|update/i)
})

test('decide rejects unsafe selected IDs, ambiguous marker bodies, unsafe URLs and tampered packet digest', () => {
  const p = packet()
  for (const entry of [
    comment({ id: 0 }), comment({ id: '101' }), comment({ id: Number.MAX_SAFE_INTEGER + 1 }),
    comment({ body: `${marked}\n${marker}` }), comment({ url: 'https://attacker.example/report' }),
  ]) assertPending(decidePublication(p, observation(p, { comments: [entry] }), ports), /id|marker|ambiguous|URL|scope|target/i)
  const tampered = packet({ body: `${marked}\nChanged after prepare` })
  assertPending(decidePublication(tampered, observation(tampered), ports), /digest|body|packet/i)
})

test('prepare → decide → host readback → record yields scoped published GitHub receipt, not independent network verification', () => {
  const p = preparePublication(input(), ports)
  assert.equal(p.status, 'ready')
  const d = decidePublication(p, observation(p), ports)
  assert.equal(d.action, 'create')
  const seen = readback(p)
  const receipt = recordPublication(p, d, seen, ports)
  assertPublished(receipt, p, seen.comment)
})

for (const scope of scopes.slice(1)) {
  test(`record ${scope.provider} public readback URL and provider-specific comment scope`, () => {
    const p = packet({ target: target(scope) })
    const seen = readback(p, {
      writeResult: { id: 101, ...(scope.threadId ? { threadId: scope.threadId } : {}) },
      comment: comment({ url: scope.url, ...(scope.threadId ? { threadId: scope.threadId } : {}) }),
    })
    const receipt = recordPublication(p, decision(p), seen, ports)
    assertPublished(receipt, p, seen.comment)
  })
}

test('record refuses mismatched body, digest, ID, author, scope, branch or absent readback provenance', () => {
  const p = packet()
  const d = decision(p)
  for (const overrides of [
    { comment: comment({ body: `${marked} ` }) }, { comment: comment({ id: 102 }) },
    { comment: comment({ author: 'other' }) }, { viewer: 'other' },
    { writeResult: undefined }, { writeResult: { id: 0 } },
    { target: target(scopes[2]) }, { target: target(scopes[0], { number: 99 }) },
    { branch: 'wrong' }, { provenance: undefined },
    { provenance: { server: 'fixture-host-server', tool: '' } },
  ]) assert.throws(() => recordPublication(p, d, readback(p, overrides), ports))
  for (const change of [{ digest: '0'.repeat(64) }, { body: `${marked} ` }, { viewer: undefined }]) {
    assert.throws(() => recordPublication(p, { ...d, ...change }, readback(p), ports))
  }
  assert.throws(() => recordPublication({ ...p, digest: '0'.repeat(64) }, d, readback(p), ports))
  assert.throws(() => recordPublication(p, decision(p, { action: 'update', commentId: 102 }), readback(p), ports))
  const ado = packet({ target: target(scopes[1]) })
  assert.throws(() => recordPublication(ado, decision(ado, { action: 'update', commentId: 101, threadId: 8 }),
    readback(ado, { writeResult: { id: 101, threadId: 7 }, comment: comment({ url: scopes[1].url, threadId: 7 }) }), ports))
})

test('record rejects URLs outside provider host, repository, target, comment or Azure organization/project/thread', () => {
  const badUrls = [
    ['http://github.com/owner/repo/pull/42#issuecomment-101',
      'https://reporter:secret@github.com/owner/repo/pull/42#issuecomment-101',
      'https://github.com.attacker.example/owner/repo/pull/42#issuecomment-101',
      'https://github.com/owner/other/pull/42#issuecomment-101',
      'https://github.com/owner/repo/issues/42#issuecomment-101',
      'https://github.com/owner/repo/pull/42#issuecomment-102'],
    [scopes[1].url.replace('/team/', '/other/'), scopes[1].url.replace('/Shop/', '/Other/'),
      scopes[1].url.replace('/pullrequest/42', '/pullrequest/43'), scopes[1].url.replace('discussionId=7', 'discussionId=8')],
    [scopes[2].url.replace('/subgroup/', '/other/'), scopes[2].url.replace('/merge_requests/', '/issues/'),
      scopes[2].url.replace('#note_101', '#note_102')],
  ]
  for (const [index, scope] of scopes.entries()) {
    const p = packet({ target: target(scope) })
    for (const url of badUrls[index]) {
      assert.throws(() => recordPublication(p, decision(p), readback(p, {
        writeResult: { id: 101, ...(scope.threadId ? { threadId: scope.threadId } : {}) },
        comment: comment({ url, ...(scope.threadId ? { threadId: scope.threadId } : {}) }),
      }), ports), /URL|scope|target|thread|comment/i)
    }
  }
})

test('pending packet or blocked decision cannot be recorded as publication merely from supplied readback', () => {
  const p = packet()
  assert.throws(() => recordPublication(p, decision(p, { action: 'pending', reason: 'Missing capability' }), readback(p), ports),
    /pending|decision|action/i)
  assert.throws(() => recordPublication({ ...p, status: 'pending' }, decision(p), readback(p), ports), /pending|packet/i)
  assertPending(decidePublication({ ...p, status: 'pending', reason: 'No confirmed target' }, observation(p), ports), /pending|target/i)
})

test('unchanged decision still requires fresh exact host readback but no write result', () => {
  const p = packet()
  const d = decision(p, { action: 'unchanged', commentId: 101 })
  const seen = readback(p, { writeResult: undefined })
  assertPublished(recordPublication(p, d, seen, ports), p, seen.comment)
  assert.throws(() => recordPublication(p, d, undefined, ports), /readback|read.back|observ/i)
})