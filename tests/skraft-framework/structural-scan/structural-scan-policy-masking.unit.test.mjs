import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scanSource } from '../../../plugins/skraft-framework/src/domain/structural-scan-policy.mjs'

// Edge cases of the comment / string masking, one language family at a time. Each case
// pins the exact [line, commitment] pairs: a signature hidden in a comment or literal must
// stay hidden, and code after a terminator (or a newline) must stay visible.
const hits = (path, content) => scanSource(path, content).map(({ line, commitment }) => [line, commitment])
const check = (cases) => {
  for (const [path, content, expected] of cases) {
    assert.deepEqual(hits(path, content), expected, `${path}: ${JSON.stringify(content)}`)
  }
}
const CQRS = 'cqrs-bus'
const SAGA = 'saga'

test('F# nests slash block comments too', () => {
  check([
    ['src/a.fs', '/* outer /* inner */ CommandBus */\nlet q = QueryBus()', [[2, CQRS]]],
  ])
})

test('nested block comments open only on a full opener and close only on a full closer', () => {
  check([
    ['src/a.rs', '/* a / CommandBus */\nlet q = QueryBus::new();', [[2, CQRS]]],
    ['src/a.rs', '/* /*/ */ CommandBus */\nlet q = QueryBus::new();', [[2, CQRS]]],
    ['src/a.ts', '/* a * Saga */\nconst q = QueryBus.create()', [[2, CQRS]]],
  ])
})

test('Rust and F# char literals are masked, including quote and escaped chars', () => {
  check([
    ['src/a.rs', '\'"\'; let bus = CommandBus::new();', [[1, CQRS]]],
    ['src/a.rs', 'let q = \'"\'; let bus = CommandBus::new();', [[1, CQRS]]],
    ['src/a.fs', 'let q = \'"\' in CommandBus.create()', [[1, CQRS]]],
    ['src/a.rs', String.raw`let q = '\"'; let bus = CommandBus::new();`, [[1, CQRS]]],
  ])
})

test('an apostrophe not closed two characters later is a lifetime or generic, not a literal', () => {
  check([
    ['src/a.rs', "let a = 'xCommandBus;", [[1, CQRS]]],
  ])
})

test('a char literal never spans a line break', () => {
  for (const newline of ['\n', '\r']) {
    const line = newline === '\n' ? 2 : 1
    check([
      ['src/a.rs', `let a = '${newline}'"'; let bus = CommandBus::new();`, [[line, CQRS]]],
      ['src/a.rs', `let a = '\\${newline}'"'; let bus = CommandBus::new();`, [[line, CQRS]]],
    ])
  }
})

test('C# raw string literals span lines', () => {
  check([
    ['src/a.cs', 'var s = """\nCommandBus\n""";\nvar q = new QueryBus();', [[4, CQRS]]],
  ])
})

test('the Rust raw prefix is masked with its opening quote', () => {
  // `r"` opens a raw string, so the `r` belongs to the literal, not to the identifier.
  check([
    ['src/a.rs', 'let pm = ProcessManager"x";\nlet bus = CommandBus::new();', [[2, CQRS]]],
  ])
})

test('a Rust raw string content is masked up to its own closing quote', () => {
  check([
    ['src/a.rs', 'let s = r"CommandBus";\nlet q = QueryBus::new();', [[2, CQRS]]],
    ['src/a.rs', 'let s = r#"a"#"Saga";', []],
    ['src/a.rs', 'let s = r"a"// Saga', []],
  ])
})

test('outside Rust an r before a quote is an identifier and the string keeps its escapes', () => {
  check([
    ['src/a.ts', 'const s = r"a\\" CommandBus"\nconst q = QueryBus.create()', [[2, CQRS]]],
  ])
})

test('Rust ordinary and byte strings honour escapes', () => {
  check([
    ['src/a.rs', 'let s = "a\\" CommandBus";\nlet q = QueryBus::new();', [[2, CQRS]]],
    ['src/a.rs', 'let s = "raw CommandBus";', []],
    ['src/a.rs', 'let s = bz"a\\" CommandBus";', []],
  ])
})

test('a lone carriage return ends a line comment and an ordinary string', () => {
  check([
    ['src/a.ts', '// note\rconst bus = CommandBus.create()', [[1, CQRS]]],
    ['src/a.ts', 'const s = "abc\rconst bus = CommandBus.create()', [[1, CQRS]]],
  ])
})

test('a backslash before a line break does not carry an ordinary string to the next line', () => {
  check([
    ['src/a.js', 'const s = "abc\\\nconst bus = CommandBus.create()', [[2, CQRS]]],
    ['src/a.js', 'const s = "abc\\\rconst bus = CommandBus.create()', [[1, CQRS]]],
  ])
})

test('a doubled quote inside a verbatim string keeps it open across lines', () => {
  check([
    ['src/a.cs', 'var s = @"a""\nCommandBus\n";\nvar q = new QueryBus();', [[4, CQRS]]],
  ])
})

test('closing a verbatim or triple string consumes exactly its delimiter', () => {
  check([
    ['src/a.py', 'x = """doc""""\nbus = CommandBus()', [[2, CQRS]]],
    ['src/a.py', "x = '''doc''''\nbus = CommandBus()", [[2, CQRS]]],
    ['src/a.js', 'const a = "x" + "\\" CommandBus "', []],
  ])
})

test('a triple string closes only on three consecutive quotes', () => {
  check([
    ['src/a.py', 'x = """ab"CommandBus"""', []],
    ['src/a.py', 'x = """a"b"CommandBus"""', []],
    ['src/a.py', 'x = """"" CommandBus"""', []],
    ['src/a.py', "x = ''''' CommandBus'''", []],
  ])
})

test('opening a comment or triple string never masks the character before it', () => {
  check([
    ['src/a.ts', 'const bus = CommandBus// trailing', [[1, CQRS]]],
    ['src/a.fs', 'let bus = CommandBus(* note *)', [[1, CQRS]]],
    ['src/a.py', 'Saga"""doc"""', [[1, SAGA]]],
    ['src/a.py', "Saga'''doc'''", [[1, SAGA]]],
    ['src/a.cs', 'var s = Saga"""x""";', [[1, SAGA]]],
  ])
})

test('division and multiplication are not comment openers', () => {
  check([
    ['src/a.ts', 'const half = total / 2; const bus = CommandBus.create()', [[1, CQRS]]],
    ['src/a.py', 'print(*args); bus = CommandBus()', [[1, CQRS]]],
    ['src/a.py', 'area = width * height; bus = CommandBus()', [[1, CQRS]]],
    ['src/a.fs', 'let area = w * h\nlet bus = CommandBus()', [[2, CQRS]]],
  ])
})

test('a VB apostrophe comment runs to the end of the line', () => {
  check([
    ['src/a.vb', "' it's CommandBus\nDim q As QueryBus", [[2, CQRS]]],
  ])
})

test('hash raw strings are Swift only', () => {
  check([
    ['src/a.ts', 'x#"a"; const bus = CommandBus.create()', [[1, CQRS]]],
    ['src/a.swift', 'let s = "a\\" CommandBus"\nlet q = QueryBus()', [[2, CQRS]]],
    ['src/a.swift', '#if DEBUG\nlet bus = CommandBus()\n#endif', [[2, CQRS]]],
  ])
})

test('a Swift raw string is multiline only when three quotes end the opening line', () => {
  check([
    ['src/a.swift', 'let s = #"a"#; let bus = CommandBus()', [[1, CQRS]]],
    ['src/a.swift', 'let s = #"ab\n"#; let bus = CommandBus()', [[2, CQRS]]],
    ['src/a.swift', 'let s = #"x"\n"#; let bus = CommandBus()', [[2, CQRS]]],
    ['src/a.swift', 'let s = #""x\n"#; let bus = CommandBus()', [[2, CQRS]]],
    ['src/a.swift', 'let s = #"""a"#; let bus = CommandBus()', [[1, CQRS]]],
  ])
})

test('C# ordinary and interpolated strings honour escapes', () => {
  check([
    ['src/a.cs', 'var s = "a\\" CommandBus";\nvar q = new QueryBus();', [[2, CQRS]]],
    ['src/a.cs', 'var s = $"a\\" CommandBus";\nvar q = new QueryBus();', [[2, CQRS]]],
    ['src/a.js', 'const s = @$"a\\" CommandBus"\nconst q = QueryBus.create()', [[2, CQRS]]],
    ['src/a.py', 'x = """a\\""" + CommandBus"""', []],
  ])
})

test('C# verbatim strings: @"" is empty, @$ needs a quote, backslash is literal', () => {
  check([
    ['src/a.cs', 'var s = @""; var bus = new CommandBus();', [[1, CQRS]]],
    ['src/a.cs', 'var x = @$\nvar bus = new CommandBus();', [[2, CQRS]]],
    ['src/a.cs', 'var path = @"C:\\"; var bus = new CommandBus();', [[1, CQRS]]],
    ['src/a.cs', 'var s = @"a\nCommandBus";\nvar q = new QueryBus();', [[3, CQRS]]],
  ])
})

test('an at-sign alone (decorator, attribute) opens no string', () => {
  check([
    ['src/a.ts', '@Injectable() class X { constructor(bus: CommandBus) {} }', [[1, CQRS]]],
  ])
})

test('one- and two-quote strings are not triple strings', () => {
  check([
    ['src/a.js', 'const a = "x"; const bus = CommandBus.create()', [[1, CQRS]]],
    ['src/a.js', 'const a = ""; const bus = CommandBus.create()', [[1, CQRS]]],
    ['src/a.py', "x = ''; bus = CommandBus()", [[1, CQRS]]],
  ])
})
