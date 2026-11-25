/**
 * What `skraft_deliver_repl` hands the agent after a cell: the runs that finished since the last cell, what
 * the cell printed, one line per run it started, then its trailing value or its error. The text
 * never passes RESULT_LIMIT characters; what is cut lives whole in the file the marker names.
 *
 * @typedef {{ id: number, command: string, status: 'running' | 'finished', exitCode: number | null, outcome: string | null, durationMs: number, log: string, gate: string | null, label: string | null }} RunLine
 *   outcome: how it ended when it did not simply exit: `timed out`, `killed`, `not started`.
 * @typedef {{ finished: RunLine[], printed: string, runs: RunLine[], value: string | null, error: string | null, status: string, cellLog: string }} CellParts
 *   cellLog: the file the whole printed text goes to when it is cut.
 */

export const RESULT_LIMIT = 24 * 1024
const COMMAND_WIDTH = 100

/** @param {string} command */
const shown = (command) => (command.length > COMMAND_WIDTH ? `${command.slice(0, COMMAND_WIDTH - 1)}…` : command)

/** @param {number} ms */
const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`

/** @param {RunLine} run */
const endOf = (run) => {
  if (run.status === 'running') return 'running'
  return run.outcome ?? `exit ${run.exitCode}`
}

/** One line per run: its id, how it stands, how long it took, its command and its log. @param {RunLine} run */
export const runLine = (run) => `r${run.id} ${endOf(run)} (${seconds(run.durationMs)}) ${shown(run.command)} - ${run.log}`

const NOT_INSTALLED = 'lib: the packages of .repl/package.json are not installed: run npm ci --prefix .repl in the working copy'

/**
 * What the first result of a kernel says of the project's REPL library: the modules it loaded,
 * then each one it could not.
 * @param {{ loaded: string[], failed: string[], refused?: string[], notInstalled?: boolean }} lib @returns {string[]}
 */
export const libraryLines = ({ loaded, failed, refused = [], notInstalled = false }) => [
  ...(notInstalled ? [NOT_INSTALLED] : []),
  ...(loaded.length === 0 ? [] : [`lib: ${loaded.join(', ')}`]),
  ...failed.map((name) => `lib: ${name} could not be loaded (it threw, or took more than 10 seconds); the kernel goes on without it`),
  ...refused.map((file) => `lib: ${file} is not loaded: the name of a module must be a JavaScript identifier`),
]

/** @param {RunLine} run */
const doneLine = (run) => `[run-done r${run.id} ${endOf(run)} in ${seconds(run.durationMs)}: ${shown(run.command)}]`

/** The trailing value or the error of the cell. @param {CellParts} parts @returns {string[]} */
const closing = ({ value, error, status }) => {
  if (error !== null) return [`${status === 'interrupted' ? 'interrupted' : 'error'}: ${error}`, ...hintOf(error)]
  return value === null ? [] : [`=> ${value}`]
}

/** Node's error for a top-level const or let declared again (measured on Node 22). */
const REDECLARED = /^SyntaxError: Identifier '[^']+' has already been declared/
const REDECLARED_HINT = 'hint: a top-level const or let lives as long as the kernel: declare a variable reused across cells with var, or under a new name, or call skraft_deliver_repl_reset for a fresh kernel'

/** @param {string} error @returns {string[]} */
const hintOf = (error) => (REDECLARED.test(error) ? [REDECLARED_HINT] : [])

/**
 * The text kept of an output past the room it has: its first and last halves around a marker.
 * @param {string} text @param {number} room @param {string} log
 */
const trimmed = (text, room, log) => {
  const marker = `\n… cut; the whole output is in ${log} …\n`
  if (text.length <= room) return text
  const half = Math.max(0, Math.floor((room - marker.length) / 2))
  return `${text.slice(0, half)}${marker}${text.slice(text.length - half)}`
}

/**
 * The result of a cell, at most RESULT_LIMIT characters.
 * @param {CellParts} parts @returns {{ text: string, cut: boolean }}
 */
export const composeCell = (parts) => {
  const around = [...parts.finished.map(doneLine), ...parts.runs.map(runLine), ...closing(parts)].join('\n')
  const printed = parts.printed.replace(/\n+$/, '')
  const room = RESULT_LIMIT - around.length - 2
  const kept = trimmed(printed, Math.max(room, 0), parts.cellLog)
  const finished = parts.finished.map(doneLine)
  const text = [...finished, ...(kept === '' ? [] : [kept]), ...parts.runs.map(runLine), ...closing(parts)].join('\n')
  return { text: text.length > RESULT_LIMIT ? `${text.slice(0, RESULT_LIMIT - 1)}…` : text, cut: kept !== printed || text.length > RESULT_LIMIT }
}
