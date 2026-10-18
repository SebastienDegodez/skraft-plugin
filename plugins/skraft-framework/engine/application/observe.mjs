import { deriveRun } from '../domain/journal/run-state.mjs'
import { NO_ACTIVE_PIPELINE } from './active-run.mjs'
import { loadConfig } from './bases.mjs'
import { loadWorkflow } from './load-workflow.mjs'
import { openJournal } from './run-journal.mjs'

/**
 * @typedef {import('../domain/journal/run-state.mjs').RunState} RunState
 * @typedef {import('../domain/journal/run-state.mjs').OpenAttempt} OpenAttempt
 * @typedef {{ phase: string, state: 'pending' | 'open' | 'closed' }} PhaseView
 * @typedef {{
 *   slug: string | null,
 *   status: 'idle' | 'not-initialised' | 'running' | 'waiting' | 'done' | 'blocked' | 'tampered',
 *   reason: string,
 *   phases: PhaseView[],
 *   current: { step: string, phase: string, agent: string | null, gates: string[] | null, question: string | null, visit: number, attempt: number } | null,
 *   question: { key: string, kind: string, text: string, options: string[], refusals: string[] } | null,
 *   attempts: number,
 *   costUsd: number | null,
 * }} RunView
 *   phases: those of the workflow the run follows; when it cannot be read, those the journal
 *   names. question: the one the run waits on, until a human answers it.
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
  view: () => view(deps),
})

/**
 * @param {ObserveDeps} deps
 * @returns {Promise<RunView>}
 */
const view = async (deps) => {
  const slug = await deps.activePipeline.current()
  const workflowPhases = await phasesOf(deps)
  const pending = (workflowPhases ?? []).map((phase) => ({ phase, state: /** @type {const} */ ('pending') }))
  if (slug === null) return withoutRun(slug, 'idle', NO_ACTIVE_PIPELINE, pending)
  const opened = await openJournal(deps, slug)
  if (!opened.ok) return withoutRun(slug, 'tampered', opened.reason, pending)
  if (opened.journal.events.length === 0) return withoutRun(slug, 'not-initialised', `${slug} has no journal (events.jsonl)`, pending)
  return runView(slug, deriveRun(opened.journal.events), workflowPhases)
}

/**
 * The view of a pipeline whose journal cannot tell a run.
 * @param {string | null} slug @param {RunView['status']} status @param {string} reason @param {PhaseView[]} phases
 * @returns {RunView}
 */
const withoutRun = (slug, status, reason, phases) => ({ slug, status, reason, phases, current: null, question: null, attempts: 0, costUsd: null })

/**
 * @param {string} slug
 * @param {RunState} run
 * @param {string[] | null} workflowPhases
 * @returns {RunView}
 */
const runView = (slug, run, workflowPhases) => ({
  slug,
  status: statusOf(run),
  reason: reasonOf(run),
  phases: phaseStates(run, workflowPhases ?? journalPhases(run)),
  current: currentNode(run),
  question: waitingOn(run),
  attempts: run.attempts,
  costUsd: run.costUsd,
})

/** @param {RunState} run @returns {RunView['status']} */
const statusOf = (run) => {
  if (run.finished) return run.finished.status === 'blocked' ? 'blocked' : 'done'
  if (waitingOn(run) !== null) return 'waiting'
  return run.stopped ? 'blocked' : 'running'
}

/** @param {RunState} run */
const reasonOf = (run) => run.finished?.reason ?? waitingOn(run)?.text ?? run.stopped?.reason ?? ''

/** The question the run waits on: asked, not answered yet. @param {RunState} run @returns {RunView['question']} */
const waitingOn = (run) => {
  const asked = run.question
  if (asked === null || asked.answer !== null) return null
  return { key: asked.key, kind: asked.kind, text: asked.text, options: asked.options, refusals: asked.refusals }
}

/** The phases the journal names, closed first. @param {RunState} run */
const journalPhases = (run) => [...new Set([...run.closed, ...Object.keys(run.phaseStarted)])]

/** @param {RunState} run @param {string[]} phases @returns {PhaseView[]} */
const phaseStates = (run, phases) => phases.map((phase) => ({ phase, state: phaseState(run, phase) }))

/** @param {RunState} run @param {string} phase @returns {PhaseView['state']} */
const phaseState = (run, phase) => {
  if (run.closed.includes(phase)) return 'closed'
  return phase in run.phaseStarted ? 'open' : 'pending'
}

/** The node whose attempt is open; null between steps. @param {RunState} run @returns {RunView['current']} */
const currentNode = (run) => {
  const found = Object.entries(run.nodes).find(([, state]) => state.open !== null)
  if (found === undefined) return null
  const [step, { open }] = found
  const attempt = /** @type {OpenAttempt} */ (open)
  return { step, phase: attempt.phase, agent: attempt.agent, gates: attempt.gates, question: attempt.question, visit: attempt.visit, attempt: attempt.attempt }
}

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
