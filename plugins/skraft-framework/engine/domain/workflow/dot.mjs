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
 * @param {string} text
 * @returns {{ ok: true, tokens: DotToken[] } | { ok: false, errors: string[] }}
 */
export const tokenizeDot = (text) => {
  /** @type {DotToken[]} */
  const tokens = []
  let line = 1
  let index = 0
  let lineStart = true
  /** @param {DotToken['kind']} kind @param {string} value @param {number} end @param {boolean} [quoted] */
  const push = (kind, value, end, quoted = false) => {
    tokens.push({ kind, value, quoted, line, start: index, end })
    index = end
  }
  /** @param {number} at @param {string} what */
  const fail = (at, what) => ({ ok: /** @type {const} */ (false), errors: [`line ${at}: ${what}`] })
  while (index < text.length) {
    const char = text[index]
    if (char === '\n') {
      push('newline', char, index + 1)
      line += 1
      lineStart = true
      continue
    }
    if (/\s/.test(char)) {
      index += 1
      continue
    }
    if (char === '#' && lineStart) {
      index = lineEnd(text, index)
      continue
    }
    lineStart = false
    if (text.startsWith('//', index)) {
      index = lineEnd(text, index)
      continue
    }
    if (text.startsWith('/*', index)) {
      const close = text.indexOf('*/', index + 2)
      if (close === -1) return fail(line, 'unterminated comment')
      line += text.slice(index, close).split('\n').length - 1
      index = close + 2
      continue
    }
    if (char === '"') {
      const startLine = line
      let value = ''
      let at = index + 1
      for (;;) {
        if (text[at] === undefined) return fail(startLine, 'unterminated string')
        if (text[at] === '"') break
        const escaped = text[at] === '\\' && (text[at + 1] === '"' || text[at + 1] === '\\')
        if (text[at] === '\n') line += 1
        value += escaped ? text[at + 1] : text[at]
        at += escaped ? 2 : 1
      }
      tokens.push({ kind: 'id', value, quoted: true, line: startLine, start: index, end: at + 1 })
      index = at + 1
      continue
    }
    if (text.startsWith('->', index)) {
      push('symbol', '->', index + 2)
      continue
    }
    if (text.startsWith('--', index)) return fail(line, 'undirected edges (--) are not supported; use ->')
    const word = match(NAME, text, index) ?? match(NUMERAL, text, index)
    if (word !== null) {
      push('id', word, index + word.length)
      continue
    }
    if (SYMBOLS.includes(char)) {
      push('symbol', char, index + 1)
      continue
    }
    if (char === ':') return fail(line, 'ports (a:p) are not supported')
    if (char === '<') return fail(line, 'HTML strings are not supported; use a double-quoted string')
    return fail(line, `unexpected character ${JSON.stringify(char)}`)
  }
  push('end', '', index)
  return { ok: true, tokens }
}

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

/** @param {DotToken[]} tokens ending with the `end` token @returns {DotGraph} */
const parseTokens = (tokens) => {
  let at = 0
  const peek = () => tokens[at]
  const take = () => tokens[at++]
  const skip = (/** @type {(token: DotToken) => boolean} */ skipped) => {
    while (skipped(peek())) at += 1
  }
  const newline = (/** @type {DotToken} */ token) => token.kind === 'newline'
  /** @type {Map<string, DotNode>} */
  const nodes = new Map()
  /** @type {DotEdge[]} */
  const edges = []
  /** @type {Record<string, string>} */
  const attributes = {}
  /** @param {DotToken} token @param {Record<string, string>} given */
  const declare = (token, given) => {
    const node = nodes.get(token.value) ?? { id: token.value, attributes: {}, line: token.line }
    Object.assign(node.attributes, given)
    nodes.set(token.value, node)
  }
  const attributeLists = () => {
    /** @type {Record<string, string>} */
    const listed = {}
    while (isSymbol(peek(), '[')) {
      take()
      for (;;) {
        skip((token) => newline(token) || isSymbol(token, ',') || isSymbol(token, ';'))
        const token = take()
        if (isSymbol(token, ']')) break
        const key = expectId(token, 'as attribute name')
        const equals = take()
        if (!isSymbol(equals, '=')) fail(equals, `expected = after ${key.value}, got ${describe(equals)}`)
        listed[key.value] = expectId(take(), `as the value of ${key.value}`).value
      }
    }
    return listed
  }
  const statement = () => {
    const first = take()
    if (isKeyword(first, 'graph')) {
      Object.assign(attributes, attributeLists())
      return
    }
    if (isKeyword(first, 'node') || isKeyword(first, 'edge')) {
      fail(first, `${first.value} [...] default attributes are not supported; set the attributes on each ${first.value}`)
    }
    expectId(first, 'to start a statement')
    if (isSymbol(peek(), '=')) {
      take()
      attributes[first.value] = expectId(take(), `as the value of ${first.value}`).value
      return
    }
    const chain = [first]
    while (isSymbol(peek(), '->')) {
      take()
      chain.push(expectId(take(), 'after ->'))
    }
    const listed = attributeLists()
    if (chain.length === 1) declare(first, listed)
    for (const token of chain) declare(token, {})
    for (let index = 1; index < chain.length; index += 1) {
      edges.push({ from: chain[index - 1].value, to: chain[index].value, attributes: { ...listed }, line: first.line })
    }
  }

  skip(newline)
  const opening = take()
  if (isKeyword(opening, 'strict')) fail(opening, 'strict graphs are not supported')
  if (isKeyword(opening, 'graph')) fail(opening, 'undirected graphs are not supported; use digraph')
  if (!isKeyword(opening, 'digraph')) fail(opening, `expected digraph, got ${describe(opening)}`)
  skip(newline)
  const name = isId(peek()) ? take().value : null
  skip(newline)
  const brace = take()
  if (!isSymbol(brace, '{')) fail(brace, `expected {, got ${describe(brace)}`)
  for (;;) {
    skip((token) => newline(token) || isSymbol(token, ';'))
    const next = peek()
    if (next.kind === 'end') fail(next, 'missing } at the end of the graph')
    if (isSymbol(next, '}')) break
    statement()
    const after = peek()
    if (!newline(after) && !isSymbol(after, ';') && !isSymbol(after, '}') && after.kind !== 'end') {
      fail(after, `unexpected ${describe(after)}; end the statement with a new line or ;`)
    }
  }
  take()
  skip(newline)
  const rest = peek()
  if (rest.kind !== 'end') fail(rest, `unexpected ${describe(rest)} after the closing }`)
  return { name, attributes, nodes: [...nodes.values()], edges }
}
