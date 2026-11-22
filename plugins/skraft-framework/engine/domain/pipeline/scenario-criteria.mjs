/**
 * One scenario per acceptance criterion: the criteria of a story are headed `## AC-<n>` in its
 * `ac-draft-<story>.md`, and each row of the test plan's `## Scenarios` table cites its criterion
 * by the tag `@AC-<n>` in its Tags column (the tag its `.feature` scenario carries). Every
 * criterion is cited by exactly one scenario and a scenario cites one criterion, an outline
 * holding the examples of its criterion alone. A story whose documents declare no criterion
 * identifier, or declare one twice, is not checked: the table cannot say which criterion a
 * citation means.
 *
 * @typedef {{ index: number, tags: string[] }} CitingScenario
 */

/** How DISCUSS heads one acceptance criterion (`## AC-1 — A card is paid`); the number may be zero-padded. */
const HEADING = /^##\s+AC-0*(\d+)\b/
/** How a scenario cites it, in its tags (`@AC-1`). */
const CITATION = /^@AC-0*(\d+)$/i

/** @param {number[]} numbers @param {string} [prefix] */
const labels = (numbers, prefix = 'AC-') => numbers.map((number) => `${prefix}${number}`).join(', ')

/**
 * The criteria numbers a story's documents declare, each document its text; none when a number
 * is declared twice.
 * @param {string[]} texts @returns {number[]}
 */
export const criteriaOf = (texts) => {
  const found = texts.flatMap((text) => text.split(/\r?\n/)).flatMap((line) => HEADING.exec(line)?.slice(1) ?? []).map(Number)
  return new Set(found).size === found.length ? found : []
}

/** The criteria a scenario cites. @param {string[]} tags */
const citedIn = (tags) => [...new Set(tags.flatMap((tag) => CITATION.exec(tag)?.slice(1) ?? []).map(Number))]

/**
 * Why the table of scenarios sends the acceptance designer back: a criterion no scenario cites, a
 * criterion several cite, a scenario citing several criteria; empty when each criterion has its
 * one scenario, or when the story declares none.
 * @param {string} path @param {CitingScenario[]} scenarios @param {number[]} criteria
 * @returns {string[]}
 */
export const criteriaFailures = (path, scenarios, criteria) => {
  const cites = scenarios.map(({ index, tags }) => ({ index, cited: citedIn(tags) }))
  return criteria.length === 0 ? [] : [...uncited(path, cites, criteria), ...shared(path, cites, criteria), ...merged(path, cites)]
}

/** @param {string} path @param {Array<{ index: number, cited: number[] }>} cites @param {number[]} criteria */
const uncited = (path, cites, criteria) => {
  const missing = criteria.filter((number) => !cites.some(({ cited }) => cited.includes(number)))
  return missing.map((number) => `${path}: AC-${number} is cited by no scenario; give it one scenario of its own, tagged @AC-${number} in the Tags column`)
}

/** @param {string} path @param {Array<{ index: number, cited: number[] }>} cites @param {number[]} criteria */
const shared = (path, cites, criteria) => criteria
  .map((number) => ({ number, rows: cites.filter(({ cited }) => cited.includes(number)).map(({ index }) => index) }))
  .filter(({ rows }) => rows.length > 1)
  .map(({ number, rows }) => `${path}: AC-${number} is cited by ${labels(rows, 'S')}; one scenario holds a criterion: merge them into one, an outline whose examples are the cases of AC-${number}`)

/** @param {string} path @param {Array<{ index: number, cited: number[] }>} cites */
const merged = (path, cites) => cites
  .filter(({ cited }) => cited.length > 1)
  .map(({ index, cited }) => `${path}: S${index} cites ${labels(cited)}; a scenario holds one criterion: give each criterion a scenario of its own`)
