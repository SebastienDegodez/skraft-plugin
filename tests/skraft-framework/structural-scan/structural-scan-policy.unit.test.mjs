import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isScannableSource,
  scanSource,
  summariseScan,
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
  for (const extension of [
    'cs', 'fs', 'vb', 'java', 'kt', 'scala', 'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
    'py', 'go', 'rb', 'php', 'rs', 'swift',
  ]) {
    assert.equal(isScannableSource(`src/file.${extension}`), true)
  }
  for (const segment of [
    '.git', 'node_modules', 'bin', 'obj', 'dist', 'build', 'out', 'target', 'vendor',
    '.copilot-tracking', 'coverage', 'reports', 'StrykerOutput',
  ]) {
    assert.equal(isScannableSource(`src/${segment}/file.ts`), false)
  }
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

test('scanSource detects each documented structural-signature family', () => {
  const cases = [
    ['src/a.ts', 'const bus: IQueryBus = service;', 'cqrs-bus'],
    ['src/a.ts', 'const stream: EventStream = source;', 'event-sourcing'],
    ['src/a.ts', 'class PaymentProcessManager {}', 'saga'],
    ['src/a.rs', 'struct Order(ICorrelatedBy);', 'saga'],
  ]
  for (const [path, content, commitment] of cases) {
    assert.equal(scanSource(path, content)[0].commitment, commitment)
  }
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
  assert.deepEqual(scanSource('src/a.CS', '// CommandBus'), [])
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
    ['src/a.swift', 'let text = #"""\r\n Saga\r\n"""#;'],
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

test('scanSource applies slash comment rules to each supported source extension', () => {
  for (const extension of [
    'cs', 'fs', 'java', 'kt', 'scala', 'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
    'go', 'php', 'rs', 'swift',
  ]) {
    assert.deepEqual(scanSource(`src/a.${extension}`, '// CommandBus\n'), [])
    assert.deepEqual(scanSource(`src/a.${extension}`, '/* QueryBus */'), [])
  }
  for (const extension of ['py', 'rb', 'php']) {
    assert.deepEqual(scanSource(`src/a.${extension}`, '# CommandBus\n'), [])
  }
})

test('scanSource masks escaped, verbatim and multiline string literals', () => {
  for (const [path, content] of [
    ['src/a.js', String.raw`const text = "CommandBus \" Saga";`],
    ['src/a.js', 'const text = `CommandBus Saga`;'],
    ['src/a.js', 'const text = `start\nCommandBus`;'],
    ['src/a.cs', 'var text = @"QueryBus "" Saga";'],
    ['src/a.cs', 'var empty = "";'],
    ['src/a.py', 'text = """CommandBus\nSaga\nIEventStore"""'],
    ['src/a.py', 'text = """CommandBus "" Saga"""'],
    ['src/a.py', "text = '''CommandBus\nSaga\nIEventStore'''"],
    ['src/a.py', "text = '''QueryBus '' Saga'''"],
    ['src/a.swift', 'let text = #"""\n " Saga\n"""#;'],
    ['src/a.rs', 'let bytes = br#"a " CommandBus"#;'],
  ]) {
    assert.deepEqual(scanSource(path, content), [])
  }
  assert.deepEqual(scanSource('src/a.cs', 'var empty = ""; public class Saga {}'), [
    { commitment: 'saga', path: 'src/a.cs', line: 1, text: 'var empty = ""; public class Saga {}' },
  ])
})

test('scanSource keeps Swift raw multiline strings open across quote-hash sequences', () => {
  for (const newline of ['\n', '\r\n']) {
    for (const [opening, embedded, closing, code] of [
      ['let text = #"""', 'embedded "# Saga', '"""#', 'let bus = CommandBus.create()'],
      ['let text = ##"""', 'embedded """# Saga', '"""##', 'let query = QueryBus.create()'],
    ]) {
      const content = [opening, embedded, closing, code].join(newline)
      assert.deepEqual(scanSource('src/a.swift', content), [
        { commitment: 'cqrs-bus', path: 'src/a.swift', line: 4, text: code },
      ])
    }
  }
})

test('scanSource keeps Rust raw strings open across shorter quote runs', () => {
  for (const [content, code] of [
    ['let text = r#"embedded ""\nSaga"#;\nlet bus = CommandBus::new();', 'let bus = CommandBus::new();'],
    ['let text = br##"embedded ""\nQueryBus"##;\nlet query = QueryBus::new();', 'let query = QueryBus::new();'],
  ]) {
    assert.deepEqual(scanSource('src/a.rs', content), [
      { commitment: 'cqrs-bus', path: 'src/a.rs', line: 3, text: code },
    ])
  }
})

test('scanSource resumes detection after comment and string terminators', () => {
  for (const [path, content, line, text] of [
    ['src/a.ts', '// Saga\nconst bus = CommandBus.create()', 2, 'const bus = CommandBus.create()'],
    ['src/a.rs', '/* Saga */\nlet bus = CommandBus::new();', 2, 'let bus = CommandBus::new();'],
    ['src/a.py', 'text = """hidden Saga"""; bus = CommandBus()', 1, 'text = """hidden Saga"""; bus = CommandBus()'],
    ['src/a.py', "text = '''hidden QueryBus'''; bus = CommandBus()", 1, "text = '''hidden QueryBus'''; bus = CommandBus()"],
    ['src/a.cs', 'var text = @"hidden QueryBus "" Saga"; var bus = new CommandBus();', 1, 'var text = @"hidden QueryBus "" Saga"; var bus = new CommandBus();'],
  ]) {
    assert.deepEqual(scanSource(path, content), [
      { commitment: 'cqrs-bus', path, line, text },
    ])
  }
})

test('scanSource keeps Rust lifetimes and detects code after ordinary strings', () => {
  const content = [
    'const NAME: &\'static str = "orders";',
    "fn borrow<'a>(x: &'a str) -> &'a str { x }",
    'pub struct OrderSaga;',
    'let bus = CommandBus::new();',
  ].join('\n')
  assert.deepEqual(scanSource('src/a.rs', content), [
    { commitment: 'saga', path: 'src/a.rs', line: 3, text: 'pub struct OrderSaga;' },
    { commitment: 'cqrs-bus', path: 'src/a.rs', line: 4, text: 'let bus = CommandBus::new();' },
  ])
})

test('scanSource keeps F# generic apostrophes and detects following types', () => {
  const content = [
    "let id (x: 'T) = x",
    'type OrderSaga()',
  ].join('\n')
  assert.deepEqual(scanSource('src/A.fs', content), [
    { commitment: 'saga', path: 'src/A.fs', line: 2, text: 'type OrderSaga()' },
  ])
})

test('scanSource ends TSX apostrophe masking at the JSX text line', () => {
  const content = [
    "<p>Don't retry</p>",
    'const bus = new CommandBus()',
    'class CheckoutSaga {}',
  ].join('\n')
  assert.deepEqual(scanSource('src/Help.tsx', content), [
    { commitment: 'cqrs-bus', path: 'src/Help.tsx', line: 2, text: 'const bus = new CommandBus()' },
    { commitment: 'saga', path: 'src/Help.tsx', line: 3, text: 'class CheckoutSaga {}' },
  ])
})

test('scanSource treats C# at-dollar strings as verbatim interpolated strings', () => {
  const content = [
    String.raw`var dir = @$"C:\temp\{name}\";`,
    'services.AddSingleton<ICommandBus, CommandBus>();',
  ].join('\n')
  assert.deepEqual(scanSource('src/Program.cs', content), [
    { commitment: 'cqrs-bus', path: 'src/Program.cs', line: 2, text: 'services.AddSingleton<ICommandBus, CommandBus>();' },
  ])
})

test('scanSource ends ordinary quote masking at newlines', () => {
  const content = [
    'const text = "CommandBus',
    'class CheckoutSaga {}',
    "const other = 'QueryBus",
    'const bus = CommandBus.create()',
  ].join('\n')
  assert.deepEqual(scanSource('src/a.ts', content), [
    { commitment: 'saga', path: 'src/a.ts', line: 2, text: 'class CheckoutSaga {}' },
    { commitment: 'cqrs-bus', path: 'src/a.ts', line: 4, text: 'const bus = CommandBus.create()' },
  ])
})

test('scanSource detects Apply of an event and handles CRLF and non-string content', () => {
  const hits = scanSource('src/a.ts', 'x\r\n  apply()\r\n  this.Apply(new OrderPlacedEvent())')
  assert.deepEqual(hits.map((h) => [h.commitment, h.line]), [['event-sourcing', 3]])
  assert.deepEqual(scanSource('src/a.ts', undefined), [])
  assert.deepEqual(scanSource(undefined, 'const bus: CommandBus = service;')[0].commitment, 'cqrs-bus')
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
  assert.deepEqual(report.manualReview, [
    'Anti-Corruption Layer',
    'Bounded-context split or merge',
    'Aggregate crossing an existing boundary',
  ])
  assert.deepEqual(report.commitments.map(({ commitment, label }) => [commitment, label]), [
    ['cqrs-bus', 'CQRS + dispatch bus'],
    ['event-sourcing', 'Event Sourcing'],
    ['saga', 'Saga / Process Manager'],
  ])
})

test('summariseScan defaults: no revision, zero files, 20 hits per commitment', () => {
  const hits = Array.from({ length: 25 }, (_, i) => ({ commitment: 'cqrs-bus', path: 'a.cs', line: i + 1, text: 'QueryBus' }))
  const report = summariseScan(hits)
  assert.equal(report.revision, null)
  assert.equal(report.scannedFiles, 0)
  assert.equal(report.commitments[0].hits.length, 20)
})
