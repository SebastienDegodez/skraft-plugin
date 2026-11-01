/**
 * How many rows of the run's test plans sit on the Domain layer, and how many are acceptance rows
 * (Application and E2E): the rows of each Markdown table whose header names a `Layer` column next
 * to a `Scenario` column, the test plan's own table; a totals table has no Scenario column.
 *
 * @typedef {{ path: string, text: string }} TrackedDocument
 * @typedef {{ domain: number, acceptance: number }} LayerCounts
 */

const ACCEPTANCE = Object.freeze(['application', 'e2e'])

/** @param {TrackedDocument[]} documents @returns {LayerCounts} */
export const layerCounts = (documents) => {
  const layers = documents.flatMap(({ text }) => planLayers(text.split('\n')))
  return {
    domain: layers.filter((layer) => layer === 'domain').length,
    acceptance: layers.filter((layer) => ACCEPTANCE.includes(layer)).length,
  }
}

/** The Layer cell of each row of each test-plan table, lower case. @param {string[]} lines @returns {string[]} */
const planLayers = (lines) => lines.flatMap((line, index) => {
  const header = isRow(line) ? cellsOf(line).map((cell) => cell.toLowerCase()) : []
  const column = header.indexOf('layer')
  return column >= 0 && header.includes('scenario') ? rowsAfter(lines, index + 1).map((row) => (cellsOf(row)[column] ?? '').toLowerCase()) : []
})

/** The rows of the table whose header is just before `from`, up to its first line that is not a row. @param {string[]} lines @param {number} from */
const rowsAfter = (lines, from) => {
  const end = lines.findIndex((line, index) => index >= from && !isRow(line))
  return lines.slice(from, end < 0 ? lines.length : end)
}

/** @param {string} line */
const isRow = (line) => line.trim().startsWith('|')

/** @param {string} line */
const cellsOf = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
