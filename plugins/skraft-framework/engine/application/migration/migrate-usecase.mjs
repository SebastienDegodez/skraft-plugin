import { discussArtifacts } from '../../domain/pipeline/artifacts.mjs'
import { completedDocuments, readV1State, V1_DONE } from '../../domain/migration/v1-state.mjs'
import { parsedJson } from '../../domain/migration/json-text.mjs'
import { loadConfig, resolveBases } from '../config/bases.mjs'
import { loadWorkflow } from '../workflow/load-workflow.mjs'
import { openJournal } from '../journal/run-journal.mjs'
import { NO_KEY_FOLDER } from '../pipeline/init-usecase.mjs'
import { listed, migrateConfig } from './migrate-config.mjs'

/**
 * @typedef {import('../../domain/migration/v1-state.mjs').V1State} V1State
 * @typedef {Extract<Awaited<ReturnType<typeof loadWorkflow>>, { ok: true }>} LoadedWorkflow
 * @typedef {'migrated' | 'would-migrate' | 'skipped' | 'refused'} PipelineStatus
 * @typedef {{ slug: string, status: PipelineStatus, code: string | null, reason: string, events?: Array<Record<string, unknown>> }} PipelineOutcome
 *   events: with --dry-run, what the journal would be written with
 * @typedef {import('./migrate-config.mjs').ConfigOutcome} ConfigOutcome
 * @typedef {{ ok: boolean, code: string | null, reason: string, dryRun: boolean, config: ConfigOutcome, pipelines: PipelineOutcome[] }} MigrateOutcome
 * @typedef {{
 *   files: Pick<import('../ports/tracking-files.mjs').TrackingFiles, 'read' | 'list' | 'pipelines'>,
 *   sourceControl: import('../ports/source-control.mjs').SourceControl,
 * } & import('./migrate-config.mjs').ConfigDeps & import('../workflow/load-workflow.mjs').WorkflowDeps & import('../journal/run-journal.mjs').JournalDeps} MigrateDeps
 * @typedef {{ dryRun: boolean, workingCopyName: string }} MigrateRequest
 *   workingCopyName: the name of the folder `.`, which names its component
 * @typedef {{ slug: string, state: V1State, closing: string[] | null }} Candidate
 *   a v1 run in progress with no journal yet (closing null), or one whose migration stopped
 *   before closing these completed phases
 * @typedef {{ workflow: LoadedWorkflow, bases: unknown }} Target what every migrated run starts with
 */

/** The mark of a journal Migrate wrote, on its run.started. */
export const MIGRATED_FROM = 'v1'

/**
 * Migrate — `skraft migrate`: the v1 `skraft-config.json` first, in the components format;
 * then each v1 run still in progress (`<slug>/state.json`, no journal) gets the journal V2
 * reads: its run.started on the workflow in force, marked migratedFrom v1, then one
 * phase.closed per completed phase; its current phase restarts at its first node.
 * state.json stays as it is. With dryRun, nothing is written.
 * @param {MigrateDeps} deps
 */
export const createMigrate = (deps) => Object.freeze({
  /** @param {{ dryRun?: boolean, workingCopyName: string }} request @returns {Promise<MigrateOutcome>} */
  migrate: ({ dryRun = false, workingCopyName }) => migrate(deps, { dryRun, workingCopyName }),
})

/** @param {MigrateDeps} deps @param {MigrateRequest} request @returns {Promise<MigrateOutcome>} */
const migrate = async (deps, request) => {
  const config = await migrateConfig(deps, request)
  const runs = await migrateRuns(deps, request.dryRun)
  if (!Array.isArray(runs)) return { ok: false, code: runs.code, reason: runs.reason, dryRun: request.dryRun, config, pipelines: runs.settled }
  return outcomeOf(runs, config, request.dryRun)
}

/**
 * @param {MigrateDeps} deps @param {boolean} dryRun
 * @returns {Promise<PipelineOutcome[] | { code: string, reason: string, settled: PipelineOutcome[] }>}
 *   the refusal when no run can be migrated, with the runs settled without migrating any
 */
const migrateRuns = async (deps, dryRun) => {
  const { candidates, settled } = await surveyed(deps)
  if (candidates.length === 0) return settled
  if (!(await deps.journalKeys.available())) return { code: 'journal-key-unavailable', reason: NO_KEY_FOLDER, settled }
  const target = await targetOf(deps)
  if ('code' in target) return { ...target, settled }
  const migrated = []
  for (const candidate of candidates) migrated.push(await migrateRun(deps, target, candidate, dryRun))
  return [...settled, ...migrated].sort(bySlug)
}

/**
 * The v1 runs to migrate, and what the others come to: skipped or refused.
 * @param {MigrateDeps} deps
 * @returns {Promise<{ candidates: Candidate[], settled: PipelineOutcome[] }>}
 */
const surveyed = async (deps) => {
  /** @type {Candidate[]} */
  const candidates = []
  /** @type {PipelineOutcome[]} */
  const settled = []
  for (const slug of await deps.files.pipelines()) {
    const seen = await surveyedRun(deps, slug)
    if (seen !== null && 'state' in seen) candidates.push(seen)
    else if (seen !== null) settled.push(seen)
  }
  return { candidates, settled }
}

/**
 * @param {MigrateDeps} deps @param {string} slug
 * @returns {Promise<Candidate | PipelineOutcome | null>} null for a run v1 never had
 */
const surveyedRun = async (deps, slug) => {
  const text = await deps.files.read(slug, 'state.json')
  if (text === null) return null
  const read = readV1State(text)
  const journaled = await journaledRun(deps, slug, read)
  if (journaled !== null) return journaled
  if (!read.ok) return settledRun(slug, 'refused', 'state-invalid', `${slug}: ${read.reason}`)
  if (read.state.currentPhase === V1_DONE) return settledRun(slug, 'skipped', 'done', `${slug}: the v1 run is ${V1_DONE}; nothing to migrate`)
  return { slug, state: read.state, closing: null }
}

/**
 * A run that already has a journal is left as it is, migrated before or started on V2; but a
 * migration that stopped before closing every completed phase is completed.
 * @param {MigrateDeps} deps @param {string} slug @param {ReturnType<typeof readV1State>} read
 * @returns {Promise<Candidate | PipelineOutcome | null>}
 */
const journaledRun = async (deps, slug, read) => {
  const events = (await deps.journal.lines(slug)).map(parsedJson)
  if (events.length === 0) return null
  if (events[0]?.migratedFrom !== MIGRATED_FROM) return settledRun(slug, 'skipped', 'has-journal', `${slug}: already has a journal (events.jsonl); state.json is left as it is`)
  const closing = read.ok ? unclosedPhases(events, read.state) : []
  if (closing.length > 0) return { slug, state: /** @type {V1State} */ (read.ok && read.state), closing }
  return settledRun(slug, 'skipped', 'already-migrated', `${slug}: already migrated from v1`)
}

/**
 * The completed v1 phases a migrated journal does not close yet, while it holds nothing but
 * what Migrate writes; none once the run went on.
 * @param {Array<Record<string, any> | null>} events @param {V1State} state
 */
const unclosedPhases = ([, ...events], { phasesCompleted }) => {
  if (events.some((event) => event?.type !== 'phase.closed')) return []
  const closed = events.map((event) => event?.phase)
  return phasesCompleted.filter((phase) => !closed.includes(phase))
}

/** @param {string} slug @param {PipelineStatus} status @param {string | null} code @param {string} reason @returns {PipelineOutcome} */
const settledRun = (slug, status, code, reason) => ({ slug, status, code, reason })

/**
 * The workflow in force and the bases of today, refused as Init refuses them.
 * @param {MigrateDeps} deps
 * @returns {Promise<Target | { code: string, reason: string }>}
 */
const targetOf = async (deps) => {
  const loaded = await loadConfig(deps)
  if (!loaded.ok) return { code: 'config-invalid', reason: loaded.reason }
  const workflow = await loadWorkflow(deps, {})
  if (!workflow.ok) return { code: 'workflow-invalid', reason: workflow.reason }
  const resolved = await resolveBases(deps, { config: loaded.config, flag: null })
  if (!resolved.ok) return { code: resolved.code, reason: resolved.reason }
  return { workflow, bases: resolved.bases }
}

/**
 * @param {MigrateDeps} deps @param {Target} target @param {Candidate} candidate @param {boolean} dryRun
 * @returns {Promise<PipelineOutcome>}
 */
const migrateRun = async (deps, target, candidate, dryRun) => {
  if (candidate.closing !== null) return completeRun(deps, candidate, dryRun)
  const { slug, state } = candidate
  const planned = plannedEvents(target.workflow, state)
  if (planned === null) return settledRun(slug, 'refused', 'phase-unknown', `${slug}: state.json names a phase the workflow ${target.workflow.name} does not hold; nothing was migrated`)
  const artifacts = await artifactsOf(deps, slug, state)
  const events = [startedEvent(slug, target, artifacts, planned.start), ...planned.closed]
  const reason = migratedReason(slug, state, planned.start)
  if (dryRun) return { ...settledRun(slug, 'would-migrate', null, reason), events }
  return written(deps, slug, events, reason)
}

/**
 * Closes the completed phases a stopped migration left open.
 * @param {MigrateDeps} deps @param {Candidate} candidate @param {boolean} dryRun
 * @returns {Promise<PipelineOutcome>}
 */
const completeRun = async (deps, { slug, closing }, dryRun) => {
  const phases = /** @type {string[]} */ (closing)
  const events = phases.map((phase) => ({ type: 'phase.closed', phase }))
  const reason = `${slug}: the migration stopped before was completed, ${listed(phases)} closed`
  if (dryRun) return { ...settledRun(slug, 'would-migrate', null, reason), events }
  return written(deps, slug, events, reason)
}

/**
 * What the resumed run's agents read first: the DISCUSS stories, then the documents of the
 * completed phases still in the run's folder, each once.
 * @param {MigrateDeps} deps @param {string} slug @param {V1State} state
 */
const artifactsOf = async (deps, slug, state) => {
  const present = []
  for (const path of completedDocuments(state, slug)) if ((await deps.files.read(slug, path)) !== null) present.push(path)
  return [...new Set([...discussArtifacts(await deps.files.list(slug, 'plans')), ...present])]
}

/**
 * The first node of the current phase and the phase.closed of each completed phase; null when
 * the workflow holds one of those phases no more.
 * @param {LoadedWorkflow} loaded @param {V1State} state
 */
const plannedEvents = ({ workflow }, { currentPhase, phasesCompleted }) => {
  const start = workflow.order.find((id) => workflow.nodes[id].phase === currentPhase)
  if (start === undefined || phasesCompleted.some((phase) => !workflow.phases.includes(phase))) return null
  return { start, closed: phasesCompleted.map((phase) => ({ type: 'phase.closed', phase })) }
}

/** @param {string} slug @param {Target} target @param {string[]} artifacts @param {string} start */
const startedEvent = (slug, { workflow, bases }, artifacts, start) => ({
  type: 'run.started', slug, story: null, workflow: workflow.name, base: bases, artifacts, start, unlocked: workflow.unlocked, migratedFrom: MIGRATED_FROM,
})

/** @param {string} slug @param {V1State} state @param {string} start */
const migratedReason = (slug, { currentPhase, phasesCompleted }, start) => {
  const closed = phasesCompleted.length === 0 ? '' : `, ${listed(phasesCompleted)} closed`
  return `${slug}: ${currentPhase} restarts at ${start}${closed}; resume it with skraft init ${slug}`
}


/**
 * @param {MigrateDeps} deps @param {string} slug @param {Array<Record<string, any>>} events @param {string} reason
 * @returns {Promise<PipelineOutcome>}
 */
const written = async (deps, slug, events, reason) => {
  const opened = await openJournal(deps, slug)
  if (!opened.ok) return settledRun(slug, 'refused', opened.code, opened.reason)
  for (const { type, ...payload } of events) await opened.journal.append(type, payload)
  return settledRun(slug, 'migrated', null, reason)
}

/** @param {PipelineOutcome} a @param {PipelineOutcome} b */
const bySlug = (a, b) => a.slug.localeCompare(b.slug)

/**
 * Not ok while a run is refused, a configuration key maps to nothing or the components could not
 * be listed: each needs a person.
 * @param {PipelineOutcome[]} pipelines @param {ConfigOutcome} config @param {boolean} dryRun @returns {MigrateOutcome}
 */
const outcomeOf = (pipelines, config, dryRun) => {
  const count = (/** @type {PipelineStatus} */ status) => pipelines.filter((pipeline) => pipeline.status === status).length
  const done = dryRun ? `${count('would-migrate')} to migrate (dry run: nothing written)` : `${count('migrated')} migrated`
  const code = count('refused') > 0 ? 'some-refused' : configCode(config)
  return { ok: code === null, code, reason: `skraft migrate: ${done}, ${count('skipped')} skipped, ${count('refused')} refused`, dryRun, config, pipelines }
}

/** What the configuration's outcome leaves a person to do, as a code; null for nothing. */
const CONFIG_CODES = Object.freeze({ unmapped: 'config-unmapped', 'components-refused': 'config-components-refused' })

/** @param {ConfigOutcome} config @returns {string | null} */
const configCode = (config) => CONFIG_CODES[/** @type {keyof typeof CONFIG_CODES} */ (config.status)] ?? null
