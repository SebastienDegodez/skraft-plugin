/**
 * A `.gitignore` that lists a file at the root of the working copy: the text to write, null
 * when it already lists it (`name` or `/name`).
 * @param {string | null} text the file's content, null when absent @param {string} name
 * @returns {string | null}
 */
export const ignoring = (text, name) => {
  if (text === null) return `${name}\n`
  if (text.split(/\r?\n/).some((line) => [name, `/${name}`].includes(line.trim()))) return null
  return `${text}${text === '' || text.endsWith('\n') ? '' : '\n'}${name}\n`
}
