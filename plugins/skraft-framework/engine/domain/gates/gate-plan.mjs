import { normalizeRelative, pathUnder } from '../config/relative-path.mjs'
import { mutationReportOf } from './mutation-report.mjs'

/**
 * @typedef {import('../config/skraft-config.mjs').Component} Component
 * @typedef {'environment' | 'deterministic'} FailureClass
 *   environment: the machine is missing something a human must provide (a command, Docker);
 *   deterministic: the command ran and failed, and fails the same way until the code changes.
 */

/** The commands that are gates, in the order they run. Other commands (`e2e`…) are not gates. */
export const GATE_ORDER = Object.freeze(['build', 'format', 'lint', 'test', 'architecture', 'coverage', 'mutation'])

/** Gates that run the tests, so Microcks mocks need Docker for them. */
const TEST_GATES = Object.freeze(['test', 'architecture', 'coverage', 'mutation'])

/** @param {Component} component @returns {string[]} */
export const gatesOf = (component) => GATE_ORDER.filter((gate) => gate in component.commands)

/** @param {Component} component @param {string} gate */
export const needsDocker = (component, gate) => component.mocking.strategy === 'microcks' && TEST_GATES.includes(gate)

/** Docker answers when this command passes. */
export const DOCKER_PROBE = Object.freeze(['docker', 'info'])

/** What the developer does when Docker does not answer and a component mocks with Microcks. */
export const DOCKER_HINT = 'start Docker, or set "mocking": { "strategy": "inprocess" } on the component'

/** Exit codes a shell gives when it cannot find the command: 127 (sh), 9009 (cmd). */
const NOT_FOUND_EXIT = Object.freeze([127, 9009])

/**
 * @param {{ started: boolean, exitCode: number | null }} result
 * @returns {FailureClass | null} null when the command passed
 */
export const failureOf = ({ started, exitCode }) => {
  if (!started || exitCode === null || NOT_FOUND_EXIT.includes(exitCode)) return 'environment'
  return exitCode === 0 ? null : 'deterministic'
}

/** Changes under the tracking folder are the run's own bookkeeping, never a component's. */
const TRACKING = '.copilot-tracking'

/**
 * Whether a component is touched by the files changed since its base. A file under another
 * component whose root sits inside this one belongs to that one; a root equal to this one's
 * (this component's own, or a component sharing it) takes nothing away. The mutation report a
 * gate run left is the run's own output, never a change.
 * @param {Component} component
 * @param {Component[]} components every component of the config
 * @param {string[]} changed paths relative to the component's root
 */
export const isTouched = (component, components, changed) => {
  const nested = components
    .map((other) => pathUnder(other.root, component.root))
    .filter((/** @type {string | null} */ inner) => inner !== null && inner !== '.')
  const report = mutationReportOf(component)
  return changed.some((path) => {
    const file = normalizeRelative(path)
    if (pathUnder(file, TRACKING) !== null || file === report) return false
    return !nested.some((inner) => pathUnder(file, /** @type {string} */ (inner)) !== null)
  })
}
