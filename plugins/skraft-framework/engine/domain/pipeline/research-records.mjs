/**
 * The RESEARCH records the engine checks when the solution researcher finishes, instead of a lens:
 *   citations  every `#file:` citation of its research document names a readable file of the working
 *              copy, and the line range it cites is one that file holds (#517); a path written
 *              from a component's root is named back from the workspace root
 *
 * @typedef {{ path: string, text: string | null }} Text
 * @typedef {{ path: string, text: string }} Document a research document of the tracking folder, as the engine read it
 * @typedef {{ documents: Document[], cited: Text[], roots: string[], template: string }} Records
 *   documents: the research documents of the tracking folder; cited: the paths their `#file:`
 *   citations name and, for each, the same path under every component root, text null when the
 *   working copy has none or the path is no readable file; roots: the component roots;
 *   template: the template this attempt started from.
 */

import { joinRelative } from '../config/relative-path.mjs'

const RESEARCH = /(^|\/)research\/[^/]+\/[^/]+\.md$/
/** `#file:<path>`, then `:line` or `:line-line` over a hyphen or a dash: the only citation of a working-copy file. */
const CITATION = /#file:((?:[A-Za-z]:)?[^\s`'"()<>[\],;:]+)(?::(\d+)(?:[-\u2013](\d+))?)?/g
/** A citation that closes a sentence keeps its full stop, which no file name ends with. */
const FULL_STOP = /\.$/
/** The headings the template requires: every H2 and H3 below Research executed. */
const SECTION = /^##(#?) ([^\n]+)$/gm
const EXTERNAL = /^### External research\s*\n([\s\S]*?)(?=^#{1,3}\s|$(?![\s\S]))/m
const APPROACHES = /^## Evaluated approaches\s*\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/m
const APPROACH_STATUS = /^### .+\((recommended|rejected)\)\s*$/gim
const EXISTING_TESTS = /^### Existing tests\s*\n([\s\S]*?)(?=^#{1,3}\s|$(?![\s\S]))/m
const HANDOFF = /^## Handoff to DESIGN\s*\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/m
const SOURCE_URL = /\(Source:\s*([^\s)]+)\)/g
const HTTP_URL = /^https?:\/\/(?:localhost|(?:[a-z\d-]+\.)+[a-z\d-]+)(?::\d+)?(?:[/?#][^\s]*)?$/i
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
export const researchFailures = ({ documents, cited, roots, template }) => documents.flatMap((document) => [
  ...sectionFailures(document, template),
  ...sourceFailures(document),
  ...approachFailures(document),
  ...existingTestFailures(document, cited),
  ...handoffFailures(document, cited),
  ...missingCitations(document, cited, roots),
  ...rangeFailures(document, cited),
])

/** Sections required by the template and absent from a research document. @param {Document} document @param {string} template */
const sectionFailures = ({ path, text }, template) => sectionsOf(template)
  .filter((section) => !new Set(sectionsOf(text)).has(section))
  .map((section) => `${path} is missing section "${section}" (#517)`)

/** External citations must be well-formed HTTP(S) URLs with a dotted host or localhost. @param {Document} document */
const sourceFailures = ({ path, text }) => externalSources(text)
  .filter((url) => !HTTP_URL.test(url))
  .map((url) => `${path} cites invalid source URL "${url}" (#517)`)

/** Evaluated approaches need one recommendation and at least one rejection. @param {Document} document */
const approachFailures = ({ path, text }) => {
  const section = APPROACHES.exec(text)?.[1]
  if (section === undefined) return []
  const statuses = [...section.matchAll(APPROACH_STATUS)].map(([, status]) => status.toLowerCase())
  const recommended = statuses.filter((status) => status === 'recommended').length
  const rejected = statuses.includes('rejected')
  return [
    ...(recommended === 1 ? [] : [`${path} must have exactly one recommended approach under "Evaluated approaches" (found ${recommended}) (#517)`]),
    ...(rejected ? [] : [`${path} must have at least one rejected approach under "Evaluated approaches" (#517)`]),
  ]
}

/** Existing test rows must name a test in their cited files. @param {Document} document @param {Text[]} cited */
const existingTestFailures = ({ path, text }, cited) => existingTestRows(text)
  .filter(({ file, name }) => textOf(cited, file) !== null && !textOf(cited, file)?.includes(name))
  .map(({ file, name }) => `${path} cannot find test "${name}" in ${file} (#517)`)

/** Rows in the template's Existing tests table. @param {string} text */
const existingTestRows = (text) => {
  const section = EXISTING_TESTS.exec(text)?.[1] ?? ''
  const lines = section.split('\n').filter((line) => line.trim().startsWith('|'))
  if (!isExistingTestsHeader(cellsOf(lines[0] ?? ''))) return []
  return lines.slice(2).map(readExistingTestRow).filter(({ file, name }) => file && name)
}

/** @param {string[]} cells */
const isExistingTestsHeader = (cells) => cells[0] === 'Test file' && cells[1] === 'Test name'

/** @param {string} line */
const readExistingTestRow = (line) => {
  const [citation, name] = cellsOf(line)
  const file = citationsOf(citation ?? '')[0]?.path ?? ''
  return { file, name }
}

/** @param {string} line */
const cellsOf = (line) => line.split('|').slice(1, -1).map((cell) => cell.trim())

/** Handoff names must appear in their cited files. @param {Document} document @param {Text[]} cited */
const handoffFailures = ({ path, text }, cited) => handoffPairs(text)
  .filter(({ file, name }) => textOf(cited, file) !== null && !textOf(cited, file)?.includes(name))
  .map(({ file, name }) => `${path} cannot find "${name}" in ${file} (#517)`)

/** Name/path pairs from Handoff to DESIGN. @param {string} text */
const handoffPairs = (text) => (HANDOFF.exec(text)?.[1] ?? '')
  .split('\n')
  .filter((line) => line.includes('->'))
  .map(readHandoffPair)
  .filter(({ name, file }) => name && file)

/** @param {string} line */
const readHandoffPair = (line) => {
  const [before, citation] = line.split('->')
  const name = before.slice(before.lastIndexOf(':') + 1).trim()
  return { name, file: citationsOf(citation ?? '')[0]?.path ?? '' }
}

/** Source URLs in External research only. @param {string} text */
const externalSources = (text) => [...(EXTERNAL.exec(text)?.[1] ?? '').matchAll(SOURCE_URL)]
  .map(([, url]) => url)

/** Every H2, and the H3s beneath Research executed. @param {string} text */
const sectionsOf = (text) => {
  const sections = []
  let parent = ''
  for (const [, level, title] of text.matchAll(SECTION)) {
    if (!level) parent = title
    if (!level || parent === 'Research executed') sections.push(title)
  }
  return sections
}

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
