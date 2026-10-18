/**
 * The small YAML a lens and the refuter answer with: top-level `key: value` lines and one list
 * of flat mappings (`findings`). A value is a quoted string, a plain word, a `|` or `>` block,
 * or nothing (null). Anchors, aliases, tags, flow collections and tabs are refused rather than
 * guessed, and so is a plain value holding `: ` or ` #`, which a reader cannot cut safely.
 *
 * @typedef {{ number: number, indent: number, text: string }} Line
 * @typedef {{ lines: Line[], at: number }} Cursor
 * @typedef {{ ok: true, value: Record<string, any> } | { ok: false, error: string }} Parsed
 */

/** The keys whose value is a list of mappings, even when it holds none. */
const LIST_KEYS = Object.freeze(['findings'])
const ENTRY = /^([A-Za-z_][\w-]*):(?:[ \t]+(.*))?$/
const DOUBLE_QUOTED = /^"((?:[^"\\]|\\.)*)"[ \t]*(?:#.*)?$/
const SINGLE_QUOTED = /^'((?:[^']|'')*)'[ \t]*(?:#.*)?$/
const BLOCK = /^[|>][-+]?[ \t]*(?:#.*)?$/
const RESERVED_START = /^[&*!%@`{}[\],?|>'"]/

class AnswerYamlError extends Error {}

/** @param {Line} line @param {string} what @returns {never} */
const fail = (line, what) => {
  throw new AnswerYamlError(`line ${line.number}: ${what}`)
}

/**
 * @param {string} source
 * @returns {Parsed}
 */
export const parseAnswerYaml = (source) => {
  try {
    return { ok: true, value: readDocument({ lines: linesOf(source), at: 0 }) }
  } catch (error) {
    if (error instanceof AnswerYamlError) return { ok: false, error: error.message }
    throw error
  }
}

/** The non-blank lines, with their indentation. @param {string} source @returns {Line[]} */
const linesOf = (source) => source.split(/\r?\n/)
  .map((raw, index) => ({ number: index + 1, raw }))
  .filter(({ raw }) => raw.trim() !== '')
  .map(({ number, raw }) => lineOf(number, raw))

/** @param {number} number @param {string} raw @returns {Line} */
const lineOf = (number, raw) => {
  const indent = /^ */.exec(raw)?.[0].length ?? 0
  const line = { number, indent, text: raw.slice(indent).trimEnd() }
  if (line.text.startsWith('\t')) fail(line, 'is indented with a tab')
  return line
}

/** @param {Cursor} cursor */
const readDocument = (cursor) => {
  /** @type {Record<string, any>} */
  const document = {}
  for (let line = next(cursor); line !== null; line = next(cursor)) {
    if (line.indent !== 0) fail(line, 'is indented where a top-level key belongs')
    cursor.at += 1
    const { key, rest } = entryOf(line)
    put(document, line, key, isList(cursor, key, rest) ? readList(cursor, line, rest) : readValue(cursor, line, rest))
  }
  return document
}

/** A key of the contract's lists, or any key whose items follow it. @param {Cursor} cursor @param {string} key @param {string} rest */
const isList = (cursor, key, rest) => {
  if (LIST_KEYS.includes(key) || rest === '[]') return true
  const following = rest === '' ? next(cursor) : null
  return following !== null && isItem(following)
}

/** The next line that is not a comment, the cursor left on it; null at the end. @param {Cursor} cursor */
const next = (cursor) => {
  while (cursor.at < cursor.lines.length && cursor.lines[cursor.at].text.startsWith('#')) cursor.at += 1
  return cursor.lines[cursor.at] ?? null
}

/** @param {Line} line */
const entryOf = (line) => {
  const match = ENTRY.exec(line.text)
  if (match === null) fail(line, 'is not a `key: value` line')
  return { key: match[1], rest: (match[2] ?? '').trim() }
}

/** @param {Record<string, any>} target @param {Line} line @param {string} key @param {unknown} value */
const put = (target, line, key, value) => {
  if (Object.hasOwn(target, key)) fail(line, `repeats the key ${key}`)
  target[key] = value
}

/** @param {Cursor} cursor @param {Line} line @param {string} rest */
const readList = (cursor, line, rest) => {
  if (rest === '[]') return []
  if (rest !== '') fail(line, `${entryOf(line).key} must be a list of \`- key: value\` items, or []`)
  const items = []
  for (let item = next(cursor); item !== null && isItem(item); item = next(cursor)) items.push(readItem(cursor, item))
  return items
}

/** @param {Line} line */
const isItem = (line) => line.text === '-' || line.text.startsWith('- ')

/** One `- key: value` item and the keys indented under it. @param {Cursor} cursor @param {Line} dash */
const readItem = (cursor, dash) => {
  cursor.at += 1
  const indent = dash.indent + 2
  /** @type {Record<string, any>} */
  const item = {}
  if (dash.text !== '-') readEntryInto(cursor, item, { number: dash.number, indent, text: dash.text.slice(2).trim() })
  for (let line = next(cursor); line !== null && line.indent === indent && !isItem(line); line = next(cursor)) {
    cursor.at += 1
    readEntryInto(cursor, item, line)
  }
  return item
}

/** @param {Cursor} cursor @param {Record<string, any>} item @param {Line} line */
const readEntryInto = (cursor, item, line) => {
  const { key, rest } = entryOf(line)
  put(item, line, key, readValue(cursor, line, rest))
}

/** @param {Cursor} cursor @param {Line} line @param {string} rest @returns {string | null} */
const readValue = (cursor, line, rest) => {
  if (!BLOCK.test(rest)) return scalarOf(line, rest)
  const parts = []
  while (cursor.at < cursor.lines.length && cursor.lines[cursor.at].indent > line.indent) {
    parts.push(cursor.lines[cursor.at].text)
    cursor.at += 1
  }
  return parts.join(rest.startsWith('|') ? '\n' : ' ')
}

/** @param {Line} line @param {string} rest @returns {string | null} */
const scalarOf = (line, rest) => {
  if (rest === '' || rest === '~' || rest === 'null') return null
  if (rest.startsWith('"')) return doubleQuoted(line, rest)
  if (rest.startsWith("'")) return singleQuoted(line, rest)
  return plainOf(line, rest)
}

/** An unquoted value, its trailing comment cut. @param {Line} line @param {string} rest */
const plainOf = (line, rest) => {
  if (RESERVED_START.test(rest)) fail(line, 'starts its value with a YAML marker; quote the value')
  const plain = rest.replace(/[ \t]+#.*$/, '')
  if (/: | #|:$/.test(plain)) fail(line, 'holds `: ` or ` #` in a plain value; quote the value')
  return plain
}

/** @param {Line} line @param {string} rest */
const doubleQuoted = (line, rest) => {
  const match = DOUBLE_QUOTED.exec(rest)
  if (match === null) fail(line, 'has a double-quoted value that does not close')
  try {
    return /** @type {string} */ (JSON.parse(`"${match[1]}"`))
  } catch {
    return fail(line, 'has an escape that is not valid in a double-quoted value')
  }
}

/** @param {Line} line @param {string} rest */
const singleQuoted = (line, rest) => {
  const match = SINGLE_QUOTED.exec(rest)
  if (match === null) fail(line, 'has a single-quoted value that does not close')
  return match[1].replaceAll("''", "'")
}
