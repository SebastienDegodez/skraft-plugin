// Which engine lines a change touches, as Stryker `mutate` targets. A pull request mutates what
// it added or changed against the branch it targets; the push to that branch mutates the whole
// engine and keeps the incremental file every pull request starts from.

/**
 * The lines the new side of a `git diff -U0 --src-prefix=a/ --dst-prefix=b/` adds or changes,
 * by file, as inclusive [start, end] ranges; a hunk that only deletes adds nothing.
 * @param {string} diff
 * @returns {Map<string, Array<[number, number]>>}
 */
export const changedLines = (diff) => {
  /** @type {Map<string, Array<[number, number]>>} */
  const changed = new Map()
  let file = null
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('+++ ')) file = newSide(line)
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line)
    if (file === null || hunk === null) continue
    const [start, count] = [Number(hunk[1]), hunk[2] === undefined ? 1 : Number(hunk[2])]
    if (count > 0) changed.set(file, [...(changed.get(file) ?? []), [start, start + count - 1]])
  }
  return changed
}

/** The path of `+++ b/<path>`; null for a deleted file. @param {string} line */
const newSide = (line) => {
  const path = line.slice(4).replace(/\t$/, '')
  return path.startsWith('b/') ? path.slice(2) : null
}

/**
 * The Stryker `mutate` targets of the changed lines: `<file>:<start>-<end>` for each range of a
 * file the configuration's `mutate` patterns select (a `!` pattern leaves a file out).
 * @param {Map<string, Array<[number, number]>>} changed
 * @param {string[]} patterns the `mutate` patterns of the Stryker configuration
 * @returns {string[]}
 */
export const mutateTargets = (changed, patterns) => {
  const included = patterns.filter((pattern) => !pattern.startsWith('!')).map(globPattern)
  const excluded = patterns.filter((pattern) => pattern.startsWith('!')).map((pattern) => globPattern(pattern.slice(1)))
  return [...changed]
    .filter(([file]) => included.some((glob) => glob.test(file)) && !excluded.some((glob) => glob.test(file)))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .flatMap(([file, ranges]) => ranges.map(([start, end]) => `${file}:${start}-${end}`))
}

/**
 * A glob as the `mutate` patterns write them: `**` spans folders, `*` stays in one.
 * @param {string} glob
 */
const globPattern = (glob) => new RegExp(`^${glob
  .split(/(\*\*\/|\*\*|\*)/)
  .map((part) => GLOB_PARTS[part] ?? part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
  .join('')}$`)

/** @type {Record<string, string>} */
const GLOB_PARTS = { '**/': '(?:.*/)?', '**': '.*', '*': '[^/]*' }
