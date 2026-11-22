/**
 * A command line from `skraft-config.json` as the argv the engine starts, with no shell in
 * between: the same line runs the same way under sh, PowerShell and cmd.
 *
 * @typedef {{ ok: true, argv: string[] } | { ok: false, reason: string }} ParsedCommand
 */

/** What a shell would act on in a word written without quotes. */
const SHELL_SYNTAX = /[|&;<>]/

/**
 * Where `python` is looked for, first found wins: the component's virtual environment, as POSIX
 * then Windows lay it out, then the PATH, where macOS and Linux often have only `python3`.
 */
const PYTHON = Object.freeze(['.venv/bin/python', '.venv/Scripts/python.exe', 'python', 'python3'])

/**
 * An argv written back as one line that parseCommand reads into the same argv: what the
 * evidence and doctor show of a command that ran.
 * @param {string[]} argv
 */
export const commandText = (argv) => argv
  .map((word) => (word.includes('"') ? `'${word}'` : word === '' || /[\s'|&;<>]/.test(word) ? `"${word}"` : word))
  .join(' ')

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
  const { words, quote } = scanWords(text)
  if (quote !== null) return { ok: false, reason: `has an unclosed ${quote} quote` }
  const reason = shellReason(words)
  return reason === null ? { ok: true, argv: words.map((candidate) => candidate.text) } : { ok: false, reason }
}

/**
 * Why the words need a shell the engine does not start: syntax it would act on, or variables it
 * would set before the program; null when they run as written.
 * @param {Word[]} words @returns {string | null}
 */
const shellReason = (words) => {
  const shell = words.find((candidate) => !candidate.quoted && SHELL_SYNTAX.test(candidate.text))
  if (shell !== undefined) return `uses shell syntax (${shell.text}); put the steps in a script and call the script`
  const assigned = assignmentsOf(words)
  if (assigned.length > 0) return `sets ${assigned.join(', ')} before its program, which no shell reads; put the variables and the command in a script and call the script`
  return null
}

/** A variable a shell sets for the program after it: `NAME=value`. */
const ASSIGNMENT = /^([A-Za-z_]\w*)=/

/**
 * The variables the words set before the program, as a shell would read them; none when the
 * first word is the program.
 * @param {Word[]} words @returns {string[]}
 */
const assignmentsOf = (words) => {
  const end = words.findIndex(({ text }) => !ASSIGNMENT.test(text))
  return words.slice(0, end === -1 ? words.length : end).map(({ text }) => /** @type {RegExpExecArray} */ (ASSIGNMENT.exec(text))[1])
}

/**
 * @typedef {{ text: string, quoted: boolean }} Word
 * @typedef {{ words: Word[], word: Word | null, quote: string | null }} Scan
 *   word: the word being read, null between words; quote: the quote left open, null outside one.
 */

/** @param {string} text @returns {Scan} the words, and the quote the text leaves open */
const scanWords = (text) => {
  /** @type {Scan} */
  const scan = { words: [], word: null, quote: null }
  for (const char of text) scanChar(scan, char)
  return scan
}

/**
 * One character: inside quotes, a blank between words, or part of a word.
 * @param {Scan} scan @param {string} char
 */
const scanChar = (scan, char) => {
  if (scan.quote !== null) scanQuoted(scan, char)
  else if (/\s/.test(char)) scan.word = null
  else scanUnquoted(scan, char)
}

/**
 * Inside quotes: the closing quote ends them; any other character, blanks included, is text.
 * @param {Scan} scan @param {string} char
 */
const scanQuoted = (scan, char) => {
  if (char === scan.quote) scan.quote = null
  else /** @type {Word} */ (scan.word).text += char
}

/**
 * Outside quotes: a quote opens quotes in the word; any other character is text. Either one
 * starts a word between words.
 * @param {Scan} scan @param {string} char
 */
const scanUnquoted = (scan, char) => {
  const word = scan.word ?? startWord(scan)
  if (char === '"' || char === "'") {
    scan.quote = char
    word.quoted = true
  } else {
    word.text += char
  }
}

/** @param {Scan} scan @returns {Word} */
const startWord = (scan) => {
  const word = { text: '', quoted: false }
  scan.words.push(word)
  scan.word = word
  return word
}
