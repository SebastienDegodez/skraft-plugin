import { createInterface } from 'node:readline'

/**
 * `skraft` alone, in a terminal: a session where each line is a skraft command.
 * Each line runs the engine in its own process, found again at that moment, so a plugin
 * update during the session is followed. The engine's `skraft commands --json` names the
 * commands (help, completion, unknown commands): nothing here lists them, so the session never
 * needs updating with the plugin.
 */

const LEAVE = new Set(['exit', 'quit', 'q'])
const PROMPT = 'skraft › '

/**
 * Splits a line the way a shell would for plain words and quotes: "two words" and 'two words'
 * are one argument; a backslash keeps the next character.
 * @param {string} line @returns {string[] | undefined} the words, undefined when a quote is left open
 */
export const wordsOf = (line) => {
  const words = []
  let word = ''
  let quote = ''
  let started = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '\\' && quote !== "'" && index + 1 < line.length) {
      word += line[(index += 1)]
      started = true
    } else if (quote !== '') {
      if (char === quote) quote = ''
      else word += char
    } else if (char === '"' || char === "'") {
      quote = char
      started = true
    } else if (/\s/.test(char)) {
      if (started) words.push(word)
      word = ''
      started = false
    } else {
      word += char
      started = true
    }
  }
  if (quote !== '') return undefined
  if (started) words.push(word)
  return words
}

/**
 * @typedef {{ command: string, synopsis?: string, summary?: string }} UsageLine
 *   one line of the engine's `skraft commands --json`
 */

/** Commands of the skraft command itself, not of the engine. */
const OWN = [
  { command: 'upgrade', summary: 'update the skraft command and the plugin in each host' },
  { command: 'help', synopsis: '[<command>]', summary: 'this list, or the lines of one command' },
  { command: 'exit', summary: 'leave the session (also quit, Ctrl-D)' },
]

/** @param {UsageLine[]} catalog @returns {string[]} the command names, in order, once each */
const namesOf = (catalog) => [...new Set(catalog.map(({ command }) => command))]

/** @param {string} left @param {string} right @returns {number} edit distance */
const distance = (left, right) => {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0]
    row[0] = i
    for (let j = 1; j <= right.length; j += 1) {
      const kept = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1))
      previous = kept
    }
  }
  return row[right.length]
}

/** @param {string} word @param {string[]} names @returns {string | undefined} the closest name, within two edits */
export const closest = (word, names) =>
  names.map((name) => [name, distance(word, name)]).filter(([, d]) => d <= 2).sort((a, b) => a[1] - b[1])[0]?.[0]

/** @param {UsageLine[]} lines @returns {string} aligned `command synopsis   summary` lines */
const listing = (lines) => {
  const lefts = lines.map(({ command, synopsis }) => [command, synopsis].filter(Boolean).join(' '))
  const width = Math.min(Math.max(...lefts.map((left) => left.length)), 44) + 2
  return lines.map(({ summary }, index) => `  ${summary ? lefts[index].padEnd(width) + summary : lefts[index]}`).join('\n')
}

/** @param {UsageLine[]} catalog @param {string | undefined} wanted @returns {string} */
export const helpOf = (catalog, wanted) => {
  if (wanted === undefined) return `${listing(catalog)}\n\n${listing(OWN)}\n`
  const lines = [...catalog, ...OWN].filter(({ command }) => command === wanted)
  if (lines.length > 0) return `${listing(lines)}\n`
  const near = closest(wanted, namesOf([...catalog, ...OWN]))
  return `skraft: no command ${wanted}${near ? `; did you mean ${near}?` : ''}\n`
}

/** The words that may follow a command: its sub-commands and its options. @param {UsageLine[]} catalog @param {string} command */
const followersOf = (catalog, command) => [
  ...new Set(
    catalog
      .filter((line) => line.command === command)
      .flatMap(({ synopsis = '' }) => [/^[a-z][\w-]*/.exec(synopsis)?.[0], ...(synopsis.match(/--[\w-]+/g) ?? [])])
      .filter(Boolean),
  ),
]

/** @param {UsageLine[]} catalog @returns {(line: string) => [string[], string]} */
const completerOf = (catalog) => {
  const names = namesOf([...catalog, ...OWN])
  return (line) => {
    const words = line.split(/\s+/)
    const last = words.at(-1) ?? ''
    const choices = words.length <= 1 ? names : followersOf(catalog, words[0])
    const hits = choices.filter((choice) => choice.startsWith(last))
    return [hits.length > 0 ? hits : choices, last]
  }
}

/**
 * @param {{
 *   input: NodeJS.ReadableStream, output: NodeJS.WritableStream, terminal: boolean,
 *   catalog: UsageLine[], run: (args: string[]) => Promise<number>, say: (line: string) => void
 * }} session
 * @returns {Promise<void>} resolves when the person leaves
 */
export const runSession = ({ input, output, terminal, catalog, run, say }) =>
  new Promise((resolve) => {
    const completer = completerOf(catalog)
    const known = new Set(namesOf([...catalog, ...OWN]).filter((name) => name !== 'help' && name !== 'exit'))
    const reader = createInterface({ input, output, terminal, completer, prompt: PROMPT, historySize: 200 })
    let running = false
    reader.on('SIGINT', () => {
      if (running) return
      output.write('\n')
      reader.prompt()
    })
    let closed = false
    let leaving = false
    /** Lines wait their turn: a pasted block or a pipe runs them one after the other. */
    let queue = Promise.resolve()
    const finish = () => {
      if (terminal) output.write('\n')
      resolve()
    }
    reader.on('close', () => {
      closed = true
      queue = queue.then(finish)
    })
    /** @param {string} line @returns {Promise<void>} */
    const handle = async (line) => {
      if (leaving) return undefined
      const words = wordsOf(line)
      if (words === undefined) return say('skraft: a quote is not closed')
      if (words.length === 0) return undefined
      if (LEAVE.has(words[0])) {
        leaving = true
        return reader.close()
      }
      const args = words[0] === 'skraft' ? words.slice(1) : words
      if (args[0] === 'help') return output.write(helpOf(catalog, args[1]))
      if (catalog.length > 0 && !known.has(args[0])) return say(helpOf(catalog, args[0]).trimEnd())
      running = true
      await run(args)
      running = false
      return undefined
    }
    reader.on('line', (line) => {
      queue = queue.then(() => handle(line)).then(() => {
        if (!closed && !leaving) reader.prompt()
      })
    })
    say(`type a command (${namesOf(catalog).filter((name) => !name.startsWith('-')).slice(0, 4).join(', ')}…), help for the list, exit to leave`)
    reader.prompt()
  })
