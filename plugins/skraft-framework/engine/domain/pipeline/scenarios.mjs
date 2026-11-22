/**
 * The scenarios of a story, as the acceptance designer lists them in its test plan; the pass that
 * writes them commits the walking skeleton and the acceptance test of every scenario as one
 * failing commit, then DELIVER makes them pass group by group, in one green commit:
 *
 *   ## Scenarios
 *
 *   | # | Scenario | Component | Tags |
 *   |---|---|---|---|
 *   | S1 | Customer pays an order by card | api | @walking-skeleton @happy-path |
 *
 *   Walking skeleton exemption: none
 *
 * The engine reads the table and refuses only a plan it cannot read: no table, rows not numbered
 * S1, S2, … in order, a row with no title or naming no component of the configuration. What the
 * rows say (the walking skeleton, its exemption, the groups) is the designer's prose and the
 * review's to judge.
 *
 * @typedef {{ index: number, title: string, component: string, tags: string[] }} StoryScenario
 * @typedef {string} Exemption
 *   as the plan declares it: none, library, refactoring or docs-only; `none` when it declares none.
 * @typedef {{ scenarios: StoryScenario[], exemption: Exemption }} ScenarioPlan
 * @typedef {{ name: string, stack: string }} PlanComponent
 * @typedef {{ index: number, scenarios: number[] }} DeliveryGroup
 *   one green commit of DELIVER: the scenarios it makes pass, by number, as the implementation
 *   plan groups them.
 */


/** A group as the subjects of its green name it: `S1, S2`. @param {number[]} numbers */
export const groupLabel = (numbers) => numbers.map((index) => `S${index}`).join(', ')
const HEADING = /^#{2,3}\s+Scenarios\s*$/i
const ROW = /^\s*\|(.*)\|\s*$/
const SEPARATOR = /^[\s|:-]+$/
const EXEMPTION = /^\s*Walking skeleton exemption\s*:\s*(\S+)/im
const COLUMNS = Object.freeze(['#', 'scenario', 'component', 'tags'])
const SHAPE = 'a "## Scenarios" heading followed by the table | # | Scenario | Component | Tags |, one row per scenario'

/**
 * The scenario plan a test plan holds, or why it holds none the engine can follow.
 * @param {{ path: string, text: string }} plan @param {readonly PlanComponent[]} components
 * @returns {{ ok: true, plan: ScenarioPlan } | { ok: false, failures: string[] }}
 */
export const readScenarioPlan = ({ path, text }, components) => {
  const rows = tableRows(text.split(/\r?\n/))
  if (rows === null) return { ok: false, failures: [`${path} lists no scenario: write ${SHAPE}`] }
  const scenarios = rows.map(scenarioOf)
  const failures = rowFailures(path, scenarios, components)
  return failures.length > 0 ? { ok: false, failures } : { ok: true, plan: { scenarios, exemption: exemptionOf(text) } }
}

/**
 * The cells of each row of the table under the Scenarios heading, columns in plan order; null
 * when the plan has no such table, or one without those columns.
 * @param {string[]} lines @returns {string[][] | null}
 */
const tableRows = (lines) => {
  const heading = lines.findIndex((line) => HEADING.test(line))
  const table = heading < 0 ? null : tableAfter(lines, heading)
  if (table === null || table.length < 2) return null
  const header = table[0].map((cell) => cell.toLowerCase())
  if (COLUMNS.some((column) => !header.includes(column))) return null
  return table.slice(1).filter((cells) => !SEPARATOR.test(cells.join('|'))).map((cells) => COLUMNS.map((column) => cells[header.indexOf(column)] ?? ''))
}

/** The rows of the first table after the heading, each as its cells; null when none follows it. @param {string[]} lines @param {number} heading */
const tableAfter = (lines, heading) => {
  const start = lines.findIndex((line, index) => index > heading && ROW.test(line))
  if (start < 0) return null
  const end = lines.findIndex((line, index) => index > start && !ROW.test(line))
  return lines.slice(start, end < 0 ? lines.length : end).map(cellsOf)
}

/** @param {string} line */
const cellsOf = (line) => /** @type {RegExpExecArray} */ (ROW.exec(line))[1].split('|').map((cell) => cell.trim())

/** @param {string[]} cells # Scenario Component Tags @returns {StoryScenario} */
const scenarioOf = ([id, title, component, tags]) => ({
  index: /^S\d+$/.test(id) ? Number(id.slice(1)) : 0,
  title,
  component,
  tags: tags.split(/[\s,]+/).filter((tag) => tag.startsWith('@')),
})

/** @param {string} text */
const exemptionOf = (text) => EXEMPTION.exec(text)?.[1].toLowerCase() ?? 'none'

/**
 * The rows the engine cannot follow: numbered out of order, untitled, or in a component the
 * configuration does not list.
 * @param {string} path @param {StoryScenario[]} scenarios @param {readonly PlanComponent[]} components
 */
const rowFailures = (path, scenarios, components) => scenarios.flatMap((scenario, position) => [
  ...(scenario.index === position + 1 ? [] : [`${path}: row ${position + 1} is not S${position + 1}; number the scenarios S1, S2, … in the order DELIVER builds them`]),
  ...(scenario.title === '' ? [`${path}: S${position + 1} has no title`] : []),
  ...(components.some(({ name }) => name === scenario.component) ? [] : [`${path}: S${position + 1} names component "${scenario.component}", which is none of ${components.map(({ name }) => name).join(', ')}`]),
])

/**
 * The groups DELIVER works through, in one green commit, as the acceptance designer's
 * implementation plan lists them under any heading, in the order DELIVER builds them:
 *
 *   | Group | Scenarios | Rule | … |
 *   |---|---|---|---|
 *   | 1 | S1, S2 | Card payment | … |
 *   | 2 | S3–S5 | Expired card | … |
 *
 * A plan with no such table, or none at all, delivers one scenario per group. A row whose
 * Scenarios cell names no scenario cannot be read.
 * @param {{ path: string, text: string | null }} plan @param {readonly StoryScenario[]} scenarios
 * @returns {{ ok: true, groups: DeliveryGroup[] } | { ok: false, failures: string[] }}
 */
export const readDeliveryGroups = ({ path, text }, scenarios) => {
  const rows = text === null ? null : groupRows(text.split(/\r?\n/))
  if (rows === null) return { ok: true, groups: scenarios.map(({ index }) => ({ index, scenarios: [index] })) }
  const groups = rows.map((cell, at) => ({ index: at + 1, scenarios: scenarioNumbers(cell) }))
  const failures = groups.filter(({ scenarios: named }) => named.length === 0).map(({ index }) => `${path}: group ${index} names no scenario`)
  return failures.length > 0 ? { ok: false, failures } : { ok: true, groups }
}

const GROUP_COLUMNS = Object.freeze(['group', 'scenarios'])

/** The Scenarios cell of each row of the first table with Group and Scenarios columns; null when none has them. @param {string[]} lines */
const groupRows = (lines) => {
  for (let at = 0; at < lines.length; at += 1) {
    if (!ROW.test(lines[at]) || (at > 0 && ROW.test(lines[at - 1]))) continue
    const table = tableAfter(lines, at - 1)
    const header = /** @type {string[][]} */ (table)[0].map((cell) => cell.toLowerCase())
    if (GROUP_COLUMNS.every((column) => header.includes(column))) {
      return /** @type {string[][]} */ (table).slice(1).filter((cells) => !SEPARATOR.test(cells.join('|'))).map((cells) => cells[header.indexOf('scenarios')] ?? '')
    }
  }
  return null
}

/** The scenario numbers a cell names: S1, S2 or a range S3–S5. @param {string} cell @returns {number[]} */
const scenarioNumbers = (cell) => [...cell.matchAll(/S(\d+)(?:\s*[–—-]\s*S?(\d+))?/gi)].flatMap(([, from, to]) => {
  const first = Number(from)
  const last = to === undefined ? first : Number(to)
  return last < first ? [first] : Array.from({ length: last - first + 1 }, (_, offset) => first + offset)
})
