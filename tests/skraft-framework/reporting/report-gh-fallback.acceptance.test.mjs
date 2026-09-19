import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  preparePublication, decidePublication, recordPublication,
} from '../../../plugins/skraft-framework/src/application/report-publication-handoff.mjs'

// Normalized host observations only: no subprocess, network client or live provider.
const ports = { hashText: (text) => createHash('sha256').update(text).digest('hex') }
const mcp = { server: 'fixture-server', tool: 'fixture-readback' }
const gh = { server: 'gh', tool: 'gh api', transport: 'gh-cli' }
const scopes = {
  github: { repo: 'owner/repo', host: 'github.com' },
  'azure-devops': { repo: 'shop', host: 'dev.azure.com', organization: 'team', project: 'Shop' },
  gitlab: { repo: 'group/shop', host: 'gitlab.com' },
}
const urls = {
  github: 'https://github.com/owner/repo/pull/42#issuecomment-101',
  'azure-devops': 'https://dev.azure.com/team/Shop/_git/shop/pullrequest/42?discussionId=7',
  gitlab: 'https://gitlab.com/group/shop/-/merge_requests/42#note_101',
}
function prepare(provider = 'github', overrides = {}) {
  return preparePublication({
    preferences: {
      confirmed: true, provider, ...scopes[provider], branch: 'feature/report',
      prNumber: 42, issueNumber: 23, destinations: { pr: true, issue: 'link', chat: true },
      maxMedia: 0, allowDraftPr: false,
    },
    story: 'S-1', kind: 'forecast', destination: 'pr', currentBranch: 'feature/report',
    body: '# Forecast\n\nCafé ☕ stays planned.\n', ...overrides,
  }, ports)
}
function observation(packet, provenance = gh, overrides = {}) {
  return {
    target: packet.target, branch: packet.branch, viewer: 'reporter', provenance,
    complete: true, comments: [], capabilities: { read: true, create: true, update: true },
    ...overrides,
  }
}
function readback(packet, provenance = gh) {
  const thread = packet.target.provider === 'azure-devops' ? { threadId: 7 } : {}
  return {
    target: packet.target, branch: packet.branch, viewer: 'reporter', provenance,
    writeResult: { id: 101, ...thread },
    comment: {
      id: 101, body: packet.body, author: 'reporter', url: urls[packet.target.provider], ...thread,
    },
  }
}
function receiptFor(packet, provenance, verification) {
  return {
    story: packet.story, kind: packet.kind,
    targets: { pr: {
      target: packet.target, status: 'published', id: 101, url: urls[packet.target.provider],
      renderedBodyDigest: packet.digest, verification, localValidation: 'body-target-match',
      provenance, ...(packet.target.provider === 'azure-devops' ? { threadId: 7 } : {}),
    } },
  }
}

for (const { name, provenance, verification, providers } of [
  { name: 'legacy MCP keeps exact receipt schema', provenance: mcp,
    verification: 'host-mcp-readback', providers: Object.keys(scopes) },
  { name: 'explicit MCP transport is preserved', provenance: { ...mcp, transport: 'mcp' },
    verification: 'host-mcp-readback', providers: Object.keys(scopes) },
  { name: 'GitHub host gh api readback is labelled and transport preserved', provenance: gh,
    verification: 'host-gh-cli-readback', providers: ['github'] },
]) {
  test(name, () => {
    for (const provider of providers) {
      const packet = prepare(provider)
      assert.equal(packet.status, 'ready')
      const decision = decidePublication(packet, observation(packet, provenance), ports)
      assert.equal(decision.action, 'create', provider)
      assert.deepEqual(
        recordPublication(packet, decision, readback(packet, provenance), ports),
        receiptFor(packet, provenance, verification), provider,
      )
    }
  })
}

const invalidProvenances = [
  { name: 'unknown transport', provider: 'github', provenance: { ...mcp, transport: 'curl' } },
  { name: 'wrong gh server', provider: 'github', provenance: { ...gh, server: 'other' } },
  { name: 'wrong gh command identity', provider: 'github', provenance: { ...gh, tool: 'gh pr comment' } },
  { name: 'gh on Azure DevOps', provider: 'azure-devops', provenance: gh },
  { name: 'gh on GitLab', provider: 'gitlab', provenance: gh },
]

test('invalid transport provenance never authorizes a publication decision', () => {
  const results = invalidProvenances.map(({ name, provider, provenance }) => {
    const packet = prepare(provider)
    const decision = decidePublication(packet, observation(packet, provenance), ports)
    return { name, action: decision.action, hasReason: typeof decision.reason === 'string' && decision.reason.length > 0 }
  })
  assert.deepEqual(results, invalidProvenances.map(({ name }) => ({ name, action: 'pending', hasReason: true })))
})

test('invalid readback provenance throws even after a valid authorized decision', () => {
  const results = invalidProvenances.map(({ name, provider, provenance }) => {
    const packet = prepare(provider)
    const decision = decidePublication(packet, observation(packet, mcp), ports)
    assert.equal(decision.action, 'create', name)
    try {
      recordPublication(packet, decision, readback(packet, provenance), ports)
      return { name, rejected: false }
    } catch (error) {
      assert.ok(error instanceof Error && !(error instanceof TypeError), `${name}: must reject on validation`)
      return { name, rejected: true }
    }
  })
  assert.deepEqual(results, invalidProvenances.map(({ name }) => ({ name, rejected: true })))
})

test('gh decisions retain identity, target, marker, digest, pagination and conflict guards', () => {
  const packet = prepare()
  const comment = readback(packet).comment
  for (const [name, change] of [
    ['missing identity', { viewer: '' }],
    ['wrong target', { target: { ...packet.target, number: 99 } }],
    ['wrong branch', { branch: 'other' }],
    ['incomplete pagination', { complete: false }],
    ['duplicate comments', { comments: [comment, { ...comment, id: 102 }] }],
    ['ambiguous marker', { comments: [{ ...comment, body: `${comment.body}\n${packet.marker}` }] }],
  ]) {
    assert.equal(decidePublication(packet, observation(packet, gh, change), ports).action, 'pending', name)
  }
  for (const [name, change] of [
    ['wrong marker identity', { marker: '<!-- skraft-report:forecast:other -->' }],
    ['changed body', { body: `${packet.body}tampered` }],
    ['wrong digest', { digest: '0'.repeat(64) }],
  ]) {
    assert.equal(decidePublication({ ...packet, ...change }, observation(packet), ports).action, 'pending', name)
  }
  const priorDecision = decidePublication(packet, observation(packet), ports)
  const priorReceipt = recordPublication(packet, priorDecision, readback(packet), ports)
  const next = prepare('github', { body: 'Revised forecast\n', previousReceipt: priorReceipt })
  assert.equal(next.previousDigest, packet.digest)
  assert.equal(decidePublication(next, observation(next, gh, {
    comments: [{ ...comment, body: `${comment.body}Human edit` }],
  }), ports).action, 'pending', 'manual edit must not be overwritten')
  assert.equal(decidePublication(packet, observation(packet, gh, {
    comments: [{ ...comment, author: 'someone-else' }],
  }), ports).action, 'create', 'foreign marker must not be adopted')
})

test('gh receipts retain fresh readback, identity, target, body, digest and selected comment guards', () => {
  const packet = prepare()
  const seen = readback(packet)
  const decision = decidePublication(packet, observation(packet), ports)
  assert.equal(decision.action, 'create')
  for (const [name, change] of [
    ['wrong viewer', { viewer: 'other' }],
    ['wrong author', { comment: { ...seen.comment, author: 'other' } }],
    ['wrong target', { target: { ...packet.target, number: 99 } }],
    ['wrong branch', { branch: 'other' }],
    ['wrong body', { comment: { ...seen.comment, body: `${packet.body} ` } }],
    ['wrong comment', { writeResult: { id: 102 } }],
    ['missing write result', { writeResult: undefined }],
    ['wrong URL', { comment: { ...seen.comment, url: urls.github.replace('/42#', '/99#') } }],
  ]) assert.throws(() => recordPublication(packet, decision, { ...seen, ...change }, ports), undefined, name)
  assert.throws(() => recordPublication(packet, decision, undefined, ports))
  assert.throws(() => recordPublication({ ...packet, digest: '0'.repeat(64) }, decision, seen, ports))
  assert.throws(() => recordPublication(packet, { ...decision, digest: '0'.repeat(64) }, seen, ports))
})

test('gh trusted update and unchanged recovery retain selected ID and fresh exact readback', () => {
  const old = prepare()
  const oldDecision = decidePublication(old, observation(old, mcp), ports)
  const previousReceipt = recordPublication(old, oldDecision, readback(old, mcp), ports)
  const packet = prepare('github', { body: 'Revised forecast\n', previousReceipt })
  const update = decidePublication(packet, observation(packet, gh, { comments: [readback(old).comment] }), ports)
  assert.equal(update.action, 'update')
  assert.equal(update.commentId, 101)
  const retry = prepare('github', { body: 'Revised forecast\n' })
  const unchanged = decidePublication(retry, observation(retry, gh, {
    comments: [readback(retry).comment], capabilities: { read: true, create: false, update: false },
  }), ports)
  assert.equal(unchanged.action, 'unchanged')
  assert.equal(unchanged.commentId, 101)
  const receipts = []
  for (const [p, decision] of [[packet, update], [retry, unchanged]]) {
    const seen = readback(p)
    if (decision.action === 'unchanged') delete seen.writeResult
    assert.throws(() => recordPublication(p, decision, undefined, ports))
    assert.throws(() => recordPublication(p, decision, {
      ...seen, comment: { ...seen.comment, body: `${p.body}changed` },
    }, ports))
    assert.throws(() => recordPublication(p, { ...decision, commentId: 102 }, seen, ports))
    receipts.push(recordPublication(p, decision, seen, ports))
  }
  assert.deepEqual(receipts, [packet, retry].map((p) => receiptFor(p, gh, 'host-gh-cli-readback')))
})