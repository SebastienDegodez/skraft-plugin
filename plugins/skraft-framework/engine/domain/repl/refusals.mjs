/**
 * Why `skraft_repl` refuses or stops a call, each by a fixed code and a fixed text: the engine's
 * own failures never quote an exception, a path or what an agent wrote.
 */

/** @type {Readonly<Record<string, string>>} */
export const REFUSALS = Object.freeze({
  'repl-unavailable': 'skraft_repl works only inside the open attempt of an agent that commits code, and none is open now',
  'repl-busy': 'a cell of this attempt is still running: call skraft_repl with empty code to wait for it, or wait for the cancellation',
  'repl-held-elsewhere': 'another skraft MCP server holds the REPL of this attempt; use that session, or end it',
  'repl-restarted': 'the kernel was ended because a cell would not stop: its variables are gone, and the runs it had started were ended',
  'repl-crashed': 'the kernel ended by itself: its variables are gone, and the runs it had started were ended',
  'repl-interrupted': 'the call was cancelled before its cell started; nothing ran',
  'repl-failed': 'skraft could not start the kernel of this attempt',
  'repl-unexpected': 'the call stopped on an unexpected error of skraft; what was left of it did not run',
})

/**
 * @param {string} code @param {string | null} [evidence] the file that holds the exception, when there is one
 */
export const refusalText = (code, evidence = null) => `${code}: ${REFUSALS[code]}${evidence === null ? '' : `; the error is in ${evidence}`}`

/** Why a run a cell asked for does not start, by what is wrong with it. */
export const RUN_REFUSALS = Object.freeze({
  command: 'run() takes a non-empty command line, or an argv array of non-empty strings',
  cwd: 'run() takes a cwd that is a non-empty text',
  timeout: 'run() takes a timeout of 1 to 7200 seconds',
  option: 'run() takes a gate and a label that are non-empty texts',
})
