/**
 * A command line from `skraft-config.json` as the argv the engine starts, with no shell in
 * between: the same line runs the same way under sh, PowerShell and cmd.
 *
 * @typedef {{ ok: true, argv: string[] } | { ok: false, reason: string }} ParsedCommand
 */

/** What a shell would act on in a word written without quotes. */
const SHELL_SYNTAX = /[|&;<>]/

/**
 * Splits on blanks; `"…"` and `'…'` keep blanks inside one argument. `{baseSha}` is replaced
 * before splitting.
 * @param {string} line
 * @param {{ baseSha?: string | null }} [values]
 * @returns {ParsedCommand}
 */
export const parseCommand = (line, { baseSha = null } = {}) => {
  if (line.includes('{baseSha}') && !baseSha) return { ok: false, reason: 'uses {baseSha} but the run has no base for this repository' }
  const text = baseSha ? line.replaceAll('{baseSha}', baseSha) : line
  /** @type {Array<{ text: string, quoted: boolean }>} */
  const words = []
  /** @type {{ text: string, quoted: boolean } | null} the word being read, null between words */
  let word = null
  /** @type {string | null} */
  let quote = null
  for (const char of text) {
    if (quote !== null) {
      if (char === quote) quote = null
      else /** @type {{ text: string }} */ (word).text += char
    } else if (/\s/.test(char)) {
      word = null
    } else {
      if (word === null) words.push((word = { text: '', quoted: false }))
      if (char === '"' || char === "'") {
        quote = char
        word.quoted = true
      } else {
        word.text += char
      }
    }
  }
  if (quote !== null) return { ok: false, reason: `has an unclosed ${quote} quote` }
  const shell = words.find((candidate) => !candidate.quoted && SHELL_SYNTAX.test(candidate.text))
  if (shell !== undefined) return { ok: false, reason: `uses shell syntax (${shell.text}); put the steps in a script and call the script` }
  return { ok: true, argv: words.map((candidate) => candidate.text) }
}
