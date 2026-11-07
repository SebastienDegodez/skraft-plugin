/**
 * The RESEARCH records the engine checks when the solution researcher finishes, instead of a lens:
 *   citations  every workspace path its research document cites is a readable file of the working
 *              copy, and a line range it cites is one that file holds (#517); a path written from
 *              a component's root is named back from the workspace root
 *
 * @typedef {{ path: string, text: string | null }} Text
 * @typedef {{ path: string, text: string }} Document a research document of the tracking folder, as the engine read it
 * @typedef {{ documents: Document[], cited: Text[], roots: string[] }} Records
 *   documents: the research documents of the tracking folder; cited: the workspace paths they
 *   cite and, for each, the same path under every component root, text null when the working copy
 *   has none or the path is no readable file; roots: the component roots of the configuration.
 */

import { joinRelative } from '../config/relative-path.mjs'

const RESEARCH = /(^|\/)research\/[^/]+\/[^/]+\.md$/
/** A token that could be a workspace path, including a trailing slash that marks a folder. */
const TOKEN = /(?<=^|[\s,`'"(])[\w.-]+(?:\/[\w.-]+)+\/?/g
/** A citation that closes a sentence keeps its full stop, which no file name ends with. */
const FULL_STOP = /\.$/
/** A path followed by `:line`, or by `:line-line` over a hyphen or a dash: what the document claims its file holds. */
const RANGE = /(?<=^|[\s,`'"(])([\w.-]+(?:\/[\w.-]+)*):(\d+)(?:[-\u2013](\d+))?/g
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

/**
 * The same path under each component root other than the working copy's own.
 * @param {string} path @param {string[]} roots
 * @returns {string[]}
 */
export const underRoots = (path, roots) => roots.filter((root) => root !== '.').map((root) => joinRelative(root, path))

/**
 * Every token that names a folder and what it holds, back slashes read as separators. A name with
 * no folder is no citation: the researcher writes each path from the workspace root, and a bare
 * name (`System.IO`, `Program.cs`) cannot tell code from a file.
 * @param {string} text
 */
const tokensOf = (text) => text.replaceAll('\\', '/').match(TOKEN) ?? []

/** @param {string} path */
const isWorkspaceFile = (path) => !path.endsWith('/') && EXTENSION.test(path) && !path.startsWith(TRACKING) && !path.split('/').some((part) => part === '.' || part === '..')

/**
 * The line ranges a research document cites: the citation as written, its path, and the last
 * line it claims the file holds.
 * @param {string} text
 * @returns {Array<{ cite: string, path: string, last: number }>}
 */
export const citedRanges = (text) => [...text.replaceAll('\\', '/').matchAll(RANGE)]
  .map(([cite, path, first, last]) => ({ cite, path, first: Number(first), last: Number(last ?? first) }))

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
const rangeFailures = ({ path, text }, cited) => citedRanges(text)
  .map((range) => ({ ...range, lines: lineCount(textOf(cited, range.path)) }))
  .filter(({ lines, first, last }) => lines !== null && (first < 1 || first > lines || last < 1 || last > lines))
  .map(({ cite, lines }) => `${path} cites ${cite}, outside the 1-${lines} line range (#517)`)

/** How many lines a file holds, a closing newline ending none; null when the engine read no file there, which missingCitations reports when a citation names it. @param {string | null} text */
const lineCount = (text) => (text === null ? null : withoutClosingNewline(text).split('\n').length)

/** @param {string} text */
// Stryker disable next-line StringLiteral: what replaces the closing newline holds no newline either, so the file keeps its line count
const withoutClosingNewline = (text) => text.replace(/\n$/, '')

/** Each path a document cites that is no file of the working copy. @param {Document} document @param {Text[]} cited @param {string[]} roots */
const missingCitations = ({ path, text }, cited, roots) => citedPaths(text)
  .filter((cite) => textOf(cited, cite) === null)
  .map((cite) => `${path} cites ${cite}, which is no file of the working copy${fromWorkspaceRoot(cited, underRoots(cite, roots))} (#517)`)

/** Where the components hold a path written from their root, or nothing when none does. @param {Text[]} cited @param {string[]} candidates */
const fromWorkspaceRoot = (cited, candidates) => {
  const held = candidates.filter((candidate) => textOf(cited, candidate) !== null)
  return held.length === 0 ? '' : `: write it from the workspace root, ${held.join(' or ')}`
}

/** @param {Text[]} cited @param {string} path */
const textOf = (cited, path) => cited.find((entry) => entry.path === path)?.text ?? null
