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
  const hashComments = new Set(['py', 'rb', 'php'])
  let state = 'code'
  let quote = ''
  let verbatim = false
  let blockEnd = '*/'
  for (let index = 0; index < chars.length; index++) {
    const current = chars[index]
    const next = chars[index + 1]
    const preserve = current === '\n' || current === '\r'
    if (state === 'line-comment') {
      if (preserve) state = 'code'
      else chars[index] = ' '
      continue
    }
    if (state === 'block-comment') {
      if (current === blockEnd[0] && next === blockEnd[1]) {
        chars[index] = ' '
        chars[index + 1] = ' '
        index++
        state = 'code'
      } else if (!preserve) chars[index] = ' '
      continue
    }
    if (state === 'string' || state === 'triple-string') {
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
      } else if (!preserve) chars[index] = ' '
      continue
    }
    if (current === '/' && next === '/') {
      chars[index] = ' '
      chars[++index] = ' '
      state = 'line-comment'
    } else if (current === '/' && next === '*') {
      chars[index] = ' '
      chars[++index] = ' '
      blockEnd = '*/'
      state = 'block-comment'
    } else if (extension === 'fs' && current === '(' && next === '*') {
      chars[index] = ' '
      chars[++index] = ' '
      blockEnd = '*)'
      state = 'block-comment'
    } else if (hashComments.has(extension) && current === '#') {
      chars[index] = ' '
      state = 'line-comment'
    } else if (extension === 'vb' && current === "'") {
      chars[index] = ' '
      state = 'line-comment'
    } else if (current === '@' && next === '"') {
      chars[index] = ' '
      chars[++index] = ' '
      quote = '"'
      verbatim = true
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
    } else if (current === '"' || current === "'" || current === '`') {
      chars[index] = ' '
      quote = current
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
