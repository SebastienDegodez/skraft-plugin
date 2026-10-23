/**
 * The name of these closest to `name`: the fewest letters to add, remove or change (Levenshtein
 * distance), the first listed on a tie.
 * @param {string} name @param {string[]} names at least one
 * @returns {string}
 */
export const closestName = (name, names) => names.reduce((best, candidate) => (distance(name, candidate) < distance(name, best) ? candidate : best))

/** @param {string} from @param {string} to */
const distance = (from, to) => {
  let row = Array.from({ length: to.length + 1 }, (_, index) => index)
  for (const [index, letter] of [...from].entries()) row = nextRow(row, letter, to, index + 1)
  return row[to.length]
}

/** The distances of `from` up to one more letter. @param {number[]} above @param {string} letter @param {string} to @param {number} start */
const nextRow = (above, letter, to, start) => {
  const row = [start]
  for (const [index, other] of [...to].entries()) row.push(Math.min(above[index + 1] + 1, row[index] + 1, above[index] + (letter === other ? 0 : 1)))
  return row
}
