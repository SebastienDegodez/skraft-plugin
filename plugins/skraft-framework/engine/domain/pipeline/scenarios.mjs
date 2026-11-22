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
 * S1 is the scenario the story's walking skeleton walks, tagged `@walking-skeleton`, in a back-end
 * component when the configuration has one; its acceptance test is a scenario's like any other,
 * the walking skeleton a plain test beside it. A story with no new entry point declares why it has
 * none instead.
 *
 * @typedef {{ index: number, title: string, component: string, tags: string[] }} StoryScenario
 * @typedef {'none' | 'library' | 'refactoring' | 'docs-only'} Exemption
 * @typedef {{ scenarios: StoryScenario[], exemption: Exemption }} ScenarioPlan
 * @typedef {{ name: string, stack: string }} PlanComponent
 * @typedef {{ index: number, scenarios: number[] }} DeliveryGroup
 *   one green commit of DELIVER: the scenarios it makes pass, by number, as the implementation
 *   plan groups them.
 */

export const WALKING_SKELETON = '@walking-skeleton'

/** A group as the subjects of its green name it: `S1, S2`. @param {number[]} numbers */
export const groupLabel = (numbers) => numbers.map((index) => `S${index}`).join(', ')
const EXEMPTIONS = Object.freeze(/** @type {Exemption[]} */ (['none', 'library', 'refactoring', 'docs-only']))
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
  const exemption = exemptionOf(text)
  const scenarios = rows.map(scenarioOf)
  const failures = [...rowFailures(path, scenarios, components), ...walkingSkeletonFailures(path, { scenarios, exemption }, components)]
  return failures.length > 0 ? { ok: false, failures } : { ok: true, plan: { scenarios, exemption: /** @type {Exemption} */ (exemption) } }
}

/**
 * An exemption the engine does not know is the only failure of the walking skeleton; a known one
 * or none decides which scenario must be it.
 * @param {string} path @param {{ scenarios: StoryScenario[], exemption: string }} plan @param {readonly PlanComponent[]} components
 */
const walkingSkeletonFailures = (path, { scenarios, exemption }, components) => (EXEMPTIONS.some((known) => known === exemption)
  ? skeletonFailures(path, { scenarios, exemption: /** @type {Exemption} */ (exemption) }, components)
  : [`${path}: walking skeleton exemption "${exemption}" must be ${EXEMPTIONS.join(', ')}`])

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
 * The rows the engine cannot follow: numbered out of order, untitled, titled twice, or in a
 * component the configuration does not list.
 * @param {string} path @param {StoryScenario[]} scenarios @param {readonly PlanComponent[]} components
 */
const rowFailures = (path, scenarios, components) => scenarios.flatMap((scenario, position) => [
  ...(scenario.index === position + 1 ? [] : [`${path}: row ${position + 1} is not S${position + 1}; number the scenarios S1, S2, … in the order DELIVER builds them`]),
  ...(scenario.title === '' ? [`${path}: S${position + 1} has no title`] : []),
  ...(scenarios.findIndex(({ title }) => title === scenario.title) < position ? [`${path}: two scenarios are titled "${scenario.title}"`] : []),
  ...(components.some(({ name }) => name === scenario.component) ? [] : [`${path}: S${position + 1} names component "${scenario.component}", which is none of ${components.map(({ name }) => name).join(', ')}`]),
])

/**
 * Exactly one walking skeleton, S1, in a back-end component when the configuration has one; none
 * when the story declares itself exempt.
 * @param {string} path @param {ScenarioPlan} plan @param {readonly PlanComponent[]} components
 */
const skeletonFailures = (path, { scenarios, exemption }, components) => {
  const tagged = scenarios.filter(({ tags }) => tags.includes(WALKING_SKELETON))
  if (exemption !== 'none') return tagged.map(({ index }) => `${path}: the story declares its walking skeleton exempt (${exemption}), and S${index} carries ${WALKING_SKELETON}`)
  if (tagged.length !== 1 || tagged[0].index !== 1) return [`${path}: tag S1, and S1 only, ${WALKING_SKELETON}, or declare "Walking skeleton exemption: library | refactoring | docs-only"`]
  return frontEnd(components, tagged[0].component) ? [`${path}: the walking skeleton S1 runs in a back-end component; ${tagged[0].component} is a react front end`] : []
}

/**
 * Whether the component is a front end while the configuration has a back end.
 * @param {readonly PlanComponent[]} components @param {string} name
 */
const frontEnd = (components, name) => components.some(({ stack }) => stack !== 'react') && components.find((component) => component.name === name)?.stack === 'react'

/**
 * The groups DELIVER works through, in one green commit, as the acceptance designer's
 * implementation plan lists them under any heading, in the order DELIVER builds them:
 *
 *   | Group | Scenarios | Rule | … |
 *   |---|---|---|---|
 *   | 1 | S1, S2 | Card payment | … |
 *   | 2 | S3–S5 | Expired card | … |
 *
 * A plan with no such table, or none at all, delivers one scenario per group. A table must name
 * every scenario once, S1 in the first group.
 * @param {{ path: string, text: string | null }} plan @param {readonly StoryScenario[]} scenarios
 * @returns {{ ok: true, groups: DeliveryGroup[] } | { ok: false, failures: string[] }}
 */
export const readDeliveryGroups = ({ path, text }, scenarios) => {
  const rows = text === null ? null : groupRows(text.split(/\r?\n/))
  if (rows === null) return { ok: true, groups: scenarios.map(({ index }) => ({ index, scenarios: [index] })) }
  const groups = rows.map((cell, at) => ({ index: at + 1, scenarios: scenarioNumbers(cell) }))
  const failures = groupFailures(path, groups, scenarios.length)
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

/**
 * A table the engine cannot follow: a group naming no scenario, a scenario in none or in two
 * groups, one the test plan does not list, S1 out of the first group.
 * @param {string} path @param {DeliveryGroup[]} groups @param {number} count
 */
const groupFailures = (path, groups, count) => {
  const named = groups.flatMap(({ scenarios }) => scenarios)
  return [
    ...groups.filter(({ scenarios }) => scenarios.length === 0).map(({ index }) => `${path}: group ${index} names no scenario`),
    ...Array.from({ length: count }, (_, at) => at + 1).filter((index) => named.filter((number) => number === index).length !== 1).map((index) => `${path}: S${index} is in ${named.includes(index) ? 'more than one group' : 'no group'}`),
    ...[...new Set(named.filter((index) => index < 1 || index > count))].map((index) => `${path}: S${index} is no scenario of the test plan`),
    ...(count > 0 && !groups[0]?.scenarios.includes(1) ? [`${path}: S1 is in the first group, the one the walking skeleton walks`] : []),
  ]
}
