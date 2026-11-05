/**
 * The RESEARCH records the engine checks when the solution researcher finishes, instead of a lens:
 *   citations  every workspace path its research document cites is a readable file of the working
 *              copy, and a line range it cites is one that file holds (#517)
 *
 * @typedef {{ path: string, text: string | null }} Text
 * @typedef {{ path: string, text: string }} Document a research document of the tracking folder, as the engine read it
 * @typedef {{ documents: Document[], cited: Text[] }} Records
 *   documents: the research documents of the tracking folder; cited: the workspace paths they
 *   cite, text null when the working copy has none or the path is no readable file.
 */

const RESEARCH = /(^|\/)research\/[^/]+\/[^/]+\.md$/
/** A token that could be a workspace path: segments of word characters, dots and dashes joined by slashes, at a path boundary. */
const TOKEN = /(?<=^|[\s,`'"(])[\w.-]+(?:\/[\w.-]+)+/g
/** A citation that closes a sentence keeps its full stop, which no file name ends with. */
const FULL_STOP = /\.$/
/** A path followed by `:line`, or by `:line-line` over a hyphen or a dash: what the document claims its file holds. */
const RANGE = /(?<=^|[\s,`'"(])([\w.-]+(?:\/[\w.-]+)+):(\d+)(?:[-\u2013](\d+))?/g
/** A file name ends with an extension; a token without one names a folder, not a file to read. */
const EXTENSION = /\.[A-Za-z]\w{0,9}$/
const TRACKING = '.copilot-tracking'

/** @param {string} path relative to the tracking folder */
export const isResearch = (path) => RESEARCH.test(path)

/**
 * The workspace paths a research document cites, forward or back slashes, each without the full
 * stop that closes its sentence and named once however often the document cites it. The tracking
 * folder is the engine's own.
 * @param {string} text
 * @returns {string[]}
 */
export const citedPaths = (text) => [...new Set(tokensOf(text).map((token) => token.replace(FULL_STOP, '')))]
  .filter(isWorkspaceFile)

/** Every token of a document that could be a path, back slashes read as separators. @param {string} text */
// Stryker disable next-line ArrayDeclaration: a document that cites nothing gives a placeholder that names no file, as no citation does
const tokensOf = (text) => text.replaceAll('\\', '/').match(TOKEN) ?? []

/** @param {string} path */
const isWorkspaceFile = (path) => EXTENSION.test(path) && !path.startsWith(TRACKING) && !path.split('/').some((part) => part === '.' || part === '..')

/**
 * The line ranges a research document cites: the citation as written, its path, and the last
 * line it claims the file holds.
 * @param {string} text
 * @returns {Array<{ cite: string, path: string, last: number }>}
 */
export const citedRanges = (text) => [...text.replaceAll('\\', '/').matchAll(RANGE)]
  .map(([cite, path, first, last]) => ({ cite, path, last: Number(last ?? first) }))

/**
 * Why the research records send the researcher back; empty when they hold.
 * @param {Records} records
 * @returns {string[]}
 */
export const researchFailures = ({ documents, cited }) => documents.flatMap((document) => [
  ...missingCitations(document, cited),
  ...rangeFailures(document, cited),
])

/** Each line range a document cites that its file does not hold. @param {Document} document @param {Text[]} cited */
const rangeFailures = ({ path, text }, cited) => citedRanges(text)
  .map((range) => ({ ...range, lines: lineCount(textOf(cited, range.path)) }))
  .filter(({ lines, last }) => lines !== null && last > lines)
  .map(({ cite, lines }) => `${path} cites ${cite}, past the end of a ${lines}-line file (#517)`)

/** How many lines a file holds, a closing newline ending none; null when the engine read no file there, which missingCitations reports when a citation names it. @param {string | null} text */
// Stryker disable next-line StringLiteral: what replaces the closing newline holds no newline either, so the file keeps its line count
const lineCount = (text) => (text === null ? null : text.replace(/\n$/, '').split('\n').length)

/** Each path a document cites that is no file of the working copy. @param {Document} document @param {Text[]} cited */
const missingCitations = ({ path, text }, cited) => citedPaths(text)
  .filter((cite) => textOf(cited, cite) === null)
  .map((cite) => `${path} cites ${cite}, which is no file of the working copy (#517)`)

/** @param {Text[]} cited @param {string} path */
const textOf = (cited, path) => cited.find((entry) => entry.path === path)?.text ?? null
