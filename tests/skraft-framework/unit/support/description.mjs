// How the scenarios read the description of a pull request a run writes.
import assert from 'node:assert/strict'

/** The text of a section of a description, between its heading and the next one. */
export const section = (text, heading) => {
  const from = text.indexOf(`\n## ${heading}\n`)
  assert.ok(from >= 0, `no section ${heading} in\n${text}`)
  const rest = text.slice(from + heading.length + 5)
  return rest.slice(0, rest.indexOf('\n## ') < 0 ? rest.length : rest.indexOf('\n## ')).trim()
}
