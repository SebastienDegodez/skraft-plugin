/**
 * The prose of a pull request the pr-writer agent writes in the template the engine gives it:
 * the summary line, what changes, why, and what is out of scope. Everything else in the
 * description is rendered by the engine from the journal.
 *
 * @typedef {{ summary: string, what: string, why: string, limitations: string }} Prose
 */

/** A summary line, as the first line of a commit: at most this long. */
export const SUMMARY_LENGTH = 72

/** Each section of the template, by its heading. */
const SECTIONS = Object.freeze(/** @type {const} */ ([['summary', 'Summary'], ['what', 'What changes'], ['why', 'Why'], ['limitations', 'Out of scope and limitations']]))

/** @param {string} text the filled template @returns {Prose} */
export const readProse = (text) => {
  const bodies = sectionsOf(text.replace(/<!--[\s\S]*?-->/g, ''))
  return /** @type {Prose} */ (Object.fromEntries(SECTIONS.map(([key, heading]) => [key, (bodies.get(heading) ?? '').trim()])))
}

/** The text under each `## ` heading, by heading; what comes before the first one under null. @param {string} text */
const sectionsOf = (text) => {
  /** @type {Map<string | null, string>} */
  const bodies = new Map()
  let current = null
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('## ')) current = line.slice(3).trim()
    else bodies.set(current, `${bodies.get(current) ?? ''}${line}\n`)
  }
  return bodies
}

/**
 * Why the prose cannot make a description: a summary that is not one line of at most 72
 * characters, a section left empty.
 * @param {Prose} prose @returns {string[]}
 */
export const proseProblems = (prose) => [
  ...summaryProblems(prose.summary),
  ...SECTIONS.slice(1).filter(([key]) => prose[key] === '').map(([, heading]) => `pull request prose: ${heading} is empty`),
]

/** @param {string} summary */
const summaryProblems = (summary) => {
  if (summary === '') return ['pull request prose: Summary is empty']
  if (summary.includes('\n')) return ['pull request prose: Summary must be one line']
  return summary.length > SUMMARY_LENGTH ? [`pull request prose: Summary is ${summary.length} characters; at most ${SUMMARY_LENGTH}`] : []
}
