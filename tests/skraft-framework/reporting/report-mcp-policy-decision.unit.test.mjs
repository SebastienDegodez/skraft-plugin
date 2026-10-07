import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  reportMarker, validateMcpPacket, chooseMcpAction, attestMcpReadback,
} from '../../../plugins/skraft-framework/src/domain/report-mcp-policy.mjs'

// Unit contract of packet validation, action choice and readback attestation.

const hashText = (text) => createHash('sha256').update(text).digest('hex')
const ghTarget = (overrides = {}) => ({ provider: 'github', host: 'github.com', repo: 'owner/repo', type: 'pr', number: 42, ...overrides })
const azTarget = (overrides = {}) => ({
  provider: 'azure-devops', host: 'dev.azure.com', organization: 'team', project: 'Shop', repo: 'repo1', type: 'pr', number: 42, ...overrides,
})
const GH_URL = 'https://github.com/owner/repo/pull/42#issuecomment-101'

function packetWith(content = '# Report\n', { target = ghTarget(), story = 'S-1', kind = 'forecast', ...rest } = {}) {
  const marker = reportMarker(story, kind)
  const body = `${marker}\n\n${content}`
  return {
    status: 'ready', story, kind, destination: target.type, target,
    branch: target.type === 'pr' ? 'feature/x' : undefined,
    marker, body, digest: hashText(body), ...rest,
  }
}
function withBody(packet, body) {
  return { ...packet, body, digest: hashText(body) }
}
function observe(packet, overrides = {}) {
  return {
    target: packet.target, branch: packet.branch, viewer: 'reporter', comments: [], complete: true,
    capabilities: { read: true, create: true, update: true }, provenance: { server: 'srv', tool: 'tool' }, ...overrides,
  }
}
function readbackOf(packet, overrides = {}, commentOverrides = {}) {
  return {
    target: packet.target, branch: packet.branch, viewer: 'reporter', provenance: { server: 'srv', tool: 'read' },
    writeResult: { id: 101 }, comment: { id: 101, body: packet.body, author: 'reporter', ...commentOverrides }, ...overrides,
  }
}
const decisionOf = (packet, overrides = {}) => ({ action: 'create', body: packet.body, digest: packet.digest, viewer: 'reporter', ...overrides })
const err = (message) => new RegExp(`^Error: ${message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)

test('a well-formed packet validates for PR and issue targets', () => {
  assert.equal(validateMcpPacket(packetWith(), hashText), undefined)
  // An issue packet needs no branch.
  assert.equal(validateMcpPacket(packetWith('# Issue\n', { target: ghTarget({ type: 'issue' }) }), hashText), undefined)
  assert.equal(validateMcpPacket(packetWith('# R\n', { previousDigest: 'b'.repeat(64) }), hashText), undefined)
})

test('packet status and target presence are required', () => {
  assert.throws(() => validateMcpPacket(undefined, hashText), err('Publication packet is pending or missing'))
  assert.throws(() => validateMcpPacket({ ...packetWith(), status: 'pending' }, hashText), err('Publication packet is pending or missing'))
  // A missing target fails while normalizing its provider scope, not while reading type/number.
  assert.throws(() => validateMcpPacket({ ...packetWith(), target: undefined }, hashText), /reading 'provider'/)
})

test('packet target must be normalized and match the destination', () => {
  const mismatch = err('Publication packet target scope mismatch')
  assert.throws(() => validateMcpPacket(packetWith('# R\n', { target: ghTarget({ host: 'GitHub.com' }) }), hashText), mismatch)
  assert.throws(() => validateMcpPacket({ ...packetWith(), destination: 'issue' }, hashText), mismatch)
})

test('PR packets need a branch', () => {
  const missing = err('Publication packet PR branch is missing')
  assert.throws(() => validateMcpPacket({ ...packetWith(), branch: undefined }, hashText), missing)
  assert.throws(() => validateMcpPacket({ ...packetWith(), branch: '  ' }, hashText), missing)
})

test('packet marker must belong to its story and kind', () => {
  assert.throws(() => validateMcpPacket({ ...packetWith(), kind: 'outcome' }, hashText), err('Publication packet marker mismatch'))
})

test('packet body must start with the marker, carry content, fit the limit and hold one marker', () => {
  const invalid = err('Publication packet body or marker is invalid')
  const p = packetWith()
  assert.throws(() => validateMcpPacket({ ...p, body: 42, digest: 'a'.repeat(64) }, () => 'a'.repeat(64)), invalid)
  assert.throws(() => validateMcpPacket(withBody(p, `${p.marker}\n\n   \n`), hashText), invalid)
  assert.throws(() => validateMcpPacket(withBody(p, `lead ${p.marker}\n\nreport`), hashText), invalid)
  assert.throws(() => validateMcpPacket(withBody(p, `${p.marker}\nreport`), hashText), invalid)
  assert.throws(() => validateMcpPacket(withBody(p, `${p.marker}\n\nreport <!--skraft-report:x`), hashText), invalid)
  const room = 65_536 - p.marker.length - 2
  assert.equal(validateMcpPacket(withBody(p, `${p.marker}\n\n${'x'.repeat(room)}`), hashText), undefined)
  assert.throws(() => validateMcpPacket(withBody(p, `${p.marker}\n\n${'x'.repeat(room + 1)}`), hashText), invalid)
})

test('packet digest must be a 64-hex string equal to the body hash', () => {
  const mismatch = err('Publication packet body digest mismatch')
  const p = packetWith()
  assert.throws(() => validateMcpPacket({ ...p, digest: 'not-a-digest' }, () => 'not-a-digest'), mismatch)
  const arrayDigest = ['a'.repeat(64)]
  assert.throws(() => validateMcpPacket({ ...p, digest: arrayDigest }, () => arrayDigest), mismatch)
  assert.throws(() => validateMcpPacket({ ...p, digest: 'c'.repeat(64) }, hashText), mismatch)
})

test('previous digest is optional but must be a 64-hex string when present', () => {
  const invalid = err('Publication packet previous digest is invalid')
  assert.throws(() => validateMcpPacket(packetWith('# R\n', { previousDigest: 'zz' }), hashText), invalid)
  assert.throws(() => validateMcpPacket(packetWith('# R\n', { previousDigest: ['b'.repeat(64)] }), hashText), invalid)
  assert.throws(() => validateMcpPacket(packetWith('# R\n', { previousDigest: `${'b'.repeat(64)}0` }), hashText), invalid)
})

test('observation scope, viewer and provenance are checked before choosing', () => {
  const p = packetWith()
  assert.throws(() => chooseMcpAction(p, undefined, hashText), err('Observed target scope mismatch'))
  assert.throws(() => chooseMcpAction(p, observe(p, { branch: 'other' }), hashText), err('Observed PR branch scope mismatch'))
  assert.throws(() => chooseMcpAction(p, observe(p, { provenance: undefined }), hashText), err('Host server/tool provenance is required'))
  assert.throws(() => chooseMcpAction(p, observe(p, { provenance: { server: 'srv' } }), hashText), err('Host server/tool provenance is required'))
  // Issue targets ignore the observed branch.
  const issue = packetWith('# I\n', { target: ghTarget({ type: 'issue' }) })
  assert.equal(chooseMcpAction(issue, observe(issue, { branch: 'anything' }), hashText).action, 'create')
})

test('read capability must be explicitly granted', () => {
  const p = packetWith()
  assert.throws(() => chooseMcpAction(p, observe(p, { capabilities: undefined }), hashText), err('Read capability is required'))
})

test('null comments and non-string bodies are not owned', () => {
  const p = packetWith()
  const comments = [null, { id: 5, author: 'reporter', body: [p.marker] }]
  const decision = chooseMcpAction(p, observe(p, { comments }), hashText)
  assert.equal(decision.action, 'create')
  assert.equal(Object.hasOwn(decision, 'commentId'), false)
})

test('GitHub update results carry no thread ID', () => {
  const old = packetWith('# Old\n')
  const p = { ...packetWith('# New\n'), previousDigest: old.digest }
  const decision = chooseMcpAction(p, observe(p, { comments: [{ id: 101, author: 'reporter', body: old.body, url: GH_URL }] }), hashText)
  assert.equal(decision.action, 'update')
  assert.equal(decision.commentId, 101)
  assert.equal(Object.hasOwn(decision, 'threadId'), false)
})

test('Azure work item decisions carry no thread ID, Azure PR decisions do', () => {
  const item = packetWith('# I\n', { target: azTarget({ type: 'issue' }) })
  const unchanged = chooseMcpAction(item, observe(item, { comments: [{ id: 101, author: 'reporter', body: item.body }] }), hashText)
  assert.equal(unchanged.action, 'unchanged')
  assert.equal(Object.hasOwn(unchanged, 'threadId'), false)
  const pr = packetWith('# P\n', { target: azTarget() })
  const threaded = chooseMcpAction(pr, observe(pr, { comments: [{ id: 101, threadId: 7, author: 'reporter', body: pr.body }] }), hashText)
  assert.equal(threaded.action, 'unchanged')
  assert.equal(threaded.threadId, 7)
})

test('attestation requires a settled decision matching the packet', () => {
  const p = packetWith()
  assert.throws(() => attestMcpReadback(p, undefined, readbackOf(p)), err('Pending or invalid publication decision action'))
  assert.throws(() => attestMcpReadback(p, decisionOf(p, { action: 'pending' }), readbackOf(p)), err('Pending or invalid publication decision action'))
  assert.throws(() => attestMcpReadback(p, decisionOf(p, { body: 'x' }), readbackOf(p)), err('Decision body, digest or viewer does not match packet'))
  assert.throws(() => attestMcpReadback(p, decisionOf(p, { viewer: ' ' }), readbackOf(p)), err('Decision body, digest or viewer does not match packet'))
  assert.throws(() => attestMcpReadback(p, decisionOf(p), undefined), err('Fresh host readback observation is required'))
})

test('readback viewer, comment body and author must match', () => {
  const p = packetWith()
  assert.throws(() => attestMcpReadback(p, decisionOf(p), readbackOf(p, { viewer: 'other' })), err('Readback viewer identity differs from decision'))
  const mismatch = err('Readback comment body or author mismatch')
  assert.throws(() => attestMcpReadback(p, decisionOf(p), readbackOf(p, { comment: undefined })), mismatch)
  assert.throws(() => attestMcpReadback(p, decisionOf(p), readbackOf(p, {}, { author: 'other' })), mismatch)
  // Without a comment, an undefined packet body must not be mistaken for a match.
  const bodiless = { ...p, body: undefined }
  assert.throws(() => attestMcpReadback(bodiless, decisionOf(bodiless), readbackOf(p, { comment: undefined })), mismatch)
})

test('create decisions cannot adopt existing IDs', () => {
  const p = packetWith()
  const adopt = err('Create decision cannot adopt an existing comment ID')
  assert.throws(() => attestMcpReadback(p, decisionOf(p, { commentId: 101 }), readbackOf(p)), adopt)
  assert.throws(() => attestMcpReadback(p, decisionOf(p, { threadId: 7 }), readbackOf(p)), adopt)
})

test('update decisions must name the read-back comment', () => {
  const p = packetWith()
  assert.throws(() => attestMcpReadback(p, decisionOf(p, { action: 'update', commentId: 102 }), readbackOf(p)),
    err('Readback comment or thread ID differs from decision'))
})

test('write results must match the read-back comment when present', () => {
  const p = packetWith()
  const differs = err('Write result comment or thread ID differs from readback')
  assert.throws(() => attestMcpReadback(p, decisionOf(p), readbackOf(p, { writeResult: undefined })), err('Invalid report comment or thread ID'))
  assert.throws(() => attestMcpReadback(p, decisionOf(p), readbackOf(p, { writeResult: { id: 999 } })), differs)
  // An unchanged decision needs no write, but a reported write must still match.
  const unchanged = decisionOf(p, { action: 'unchanged', commentId: 101 })
  assert.equal(attestMcpReadback(p, unchanged, readbackOf(p, { writeResult: undefined })).status, 'published')
  assert.throws(() => attestMcpReadback(p, unchanged, readbackOf(p, { writeResult: { id: 999 } })), differs)
  // Thread IDs only matter on threaded (Azure PR) targets.
  const entry = attestMcpReadback(p, decisionOf(p), readbackOf(p, { writeResult: { id: 101, threadId: 9 } }))
  assert.equal(Object.hasOwn(entry, 'threadId'), false)
  const az = packetWith('# A\n', { target: azTarget() })
  assert.throws(() => attestMcpReadback(az, decisionOf(az), readbackOf(az, { writeResult: { id: 101, threadId: 8 } }, { threadId: 7 })), differs)
  assert.equal(attestMcpReadback(az, decisionOf(az), readbackOf(az, { writeResult: { id: 101, threadId: 7 } }, { threadId: 7 })).threadId, 7)
})

test('Azure work item attestations carry no thread ID', () => {
  const p = packetWith('# I\n', { target: azTarget({ type: 'issue' }) })
  const entry = attestMcpReadback(p, decisionOf(p), readbackOf(p))
  assert.equal(entry.status, 'published')
  assert.equal(entry.urlStatus, 'unavailable')
  assert.equal(Object.hasOwn(entry, 'threadId'), false)
})
