import { deriveRun } from '../domain/journal/run-state.mjs'
import { NO_ACTIVE_PIPELINE } from './active-run.mjs'
import { loadConfig } from './bases.mjs'
import { loadWorkflow } from './load-workflow.mjs'
import { openJournal } from './run-journal.mjs'

/**
 * @typedef {{ phase: string, state: 'pending' | 'open' | 'closed' }} PhaseView
 * @typedef {{
 *   slug: string | null,
 *   status: 'idle' | 'not-initialised' | 'running' | 'done' | 'blocked' | 'tampered',
 *   reason: string,
 *   phases: PhaseView[],
 *   current: { step: string, phase: string, agent: string | null, gates: string[] | null, visit: number, attempt: number } | null,
 *   attempts: number,
 *   costUsd: number | null,
 * }} RunView
 *   phases: those of the workflow the run follows; when it cannot be read, those the journal
 *   names.
 * @typedef {{
 *   activePipeline: import('./ports/active-pipeline.mjs').ActivePipeline,
 *   workspace: import('./ports/workspace.mjs').ConfigSource,
 *   workflowSource: import('./ports/workflow-source.mjs').WorkflowSource,
 * } & Parameters<typeof openJournal>[0]} ObserveDeps
 */

/**
 * Observe — the view of the active pipeline that panes, canvases and `skraft status` draw.
 * @param {ObserveDeps} deps
 */
export const createObserve = (deps) => Object.freeze({
  /** @returns {Promise<RunView>} */
  view: async () => {
    const empty = { current: null, attempts: 0, costUsd: null }
    const slug = await deps.activePipeline.current()
    const workflowPhases = await phasesOf(deps)
    const pending = (workflowPhases ?? []).map((phase) => ({ phase, state: /** @type {const} */ ('pending') }))
    if (slug === null) return { slug, status: 'idle', reason: NO_ACTIVE_PIPELINE, phases: pending, ...empty }
    const opened = await openJournal(deps, slug)
    if (!opened.ok) return { slug, status: 'tampered', reason: opened.reason, phases: pending, ...empty }
    if (opened.journal.events.length === 0) return { slug, status: 'not-initialised', reason: `${slug} has no journal (events.jsonl)`, phases: pending, ...empty }
    const run = deriveRun(opened.journal.events)
    const phases = workflowPhases ?? [...new Set([...run.closed, ...Object.keys(run.phaseStarted)])]
    const [step, { open: attempt }] = Object.entries(run.nodes).find(([, state]) => state.open !== null) ?? [null, { open: null }]
    return {
      slug,
      status: run.finished ? (run.finished.status === 'blocked' ? 'blocked' : 'done') : run.stopped ? 'blocked' : 'running',
      reason: run.finished?.reason ?? run.stopped?.reason ?? '',
      phases: phases.map((phase) => ({
        phase,
        state: run.closed.includes(phase) ? 'closed' : phase in run.phaseStarted ? 'open' : 'pending',
      })),
      current: attempt === null
        ? null
        : { step: /** @type {string} */ (step), phase: attempt.phase, agent: attempt.agent, gates: attempt.gates, visit: attempt.visit, attempt: attempt.attempt },
      attempts: run.attempts,
      costUsd: run.costUsd,
    }
  },
})

/**
 * The phases of the workflow the configuration designates; null when it cannot be read.
 * @param {ObserveDeps} deps
 */
const phasesOf = async (deps) => {
  const config = await loadConfig(deps)
  if (!config.ok) return null
  const loaded = await loadWorkflow(/** @type {import('./load-workflow.mjs').WorkflowDeps} */ (deps), { config: config.config, agents: false })
  return loaded.ok ? loaded.workflow.phases : null
}
