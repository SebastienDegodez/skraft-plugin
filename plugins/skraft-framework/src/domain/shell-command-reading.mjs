// Pure: reads a shell command line the way a POSIX shell splits it, far enough for the
// session guard (G7/G8) to know which files a command writes. No IO, no execution.
//
// readCommandLine(command, { vars? }) → [{ words, redirects }] — every simple command the
// line runs, in order, nested ones included:
//   words      the command's words, quotes and escapes removed as the shell removes them
//              ('state.json', "state".json, state\.json and $'\x73tate.json' are all
//              `state.json`); a $NAME / ${NAME} the line assigned earlier is
//              substituted; brace expansion ({a,b}) yields one word per variant; any other
//              expansion ($UNKNOWN, ${X:-…}, $(…), `…`, $((…)), {1..3}) is replaced by
//              UNKNOWN — the caller decides what an unknown piece may be (~ and globs are
//              kept literal)
//   redirects  [{ op, target }] for >, >>, >|, &>, &>>, n>…; reads (<, <<, <<<) and
//              descriptor copies (2>&1) are left out
// Commands substituted inside $(…), backticks, $((…)) or ${…} are returned too: they run.
//
// Not read: aliases, functions defined elsewhere, scripts run from a file (bash x.sh,
// source x), here-document bodies are read as commands (conservative: a body that names
// a protected file is treated as if it ran).

export const UNKNOWN = '\u0000'

const isSpace = (char) => char === ' ' || char === '\t' || char === '\r'
const isNameStart = (char) => /[A-Za-z_]/.test(char ?? '')
const isNameChar = (char) => /[A-Za-z0-9_]/.test(char ?? '')
const SEPARATORS = new Set([';', '&', '|', '\n', '(', ')'])

// The text of a $(…) starting at `start` (just after "$("), and the index after its ")".
const substitutionAt = (text, start) => {
  let depth = 1
  let quote = null
  for (let i = start; i < text.length; i += 1) {
    const char = text[i]
    if (quote) {
      if (char === '\\' && quote === '"') { i += 1; continue }
      if (char === quote) quote = null
      continue
    }
    if (char === '\\') { i += 1; continue }
    if (char === '"' || char === "'") quote = char
    else if (char === '(') depth += 1
    else if (char === ')') {
      depth -= 1
      if (depth === 0) return { inner: text.slice(start, i), end: i + 1 }
    }
  }
  return { inner: text.slice(start), end: text.length }
}

// The index of the "}" closing a "{" opened just before `start`, nested braces, quotes and
// substitutions skipped; -1 when it never closes.
const braceEnd = (text, start) => {
  let depth = 1
  let quote = null
  for (let i = start; i < text.length; i += 1) {
    const char = text[i]
    if (quote) {
      if (char === '\\' && quote === '"') { i += 1; continue }
      if (char === quote) quote = null
      continue
    }
    if (char === '\\') { i += 1; continue }
    if (char === '"' || char === "'" || char === '`') quote = char
    else if (char === '$' && text[i + 1] === '(') i = substitutionAt(text, i + 2).end - 1
    else if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

// $'…' (ANSI-C quoting): the text up to the closing quote, its escapes decoded; an escape
// it cannot decode makes the piece UNKNOWN.
const SIMPLE_ESCAPES = { a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\', "'": "'", '"': '"', '?': '?' }
const ansiCAt = (text, start) => {
  let out = ''
  let i = start
  while (i < text.length && text[i] !== "'") {
    if (text[i] !== '\\') { out += text[i]; i += 1; continue }
    const next = text[i + 1] ?? ''
    if (Object.hasOwn(SIMPLE_ESCAPES, next)) { out += SIMPLE_ESCAPES[next]; i += 2; continue }
    const hex = /^x([0-9A-Fa-f]{1,2})/.exec(text.slice(i + 1)) ?? /^u([0-9A-Fa-f]{1,4})/.exec(text.slice(i + 1)) ?? /^U([0-9A-Fa-f]{1,8})/.exec(text.slice(i + 1))
    const octal = /^([0-7]{1,3})/.exec(text.slice(i + 1))
    if (hex) { out += String.fromCodePoint(Number.parseInt(hex[1], 16)); i += 1 + hex[0].length; continue }
    if (octal) { out += String.fromCodePoint(Number.parseInt(octal[1], 8)); i += 1 + octal[0].length; continue }
    out += UNKNOWN
    i += 2
  }
  return { value: out, end: i + 1 }
}

// The variants of a brace expansion's body ("a,b,{c,d}"): its top-level comma pieces, or
// null when it has none (then the braces are literal, as in `{}` or `{ cmd; }`).
const braceVariants = (body) => {
  const variants = []
  let depth = 0
  let from = 0
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === '{') depth += 1
    else if (body[i] === '}') depth -= 1
    else if (body[i] === ',' && depth === 0) { variants.push(body.slice(from, i)); from = i + 1 }
  }
  if (variants.length === 0) return null
  variants.push(body.slice(from))
  return variants.map((variant) => variant.replace(/["']/g, ''))
}
const MAX_VARIANTS = 64

// Tokens of one simple command (separators already split off by splitSimpleCommands):
// { type: 'word', value } | { type: 'redirect', value }. `nested` collects the command
// lines of $(…) and backticks.
const tokenize = (text, vars, nested) => {
  const tokens = []
  let word = null // the word being read, as its variants (several after a brace expansion)
  const append = (piece) => { word = (word ?? ['']).map((variant) => variant + piece) }
  const fork = (pieces) => {
    const variants = (word ?? ['']).flatMap((variant) => pieces.map((piece) => variant + piece))
    word = variants.length > MAX_VARIANTS ? (word ?? ['']).map((variant) => variant + UNKNOWN) : variants
  }
  const flush = () => {
    if (word !== null) for (const value of word) tokens.push({ type: 'word', value })
    word = null
  }
  const expand = (i, inDouble = false) => {
    // text[i] === '$'
    const next = text[i + 1]
    if (next === "'" && !inDouble) { // $'…': ANSI-C quoting
      const { value, end } = ansiCAt(text, i + 2)
      append(value)
      return end
    }
    if (next === '"' && !inDouble) return i + 1 // $"…": a translated double-quoted string
    if (next === '(') {
      if (text[i + 2] === '(') { // $(( arithmetic )): a number, but $( ) inside it runs
        const { inner, end } = substitutionAt(text, i + 2) // from the inner '(' to the outer ')'
        tokenize(inner, vars, nested)
        append(UNKNOWN)
        return end
      }
      const { inner, end } = substitutionAt(text, i + 2)
      nested.push(inner)
      append(UNKNOWN)
      return end
    }
    if (next === '{') {
      const close = braceEnd(text, i + 2)
      const body = close < 0 ? text.slice(i + 2) : text.slice(i + 2, close)
      tokenize(body, vars, nested) // ${X:-$(cmd)} runs cmd
      append(/^[A-Za-z_][A-Za-z0-9_]*$/.test(body) && Object.hasOwn(vars, body) ? vars[body] : UNKNOWN)
      return close < 0 ? text.length : close + 1
    }
    if (isNameStart(next)) {
      let j = i + 1
      while (isNameChar(text[j])) j += 1
      const name = text.slice(i + 1, j)
      append(Object.hasOwn(vars, name) ? vars[name] : UNKNOWN)
      return j
    }
    if (next && /[0-9@*#?$!-]/.test(next)) { append(UNKNOWN); return i + 2 }
    append('$')
    return i + 1
  }

  let i = 0
  while (i < text.length) {
    const char = text[i]
    if (char === '\\') {
      if (text[i + 1] === '\n') { i += 2; continue } // line continuation
      append(text[i + 1] ?? '')
      i += 2
      continue
    }
    if (char === "'") {
      const close = text.indexOf("'", i + 1)
      append(close < 0 ? text.slice(i + 1) : text.slice(i + 1, close))
      i = close < 0 ? text.length : close + 1
      continue
    }
    if (char === '"') {
      append('')
      i += 1
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && /[$`"\\\n]/.test(text[i + 1] ?? '')) { append(text[i + 1] === '\n' ? '' : text[i + 1]); i += 2; continue }
        if (text[i] === '$') { i = expand(i, true); continue }
        if (text[i] === '`') {
          const close = text.indexOf('`', i + 1)
          nested.push(close < 0 ? text.slice(i + 1) : text.slice(i + 1, close))
          append(UNKNOWN)
          i = close < 0 ? text.length : close + 1
          continue
        }
        append(text[i])
        i += 1
      }
      i += 1
      continue
    }
    if (char === '`') {
      const close = text.indexOf('`', i + 1)
      nested.push(close < 0 ? text.slice(i + 1) : text.slice(i + 1, close))
      append(UNKNOWN)
      i = close < 0 ? text.length : close + 1
      continue
    }
    if (char === '$') { i = expand(i); continue }
    if (char === '{') { // brace expansion: {a,b} → one word per variant; {1..3} → unknown
      const close = braceEnd(text, i + 1)
      const body = close < 0 ? null : text.slice(i + 1, close)
      const variants = body === null ? null : braceVariants(body)
      if (variants) { fork(variants); i = close + 1; continue }
      if (body !== null && /^-?[A-Za-z0-9]+\.\.-?[A-Za-z0-9]+(?:\.\.-?[0-9]+)?$/.test(body)) { append(UNKNOWN); i = close + 1; continue }
    }
    if (char === '#' && word === null) { // a comment runs to the end of the line
      const end = text.indexOf('\n', i)
      i = end < 0 ? text.length : end
      continue
    }
    if (isSpace(char)) { flush(); i += 1; continue }
    // Redirections: an optional descriptor number glued to the operator, or &> / &>>.
    if (char === '>' || char === '<' || (char === '&' && text[i + 1] === '>')) {
      let fd = ''
      if (word !== null && word.length === 1 && /^[0-9]+$/.test(word[0])) { fd = word[0]; word = null }
      flush()
      const op = /^(?:&>>|&>|>>|>\||>&|>|<<<|<<-|<<|<&|<>|<)/.exec(text.slice(i))[0]
      tokens.push({ type: 'redirect', value: fd + op })
      i += op.length
      continue
    }
    append(char)
    i += 1
  }
  flush()
  return tokens
}

const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/
const DECLARING = new Set(['export', 'declare', 'typeset', 'local', 'readonly'])

// A descriptor copy (2>&1, >&-) writes no file; `>&file` and `&>file` do.
const writesFile = (op, target) => op.includes('>') && !(/>&$/.test(op) && /^(?:[0-9]+|-)$/.test(target))

// Simple commands of one command line; assignments the line makes are visible to the
// words that follow them (NAME=x; rm $NAME), as the shell sees them. The line is split
// into simple commands first, and each is read with the variables known at that point.
export const readCommandLine = (command, { vars = {} } = {}) => {
  if (typeof command !== 'string' || command.length === 0) return []
  const known = { ...vars }
  const commands = []
  for (const piece of splitSimpleCommands(command)) {
    const nested = []
    const tokens = tokenize(piece, known, nested)
    const current = { words: [], redirects: [] }
    for (let t = 0; t < tokens.length; t += 1) {
      const token = tokens[t]
      if (token.type === 'word') current.words.push(token.value)
      else if (token.type === 'redirect') {
        const target = tokens[t + 1]?.type === 'word' ? tokens[t + 1].value : ''
        if (tokens[t + 1]?.type === 'word') t += 1
        if (writesFile(token.value, target)) current.redirects.push({ op: token.value, target })
      }
    }
    if (current.words.length > 0 || current.redirects.length > 0) commands.push(current)
    // A command made of assignments only sets them for what follows; `export NAME=…` too.
    const { words } = current
    const declaring = words.length > 0 && DECLARING.has(words[0])
    if (words.length > 0 && (declaring || words.every((w) => ASSIGNMENT.test(w)))) {
      for (const w of declaring ? words.slice(1) : words) {
        const match = ASSIGNMENT.exec(w)
        if (match && !match[2].includes(UNKNOWN)) known[match[1]] = match[2]
        else if (match) delete known[match[1]]
      }
    }
    for (const inner of nested) commands.push(...readCommandLine(inner, { vars: known }))
  }
  return commands
}

// The simple-command pieces of a line, split at ; & && || | newlines and parentheses,
// never inside quotes, escapes or substitutions.
const splitSimpleCommands = (text) => {
  const pieces = []
  let start = 0
  let quote = null
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quote) {
      if (char === '\\' && quote === '"') { i += 1; continue }
      if (char === quote) quote = null
      continue
    }
    if (char === '\\') { i += 1; continue }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue }
    if (char === '$' && text[i + 1] === '(') { i = substitutionAt(text, i + 2).end - 1; continue }
    if (char === '#' && (i === 0 || /[\s;&|()]/.test(text[i - 1]))) {
      const end = text.indexOf('\n', i)
      i = end < 0 ? text.length - 1 : end - 1
      continue
    }
    const redirectAmp = char === '&' && (text[i + 1] === '>' || text[i - 1] === '>' || text[i - 1] === '<')
    const pipeAfterRedirect = char === '|' && text[i - 1] === '>'
    if ((SEPARATORS.has(char) && !redirectAmp && !pipeAfterRedirect)) {
      pieces.push(text.slice(start, i))
      if ((char === '&' || char === '|') && text[i + 1] === char) i += 1
      start = i + 1
    }
  }
  pieces.push(text.slice(start))
  return pieces.map((piece) => piece.trim()).filter(Boolean)
}

// Lexical path join, '/'-separated: `cd` and relative paths without touching the disk.
export const joinPath = (base, path) => {
  const slashed = String(path).replace(/\\/g, '/')
  const absolute = slashed.startsWith('/') || /^[A-Za-z]:\//.test(slashed)
  const joined = absolute || !base ? slashed : `${String(base).replace(/\\/g, '/').replace(/\/+$/, '')}/${slashed}`
  const rooted = joined.startsWith('/') || /^[A-Za-z]:\//.test(joined)
  const parts = joined.split('/')
  const out = []
  const isRoot = (part) => part === '' || /^[A-Za-z]:$/.test(part) // '/' or a drive
  for (const part of parts) {
    if (part === '.' || (part === '' && out.length > 0)) continue
    if (part === '..' && out.length === 1 && isRoot(out[0])) continue // above the root is the root
    if (part === '..' && out.length > 0 && out[out.length - 1] !== '..' && !isRoot(out[out.length - 1])) out.pop()
    else out.push(part)
  }
  if (out.length === 1 && /^[A-Za-z]:$/.test(out[0])) return `${out[0]}/`
  return out.join('/') || (rooted ? '/' : '.')
}
