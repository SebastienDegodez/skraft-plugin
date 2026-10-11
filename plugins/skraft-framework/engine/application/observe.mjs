import { DEFAULT_PIPELINE } from '../domain/pipeline/pipeline-definition.mjs'
import { deriveRun } from '../domain/journal/run-state.mjs'
import { NO_ACTIVE_PIPELINE } from './active-run.mjs'
import { openJournal } from './run-journal.mjs'

/**
 * @typedef {{ phase: string, state: 'pending' | 'open' | 'closed' }} PhaseView
 * @typedef {{
 *   slug: string | null,
 *   status: 'idle' | 'not-initialised' | 'running' | 'done' | 'blocked' | 'tampered',
 *   reason: string,
 *   phases: PhaseView[],
 *   current: { step: string, phase: string, agent: string, attempt: number } | null,
 *   attempts: number,
 *   costUsd: number | null,
 * }} RunView
 */

/**
 * Observe — the view of the active pipeline that panes, canvases and `skraft status` draw.
 * @param {{ activePipeline: import('./ports/active-pipeline.mjs').ActivePipeline } & Parameters<typeof openJournal>[0]} deps
 * @param {import('../domain/pipeline/pipeline-definition.mjs').PipelineDefinition} [definition]
 */
export const createObserve = (deps, definition = DEFAULT_PIPELINE) => Object.freeze({
  /** @returns {Promise<RunView>} */
  view: async () => {
    const pending = definition.phases.map(({ phase }) => ({ phase, state: /** @type {const} */ ('pending') }))
    const empty = { phases: pending, current: null, attempts: 0, costUsd: null }
    const slug = await deps.activePipeline.current()
    if (slug === null) return { slug, status: 'idle', reason: NO_ACTIVE_PIPELINE, ...empty }
    const opened = await openJournal(deps, slug)
    if (!opened.ok) return { slug, status: 'tampered', reason: opened.reason, ...empty }
    if (opened.journal.events.length === 0) return { slug, status: 'not-initialised', reason: `${slug} has no journal (events.jsonl)`, ...empty }
    const run = deriveRun(opened.journal.events)
    const open = Object.entries(run.steps).find(([, step]) => step.open)
    return {
      slug,
      status: run.finished ? (run.finished.status === 'blocked' ? 'blocked' : 'done') : 'running',
      reason: run.finished?.reason ?? '',
      phases: definition.phases.map(({ phase, steps }) => ({
        phase,
        state: run.closed.includes(phase) ? 'closed' : steps.some((step) => run.steps[step.id]) ? 'open' : 'pending',
      })),
      current: open && open[1].open
        ? { step: open[0], phase: open[1].open.phase, agent: open[1].open.agent, attempt: open[1].open.attempt }
        : null,
      attempts: run.attempts,
      costUsd: run.costUsd,
    }
  },
})
