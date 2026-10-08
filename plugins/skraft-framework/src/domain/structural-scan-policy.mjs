// Pure structural-scan policy. No IO. The deterministic form of the DESIGN Step 7.0
// signatures: which structural commitments the existing code already carries. The
// architect reads the scan instead of grepping; the DESIGN reviewer re-runs the same
// scan for G1, so both judge the same evidence.

export const STRUCTURAL_SIGNATURES = Object.freeze([
  Object.freeze({ commitment: 'cqrs-bus', label: 'CQRS + dispatch bus', pattern: /ICommandBus|IQueryBus|CommandBus|QueryBus/ }),
  Object.freeze({ commitment: 'event-sourcing', label: 'Event Sourcing', pattern: /IEventStore|EventStream|Apply\(.*Event/ }),
  Object.freeze({ commitment: 'saga', label: 'Saga / Process Manager', pattern: /Saga|ProcessManager|ICorrelatedBy/ }),
])

// Commitments no code signature detects reliably: the scan names them, a human judges.
export const MANUAL_REVIEW = Object.freeze([
  'Anti-Corruption Layer',
  'Bounded-context split or merge',
  'Aggregate crossing an existing boundary',
])

const SOURCE_EXTENSIONS = new Set([
  'cs', 'fs', 'vb', 'java', 'kt', 'scala', 'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'go', 'rb', 'php', 'rs', 'swift',
])

const EXCLUDED_SEGMENTS = new Set([
  '.git', 'node_modules', 'bin', 'obj', 'dist', 'build', 'out', 'target', 'vendor',
  '.copilot-tracking', 'coverage', 'reports', 'StrykerOutput',
])

const MAX_LINE_LENGTH = 160
const SLASH_LINE_COMMENT_EXTENSIONS = new Set([
  'cs', 'fs', 'java', 'kt', 'scala', 'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'go', 'php', 'rs', 'swift',
])
const SLASH_BLOCK_COMMENT_EXTENSIONS = new Set([
  'cs', 'fs', 'java', 'kt', 'scala', 'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'go', 'php', 'rs', 'swift',
])
const HASH_COMMENT_EXTENSIONS = new Set(['py', 'rb', 'php'])
const NESTED_BLOCK_COMMENT_EXTENSIONS = new Set(['fs', 'scala', 'rs', 'swift'])
const SINGLE_QUOTE_CHAR_LITERAL_EXTENSIONS = new Set(['fs', 'rs'])

// True when the path is source code worth scanning: a known source extension, outside
// dependency, build and tracking directories.
export const isScannableSource = (path) => {
  if (typeof path !== 'string' || path === '') return false
  const segments = path.split(/[\\/]/)
  if (segments.slice(0, -1).some((segment) => EXCLUDED_SEGMENTS.has(segment))) return false
  const extension = segments.at(-1).split('.').at(-1)
  return segments.at(-1).includes('.') && SOURCE_EXTENSIONS.has(extension)
}

const maskNonCode = (content, path) => {
  const chars = content.split('')
  const extension = typeof path === 'string' ? path.split('.').at(-1).toLowerCase() : ''
  let state = 'code'
  let quote = ''
  let verbatim = false
  let blockStart = '/*'
  let blockEnd = '*/'
  let blockDepth = 0
  let nestedBlock = false
  let rawQuoteCount = 0
  let rawHashCount = 0
  let stringMultiline = false
  let index = 0
  const maskSingleQuoteCharLiteral = (start) => {
    const literal = chars[start + 1]
    const closing = literal === '\\' ? start + 3 : start + 2
    if (!literal || literal === '\n' || literal === '\r' || chars[closing] !== "'") return false
    if (literal === '\\') {
      const escaped = chars[start + 2]
      if (!escaped || escaped === '\n' || escaped === '\r') return false
    } else if (literal === "'") return false
    for (let cursor = start; cursor <= closing; cursor++) chars[cursor] = ' '
    index = closing
    return true
  }
  const startRawString = (start, quoteAt, hashes, allowTriple = false, fixedQuoteCount = null) => {
    let quoteCount = fixedQuoteCount ?? 0
    if (fixedQuoteCount === null) {
      while (chars[quoteAt + quoteCount] === '"') quoteCount++
      if (quoteCount === 0 || quoteCount === 2 || (!allowTriple && quoteCount !== 1)) return false
    }
    for (let cursor = start; cursor < quoteAt + quoteCount; cursor++) chars[cursor] = ' '
    rawQuoteCount = quoteCount
    rawHashCount = hashes
    state = 'raw-string'
    index = quoteAt + quoteCount - 1
    return true
  }
  for (index = 0; index < chars.length; index++) {
    const current = chars[index]
    const next = chars[index + 1]
    const preserve = current === '\n' || current === '\r'
    if (state === 'line-comment') {
      if (preserve) state = 'code'
      else chars[index] = ' '
      continue
    }
    if (state === 'block-comment') {
      if (nestedBlock && current === blockStart[0] && next === blockStart[1]) {
        chars[index] = ' '
        chars[++index] = ' '
        blockDepth++
      } else if (current === blockEnd[0] && next === blockEnd[1]) {
        chars[index] = ' '
        chars[index + 1] = ' '
        index++
        blockDepth--
        if (blockDepth === 0) state = 'code'
      } else if (!preserve) chars[index] = ' '
      continue
    }
    if (state === 'raw-string') {
      let matches = current === '"'
      let quoteRun = 0
      while (chars[index + quoteRun] === '"') quoteRun++
      matches = matches && (extension === 'cs'
        ? quoteRun >= rawQuoteCount
        : quoteRun === rawQuoteCount)
      for (let offset = 0; matches && offset < rawHashCount; offset++) {
        matches = chars[index + quoteRun + offset] === '#'
      }
      if (matches) {
        const delimiterLength = quoteRun + rawHashCount
        for (let offset = 0; offset < delimiterLength; offset++) chars[index + offset] = ' '
        index += delimiterLength - 1
        state = 'code'
      } else if (!preserve) chars[index] = ' '
      continue
    }
    if (state === 'string' || state === 'triple-string') {
      if (state === 'string' && !stringMultiline && preserve) {
        state = 'code'
        quote = ''
        continue
      }
      const closing = state === 'triple-string'
        ? current === quote && chars[index + 1] === quote && chars[index + 2] === quote
        : current === quote
      if (current === '\\' && !verbatim) {
        chars[index] = ' '
        if (next && next !== '\n' && next !== '\r') chars[++index] = ' '
      } else if (verbatim && current === quote && next === quote) {
        chars[index] = ' '
        chars[++index] = ' '
      } else if (closing) {
        chars[index] = ' '
        if (state === 'triple-string') {
          chars[++index] = ' '
          chars[++index] = ' '
        }
        state = 'code'
        verbatim = false
        stringMultiline = false
      } else if (!preserve) chars[index] = ' '
      continue
    }
    if (SLASH_LINE_COMMENT_EXTENSIONS.has(extension) && current === '/' && next === '/') {
      chars[index] = ' '
      chars[++index] = ' '
      state = 'line-comment'
    } else if (SLASH_BLOCK_COMMENT_EXTENSIONS.has(extension) && current === '/' && next === '*') {
      chars[index] = ' '
      chars[++index] = ' '
      blockStart = '/*'
      blockEnd = '*/'
      blockDepth = 1
      nestedBlock = NESTED_BLOCK_COMMENT_EXTENSIONS.has(extension)
      state = 'block-comment'
    } else if (extension === 'fs' && current === '(' && next === '*') {
      chars[index] = ' '
      chars[++index] = ' '
      blockStart = '(*'
      blockEnd = '*)'
      blockDepth = 1
      nestedBlock = true
      state = 'block-comment'
    } else if (HASH_COMMENT_EXTENSIONS.has(extension) && current === '#') {
      chars[index] = ' '
      state = 'line-comment'
    } else if (extension === 'vb' && current === "'") {
      chars[index] = ' '
      state = 'line-comment'
    } else if (extension === 'swift' && current === '#') {
      let quoteAt = index
      while (chars[quoteAt] === '#') quoteAt++
      if (chars[quoteAt] === '"') {
        const multiline = chars[quoteAt + 1] === '"'
          && chars[quoteAt + 2] === '"'
          && (chars[quoteAt + 3] === '\n' || chars[quoteAt + 3] === '\r')
        startRawString(index, quoteAt, quoteAt - index, false, multiline ? 3 : 1)
      }
    } else if (extension === 'rs' && (current === 'r' || current === 'b' && next === 'r')) {
      const start = index
      const rawPrefix = current === 'b' ? index + 1 : index
      let quoteAt = rawPrefix + 1
      while (chars[quoteAt] === '#') quoteAt++
      if (chars[quoteAt] === '"') startRawString(start, quoteAt, quoteAt - rawPrefix - 1, false, 1)
    } else if (extension === 'cs' && current === '"' && next === '"') {
      if (!startRawString(index, index, 0, true)) {
        chars[index] = ' '
        chars[++index] = ' '
      }
    } else if (extension === 'cs' && current === '@' && next === '$' && chars[index + 2] === '"') {
      chars[index] = ' '
      chars[++index] = ' '
      chars[++index] = ' '
      quote = '"'
      verbatim = true
      stringMultiline = true
      state = 'string'
    } else if (current === '@' && next === '"') {
      chars[index] = ' '
      chars[++index] = ' '
      quote = '"'
      verbatim = true
      stringMultiline = true
      state = 'string'
    } else if (current === '"' && next === '"' && chars[index + 2] === '"') {
      chars[index] = ' '
      chars[++index] = ' '
      chars[++index] = ' '
      quote = '"'
      state = 'triple-string'
    } else if (current === "'" && next === "'" && chars[index + 2] === "'") {
      chars[index] = ' '
      chars[++index] = ' '
      chars[++index] = ' '
      quote = "'"
      state = 'triple-string'
    } else if (current === "'" && SINGLE_QUOTE_CHAR_LITERAL_EXTENSIONS.has(extension)) {
      maskSingleQuoteCharLiteral(index)
    } else if (current === '"' || current === "'" || current === '`') {
      chars[index] = ' '
      quote = current
      stringMultiline = current === '`'
      state = 'string'
    }
  }
  return chars.join('')
}

// Every signature hit in one file: { commitment, path, line, text }.
export const scanSource = (path, content) => {
  if (typeof content !== 'string') return []
  const code = maskNonCode(content, path).split(/\r?\n/)
  return content.split(/\r?\n/).flatMap((text, index) =>
    STRUCTURAL_SIGNATURES
      .filter(({ pattern }) => pattern.test(code[index]))
      .map(({ commitment }) => ({ commitment, path, line: index + 1, text: text.trim().slice(0, MAX_LINE_LENGTH) })))
}

// The scan report: per commitment, detected or not, with at most maxHits locations.
export const summariseScan = (hits, { revision = null, scannedFiles = 0, maxHits = 20 } = {}) => ({
  revision,
  scannedFiles,
  commitments: STRUCTURAL_SIGNATURES.map(({ commitment, label }) => {
    const found = hits.filter((hit) => hit.commitment === commitment)
    return {
      commitment,
      label,
      detected: found.length > 0,
      hitCount: found.length,
      hits: found.slice(0, maxHits).map(({ path, line, text }) => ({ path, line, text })),
    }
  }),
  manualReview: [...MANUAL_REVIEW],
})
