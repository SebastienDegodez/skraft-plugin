/**
 * How many rows of the run's test plans sit on the Domain layer, and how many are acceptance rows
 * (Application and E2E): the rows of each Markdown table whose header names a `Layer` column next
 * to a `Scenario` column, the test plan's own table; a totals table has no Scenario column. A
 * Domain row whose `Priority` is `existing` plans no new test: an existing one covers it, so it
 * is not counted.
 *
 * @typedef {{ path: string, text: string }} TrackedDocument
 * @typedef {{ domain: number, acceptance: number }} LayerCounts
 */

const ACCEPTANCE = Object.freeze(['application', 'e2e'])

/** @typedef {{ layer: string | undefined, priority: string | undefined }} PlanRow the Layer and Priority cells of a row, lower case; undefined for a cell the row lacks */

/** @param {TrackedDocument[]} documents @returns {LayerCounts} */
export const layerCounts = (documents) => {
  const rows = documents.flatMap(({ text }) => planRows(text.split('\n')))
  return {
    domain: rows.filter(({ layer, priority }) => layer === 'domain' && priority !== 'existing').length,
    acceptance: rows.filter(({ layer }) => ACCEPTANCE.includes(/** @type {string} */ (layer))).length,
  }
}

/** The Layer and Priority cells of each row of each test-plan table. @param {string[]} lines @returns {PlanRow[]} */
const planRows = (lines) => lines.flatMap((line, index) => {
  const header = isRow(line) ? cellsOf(line).map((cell) => cell.toLowerCase()) : []
  return header.includes('layer') && header.includes('scenario') ? rowsAfter(lines, index + 1).map((row) => rowOf(header, row)) : []
})

/** @param {string[]} header @param {string} row @returns {PlanRow} */
const rowOf = (header, row) => {
  const cells = cellsOf(row).map((cell) => cell.toLowerCase())
  return { layer: cells[header.indexOf('layer')], priority: cells[header.indexOf('priority')] }
}

/** The rows of the table whose header is just before `from`, up to its first line that is not a row. @param {string[]} lines @param {number} from */
const rowsAfter = (lines, from) => {
  const end = lines.findIndex((line, index) => index >= from && !isRow(line))
  return lines.slice(from, end < 0 ? lines.length : end)
}

/** @param {string} line */
const isRow = (line) => line.trim().startsWith('|')

/** @param {string} line */
const cellsOf = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
