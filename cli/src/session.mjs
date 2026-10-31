import { createInterface } from 'node:readline'

/**
 * `skraft` alone, in a terminal: a session where each line is a skraft command.
 * Each line runs the engine in its own process, found again at that moment, so a plugin
 * update during the session is followed. The engine's own `usage` names the commands:
 * nothing here lists them, so the session never needs updating with the plugin.
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

/** The command names of the engine's usage text (`skraft <name> …`). @param {string} usage @returns {string[]} */
export const commandsOf = (usage) => [
  ...new Set(
    usage
      .split('\n')
      .map((line) => /skraft\s+([a-z][\w-]*|--version)/.exec(line)?.[1])
      .filter((name) => name !== undefined),
  ),
]

/**
 * @param {{
 *   input: NodeJS.ReadableStream, output: NodeJS.WritableStream, terminal: boolean,
 *   commands: string[], run: (args: string[]) => Promise<number>, say: (line: string) => void
 * }} session
 * @returns {Promise<void>} resolves when the person leaves
 */
export const runSession = ({ input, output, terminal, commands, run, say }) =>
  new Promise((resolve) => {
    const names = [...commands, 'upgrade', 'help', 'exit']
    const completer = (line) => {
      const hits = names.filter((name) => name.startsWith(line.trim()))
      return [hits.length > 0 ? hits : names, line.trim()]
    }
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
      const args = words[0] === 'skraft' ? words.slice(1) : words[0] === 'help' ? [] : words
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
    say(`type a command (${commands.slice(0, 4).join(', ')}…), help for the list, exit to leave`)
    reader.prompt()
  })
