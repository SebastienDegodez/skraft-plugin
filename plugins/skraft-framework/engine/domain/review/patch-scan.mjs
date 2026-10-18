/**
 * What the engine reads in a review's patch for G9 (Iron Rule) without asking a lens, given to
 * the review as findings of `test-integrity#patch`:
 *   a skip added to a test                                      blocker at path:line
 *   a test file deleted                                         blocker at path
 *   assertion lines removed from a test file, fewer added back  high at path
 * A test file is one under a `test`, `tests`, `spec`, `specs` or `__tests__` folder, or whose
 * name ends in `.test.<ext>`, `_test.<ext>`, `-spec.<ext>`, `Tests.<ext>` and the like.
 *
 * @typedef {import('./answers.mjs').Finding} Finding
 * @typedef {{ path: string, deleted: boolean, added: Array<{ line: number, text: string }>, removed: string[] }} FileChange
 */

/** The lens id the findings come under; its name is test-integrity, whose gates they are. */
export const SCAN = 'test-integrity#patch'
/** The lens whose review the scan joins. */
export const SCANNED_WITH = 'test-integrity'

const TEST_FILE = /(^|\/)(tests?|specs?|__tests__)\/|[._-](tests?|specs?)\.[^/.]+$|Tests?\.[^/.]+$/i
const SKIP = /\[(?:Fact|Theory|Test)\([^)\]]*\bSkip\s*=|\[(?:Skip|Ignore)\b|\b(?:it|test|describe|context)\.skip\s*\(|\b(?:xit|xtest|xdescribe)\s*\(|@pytest\.mark\.(?:skip|xfail)\b|\bpytest\.skip\s*\(|@unittest\.skip|@Disabled\b|@Ignore\b/
const ASSERTION = /\bAssert\.\w+|\bassert\w*\s*\(|^\s*assert\s|\bexpect\s*\(|\.Should\(|\bassertThat\s*\(/
const SECTION = /^diff --git a\/(.+?) b\/(.+)$/
const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/**
 * @param {string} patch a unified diff, paths relative to the working copy
 * @returns {Finding[]} numbered F1, F2… in patch order
 */
export const scanPatch = (patch) => fileChanges(patch)
  .filter(({ path }) => TEST_FILE.test(path))
  .flatMap(fileFindings)
  .map((finding, index) => ({ id: `F${index + 1}`, gate: 'G9', suggestion: null, ...finding }))

/** @typedef {Omit<Finding, 'id' | 'gate' | 'suggestion'>} Found */

/** @param {FileChange} change @returns {Found[]} */
const fileFindings = ({ path, deleted, added, removed }) => {
  if (deleted) return [found('blocker', path, 'test file deleted')]
  const skips = added.filter(({ text }) => SKIP.test(text))
    .map(({ line, text }) => found('blocker', `${path}:${line}`, `a skip added to a test: ${text.trim()}`))
  const lost = removed.filter((text) => ASSERTION.test(text)).length
  const back = added.filter(({ text }) => ASSERTION.test(text)).length
  return lost > back ? [...skips, found('high', path, `${lost} assertion lines removed, ${back} added back`)] : skips
}

/** @param {Finding['severity']} severity @param {string} location @param {string} description @returns {Found} */
const found = (severity, location, description) => ({ severity, location, description })

/** @param {string} patch @returns {FileChange[]} */
const fileChanges = (patch) => {
  /** @type {FileChange[]} */
  const changes = []
  /** @type {{ change: FileChange | null, line: number }} */
  const at = { change: null, line: 0 }
  for (const text of patch.split('\n')) readLine(changes, at, text)
  return changes
}

/**
 * One line of the patch: a new file section, a hunk header, or a line of the current file.
 * @param {FileChange[]} changes @param {{ change: FileChange | null, line: number }} at @param {string} text
 */
const readLine = (changes, at, text) => {
  const section = SECTION.exec(text)
  if (section !== null) {
    at.change = { path: section[2], deleted: false, added: [], removed: [] }
    changes.push(at.change)
    return
  }
  if (at.change !== null) readChange(at, /** @type {FileChange} */ (at.change), text)
}

/** @param {{ line: number }} at @param {FileChange} change @param {string} text */
const readChange = (at, change, text) => {
  const hunk = HUNK.exec(text)
  if (hunk !== null) at.line = Number(hunk[1])
  else if (text.startsWith('deleted file mode')) change.deleted = true
  else if (text.startsWith('+')) change.added.push({ line: at.line++, text: text.slice(1) })
  else if (text.startsWith('-')) change.removed.push(text.slice(1))
  else if (text.startsWith(' ')) at.line += 1
}
