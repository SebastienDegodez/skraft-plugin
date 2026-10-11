/**
 * Where a journal stops chaining: each line's `prev` must be the hash of the line before
 * it, the first line's `null`.
 *
 * @param {string[]} lines the raw lines, in file order
 * @param {string[]} hashes hashes[i] is the hash of lines[i]
 * @returns {{ line: number, detail: string } | null} the first broken line, 1-based
 */
export const chainBreak = (lines, hashes) => {
  for (let index = 0; index < lines.length; index += 1) {
    const event = parse(lines[index])
    if (event === undefined) return { line: index + 1, detail: 'is not JSON' }
    if (index === 0) {
      if (event.prev !== null) return { line: 1, detail: 'does not open the chain' }
    } else if (event.prev !== hashes[index - 1]) {
      return { line: index + 1, detail: `does not chain to line ${index}` }
    }
  }
  return null
}

/** @param {{ line: number, detail: string }} broken */
export const tamperedReason = ({ line, detail }) =>
  `journal tampered: events.jsonl line ${line} ${detail}; restore the file or start a new slug`

/** @param {string} line @returns {any} */
const parse = (line) => {
  try {
    const value = JSON.parse(line)
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined
  } catch {
    return undefined
  }
}
