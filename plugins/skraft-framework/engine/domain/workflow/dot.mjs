/**
 * The subset of Graphviz DOT a skraft workflow is written in: one `digraph`, node statements,
 * edge chains, `graph [...]` attributes, comments. Every other construct is refused with its
 * line, so a workflow never means something the engine does not read.
 *
 * @typedef {{ kind: 'id' | 'symbol' | 'newline' | 'end', value: string, quoted: boolean, line: number, start: number, end: number }} DotToken
 *   id: a name, a numeral or a double-quoted string (value unescaped); start/end: offsets in the text.
 * @typedef {{ id: string, attributes: Record<string, string>, line: number }} DotNode
 * @typedef {{ from: string, to: string, attributes: Record<string, string>, line: number }} DotEdge
 * @typedef {{ name: string | null, attributes: Record<string, string>, nodes: DotNode[], edges: DotEdge[] }} DotGraph
 */

const KEYWORDS = Object.freeze(['strict', 'graph', 'digraph', 'subgraph', 'node', 'edge'])
const NAME = /[A-Za-z_][A-Za-z0-9_]*/y
const NUMERAL = /-?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)/y
const SYMBOLS = '{}[]=,;'

/**
 * @typedef {{ text: string, tokens: DotToken[], line: number, index: number, lineStart: boolean }} Scan
 *   the tokenizer's position: index in the text, line of that index, nothing but blanks before it on its line.
 * @typedef {{ ok: true } | { ok: false, errors: string[] }} ScanStep
 * @typedef {(scan: Scan) => ScanStep | null} TokenReader null when the text at the index is not its kind
 */

/** @type {ScanStep} */
const CONSUMED = Object.freeze({ ok: /** @type {const} */ (true) })

/**
 * @param {string} text
 * @returns {{ ok: true, tokens: DotToken[] } | { ok: false, errors: string[] }}
 */
export const tokenizeDot = (text) => {
  /** @type {Scan} */
  const scan = { text, tokens: [], line: 1, index: 0, lineStart: true }
  while (scan.index < text.length) {
    const step = readToken(scan)
    if (!step.ok) return step
  }
  push(scan, 'end', '', scan.index)
  return { ok: true, tokens: scan.tokens }
}

/** @param {Scan} scan @returns {ScanStep} */
const readToken = (scan) => {
  const blank = firstStep(BLANK_READERS, scan)
  if (blank !== null) return blank
  scan.lineStart = false
  return /** @type {ScanStep} */ (firstStep(TOKEN_READERS, scan))
}

/** @param {TokenReader[]} readers @param {Scan} scan @returns {ScanStep | null} the step of the first reader that applies */
const firstStep = (readers, scan) => {
  for (const reader of readers) {
    const step = reader(scan)
    if (step !== null) return step
  }
  return null
}

/** @param {Scan} scan @param {DotToken['kind']} kind @param {string} value @param {number} end @param {boolean} [quoted] */
const push = (scan, kind, value, end, quoted = false) => {
  scan.tokens.push({ kind, value, quoted, line: scan.line, start: scan.index, end })
  scan.index = end
}

/** @param {number} line @param {string} what @returns {ScanStep} */
const failAt = (line, what) => ({ ok: /** @type {const} */ (false), errors: [`line ${line}: ${what}`] })

/** @param {string} text */
const newlinesIn = (text) => text.split('\n').length - 1

/** @type {TokenReader} */
const readNewline = (scan) => {
  if (scan.text[scan.index] !== '\n') return null
  push(scan, 'newline', '\n', scan.index + 1)
  scan.line += 1
  scan.lineStart = true
  return CONSUMED
}

/** @type {TokenReader} */
const skipWhitespace = (scan) => {
  if (!/\s/.test(scan.text[scan.index])) return null
  scan.index += 1
  return CONSUMED
}

/** @type {TokenReader} */
const skipHashComment = (scan) => {
  if (scan.text[scan.index] !== '#' || !scan.lineStart) return null
  scan.index = lineEnd(scan.text, scan.index)
  return CONSUMED
}

/** @type {TokenReader} */
const skipLineComment = (scan) => {
  if (!scan.text.startsWith('//', scan.index)) return null
  scan.index = lineEnd(scan.text, scan.index)
  return CONSUMED
}

/** @type {TokenReader} */
const skipBlockComment = (scan) => {
  if (!scan.text.startsWith('/*', scan.index)) return null
  const close = scan.text.indexOf('*/', scan.index + 2)
  if (close === -1) return failAt(scan.line, 'unterminated comment')
  scan.line += newlinesIn(scan.text.slice(scan.index, close))
  scan.index = close + 2
  return CONSUMED
}

/** @type {TokenReader} */
const readString = (scan) => {
  if (scan.text[scan.index] !== '"') return null
  const string = scanString(scan.text, scan.index + 1)
  if (string === null) return failAt(scan.line, 'unterminated string')
  push(scan, 'id', string.value, string.end, true)
  scan.line += newlinesIn(string.value)
  return CONSUMED
}

/**
 * @param {string} text @param {number} from the offset after the opening quote
 * @returns {{ value: string, end: number } | null} the unescaped value and the offset after the closing quote; null when unterminated
 */
const scanString = (text, from) => {
  let value = ''
  let at = from
  while (text[at] !== '"') {
    if (text[at] === undefined) return null
    const escaped = isEscape(text, at)
    value += escaped ? text[at + 1] : text[at]
    at += escaped ? 2 : 1
  }
  return { value, end: at + 1 }
}

/** @param {string} text @param {number} at */
const isEscape = (text, at) => text[at] === '\\' && (text[at + 1] === '"' || text[at + 1] === '\\')

/** @type {TokenReader} */
const readArrow = (scan) => {
  if (!scan.text.startsWith('->', scan.index)) return null
  push(scan, 'symbol', '->', scan.index + 2)
  return CONSUMED
}

/** @type {TokenReader} */
const refuseUndirectedEdge = (scan) => (scan.text.startsWith('--', scan.index) ? failAt(scan.line, 'undirected edges (--) are not supported; use ->') : null)

/** @type {TokenReader} */
const readWord = (scan) => {
  const word = match(NAME, scan.text, scan.index) ?? match(NUMERAL, scan.text, scan.index)
  if (word === null) return null
  push(scan, 'id', word, scan.index + word.length)
  return CONSUMED
}

/** @type {TokenReader} */
const readSymbol = (scan) => {
  const char = scan.text[scan.index]
  if (!SYMBOLS.includes(char)) return null
  push(scan, 'symbol', char, scan.index + 1)
  return CONSUMED
}

/** @type {ReadonlyMap<string, string>} */
const REFUSED_CHARACTERS = new Map([
  [':', 'ports (a:p) are not supported'],
  ['<', 'HTML strings are not supported; use a double-quoted string'],
])

/** @type {TokenReader} */
const refuseCharacter = (scan) => {
  const char = scan.text[scan.index]
  return failAt(scan.line, REFUSED_CHARACTERS.get(char) ?? `unexpected character ${JSON.stringify(char)}`)
}

/** Read while the line holds nothing but blanks: a `#` there starts a comment. */
const BLANK_READERS = Object.freeze([readNewline, skipWhitespace, skipHashComment])
/** The last reader refuses whatever no other reader takes. */
const TOKEN_READERS = Object.freeze([skipLineComment, skipBlockComment, readString, readArrow, refuseUndirectedEdge, readWord, readSymbol, refuseCharacter])

/** @param {string} text @param {number} from @returns {number} the offset of the next newline, or the end */
const lineEnd = (text, from) => `${text}\n`.indexOf('\n', from)

/** @param {RegExp} pattern a sticky pattern @param {string} text @param {number} index */
const match = (pattern, text, index) => {
  pattern.lastIndex = index
  return pattern.exec(text)?.[0] ?? null
}

/** @param {DotToken} token @param {string} value */
export const isSymbol = (token, value) => token.kind === 'symbol' && token.value === value

/** @param {DotToken} token @param {string} value */
export const isKeyword = (token, value) => token.kind === 'id' && !token.quoted && token.value === value

/** @param {DotToken} token */
const isId = (token) => token.kind === 'id' && (token.quoted || !KEYWORDS.includes(token.value))

/** @param {DotToken} token */
const describe = (token) => (token.kind === 'end' ? 'end of file' : token.kind === 'newline' ? 'end of line' : JSON.stringify(token.value))

/**
 * @param {string} text
 * @returns {{ ok: true, graph: DotGraph } | { ok: false, errors: string[] }}
 */
export const parseDot = (text) => {
  const lexed = tokenizeDot(text)
  if (!lexed.ok) return lexed
  try {
    return { ok: true, graph: parseTokens(lexed.tokens) }
  } catch (error) {
    return { ok: false, errors: [/** @type {Error} */ (error).message] }
  }
}

/** @param {DotToken} token @param {string} what @returns {never} */
const fail = (token, what) => {
  throw new Error(`line ${token.line}: ${what}`)
}

/** @param {DotToken} token @param {string} where @returns {DotToken} */
const expectId = (token, where) => {
  if (isSymbol(token, '{')) fail(token, '{ } groups are not supported')
  if (isKeyword(token, 'subgraph')) fail(token, 'subgraph is not supported')
  if (!isId(token)) fail(token, `expected an ID ${where}, got ${describe(token)}`)
  return token
}

/**
 * @typedef {{ tokens: DotToken[], at: number }} Cursor
 * @typedef {{ nodes: Map<string, DotNode>, edges: DotEdge[], attributes: Record<string, string> }} GraphParts
 */

/** @param {DotToken[]} tokens ending with the `end` token @returns {DotGraph} */
const parseTokens = (tokens) => {
  /** @type {Cursor} */
  const cursor = { tokens, at: 0 }
  const name = readHeader(cursor)
  /** @type {GraphParts} */
  const graph = { nodes: new Map(), edges: [], attributes: {} }
  readBody(cursor, graph)
  readTrailer(cursor)
  return { name, attributes: graph.attributes, nodes: [...graph.nodes.values()], edges: graph.edges }
}

/** @param {Cursor} cursor */
const peek = (cursor) => cursor.tokens[cursor.at]

/** @param {Cursor} cursor */
const take = (cursor) => {
  const token = peek(cursor)
  cursor.at += 1
  return token
}

/** @param {Cursor} cursor @param {(token: DotToken) => boolean} skipped */
const skip = (cursor, skipped) => {
  while (skipped(peek(cursor))) cursor.at += 1
}

/** @param {DotToken} token */
const isNewline = (token) => token.kind === 'newline'

/** @param {DotToken} token */
const isStatementSeparator = (token) => isNewline(token) || isSymbol(token, ';')

/** @param {DotToken} token */
const isAttributeSeparator = (token) => isNewline(token) || isSymbol(token, ',') || isSymbol(token, ';')

/** `digraph [name] {` @param {Cursor} cursor @returns {string | null} the graph's name */
const readHeader = (cursor) => {
  skip(cursor, isNewline)
  expectDigraph(take(cursor))
  skip(cursor, isNewline)
  const name = isId(peek(cursor)) ? take(cursor).value : null
  skip(cursor, isNewline)
  const brace = take(cursor)
  if (!isSymbol(brace, '{')) fail(brace, `expected {, got ${describe(brace)}`)
  return name
}

/** @param {DotToken} opening */
const expectDigraph = (opening) => {
  if (isKeyword(opening, 'strict')) fail(opening, 'strict graphs are not supported')
  if (isKeyword(opening, 'graph')) fail(opening, 'undirected graphs are not supported; use digraph')
  if (!isKeyword(opening, 'digraph')) fail(opening, `expected digraph, got ${describe(opening)}`)
}

/** The statements up to the closing `}`, left unread. @param {Cursor} cursor @param {GraphParts} graph */
const readBody = (cursor, graph) => {
  while (!reachedClosingBrace(cursor)) {
    readStatement(cursor, graph)
    expectStatementEnd(peek(cursor))
  }
}

/** @param {Cursor} cursor @returns {boolean} true at the `}`, false at the next statement */
const reachedClosingBrace = (cursor) => {
  skip(cursor, isStatementSeparator)
  const next = peek(cursor)
  if (next.kind === 'end') fail(next, 'missing } at the end of the graph')
  return isSymbol(next, '}')
}

/** @param {DotToken} after the token that follows a statement */
const expectStatementEnd = (after) => {
  if (!isNewline(after) && !isSymbol(after, ';') && !isSymbol(after, '}') && after.kind !== 'end') {
    fail(after, `unexpected ${describe(after)}; end the statement with a new line or ;`)
  }
}

/** The closing `}` and nothing after it. @param {Cursor} cursor */
const readTrailer = (cursor) => {
  take(cursor)
  skip(cursor, isNewline)
  const rest = peek(cursor)
  if (rest.kind !== 'end') fail(rest, `unexpected ${describe(rest)} after the closing }`)
}

/** @param {Cursor} cursor @param {GraphParts} graph */
const readStatement = (cursor, graph) => {
  const first = take(cursor)
  if (isKeyword(first, 'graph')) {
    Object.assign(graph.attributes, readAttributeLists(cursor))
    return
  }
  refuseDefaultAttributes(first)
  expectId(first, 'to start a statement')
  if (isSymbol(peek(cursor), '=')) readGraphAssignment(cursor, graph, first)
  else readNodeOrEdges(cursor, graph, first)
}

/** @param {DotToken} first */
const refuseDefaultAttributes = (first) => {
  if (isKeyword(first, 'node') || isKeyword(first, 'edge')) {
    fail(first, `${first.value} [...] default attributes are not supported; set the attributes on each ${first.value}`)
  }
}

/** `key = value` @param {Cursor} cursor @param {GraphParts} graph @param {DotToken} key */
const readGraphAssignment = (cursor, graph, key) => {
  take(cursor)
  graph.attributes[key.value] = expectId(take(cursor), `as the value of ${key.value}`).value
}

/** `a [...]` or `a -> b -> c [...]` @param {Cursor} cursor @param {GraphParts} graph @param {DotToken} first */
const readNodeOrEdges = (cursor, graph, first) => {
  const chain = readChain(cursor, first)
  const listed = readAttributeLists(cursor)
  if (chain.length === 1) declare(graph, first, listed)
  for (const token of chain) declare(graph, token, {})
  addEdges(graph, chain, listed)
}

/** @param {Cursor} cursor @param {DotToken} first @returns {DotToken[]} the IDs joined by -> */
const readChain = (cursor, first) => {
  const chain = [first]
  while (isSymbol(peek(cursor), '->')) {
    take(cursor)
    chain.push(expectId(take(cursor), 'after ->'))
  }
  return chain
}

/** @param {GraphParts} graph @param {DotToken} token @param {Record<string, string>} given */
const declare = (graph, token, given) => {
  const node = graph.nodes.get(token.value) ?? { id: token.value, attributes: {}, line: token.line }
  Object.assign(node.attributes, given)
  graph.nodes.set(token.value, node)
}

/** @param {GraphParts} graph @param {DotToken[]} chain @param {Record<string, string>} listed */
const addEdges = (graph, chain, listed) => {
  for (let index = 1; index < chain.length; index += 1) {
    graph.edges.push({ from: chain[index - 1].value, to: chain[index].value, attributes: { ...listed }, line: chain[0].line })
  }
}

/** Every `[...]` in a row, merged. @param {Cursor} cursor @returns {Record<string, string>} */
const readAttributeLists = (cursor) => {
  /** @type {Record<string, string>} */
  const listed = {}
  while (isSymbol(peek(cursor), '[')) {
    take(cursor)
    readAttributeList(cursor, listed)
  }
  return listed
}

/** The attributes up to and including `]`. @param {Cursor} cursor @param {Record<string, string>} listed */
const readAttributeList = (cursor, listed) => {
  for (;;) {
    skip(cursor, isAttributeSeparator)
    const token = take(cursor)
    if (isSymbol(token, ']')) return
    readAttribute(cursor, token, listed)
  }
}

/** `key = value` @param {Cursor} cursor @param {DotToken} name @param {Record<string, string>} listed */
const readAttribute = (cursor, name, listed) => {
  const key = expectId(name, 'as attribute name')
  const equals = take(cursor)
  if (!isSymbol(equals, '=')) fail(equals, `expected = after ${key.value}, got ${describe(equals)}`)
  listed[key.value] = expectId(take(cursor), `as the value of ${key.value}`).value
}
