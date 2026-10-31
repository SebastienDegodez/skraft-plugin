// Pure parser of a ```console fence. Source syntax:
//   `$ ` starts a POSIX command, `PS> ` a PowerShell command, `> ` a command typed in a host prompt.
//   A trailing `\` continues a command; every other line is output.
const PROMPTS = ['$ ', 'PS> ', '> ']

const promptOf = (line) => PROMPTS.find((prompt) => line.startsWith(prompt))

/** @returns {{ kind: 'command' | 'continuation' | 'output', prompt: string, text: string }[]} */
export const parseConsole = (source) => {
  const rows = []
  let continuing = false
  for (const line of source.replace(/\n$/, '').split('\n')) {
    const prompt = continuing ? undefined : promptOf(line)
    if (prompt) rows.push({ kind: 'command', prompt: prompt.trim(), text: line.slice(prompt.length) })
    else if (continuing) rows.push({ kind: 'continuation', prompt: '', text: line })
    else rows.push({ kind: 'output', prompt: '', text: line })
    continuing = rows.at(-1).kind !== 'output' && line.endsWith('\\')
  }
  return rows
}

/** The commands only, prompts stripped, continuations joined: one command per line. */
export const commandsOf = (rows) => {
  const commands = []
  for (const row of rows) {
    if (row.kind === 'command') commands.push(row.text)
    else if (row.kind === 'continuation') commands[commands.length - 1] = `${commands.at(-1).slice(0, -1).trimEnd()} ${row.text.trim()}`
  }
  return commands.join('\n')
}

/** The `title="…"` of a fence meta string, if any. */
export const titleOf = (metastring = '') => /title=(?:"([^"]*)"|'([^']*)')/.exec(metastring)?.slice(1).find(Boolean)
