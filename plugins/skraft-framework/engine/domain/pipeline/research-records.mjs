/**
 * The RESEARCH records the engine checks when the solution researcher finishes, instead of a lens:
 *   citations  every `#file:` citation of its research document names a readable file of the working
 *              copy, and the line range it cites is one that file holds (#517)
 *
 * @typedef {{ path: string, text: string | null }} Text
 * @typedef {{ path: string, text: string }} Document a research document of the tracking folder, as the engine read it
 * @typedef {{ documents: Document[], cited: Text[] }} Records
 *   documents: the research documents of the tracking folder; cited: the paths their `#file:`
 *   citations name, text null when the working copy has none or the path is no readable file.
 */

const RESEARCH = /(^|\/)research\/[^/]+\/[^/]+\.md$/
/** `#file:<path>`, then `:line` or `:line-line` over a hyphen or a dash: the only citation of a working-copy file. */
const CITATION = /#file:((?:[A-Za-z]:)?[^\s`'"()<>[\],;:]+)(?::(\d+)(?:[-\u2013](\d+))?)?/g
/** A citation that closes a sentence keeps its full stop, which no file name ends with. */
const FULL_STOP = /\.$/
/** A path the engine never reads: absolute, climbing out with `..`, or in its own tracking folder. */
const OUTSIDE = /^(?:\/|[A-Za-z]:|\.copilot-tracking\/)|(?:^|\/)\.\.(?:\/|$)/

/** @param {string} path relative to the tracking folder */
export const isResearch = (path) => RESEARCH.test(path)

/**
 * The `#file:` citations of a research document, back slashes read as separators: the citation as
 * written, its path, and the first and last lines it claims the file holds, NaN when it names no
 * line, which lies outside no range. Text without `#file:` is no citation.
 * @param {string} text
 * @returns {Array<{ cite: string, path: string, first: number, last: number }>}
 */
const citationsOf = (text) => [...text.replaceAll('\\', '/').matchAll(CITATION)]
  .map(([cite, path, first, last]) => ({ cite, path: path.replace(FULL_STOP, ''), first: Number(first), last: Number(last ?? first) }))

/**
 * The paths a research document cites, each named once however often it cites it.
 * @param {string} text
 * @returns {string[]}
 */
const allCitedPaths = (text) => [...new Set(citationsOf(text).map(({ path }) => path))]

/**
 * The cited paths the engine reads: those inside the working copy. Any other is never read, so
 * it is reported as no file of the working copy.
 * @param {string} text
 * @returns {string[]}
 */
export const citedPaths = (text) => allCitedPaths(text).filter((path) => !OUTSIDE.test(path))

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
const rangeFailures = ({ path, text }, cited) => citationsOf(text)
  .map((citation) => ({ ...citation, lines: lineCount(textOf(cited, citation.path)) }))
  .filter(({ lines, first, last }) => lines !== null && (first < 1 || first > lines || last < 1 || last > lines))
  .map(({ cite, lines }) => `${path} cites ${cite}, outside the 1-${lines} line range (#517)`)

/** How many lines a file holds, a closing newline ending none; null when the engine read no file there, which missingCitations reports when a citation names it. @param {string | null} text */
const lineCount = (text) => (text === null ? null : withoutClosingNewline(text).split('\n').length)

/** @param {string} text */
// Stryker disable next-line StringLiteral: what replaces the closing newline holds no newline either, so the file keeps its line count
const withoutClosingNewline = (text) => text.replace(/\n$/, '')

/** Each path a document cites that is no file of the working copy. @param {Document} document @param {Text[]} cited */
const missingCitations = ({ path, text }, cited) => allCitedPaths(text)
  .filter((cite) => textOf(cited, cite) === null)
  .map((cite) => `${path} cites #file:${cite}, which is no file of the working copy (#517)`)

/** @param {Text[]} cited @param {string} path */
const textOf = (cited, path) => cited.find((entry) => entry.path === path)?.text ?? null
