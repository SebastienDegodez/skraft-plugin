/**
 * Who can fix a failure, and what the engine tells a human of one it cannot send back to an agent.
 *
 * @typedef {'agent' | 'environment' | 'config' | 'unknown' | 'interrupted'} Owner
 *   agent: its work, which the run sends back to it; environment: the machine (a program, a
 *   service, a permission, a Git hook); config: skraft-config.json (a command, a path);
 *   unknown: a command stopped by a signal or a crash, which nothing tells apart; interrupted:
 *   a person who stopped the command (Ctrl-C), whom the run never asks again
 * @typedef {{ owner: Exclude<Owner, 'agent'>, log: string | null }} Incident
 *   log: the file that holds what the failing command printed, absolute; null when none ran
 */

/** What a human reads of each cause the engine does not send back to an agent. */
const CAUSES = Object.freeze({
  environment: 'the machine: a program, a service, a permission or a Git hook it lacks or refuses',
  config: 'skraft-config.json: a command or a path it gives the engine',
  unknown: 'none the engine knows: the command was stopped by a signal or crashed, which no failing check explains',
})

/** @param {Incident} incident */
export const causeLines = ({ owner, log }) => [`Cause: ${CAUSES[owner]}.`, ...(log === null ? [] : [`Output: ${log}`])]

/** The incident of a machine that cannot run a step, when nothing more is known of it. @type {Incident} */
export const MACHINE = Object.freeze({ owner: 'environment', log: null })

/** What a command exits with when a person interrupts it: SIGINT (128 + 2) on POSIX, STATUS_CONTROL_C_EXIT on Windows. */
const INTERRUPTED = Object.freeze([130, 0xC000013A])

/** Whether an exit code says a person interrupted the command (Ctrl-C). @param {number} exitCode */
export const interruptedBy = (exitCode) => INTERRUPTED.includes(exitCode)

/**
 * Whether an exit code says the command was stopped rather than failed: a signal (128 + its
 * number on POSIX) or a crash (an NTSTATUS from 0xC0000000 on Windows).
 * @param {number} exitCode
 */
export const endedByMachine = (exitCode) => exitCode > 128
