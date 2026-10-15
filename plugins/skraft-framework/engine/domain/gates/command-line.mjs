/**
 * A command line from `skraft-config.json` as the argv the engine starts, with no shell in
 * between: the same line runs the same way under sh, PowerShell and cmd.
 *
 * @typedef {{ ok: true, argv: string[] } | { ok: false, reason: string }} ParsedCommand
 */

const SHELL_ONLY = /^(?:&&|\|\||[|;&<>]|>>|2>&1|2>)$|^[<>|]|[|]$/

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
  /** @type {string[]} */
  const argv = []
  /** @type {string[]} the words written without quotes, where shell syntax would act */
  const bare = []
  let current = ''
  let started = false
  let quoted = false
  /** @type {string | null} */
  let quote = null
  const end = () => {
    argv.push(current)
    if (!quoted) bare.push(current)
  }
  for (const char of text) {
    if (quote !== null) {
      if (char === quote) quote = null
      else current += char
    } else if (char === '"' || char === "'") {
      quote = char
      started = true
      quoted = true
    } else if (/\s/.test(char)) {
      if (started) end()
      current = ''
      started = false
      quoted = false
    } else {
      current += char
      started = true
    }
  }
  if (quote !== null) return { ok: false, reason: `has an unclosed ${quote} quote` }
  if (started) end()
  if (argv.length === 0) return { ok: false, reason: 'is empty' }
  const shell = bare.find((word) => SHELL_ONLY.test(word))
  if (shell !== undefined) return { ok: false, reason: `uses shell syntax (${shell}); put the steps in a script and call the script` }
  return { ok: true, argv }
}
