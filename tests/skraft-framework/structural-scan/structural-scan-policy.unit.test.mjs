import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isScannableSource,
  scanSource,
  summariseScan,
  STRUCTURAL_SIGNATURES,
  MANUAL_REVIEW,
} from '../../../plugins/skraft-framework/src/domain/structural-scan-policy.mjs'

test('isScannableSource keeps source files and skips build, dependency and tracking directories', () => {
  assert.equal(isScannableSource('src/Orders/Application/PlaceOrder.cs'), true)
  assert.equal(isScannableSource('src/app.mjs'), true)
  assert.equal(isScannableSource('src/Orders/bin/Debug/Orders.cs'), false)
  assert.equal(isScannableSource('node_modules/bus/index.js'), false)
  assert.equal(isScannableSource('.copilot-tracking/skraft-plans/demo/x.ts'), false)
  assert.equal(isScannableSource('docs/adr/adr-001-saga.md'), false)
  assert.equal(isScannableSource('Makefile'), false)
  assert.equal(isScannableSource(''), false)
  assert.equal(isScannableSource(undefined), false)
})

test('isScannableSource judges the directory segments, not the file name', () => {
  assert.equal(isScannableSource('src/build.ts'), true)
  assert.equal(isScannableSource('src\\Orders\\obj\\Orders.cs'), false)
})

test('scanSource reports each signature with its path, 1-based line and trimmed text', () => {
  const content = [
    'namespace Orders;',
    '    public sealed class PlaceOrderHandler(ICommandBus bus) {}',
    'public interface IEventStore {}',
    'public class ShippingSaga {}',
  ].join('\n')
  assert.deepEqual(scanSource('src/Orders.cs', content), [
    { commitment: 'cqrs-bus', path: 'src/Orders.cs', line: 2, text: 'public sealed class PlaceOrderHandler(ICommandBus bus) {}' },
    { commitment: 'event-sourcing', path: 'src/Orders.cs', line: 3, text: 'public interface IEventStore {}' },
    { commitment: 'saga', path: 'src/Orders.cs', line: 4, text: 'public class ShippingSaga {}' },
  ])
})

test('scanSource: direct handler injection without a bus is the CQS baseline, not a commitment', () => {
  assert.deepEqual(scanSource('src/a.cs', 'public class X(ICommandHandler<PlaceOrder> handler) {}'), [])
})

test('scanSource ignores signatures in line comments, block comments and string literals', () => {
  const content = [
    '// CommandBus and Saga',
    'const message = "CommandBus";',
    '/* IEventStore',
    '   ShippingSaga */',
    'var note = @"QueryBus";',
    'public class ShippingSagaHandler(CommandBus bus) {}',
  ].join('\n')
  assert.deepEqual(scanSource('src/a.cs', content), [
    { commitment: 'cqrs-bus', path: 'src/a.cs', line: 6, text: 'public class ShippingSagaHandler(CommandBus bus) {}' },
    { commitment: 'saga', path: 'src/a.cs', line: 6, text: 'public class ShippingSagaHandler(CommandBus bus) {}' },
  ])
  assert.deepEqual(scanSource('src/a.py', '# CommandBus'), [])
  assert.deepEqual(scanSource('src/a.py', 'pages = len(items) // 2; bus = CommandBus()'), [
    { commitment: 'cqrs-bus', path: 'src/a.py', line: 1, text: 'pages = len(items) // 2; bus = CommandBus()' },
  ])
  assert.deepEqual(scanSource('src/a.vb', "' CommandBus"), [])
  for (const [path, comment] of [
    ['src/a.fs', '(* outer (* inner *) CommandBus *)'],
    ['src/a.rs', '/* outer /* inner */ CommandBus */'],
    ['src/a.scala', '/* outer /* inner */ CommandBus */'],
    ['src/a.swift', '/* outer /* inner */ CommandBus */'],
  ]) {
    assert.deepEqual(scanSource(path, comment), [])
  }
  for (const [path, literal] of [
    ['src/a.rs', 'let text = r#"a " Saga"#;'],
    ['src/a.swift', 'let text = #"a " Saga"#;'],
    ['src/a.swift', 'let text = #"" Saga"#;'],
    ['src/a.swift', 'let text = ##"" Saga"##;'],
    ['src/a.swift', 'let text = ##"""a " Saga"""##;'],
    ['src/a.swift', 'let text = #"""\n Saga\n"""#;'],
    ['src/a.cs', 'var text = """"a """ Saga"""";'],
  ]) {
    assert.deepEqual(scanSource(path, literal), [])
  }
  assert.deepEqual(scanSource('src/a.rs', 'let quote = r#"""#; let bus = CommandBus::new();'), [
    { commitment: 'cqrs-bus', path: 'src/a.rs', line: 1, text: 'let quote = r#"""#; let bus = CommandBus::new();' },
  ])
  assert.deepEqual(scanSource('src/a.cs', 'var s = """"text""""" ;\npublic class Saga {}'), [
    { commitment: 'saga', path: 'src/a.cs', line: 2, text: 'public class Saga {}' },
  ])
})

test('scanSource detects Apply of an event and handles CRLF and non-string content', () => {
  const hits = scanSource('src/a.ts', 'x\r\n  apply()\r\n  this.Apply(new OrderPlacedEvent())')
  assert.deepEqual(hits.map((h) => [h.commitment, h.line]), [['event-sourcing', 3]])
  assert.deepEqual(scanSource('src/a.ts', undefined), [])
})

test('scanSource truncates a long line to 160 characters', () => {
  const [hit] = scanSource('src/a.ts', `const bus: CommandBus = ${'x'.repeat(400)}`)
  assert.equal(hit.text.length, 160)
})

test('summariseScan lists every commitment, detected or not, with capped hits and the manual-review list', () => {
  const hits = [1, 2, 3].map((line) => ({ commitment: 'saga', path: 'src/a.cs', line, text: 'Saga' }))
  const report = summariseScan(hits, { revision: 'abc', scannedFiles: 7, maxHits: 2 })
  assert.equal(report.revision, 'abc')
  assert.equal(report.scannedFiles, 7)
  assert.deepEqual(report.commitments.map((c) => [c.commitment, c.detected, c.hitCount]), [
    ['cqrs-bus', false, 0],
    ['event-sourcing', false, 0],
    ['saga', true, 3],
  ])
  assert.deepEqual(report.commitments[2].hits, [
    { path: 'src/a.cs', line: 1, text: 'Saga' },
    { path: 'src/a.cs', line: 2, text: 'Saga' },
  ])
  assert.deepEqual(report.manualReview, [...MANUAL_REVIEW])
  assert.equal(report.commitments[0].label, STRUCTURAL_SIGNATURES[0].label)
})

test('summariseScan defaults: no revision, zero files, 20 hits per commitment', () => {
  const hits = Array.from({ length: 25 }, (_, i) => ({ commitment: 'cqrs-bus', path: 'a.cs', line: i + 1, text: 'QueryBus' }))
  const report = summariseScan(hits)
  assert.equal(report.revision, null)
  assert.equal(report.scannedFiles, 0)
  assert.equal(report.commitments[0].hits.length, 20)
})
