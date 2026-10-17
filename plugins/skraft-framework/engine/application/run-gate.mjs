import { NO_COMPONENT } from '../domain/config/skraft-config.mjs'
import { deriveRun } from '../domain/journal/run-state.mjs'
import { loadConfig } from './bases.mjs'
import { openActiveRun } from './active-run.mjs'
import { runGates } from './gate-runs.mjs'

/**
 * @typedef {import('../domain/config/skraft-config.mjs').Component} Component
 * @typedef {import('../domain/gates/gate-plan.mjs').FailureClass} FailureClass
 * @typedef {import('./gate-runs.mjs').GateScope} GateScope
 * @typedef {import('./gate-runs.mjs').GateResult} GateResult
 * @typedef {{
 *   status: 'passed' | 'failed' | 'refused' | 'blocked', slug: string | null, scope: GateScope,
 *   components: string[], gates: GateResult[], failure: FailureClass | null, code: string | null, reason: string,
 * }} GateOutcome
 * @typedef {{
 *   activePipeline: import('./ports/active-pipeline.mjs').ActivePipeline,
 *   workspace: import('./ports/workspace.mjs').ConfigSource,
 * } & import('./gate-runs.mjs').GateRunDeps & Parameters<typeof openActiveRun>[0]} GateDeps
 */

/**
 * RunGate — `skraft gate`: runs the gate commands of `skraft-config.json` for the active
 * pipeline, from each component's root, outside the pipeline's own gate nodes.
 * @param {GateDeps} deps
 */
export const createRunGate = (deps) => Object.freeze({
  /** @param {{ slug?: string | null, scope?: GateScope }} [request] @returns {Promise<GateOutcome>} */
  run: (request) => runGate(deps, request),
})

/**
 * @param {GateDeps} deps @param {{ slug?: string | null, scope?: GateScope }} [request]
 * @returns {Promise<GateOutcome>}
 */
const runGate = async (deps, { slug: requested, scope = 'touched' } = {}) => {
  const opened = await openRunAndConfig(deps, requested)
  if (!opened.ok) return { scope, components: [], gates: [], failure: null, ...opened.refusal }
  const { slug, journal, components } = opened
  const ran = await runGates(deps, { slug, journal, components, base: deriveRun(journal.events).base, scope })
  if (ran.conflict !== null) {
    return { scope, components: ran.components, gates: ran.gates, failure: null, status: 'blocked', slug, code: 'journal-changed', reason: ran.conflict }
  }
  const { status, reason } = verdict(ran.gates, ran.components)
  return { status, slug, scope, components: ran.components, gates: ran.gates, failure: ran.failure, code: null, reason }
}

/**
 * The active run and its configured components, or the refusal that stops before any gate.
 * @param {GateDeps} deps @param {string | null | undefined} requested
 * @returns {Promise<
 *   | { ok: true, slug: string, journal: import('./run-journal.mjs').OpenJournal, components: Component[] }
 *   | { ok: false, refusal: Pick<GateOutcome, 'status' | 'slug' | 'code' | 'reason'> }
 * >}
 */
const openRunAndConfig = async (deps, requested) => {
  const opened = await openActiveRun(deps, requested)
  if (!opened.ok) return { ok: false, refusal: notOpened(opened.outcome) }
  const { slug, journal } = opened
  const loaded = await loadConfig(deps)
  if (!loaded.ok) return refused(slug, 'config-invalid', loaded.reason)
  const { components } = loaded.config
  if (components.length === 0) return refused(slug, 'no-components', NO_COMPONENT)
  return { ok: true, slug, journal, components }
}

/**
 * A run that does not open refuses when the caller can fix it, else it is blocked.
 * @param {import('./active-run.mjs').RunOutcome} outcome
 * @returns {Pick<GateOutcome, 'status' | 'slug' | 'code' | 'reason'>}
 */
const notOpened = (outcome) => ({ ...outcome, status: outcome.status === 'refused' ? 'refused' : 'blocked' })

/**
 * @param {string} slug @param {string} code @param {string} reason
 * @returns {{ ok: false, refusal: { status: 'refused', slug: string, code: string, reason: string } }}
 */
const refused = (slug, code, reason) => ({ ok: false, refusal: { status: 'refused', slug, code, reason } })

/**
 * @param {GateResult[]} gates @param {string[]} names the components the gates ran on
 * @returns {Pick<GateOutcome, 'status' | 'reason'>}
 */
const verdict = (gates, names) => {
  const failed = gates.filter((gate) => gate.status === 'fail')
  if (failed.length > 0) return { status: 'failed', reason: failed.map((gate) => `${gate.component}/${gate.gate}: ${gate.reason}`).join('; ') }
  const reason = names.length === 0 ? 'no component changed since its base; no gate to run' : `${gates.length} gates passed on ${names.join(', ')}`
  return { status: 'passed', reason }
}
