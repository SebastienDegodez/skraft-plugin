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

/** Invocations that install dependencies into the folders a commit replay links from the working copy. */
const INSTALLERS = Object.freeze([['npm', 'ci'], ['npm', 'install'], ['npm', 'cit'], ['npm', 'install-ci-test'], ['pnpm', 'install'], ['yarn', 'install'], ['uv', 'sync'], ['pip', 'install']])

/**
 * The installer an argv runs, `npm ci`, as its words follow one another in it; null when it runs none.
 * @param {string[]} argv @returns {string | null}
 */
export const installerIn = (argv) => INSTALLERS.find((words) => argv.some((_, start) => words.every((word, at) => argv[start + at] === word)))?.join(' ') ?? null

/**
 * The argvs to try for a command, in order. Only `python` has more than one; any other program
 * starts as written.
 * @param {string[]} argv @returns {string[][]}
 */
export const programChoices = (argv) => (argv[0] === 'python' ? PYTHON.map((program) => [program, ...argv.slice(1)]) : [argv])

/**
 * Where a program with several choices was looked for, as a suffix of the message that it was
 * not found; empty for a program that starts as written.
 * @param {string[][]} choices from programChoices
 */
export const lookedFor = (choices) => (choices.length === 1 ? '' : `; looked for ${choices.map(([program]) => program).join(', ')}`)

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
  const shell = words.find((candidate) => !candidate.quoted && SHELL_SYNTAX.test(candidate.text))
  if (shell !== undefined) return { ok: false, reason: `uses shell syntax (${shell.text}); put the steps in a script and call the script` }
  return { ok: true, argv: words.map((candidate) => candidate.text) }
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
