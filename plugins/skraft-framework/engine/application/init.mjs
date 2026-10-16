import { isSlug } from '../domain/pipeline/slug.mjs'
import { discussArtifacts, ENTRY_AFTER_DISCUSS } from '../domain/pipeline/artifacts.mjs'
import { loadConfig, resolveBases } from './bases.mjs'
import { loadWorkflow } from './load-workflow.mjs'
import { openJournal } from './run-journal.mjs'

/**
 * @typedef {import('./ports/active-pipeline.mjs').ActivePipeline} ActivePipeline
 * @typedef {{ issue?: number | null, title?: string | null } | null} Story
 * @typedef {'invalid-slug' | 'invalid-base' | 'journal-tampered' | 'config-invalid' | 'base-unresolved' | 'source-control-unavailable'
 *   | 'workflow-invalid' | 'already-started' | 'no-artifacts'} InitCode
 * @typedef {{ ok: boolean, slug: string | null, created: boolean, code: InitCode | null, reason: string }} InitOutcome
 * @typedef {{
 *   activePipeline: ActivePipeline,
 *   workspace: import('./ports/workspace.mjs').ConfigSource,
 *   sourceControl: import('./ports/source-control.mjs').SourceControl,
 *   files: Pick<import('./ports/tracking-files.mjs').TrackingFiles, 'list'>,
 * } & import('./load-workflow.mjs').WorkflowDeps & Parameters<typeof openJournal>[0]} InitDeps
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
  init: async ({ slug, story = null, base = null, fromArtifacts = false }) => {
    if (!isSlug(slug)) {
      return { ok: false, slug: /** @type {any} */ (slug) ?? null, created: false, code: 'invalid-slug', reason: `slug must be kebab-case, got ${JSON.stringify(slug ?? null)}` }
    }
    const opened = await openJournal(deps, slug)
    if (!opened.ok) return { ok: false, slug, created: false, code: 'journal-tampered', reason: opened.reason }
    const created = opened.journal.events.length === 0
    if (!created && fromArtifacts) {
      return { ok: false, slug, created: false, code: 'already-started', reason: `${slug} already has a journal; resume it without --from-artifacts` }
    }
    if (created) {
      const refused = await start(deps, opened.journal, { slug, story, base, fromArtifacts })
      if (refused) return refused
    }
    await deps.activePipeline.activate(slug)
    return { ok: true, slug, created, code: null, reason: `${slug} is the active pipeline` }
  },
})

/**
 * @param {InitDeps} deps
 * @param {import('./run-journal.mjs').OpenJournal} journal
 * @param {{ slug: string, story: Story, base: unknown, fromArtifacts: boolean }} request
 * @returns {Promise<InitOutcome | null>} the refusal, null once the run started
 */
const start = async (deps, journal, { slug, story, base, fromArtifacts }) => {
  const refuse = (/** @type {InitCode} */ code, /** @type {string} */ reason) => ({ ok: false, slug, created: false, code, reason })
  const loaded = await loadConfig(deps)
  if (!loaded.ok) return refuse('config-invalid', loaded.reason)
  const workflow = await loadWorkflow(deps, { config: loaded.config })
  if (!workflow.ok) return refuse('workflow-invalid', workflow.reason)
  const artifacts = discussArtifacts(await deps.files.list(slug, 'plans'))
  /** @type {string | null} */
  let entry = null
  if (fromArtifacts) {
    // Stryker disable next-line Regex: every DISCUSS artefact already ends in its .md file name, so only a folder named stories-*.md* could tell the anchor
    if (!artifacts.some((path) => /\/stories-[^/]+\.md$/.test(path))) {
      return refuse('no-artifacts', `${slug} has no DISCUSS stories (plans/<date>/stories-<milestone>.md) to start from`)
    }
    entry = workflow.workflow.order.find((id) => workflow.workflow.nodes[id].phase === ENTRY_AFTER_DISCUSS) ?? null
    if (entry === null) return refuse('workflow-invalid', `${workflow.name} has no ${ENTRY_AFTER_DISCUSS} phase to start from`)
  }
  const resolved = await resolveBases(deps, { config: loaded.config, flag: base })
  if (!resolved.ok) return refuse(resolved.code, resolved.reason)
  await journal.append('run.started', { slug, story, workflow: workflow.name, base: resolved.bases, artifacts, start: entry, unlocked: workflow.unlocked })
  const skipped = entry === null ? [] : workflow.workflow.phases.slice(0, workflow.workflow.phases.indexOf(ENTRY_AFTER_DISCUSS))
  for (const phase of skipped) await journal.append('phase.closed', { phase, skipped: 'from-artifacts' })
  return null
}
