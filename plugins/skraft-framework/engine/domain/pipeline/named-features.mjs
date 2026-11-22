/**
 * The `.feature` files a test plan names, which the scenario review cites: the rows of its
 * coverage matrix name them, as a path or in backticks; a row that names none writes `—`. Its
 * prose may mention another story's file, which stays out.
 */

/** A test plan names its scenarios' file in a cell of its coverage matrix, as a path or in backticks. */
const CITED = /[\w.-]+(?:\/[\w.-]+)*\.feature/g
/** A row of a table, its cells between pipes. */
const ROW = /^\s*\|(.*)\|\s*$/

/**
 * The `.feature` files the rows of a test plan's tables name, each once, back slashes read as
 * separators; a file its prose mentions is not one of them.
 * @param {string} text @returns {string[]}
 */
export const namedFeatures = (text) => {
  const rows = text.split(/\r?\n/).filter((line) => ROW.test(line)).join('\n')
  return [...new Set([...rows.replaceAll('\\', '/').matchAll(CITED)].map(([path]) => path))]
}
