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

// Every signature hit in one file: { commitment, path, line, text }.
export const scanSource = (path, content) => {
  if (typeof content !== 'string') return []
  return content.split(/\r?\n/).flatMap((text, index) =>
    STRUCTURAL_SIGNATURES
      .filter(({ pattern }) => pattern.test(text))
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
