import { normalizeRelative, pathUnder } from '../config/relative-path.mjs'
import { mutationOutputsOf } from './mutation-report.mjs'
import { endedByMachine, interruptedBy } from '../pipeline/incidents.mjs'

/**
 * @typedef {import('../config/skraft-config.mjs').Component} Component
 * @typedef {'interrupted' | 'environment' | 'deterministic' | 'unknown'} FailureClass
 *   interrupted: a person stopped the command (Ctrl-C);
 *   environment: what a human must provide before the gate can tell anything: a program the
 *   machine lacks (it did not start, or the shell found none: 127, 9009), a command the
 *   configuration lacks, a mutation report that cannot be read;
 *   deterministic: the command ran and failed; its evidence goes back to the agent;
 *   unknown: the command timed out or stopped unexpectedly, with no known failing check.
 */

/** The commands that are gates, in the order they run. Other commands (`e2e`…) are not gates. */
export const GATE_ORDER = Object.freeze(['build', 'format', 'lint', 'test', 'architecture', 'coverage', 'mutation'])

/** @param {Component} component @returns {string[]} */
export const gatesOf = (component) => GATE_ORDER.filter((gate) => gate in component.commands)

/** Exit codes a shell gives when it cannot find the command: 127 (sh), 9009 (cmd). */
const NOT_FOUND_EXIT = Object.freeze([127, 9009])
const PERMISSION_DENIED = /\b(?:EACCES|EPERM|permission denied|access is denied|access denied)\b/i

/**
 * @param {{ started: boolean, exitCode: number | null, stdout?: string, stderr?: string }} result
 * @returns {FailureClass | null} null when the command passed
 */
export const failureOf = ({ started, exitCode, stdout = '', stderr = '' }) => {
  if (!started || NOT_FOUND_EXIT.includes(/** @type {number} */ (exitCode))) return 'environment'
  if (exitCode === 0) return null
  return startedFailure(exitCode, stdout, stderr)
}

/** @param {number | null} exitCode @param {string} stdout @param {string} stderr */
const startedFailure = (exitCode, stdout, stderr) => {
  if (PERMISSION_DENIED.test(`${stdout}\n${stderr}`)) return 'environment'
  if (interruptedBy(/** @type {number} */ (exitCode))) return 'interrupted'
  return exitCode === null || endedByMachine(/** @type {number} */ (exitCode)) ? 'unknown' : 'deterministic'
}

/** Changes under the tracking folder are the run's own bookkeeping, never a component's. */
const TRACKING = '.copilot-tracking'

/**
 * Whether a component is touched by the files changed since its base. A file under another
 * component whose root sits inside this one belongs to that one; a root equal to this one's
 * (this component's own, or a component sharing it) takes nothing away. What a mutation run left
 * (its report, StrykerJS's incremental file) is the run's own output, never a change.
 * @param {Component} component
 * @param {Component[]} components every component of the config
 * @param {string[]} changed paths relative to the component's root
 */
export const isTouched = (component, components, changed) => {
  const nested = components
    .map((other) => pathUnder(other.root, component.root))
    .filter((/** @type {string | null} */ inner) => inner !== null && inner !== '.')
  const outputs = mutationOutputsOf(component)
  return changed.some((path) => {
    const file = normalizeRelative(path)
    if (pathUnder(file, TRACKING) !== null || outputs.includes(file)) return false
    return !nested.some((inner) => pathUnder(file, /** @type {string} */ (inner)) !== null)
  })
}
