// How the scenarios read the description of a pull request a run writes.
import assert from 'node:assert/strict'

/** Where a section starts: its heading, or the summary of the block that folds it. */
const START = /\n(?:## |<details(?: open)?><summary>)/g

/**
 * The text of a section of a description, between its heading, or the summary that folds it, and
 * the next section; a folded section without the end of its block.
 */
export const section = (text, heading) => {
  const starts = [...text.matchAll(START)].filter((start) => !text.startsWith('Dark theme', start.index + start[0].length))
  const own = starts.findIndex((start) => new RegExp(`^${heading}(?:: [^\\n]*)?(?:</summary>)?\\n`).test(text.slice(start.index + start[0].length)))
  assert.ok(own >= 0, `no section ${heading} in\n${text}`)
  const from = text.indexOf('\n', starts[own].index + 1)
  const whole = text.slice(from, starts[own + 1]?.index ?? text.length).trim()
  return starts[own][0].includes('<details') ? whole.replace(/\n*<\/details>$/, '') : whole
}

/** The line that opens a section: its heading, or the summary of the block that folds it. */
export const opening = (text, heading) => text.split('\n').find((line) => line === `## ${heading}` || new RegExp(`^<details(?: open)?><summary>${heading}(?:: .*)?</summary>$`).test(line))
