// Unit tests of the StructuralScan use case (src/application/structural-scan-service.mjs)
// against in-memory SourceTree, SourceControl and TimeProvider doubles.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStructuralScan, MAX_SCANNED_FILE_BYTES } from '../../../plugins/skraft-framework/src/application/structural-scan-service.mjs'

const doubles = (files) => {
  const reads = []
  return {
    reads,
    sourceTree: {
      listFiles: async () => Object.keys(files),
      readSource: async (path, maxBytes) => { reads.push({ path, maxBytes }); return files[path] },
    },
    sourceControl: { headSha: async () => 'abc123' },
    time: { isoString: () => '2026-10-07T00:00:00.000Z' },
  }
}

test('structural scan: reads only scannable sources, under the size cap, and reports their commitments at HEAD', async () => {
  const host = doubles({
    'src/Orders/PlaceOrderHandler.cs': 'public sealed class PlaceOrderHandler(ICommandBus bus) {}\n',
    'src/Orders/OrderSaga.cs': 'namespace Orders;\npublic sealed class OrderSaga {}\n',
    'README.md': 'We use an ICommandBus.\n',
    'node_modules/lib/index.js': 'const QueryBus = 1\n',
  })
  const report = await createStructuralScan(host).scan()

  assert.deepEqual(host.reads, [
    { path: 'src/Orders/PlaceOrderHandler.cs', maxBytes: MAX_SCANNED_FILE_BYTES },
    { path: 'src/Orders/OrderSaga.cs', maxBytes: MAX_SCANNED_FILE_BYTES },
  ], 'Markdown and node_modules are not read')
  assert.equal(MAX_SCANNED_FILE_BYTES, 1024 * 1024)
  assert.equal(report.generatedAt, '2026-10-07T00:00:00.000Z')
  assert.equal(report.revision, 'abc123')
  assert.equal(report.scannedFiles, 2)
  const byCommitment = Object.fromEntries(report.commitments.map((c) => [c.commitment, c]))
  assert.deepEqual(byCommitment['cqrs-bus'].hits, [{ path: 'src/Orders/PlaceOrderHandler.cs', line: 1, text: 'public sealed class PlaceOrderHandler(ICommandBus bus) {}' }])
  assert.deepEqual(byCommitment.saga.hits, [{ path: 'src/Orders/OrderSaga.cs', line: 2, text: 'public sealed class OrderSaga {}' }])
  assert.equal(byCommitment['event-sourcing'].detected, false)
})

test('structural scan: a source it cannot read counts as scanned but adds no hit', async () => {
  const host = doubles({ 'src/Big.cs': null, 'src/Bus.cs': 'class X : ICommandBus {}' })
  const report = await createStructuralScan(host).scan()

  assert.equal(report.scannedFiles, 2)
  const cqrs = report.commitments.find((c) => c.commitment === 'cqrs-bus')
  assert.deepEqual(cqrs.hits.map((hit) => hit.path), ['src/Bus.cs'])
  assert.equal(cqrs.hitCount, 1)
})

test('structural scan: an empty tree reports nothing detected and zero files', async () => {
  const report = await createStructuralScan(doubles({})).scan()
  assert.equal(report.scannedFiles, 0)
  assert.ok(report.commitments.every((c) => !c.detected && c.hits.length === 0))
  assert.ok(report.manualReview.length > 0)
})
