import { isSlug } from '../../domain/pipeline/slug.mjs'
import { discussArtifacts, ENTRY_AFTER_DISCUSS } from '../../domain/pipeline/artifacts.mjs'
import { loadConfig, resolveBases } from '../config/bases.mjs'
import { loadWorkflow } from '../workflow/load-workflow.mjs'
import { openJournal } from '../journal/run-journal.mjs'

/**
 * @typedef {import('../ports/active-pipeline.mjs').ActivePipeline} ActivePipeline
 * @typedef {{ issue?: number | null, title?: string | null } | null} Story
 * @typedef {'invalid-slug' | 'invalid-base' | 'journal-tampered' | 'config-invalid' | 'base-unresolved' | 'source-control-unavailable'
 *   | 'workflow-invalid' | 'already-started' | 'no-artifacts'} InitCode
 * @typedef {{ ok: boolean, slug: string | null, created: boolean, code: InitCode | null, reason: string }} InitOutcome
 * @typedef {{
 *   activePipeline: ActivePipeline,
 *   workspace: import('../ports/workspace.mjs').ConfigSource,
 *   userSettings: import('../ports/user-settings.mjs').UserSettings,
 *   sourceControl: import('../ports/source-control.mjs').SourceControl,
 *   files: Pick<import('../ports/tracking-files.mjs').TrackingFiles, 'list'>,
 * } & import('../workflow/load-workflow.mjs').WorkflowDeps & Parameters<typeof openJournal>[0]} InitDeps
 * @typedef {{ slug: string, story: Story, base: unknown, fromArtifacts: boolean }} StartRequest
 * @typedef {Extract<Awaited<ReturnType<typeof loadWorkflow>>, { ok: true }>} LoadedWorkflow
 */

/**
 * Init — makes a slug the active pipeline of the working copy and opens its journal. A new
 * run checks its workflow, journals the base of every repository it diffs against and the
 * DISCUSS stories already in its tracking folder; from those artefacts, it starts in DESIGN.
 * @param {InitDeps} deps
 */
export const createInit = (deps) => Object.freeze({
  /**
   * @param {{ slug?: unknown, story?: Story, base?: unknown, fromArtifacts?: boolean }} request
   * @returns {Promise<InitOutcome>}
   */
  init: ({ slug, story = null, base = null, fromArtifacts = false }) => init(deps, { slug, story, base, fromArtifacts }),
})

/**
 * @param {InitDeps} deps
 * @param {{ slug: unknown, story: Story, base: unknown, fromArtifacts: boolean }} request
 * @returns {Promise<InitOutcome>}
 */
const init = async (deps, request) => {
  const { slug } = request
  if (!isSlug(slug)) return refuseInvalidSlug(slug)
  const opened = await openJournal(deps, slug)
  if (!opened.ok) return refusal(slug, 'journal-tampered', opened.reason)
  if (opened.journal.events.length > 0) return resumeStartedRun(deps, slug, request.fromArtifacts)
  const refused = await start(deps, opened.journal, /** @type {StartRequest} */ (request))
  if (refused) return refused
  return activate(deps, slug, true)
}

/** @param {string | null} slug @param {InitCode} code @param {string} reason @returns {InitOutcome} */
const refusal = (slug, code, reason) => ({ ok: false, slug, created: false, code, reason })

/** @param {unknown} slug @returns {InitOutcome} */
const refuseInvalidSlug = (slug) =>
  refusal(/** @type {any} */ (slug) ?? null, 'invalid-slug', `slug must be kebab-case, got ${JSON.stringify(slug ?? null)}`)

/**
 * A run that already has a journal resumes; --from-artifacts only starts a new one.
 * @param {InitDeps} deps @param {string} slug @param {boolean} fromArtifacts
 * @returns {Promise<InitOutcome>}
 */
const resumeStartedRun = async (deps, slug, fromArtifacts) => {
  if (fromArtifacts) return refusal(slug, 'already-started', `${slug} already has a journal; resume it without --from-artifacts`)
  return activate(deps, slug, false)
}

/** @param {InitDeps} deps @param {string} slug @param {boolean} created @returns {Promise<InitOutcome>} */
const activate = async (deps, slug, created) => {
  await deps.activePipeline.activate(slug)
  return { ok: true, slug, created, code: null, reason: `${slug} is the active pipeline` }
}

/**
 * @param {InitDeps} deps
 * @param {import('../journal/run-journal.mjs').OpenJournal} journal
 * @param {StartRequest} request
 * @returns {Promise<InitOutcome | null>} the refusal, null once the run started
 */
const start = async (deps, journal, request) => {
  const checked = await checkConfigAndWorkflow(deps, request.slug)
  if (checked.refusal) return checked.refusal
  const artifacts = discussArtifacts(await deps.files.list(request.slug, 'plans'))
  const found = findEntry(checked.workflow, artifacts, request)
  if (found.refusal) return found.refusal
  const resolved = await resolveBases(deps, { config: checked.config, flag: request.base })
  if (!resolved.ok) return refusal(request.slug, resolved.code, resolved.reason)
  await journalStart(journal, request, { workflow: checked.workflow, bases: resolved.bases, artifacts, entry: found.entry })
  return null
}

/**
 * @param {InitDeps} deps @param {string} slug
 * @returns {Promise<{ refusal: InitOutcome } | { refusal: null, config: any, workflow: LoadedWorkflow }>}
 */
const checkConfigAndWorkflow = async (deps, slug) => {
  const loaded = await loadConfig(deps)
  if (!loaded.ok) return { refusal: refusal(slug, 'config-invalid', loaded.reason) }
  const workflow = await loadWorkflow(deps, { config: loaded.config })
  if (!workflow.ok) return { refusal: refusal(slug, 'workflow-invalid', workflow.reason) }
  return { refusal: null, config: loaded.config, workflow }
}

/**
 * The node a run starts on: null for a new run, the first DESIGN node from DISCUSS stories.
 * @param {LoadedWorkflow} workflow @param {string[]} artifacts @param {StartRequest} request
 * @returns {{ refusal: InitOutcome, entry?: undefined } | { refusal: null, entry: string | null }}
 */
const findEntry = (workflow, artifacts, { slug, fromArtifacts }) => {
  if (!fromArtifacts) return { refusal: null, entry: null }
  // Stryker disable next-line Regex: every DISCUSS artefact already ends in its .md file name, so only a folder named stories-*.md* could tell the anchor
  if (!artifacts.some((path) => /\/stories-[^/]+\.md$/.test(path))) {
    return { refusal: refusal(slug, 'no-artifacts', `${slug} has no DISCUSS stories (plans/<date>/stories-<milestone>.md) to start from`) }
  }
  const entry = workflow.workflow.order.find((id) => workflow.workflow.nodes[id].phase === ENTRY_AFTER_DISCUSS) ?? null
  if (entry === null) return { refusal: refusal(slug, 'workflow-invalid', `${workflow.name} has no ${ENTRY_AFTER_DISCUSS} phase to start from`) }
  return { refusal: null, entry }
}

/**
 * @param {import('../journal/run-journal.mjs').OpenJournal} journal @param {StartRequest} request
 * @param {{ workflow: LoadedWorkflow, bases: any, artifacts: string[], entry: string | null }} started
 */
const journalStart = async (journal, { slug, story }, { workflow, bases, artifacts, entry }) => {
  await journal.append('run.started', { slug, story, workflow: workflow.name, base: bases, artifacts, start: entry, unlocked: workflow.unlocked })
  for (const phase of skippedPhases(workflow, entry)) await journal.append('phase.closed', { phase, skipped: 'from-artifacts' })
}

/** The phases a run started after DISCUSS never runs. @param {LoadedWorkflow} workflow @param {string | null} entry */
const skippedPhases = (workflow, entry) => {
  if (entry === null) return []
  return workflow.workflow.phases.slice(0, workflow.workflow.phases.indexOf(ENTRY_AFTER_DISCUSS))
}
