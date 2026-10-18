/**
 * The structural commitments the code already carries, read before each attempt of the
 * solution architect (its Step 7.0): it back-fills an ADR for each one no ADR covers, and the
 * consistency lens judges G1 and G14 on the same report, so neither greps by hand.
 *   cqrs-bus        ICommandBus|IQueryBus|CommandBus|QueryBus
 *   event-sourcing  IEventStore|EventStream|Apply(…Event
 *   saga            Saga|ProcessManager|ICorrelatedBy
 * A signature counts in code only: comments and string literals are blanked first, `#`
 * comments in Python and Ruby, `//` and block comments elsewhere. A source file is one of
 * the languages below, outside dependency, build and tracking folders.
 *
 * @typedef {{ commitment: string, path: string, line: number, text: string }} Hit
 */

/** Where the engine writes the report, in the pipeline's tracking folder. */
export const SCAN_FILE = 'details/{date}/structural-scan.json'

const SIGNATURES = Object.freeze([
  Object.freeze({ commitment: 'cqrs-bus', label: 'CQRS + dispatch bus', pattern: /ICommandBus|IQueryBus|CommandBus|QueryBus/ }),
  Object.freeze({ commitment: 'event-sourcing', label: 'Event Sourcing', pattern: /IEventStore|EventStream|Apply\(.*Event/ }),
  Object.freeze({ commitment: 'saga', label: 'Saga / Process Manager', pattern: /Saga|ProcessManager|ICorrelatedBy/ }),
])

/** The commitments no code signature detects: the report names them, the architect judges. */
const MANUAL_REVIEW = Object.freeze(['Anti-Corruption Layer', 'Bounded-context split or merge', 'Aggregate crossing an existing boundary'])

const SOURCE = /\.(cs|fs|vb|java|kt|scala|ts|tsx|js|jsx|mjs|cjs|py|go|rb|php|rs|swift)$/
const NOT_SOURCE = /(^|\/)(\.git|node_modules|bin|obj|dist|build|out|target|vendor|\.copilot-tracking|coverage|reports|StrykerOutput)\//
const HASH_COMMENTS = /\.(py|rb)$/
const STRINGS = String.raw`"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'`
const SLASH_NOISE = new RegExp(String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/|` + '`(?:\\\\.|[^`\\\\])*`|' + STRINGS, 'g')
const HASH_NOISE = new RegExp(String.raw`#[^\n]*|"""[\s\S]*?"""|'''[\s\S]*?'''|` + STRINGS, 'g')
const MAX_TEXT = 160
const MAX_HITS = 20

/** @param {string} path relative to the working copy */
export const isScannable = (path) => SOURCE.test(path) && !NOT_SOURCE.test(path)

/**
 * Every signature a source file carries in its code, line by line.
 * @param {string} path relative to the working copy @param {string} text
 * @returns {Hit[]}
 */
export const scanSource = (path, text) => {
  const code = codeOf(path, text).split('\n')
  return text.split('\n').flatMap((line, index) => SIGNATURES
    .filter(({ pattern }) => pattern.test(code[index]))
    .map(({ commitment }) => ({ commitment, path, line: index + 1, text: line.trim().slice(0, MAX_TEXT) })))
}

/** The text with its comments and string literals blanked, lines kept. @param {string} path @param {string} text */
const codeOf = (path, text) => text.replace(HASH_COMMENTS.test(path) ? HASH_NOISE : SLASH_NOISE, (noise) => noise.replace(/[^\n]/g, ' '))

/**
 * The report: per commitment, whether the code carries it, how often, and its first hits. It
 * names no commit, so a pass that changed no source file gives the review the same report.
 * @param {Hit[]} hits @param {number} scannedFiles
 */
export const scanReport = (hits, scannedFiles) => ({
  scannedFiles,
  commitments: SIGNATURES.map(({ commitment, label }) => commitmentOf(commitment, label, hits.filter((hit) => hit.commitment === commitment))),
  manualReview: [...MANUAL_REVIEW],
})

/** @param {string} commitment @param {string} label @param {Hit[]} hits */
const commitmentOf = (commitment, label, hits) => ({
  commitment,
  label,
  detected: hits.length > 0,
  hitCount: hits.length,
  hits: hits.slice(0, MAX_HITS).map(({ path, line, text }) => ({ path, line, text })),
})
