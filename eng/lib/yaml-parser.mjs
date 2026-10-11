// Zero-dependency reader for the small YAML subset SKRAFT artifact payloads use
// (see scripts/lib/book.mjs for the sibling dev-tooling reader, which re-exports
// `parseYaml` from here so the two never drift).
//
// The repo deliberately ships NO YAML runtime dependency (see check-citations.mjs
// which hand-rolls a flat parser). This module implements a small indentation-stack
// parser scoped to:
//   - nested maps (`key:` then indented children)
//   - lists of maps (`- key: value` then indented siblings)
//   - scalars (quoted strings, integers, booleans)
//   - inline flow arrays (`[a, b, c]`)
//   - block scalars (`|`, `>`, with optional `-`/`+` chomping)
//   - `#` line/trailing comments (respecting quotes)
// It does NOT support anchors or other exotic YAML constructs. Extend this parser
// (and its tests) rather than reaching for a dependency.

/** Strip a trailing/`#` comment that is not inside quotes. */
function stripComment(line) {
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === "'" && !inDouble) inSingle = !inSingle
    else if (c === '"' && !inSingle) inDouble = !inDouble
    else if (c === '#' && !inSingle && !inDouble) {
      // Treat as a comment only at line start or after whitespace.
      if (i === 0 || /\s/.test(line[i - 1])) return line.slice(0, i)
    }
  }
  return line
}

function unquote(s) {
  const t = s.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1)
  }
  return t
}

/** Coerce a scalar token into string | number | boolean | array | null. */
function coerce(raw) {
  const v = raw.trim()
  if (v === '') return null
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim()
    if (inner === '') return []
    return splitFlow(inner).map((x) => coerce(x))
  }
  if (v === 'true') return true
  if (v === 'false') return false
  if (/^-?\d+$/.test(v)) return Number(v)
  return unquote(v)
}

/** Split a flow array body on commas that are not inside quotes. */
function splitFlow(inner) {
  const out = []
  let buf = ''
  let inSingle = false
  let inDouble = false
  for (const c of inner) {
    if (c === "'" && !inDouble) inSingle = !inSingle
    else if (c === '"' && !inSingle) inDouble = !inDouble
    if (c === ',' && !inSingle && !inDouble) {
      out.push(buf.trim())
      buf = ''
    } else {
      buf += c
    }
  }
  if (buf.trim() !== '') out.push(buf.trim())
  return out
}

/** Split `key: value` on the first quote-free colon followed by EOL/space. */
function splitKeyValue(content) {
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < content.length; i++) {
    const c = content[i]
    if (c === "'" && !inDouble) inSingle = !inSingle
    else if (c === '"' && !inSingle) inDouble = !inDouble
    else if (c === ':' && !inSingle && !inDouble) {
      const after = content.slice(i + 1)
      if (after === '' || after.startsWith(' ')) {
        return { key: content.slice(0, i).trim(), value: after.trim() }
      }
    }
  }
  return null
}

/** Detect a YAML block-scalar indicator (`|`, `>`, with optional `-`/`+` chomping). */
function blockStyle(value) {
  const m = /^([|>])([+-]?)\d*$/.exec(value)
  if (!m) return null
  return { style: m[1], chomp: m[2] === '-' ? 'strip' : m[2] === '+' ? 'keep' : 'clip' }
}

/**
 * Read a literal (`|`) or folded (`>`) block scalar starting at `start`.
 * Lines are consumed while blank OR indented deeper than `keyIndent`. Content is
 * taken from RAW lines (never comment-stripped) so markdown `#` survives.
 * Returns { value, nextIndex } where nextIndex is the first unconsumed line.
 */
function readBlockScalar(rawLines, start, keyIndent, { style, chomp }) {
  const collected = []
  let i = start
  for (; i < rawLines.length; i++) {
    const raw = rawLines[i].replace(/\r$/, '')
    if (raw.trim() === '') {
      collected.push('')
      continue
    }
    const ind = raw.length - raw.trimStart().length
    if (ind <= keyIndent) break
    collected.push(raw)
  }
  // Trailing blank lines are re-applied per the chomping indicator.
  let end = collected.length
  while (end > 0 && collected[end - 1] === '') end--
  const body = collected.slice(0, end)
  const trailingBlanks = collected.length - end

  // Strip the common leading indentation (the least-indented non-blank line).
  let blockIndent = Infinity
  for (const l of body) {
    if (l === '') continue
    const ind = l.length - l.trimStart().length
    if (ind < blockIndent) blockIndent = ind
  }
  if (!Number.isFinite(blockIndent)) blockIndent = 0
  const stripped = body.map((l) => (l === '' ? '' : l.slice(blockIndent)))

  let value
  if (style === '|') {
    value = stripped.join('\n')
  } else {
    let out = ''
    for (const l of stripped) {
      if (l === '') out += '\n'
      else {
        if (out !== '' && !out.endsWith('\n')) out += ' '
        out += l
      }
    }
    value = out
  }

  if (chomp === 'clip') value += '\n'
  else if (chomp === 'keep') value += '\n'.repeat(trailingBlanks + 1)
  return { value, nextIndex: i }
}

/** Assign `key: value` into `node`; a bare key opens a child container frame. */
function assignInto(node, { key, value }, stack, indent) {
  if (value === '') {
    const child = {}
    node[key] = child
    stack.push({ indent, node: child, container: node, key })
  } else {
    node[key] = coerce(value)
  }
}

/**
 * Parse the subset of YAML documented above into a nested JS object.
 *
 * Indentation-stack invariant: `stack` holds container frames ordered by strictly
 * increasing indent. A frame is { indent, node, container, key } where `node` is
 * the map/array being filled, and (container, key) is its slot in the parent so a
 * bare-key container can be upgraded to an array when its first `- ` child appears.
 */
export function parseYaml(text) {
  const root = {}
  const stack = [{ indent: -1, node: root, container: null, key: null }]
  const rawLines = text.split('\n')

  for (let li = 0; li < rawLines.length; li++) {
    const line = stripComment(rawLines[li].replace(/\r$/, ''))
    if (line.trim() === '') continue

    const indent = line.length - line.trimStart().length
    let content = line.trim()
    const isItem = content.startsWith('- ') || content === '-'
    if (isItem) content = content.replace(/^-\s*/, '')

    // Pop until the top frame is a strict parent of this line.
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop()
    const parent = stack[stack.length - 1]

    if (isItem) {
      // The parent container must be an array; upgrade it in place if needed.
      let arr = parent.node
      if (!Array.isArray(arr)) {
        arr = []
        if (parent.container !== null) parent.container[parent.key] = arr
        parent.node = arr
      }
      const kv = content === '' ? null : splitKeyValue(content)
      if (kv === null && content !== '') {
        arr.push(coerce(content)) // bare scalar list item
        continue
      }
      const element = {}
      arr.push(element)
      stack.push({ indent, node: element, container: arr, key: arr.length - 1 })
      if (kv) {
        const bs = blockStyle(kv.value)
        if (bs) {
          const block = readBlockScalar(rawLines, li + 1, indent, bs)
          element[kv.key] = block.value
          li = block.nextIndex - 1
        } else {
          assignInto(element, kv, stack, indent)
        }
      }
      continue
    }

    const kv = splitKeyValue(content)
    if (kv) {
      const bs = blockStyle(kv.value)
      if (bs) {
        const block = readBlockScalar(rawLines, li + 1, indent, bs)
        parent.node[kv.key] = block.value
        li = block.nextIndex - 1
      } else {
        assignInto(parent.node, kv, stack, indent)
      }
    }
  }

  return root
}
