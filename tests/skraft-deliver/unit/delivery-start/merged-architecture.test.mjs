import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createArchitectureReader } from '../../../../plugins/skraft-deliver/engine/application/architecture/read-architecture.mjs'
import { createDeliveryStart } from '../../../../plugins/skraft-deliver/engine/application/delivery-start.mjs'

const PATH = 'docs/architecture/stories/42-check-out.md'
const ADR = 'docs/adr/adr-001-checkout.md'
const DOCUMENT = 'docs/architecture/context-map.md'
const FINGERPRINT = 'f'.repeat(64)
const ISSUE = { number: 42, body: 'Checkout criteria.\n', forge: 'github', repository: 'team/store' }
const BRIEF = { version: 1, issue: 42, forge: 'github', repository: 'team/store', bodySha256: FINGERPRINT,
  components: ['api'], criteria: [{ id: 'AC-1', components: ['api'], adrs: [ADR] }], adrs: [ADR], documents: [DOCUMENT] }
const markdown = (brief = BRIEF) => `<!-- skraft-architecture-brief:v1\n${JSON.stringify(brief)}\n-->\n\n# Checkout\n`

const setup = ({ header = BRIEF, status = 'Accepted', absent = false, unmerged = false, missingDocument = false, newline = '\n' } = {}) => {
  const documents = new Map([[PATH, markdown(header).replaceAll('\n', newline)], [ADR, `---\nstatus: ${status}\n---\n`], [DOCUMENT, '# Merged context map\n']])
  if (missingDocument) documents.delete(DOCUMENT)
  const architecture = createArchitectureReader({
    hasher: { sha256: async () => FINGERPRINT },
    architectureRepository: {
      snapshot: async () => ({ ok: true, sha: 'merged-sha', paths: absent ? [] : [...documents.keys()], read: async (path) => documents.get(path) ?? null }),
      unmerged: async () => ({ ok: true, found: unmerged }),
    },
  })
  const starts = []
  const delivery = createDeliveryStart({ architecture, pipeline: { start: async (request) => { starts.push(request); return { status: 'started' } } } })
  return { architecture, delivery, starts }
}

test('a Windows-authored merged brief starts delivery at DISTILL and keeps every cited document', async () => {
  const { architecture, delivery, starts } = setup({ newline: '\r\n' })
  const found = await architecture.find(ISSUE)
  assert.equal(found.status, 'current', found.reason)
  assert.deepEqual(found.documents.map(({ path }) => path), [PATH, DOCUMENT, ADR])
  assert.equal((await delivery.start({ issue: ISSUE })).status, 'started')
  assert.deepEqual(starts, [{ issue: ISSUE, entry: 'distill', architecture: PATH }])
})

for (const status of ['Superseded', 'Rejected', 'Proposed']) {
  test(`a cited ${status} ADR refuses delivery, without dispatch`, async () => {
    const { delivery, starts } = setup({ status })
    assert.equal((await delivery.start({ issue: ISSUE })).code, 'architecture-stale')
    assert.deepEqual(starts, [])
  })
}

test('an unmerged brief is refused rather than treated as absent', async () => {
  const { delivery, starts } = setup({ absent: true, unmerged: true })
  assert.equal((await delivery.start({ issue: ISSUE })).code, 'architecture-unmerged')
  assert.deepEqual(starts, [])
})

test('a changed issue asks a human, and never starts delivery implicitly', async () => {
  const { delivery, starts } = setup({ header: { ...BRIEF, bodySha256: 'a'.repeat(64) } })
  const outcome = await delivery.start({ issue: ISSUE })
  assert.deepEqual(outcome.question.options, ['KEEP', 'REDESIGN'])
  assert.deepEqual(starts, [])
})

test('another repository or a missing merged dependency cannot be used as architecture', async () => {
  for (const options of [{ header: { ...BRIEF, repository: 'other/store' } }, { missingDocument: true }]) {
    const { delivery, starts } = setup(options)
    assert.equal((await delivery.start({ issue: ISSUE })).code, 'architecture-invalid')
    assert.deepEqual(starts, [])
  }
})

test('a brief that pins its documents delivers while they are as designed, and refuses one changed since, naming it', async () => {
  const pinned = (pin) => ({ ...BRIEF, version: 2, pins: { [DOCUMENT]: pin } })
  const kept = setup({ header: pinned(FINGERPRINT) })
  assert.equal((await kept.delivery.start({ issue: ISSUE })).status, 'started')
  const changed = setup({ header: pinned('b'.repeat(64)) })
  const outcome = await changed.delivery.start({ issue: ISSUE })
  assert.equal(outcome.code, 'architecture-stale')
  assert.match(outcome.reason, new RegExp(`${DOCUMENT} changed on the merged base since the design`))
  assert.deepEqual(changed.starts, [])
})

test('a brief v2 that pins none of its documents is invalid', async () => {
  const { delivery, starts } = setup({ header: { ...BRIEF, version: 2, pins: {} } })
  assert.equal((await delivery.start({ issue: ISSUE })).code, 'architecture-invalid')
  assert.deepEqual(starts, [])
})
