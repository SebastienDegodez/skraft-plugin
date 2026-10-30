import { deriveRun } from '../../domain/journal/run-state.mjs'
import { reasonOf, statusOf, waitingOn } from '../../domain/reporting/run-status.mjs'
import { runReport } from '../../domain/reporting/run-report.mjs'
import { runGraph } from '../../domain/reporting/run-graph.mjs'
import { reviewPasses } from '../../domain/reporting/review-passes.mjs'
import { finalGates } from '../../domain/reporting/run-facts.mjs'
import { agentModels } from '../../domain/reporting/agent-models.mjs'
import { NO_ACTIVE_PIPELINE } from './active-run.mjs'
import { loadConfig } from '../config/bases.mjs'
import { loadWorkflow, WORKFLOW_FILE } from '../workflow/load-workflow.mjs'
import { workflowDrawing } from '../../domain/reporting/workflow-drawing.mjs'
import { openJournal } from '../journal/run-journal.mjs'

/**
 * @typedef {import('../../domain/journal/run-state.mjs').RunState} RunState
 * @typedef {import('../../domain/journal/run-state.mjs').OpenAttempt} OpenAttempt
 * @typedef {import('../../domain/reporting/workflow-drawing.mjs').WorkflowDrawing} WorkflowDrawing
 * @typedef {{ phase: string, state: 'pending' | 'open' | 'closed' }} PhaseView
 * @typedef {{
 *   slug: string | null,
 *   status: 'idle' | 'not-initialised' | 'running' | 'waiting' | 'done' | 'blocked' | 'tampered',
 *   reason: string,
 *   phases: PhaseView[],
 *   current: { step: string, phase: string, agent: string | null, gates: string[] | null, question: string | null, visit: number, attempt: number } | null,
 *   question: import('../../domain/reporting/run-status.mjs').WaitingQuestion | null,
 *   attempts: number,
 *   costUsd: number | null,
 *   graph: import('../../domain/reporting/run-graph.mjs').RunGraph,
 *   reviews: import('../../domain/reporting/review-passes.mjs').ReviewPass[],
 *   gates: import('../../domain/reporting/run-facts.mjs').GateFact[],
 *   agents: import('../../domain/reporting/agent-models.mjs').AgentModel[],
 * }} RunView
 *   phases: those of the workflow the run follows; when it cannot be read, those the journal
 *   names. question: the one the run waits on, until a human answers it. graph: the workflow's
 *   steps and edges with where the run stands; reviews: the last pass of each review step;
 *   gates: the last result of each gate of each component, the tests among them; agents: what
 *   each agent the run started runs on under the host that started it.
 * @typedef {import('../../domain/journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {import('../../domain/workflow/workflow.mjs').Workflow} Workflow
 * @typedef {{
 *   activePipeline: import('../ports/active-pipeline.mjs').ActivePipeline,
 *   workspace: import('../ports/workspace.mjs').ConfigSource,
 *   userSettings: import('../ports/user-settings.mjs').UserSettings,
 *   workflowSource: import('../ports/workflow-source.mjs').WorkflowSource,
 * } & Parameters<typeof openJournal>[0]} ObserveDeps
 * @typedef {{ slug: string | null, status: RunView['status'], reason: string } & import('../../domain/reporting/run-report.mjs').RunReport} RunReportView
 * @typedef {'verified' | 'tampered' | 'unverifiable' | 'none'} ChainState
 * @typedef {{ state: ChainState, lines: number, unverified: number, reason: string }} JournalChain
 *   lines: how many lines events.jsonl holds, 0 unless verified; unverified: the lines of an adopted
 *   journal this machine cannot verify (the last adoption's count), 0 when never adopted; reason:
 *   why the chain is not verified, in the engine's words; '' when verified.
 * @typedef {{ slug: string | null, chain: JournalChain, entries: import('../../domain/reporting/journal-entries.mjs').JournalEntry[], total: number }} JournalView
 *   entries: the last `last` entries, oldest first; total: how many entries the journal holds.
 */

/**
 * Observe — the view of the active pipeline that panes, canvases and `skraft status` draw.
 * @param {ObserveDeps} deps
 */
export const createObserve = (deps) => Object.freeze({
  /** @returns {Promise<RunView>} */
  view: () => view(deps),
  /** @returns {Promise<RunReportView>} */
  report: () => report(deps),
  /** @returns {Promise<WorkflowDrawing[]>} */
  workflows: () => workflows(deps),
  /** @param {{ last: number }} request at least 1 @returns {Promise<JournalView>} */
  journal: (request) => journal(deps, request),
})

/**
 * The journal of the active pipeline as a person reads it: the state of its hash chain, then its
 * last `last` entries, oldest first, out of `total`; none when the chain is not verified.
 * @param {ObserveDeps} deps @param {{ last: number }} request @returns {Promise<JournalView>}
 */
const journal = async (deps, request) => ({ slug: null, chain: { state: 'none', lines: 0, unverified: 0, reason: '' }, entries: [], total: 0 })

/**
 * @param {ObserveDeps} deps
 * @returns {Promise<RunView>}
 */
const view = async (deps) => {
  const slug = await deps.activePipeline.current()
  const workflow = await workflowOf(deps)
  if (slug === null) return withoutRun({ slug, status: 'idle', reason: NO_ACTIVE_PIPELINE }, workflow)
  const opened = await openJournal(deps, slug)
  if (!opened.ok) return withoutRun({ slug, status: 'tampered', reason: opened.reason }, workflow)
  if (opened.journal.events.length === 0) return withoutRun({ slug, status: 'not-initialised', reason: `${slug} has no journal (events.jsonl)` }, workflow)
  return runView(slug, opened.journal.events, workflow)
}

/**
 * The view of a pipeline whose journal cannot tell a run: the workflow's phases and steps pending.
 * @param {Pick<RunView, 'slug' | 'status' | 'reason'>} where @param {Workflow | null} workflow
 * @returns {RunView}
 */
const withoutRun = (where, workflow) => ({
  ...where,
  phases: (workflow?.phases ?? []).map((phase) => ({ phase, state: /** @type {const} */ ('pending') })),
  current: null,
  question: null,
  attempts: 0,
  costUsd: null,
  graph: runGraph(workflow, [], {}),
  reviews: [],
  gates: [],
  agents: [],
})

/**
 * @param {string} slug
 * @param {RunEvent[]} events
 * @param {Workflow | null} workflow
 * @returns {RunView}
 */
const runView = (slug, events, workflow) => {
  const run = deriveRun(events)
  return { slug, ...whereRunStands(run, workflow), ...stepResults(events, run, workflow) }
}

/**
 * The run's status, phases, open step, waiting question and totals.
 * @param {RunState} run @param {Workflow | null} workflow
 * @returns {Omit<RunView, 'slug' | 'graph' | 'reviews' | 'gates' | 'agents'>}
 */
const whereRunStands = (run, workflow) => ({
  status: statusOf(run),
  reason: reasonOf(run),
  phases: phaseStates(run, workflow?.phases ?? journalPhases(run)),
  current: currentNode(run),
  question: waitingOn(run),
  attempts: run.attempts,
  costUsd: run.costUsd,
})

/**
 * What each step came to: the graph with where the run stands, the reviews' last passes, the
 * gates' last results, what each agent runs on.
 * @param {RunEvent[]} events @param {RunState} run @param {Workflow | null} workflow
 * @returns {Pick<RunView, 'graph' | 'reviews' | 'gates' | 'agents'>}
 */
const stepResults = (events, run, workflow) => ({
  graph: runGraph(workflow, runReport(events).steps, run.traversals),
  reviews: reviewPasses(events),
  gates: finalGates(events),
  agents: agentModels(events),
})

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
 * The run report of the active pipeline: time, cost and retries per step; empty, with the
 * reason, when its journal cannot tell a run.
 * @param {ObserveDeps} deps @returns {Promise<RunReportView>}
 */
const report = async (deps) => {
  const slug = await deps.activePipeline.current()
  if (slug === null) return emptyReport(slug, 'idle', NO_ACTIVE_PIPELINE)
  const opened = await openJournal(deps, slug)
  if (!opened.ok) return emptyReport(slug, 'tampered', opened.reason)
  if (opened.journal.events.length === 0) return emptyReport(slug, 'not-initialised', `${slug} has no journal (events.jsonl)`)
  const run = deriveRun(opened.journal.events)
  return { slug, status: statusOf(run), reason: reasonOf(run), ...runReport(opened.journal.events) }
}

/** @param {string | null} slug @param {RunView['status']} status @param {string} reason @returns {RunReportView} */
const emptyReport = (slug, status, reason) => ({ slug, status, reason, ...runReport([]) })

/**
 * The workflow the configuration designates; null when it cannot be read.
 * @param {ObserveDeps} deps @returns {Promise<Workflow | null>}
 */
const workflowOf = async (deps) => (await loadedOf(deps))?.workflow ?? null

/**
 * The workflow the configuration designates, with the name it was read under; null when it
 * cannot be read.
 * @param {ObserveDeps} deps
 */
const loadedOf = async (deps) => {
  const config = await loadConfig(deps)
  if (!config.ok) return null
  const loaded = await loadWorkflow(/** @type {import('../workflow/load-workflow.mjs').WorkflowDeps} */ (deps), { agents: false })
  return loaded.ok ? loaded : null
}

/**
 * The pipeline a run of this working copy follows, with where the active run stands on it, then
 * each workflow it calls; none when it cannot be read.
 * @param {ObserveDeps} deps @returns {Promise<WorkflowDrawing[]>}
 */
const workflows = async (deps) => {
  const loaded = await loadedOf(deps)
  if (loaded === null) return []
  const pipeline = workflowDrawing({ name: 'pipeline', file: loaded.name === WORKFLOW_FILE ? WORKFLOW_FILE : null, workflow: loaded.workflow, run: await activeRun(deps) })
  return [pipeline, ...Object.entries(loaded.workflow.called).map(([name, { path, workflow }]) => workflowDrawing({ name, file: path, workflow, run: null }))]
}

/** The state of the active run; null without one whose journal tells a run. @param {ObserveDeps} deps */
const activeRun = async (deps) => {
  const slug = await deps.activePipeline.current()
  const opened = slug === null ? null : await openJournal(deps, slug)
  return opened?.ok && opened.journal.events.length > 0 ? deriveRun(opened.journal.events) : null
}
