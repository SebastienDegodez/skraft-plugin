import { discussArtifacts } from '../../domain/pipeline/artifacts.mjs'
import { readV1State, V1_DONE } from '../../domain/migration/v1-state.mjs'
import { loadConfig, resolveBases } from '../config/bases.mjs'
import { loadWorkflow } from '../workflow/load-workflow.mjs'
import { openJournal } from '../journal/run-journal.mjs'
import { NO_KEY_FOLDER } from '../pipeline/init-usecase.mjs'

/**
 * @typedef {import('../../domain/migration/v1-state.mjs').V1State} V1State
 * @typedef {Extract<Awaited<ReturnType<typeof loadWorkflow>>, { ok: true }>} LoadedWorkflow
 * @typedef {'migrated' | 'would-migrate' | 'skipped' | 'refused'} PipelineStatus
 * @typedef {{ slug: string, status: PipelineStatus, code: string | null, reason: string, events?: Array<Record<string, unknown>> }} PipelineOutcome
 *   events: with --dry-run, what the journal would be written with
 * @typedef {{ ok: boolean, code: string | null, reason: string, dryRun: boolean, pipelines: PipelineOutcome[] }} MigrateOutcome
 * @typedef {{
 *   files: Pick<import('../ports/tracking-files.mjs').TrackingFiles, 'read' | 'list' | 'pipelines'>,
 *   workspace: import('../ports/workspace.mjs').ConfigSource,
 *   userSettings: import('../ports/user-settings.mjs').UserSettings,
 *   sourceControl: import('../ports/source-control.mjs').SourceControl,
 * } & import('../workflow/load-workflow.mjs').WorkflowDeps & import('../journal/run-journal.mjs').JournalDeps} MigrateDeps
 * @typedef {{ slug: string, state: V1State }} Candidate a v1 run in progress with no journal yet
 * @typedef {{ workflow: LoadedWorkflow, bases: unknown }} Target what every migrated run starts with
 */

/** The mark of a journal Migrate wrote, on its run.started. */
export const MIGRATED_FROM = 'v1'

/**
 * Migrate — `skraft migrate`: each v1 run still in progress (`<slug>/state.json`, no journal)
 * gets the journal V2 reads: its run.started on the workflow in force, marked migratedFrom v1,
 * then one phase.closed per completed phase; its current phase restarts at its first node.
 * state.json stays as it is. With dryRun, nothing is written.
 * @param {MigrateDeps} deps
 */
export const createMigrate = (deps) => Object.freeze({
  /** @param {{ dryRun?: boolean }} request @returns {Promise<MigrateOutcome>} */
  migrate: ({ dryRun = false }) => migrate(deps, dryRun),
})

/** @param {MigrateDeps} deps @param {boolean} dryRun @returns {Promise<MigrateOutcome>} */
const migrate = async (deps, dryRun) => {
  const { candidates, settled } = await surveyed(deps)
  if (candidates.length === 0) return outcomeOf(settled, dryRun)
  if (!(await deps.journalKeys.available())) return refusal('journal-key-unavailable', NO_KEY_FOLDER, dryRun)
  const target = await targetOf(deps)
  if ('code' in target) return refusal(target.code, target.reason, dryRun)
  const migrated = []
  for (const candidate of candidates) migrated.push(await migrateRun(deps, target, candidate, dryRun))
  return outcomeOf([...settled, ...migrated].sort(bySlug), dryRun)
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
  const journaled = await journaledRun(deps, slug)
  if (journaled !== null) return journaled
  const read = readV1State(text)
  if (!read.ok) return settledRun(slug, 'refused', 'state-invalid', `${slug}: ${read.reason}`)
  if (read.state.currentPhase === V1_DONE) return settledRun(slug, 'skipped', 'done', `${slug}: the v1 run is ${V1_DONE}; nothing to migrate`)
  return { slug, state: read.state }
}

/**
 * A run that already has a journal is left as it is: migrated before, or started on V2.
 * @param {MigrateDeps} deps @param {string} slug @returns {Promise<PipelineOutcome | null>}
 */
const journaledRun = async (deps, slug) => {
  const [first] = await deps.journal.lines(slug)
  if (first === undefined) return null
  if (migratedStart(first)) return settledRun(slug, 'skipped', 'already-migrated', `${slug}: already migrated from v1`)
  return settledRun(slug, 'skipped', 'has-journal', `${slug}: already has a journal (events.jsonl); state.json is left as it is`)
}

/** Whether the journal's first line is the run.started Migrate wrote. @param {string} line */
const migratedStart = (line) => {
  try {
    return JSON.parse(line).migratedFrom === MIGRATED_FROM
  } catch {
    return false
  }
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
const migrateRun = async (deps, target, { slug, state }, dryRun) => {
  const planned = plannedEvents(target.workflow, state)
  if (planned === null) return settledRun(slug, 'refused', 'phase-unknown', `${slug}: state.json names a phase the workflow ${target.workflow.name} does not hold; nothing was migrated`)
  const artifacts = discussArtifacts(await deps.files.list(slug, 'plans'))
  const events = [startedEvent(slug, target, artifacts, planned.start), ...planned.closed]
  const reason = migratedReason(slug, state, planned.start)
  if (dryRun) return { ...settledRun(slug, 'would-migrate', null, reason), events }
  return written(deps, slug, events, reason)
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

/** @param {string[]} names */
const listed = (names) => (names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

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

/** @param {string} code @param {string} reason @param {boolean} dryRun @returns {MigrateOutcome} */
const refusal = (code, reason, dryRun) => ({ ok: false, code, reason, dryRun, pipelines: [] })

/** @param {PipelineOutcome[]} pipelines @param {boolean} dryRun @returns {MigrateOutcome} */
const outcomeOf = (pipelines, dryRun) => {
  const count = (/** @type {PipelineStatus} */ status) => pipelines.filter((pipeline) => pipeline.status === status).length
  const done = dryRun ? `${count('would-migrate')} to migrate (dry run: nothing written)` : `${count('migrated')} migrated`
  const refused = count('refused')
  return { ok: refused === 0, code: refused === 0 ? null : 'some-refused', reason: `skraft migrate: ${done}, ${count('skipped')} skipped, ${refused} refused`, dryRun, pipelines }
}
