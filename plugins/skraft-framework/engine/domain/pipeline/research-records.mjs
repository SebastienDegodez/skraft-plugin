/**
 * The RESEARCH records the engine checks when the solution researcher finishes, instead of a lens:
 *   citations  every `#file:` citation of its research document names a readable file of the working
 *              copy, and the line range it cites is one that file holds (#517); a path written
 *              from a component's root is named back from the workspace root
 *
 * @typedef {{ path: string, text: string | null }} Text
 * @typedef {{ path: string, text: string }} Document a research document of the tracking folder, as the engine read it
 * @typedef {{ documents: Document[], cited: Text[], roots: string[] }} Records
 *   documents: the research documents of the tracking folder; cited: the paths their `#file:`
 *   citations name and, for each, the same path under every component root, text null when the
 *   working copy has none or the path is no readable file; roots: the component roots.
 */

import { joinRelative } from '../config/relative-path.mjs'

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
 * The same path under each component root inside the working copy, other than the working copy
 * itself: a root outside it gives a `#file:` the engine never reads.
 * @param {string} path @param {string[]} roots
 * @returns {string[]}
 */
export const underRoots = (path, roots) => roots.filter((root) => root !== '.' && !OUTSIDE.test(root)).map((root) => joinRelative(root, path))

/**
 * Why the research records send the researcher back; empty when they hold.
 * @param {Records} records
 * @returns {string[]}
 */
export const researchFailures = ({ documents, cited, roots }) => documents.flatMap((document) => [
  ...missingCitations(document, cited, roots),
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

/** Each path a document cites that is no file of the working copy. @param {Document} document @param {Text[]} cited @param {string[]} roots */
const missingCitations = ({ path, text }, cited, roots) => allCitedPaths(text)
  .filter((cite) => textOf(cited, cite) === null)
  .map((cite) => `${path} cites #file:${cite}, which is no file of the working copy${fromWorkspaceRoot(cited, underRoots(cite, roots))} (#517)`)

/** Where the components hold a path written from their root, or nothing when none does. @param {Text[]} cited @param {string[]} candidates */
const fromWorkspaceRoot = (cited, candidates) => {
  const held = candidates.filter((candidate) => textOf(cited, candidate) !== null)
  return held.length === 0 ? '' : `: write it from the workspace root, ${held.map((file) => `#file:${file}`).join(' or ')}`
}

/** @param {Text[]} cited @param {string} path */
const textOf = (cited, path) => cited.find((entry) => entry.path === path)?.text ?? null
