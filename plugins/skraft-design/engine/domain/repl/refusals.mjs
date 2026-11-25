/**
 * Why `skraft_design_repl` or `skraft_design_repl_reset` refuses or stops a call, or what a reset did, each by
 * a fixed code and a fixed text: the engine's own failures never quote an exception, a path or
 * what an agent wrote.
 */

/** @type {Readonly<Record<string, string>>} */
export const REFUSALS = Object.freeze({
  'repl-unavailable': 'skraft_design_repl works only inside the open attempt of an agent that commits code, and none is open now',
  'repl-busy': 'a cell of this attempt is still running: call skraft_design_repl with empty code to wait for it, wait for the cancellation, or call skraft_design_repl_reset to end it',
  'repl-held-elsewhere': 'another skraft MCP server holds the REPL of this attempt; use that session, or end it',
  'repl-restarted': 'the kernel was ended because a cell would not stop: its variables are gone, and the runs it had started were ended',
  'repl-reset': 'the kernel of this attempt was ended on request, with the runs it had started: its variables are gone, and the next skraft_design_repl starts a fresh kernel',
  'repl-no-kernel': 'no kernel of this attempt runs, so nothing was ended; the next skraft_design_repl starts a fresh kernel',
  'repl-fresh': 'the kernel of this attempt was ended (on request, unused for 15 minutes, its attempt over, or the session closing) and a fresh one started: its variables are gone',
  'repl-crashed': 'the kernel ended by itself: its variables are gone, and the runs it had started were ended',
  'repl-interrupted': 'the call was cancelled before its cell started; nothing ran',
  'repl-failed': 'skraft could not start the kernel of this attempt',
  'repl-trace-failed': 'a line of the trace of this attempt could not be written, so the trace is incomplete',
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
  unknown: 'run() takes only these options: cwd, timeout, gate, label',
  many: 'run() runs at most 8 programs of an attempt at once: await or kill one first',
})

/** The signals a cell may end its run with, and the longest grace before SIGKILL, in seconds. */
export const KILL_SIGNALS = Object.freeze(['SIGTERM', 'SIGINT', 'SIGKILL'])
export const MAX_GRACE_S = 30
export const KILL_REFUSAL = 'kill() takes SIGTERM, SIGINT or SIGKILL and a grace of 0 to 30 whole seconds'

/** @param {unknown} signal @param {unknown} grace seconds @returns {string | null} why the kill is refused, null when it is not */
export const refusalOfKill = (signal, grace) => {
  const bounded = Number.isInteger(grace) && /** @type {number} */ (grace) >= 0 && /** @type {number} */ (grace) <= MAX_GRACE_S
  return KILL_SIGNALS.includes(/** @type {string} */ (signal)) && bounded ? null : KILL_REFUSAL
}
