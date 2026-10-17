import { isSlug } from '../domain/pipeline/slug.mjs'
import { loadConfig, resolveBases } from './bases.mjs'
import { openJournal } from './run-journal.mjs'

/**
 * @typedef {import('./ports/active-pipeline.mjs').ActivePipeline} ActivePipeline
 * @typedef {{ issue?: number | null, title?: string | null } | null} Story
 * @typedef {'invalid-slug' | 'invalid-base' | 'journal-tampered' | 'config-invalid' | 'base-unresolved' | 'source-control-unavailable'} InitCode
 * @typedef {{ ok: boolean, slug: string | null, created: boolean, code: InitCode | null, reason: string }} InitOutcome
 * @typedef {{
 *   activePipeline: ActivePipeline,
 *   workspace: import('./ports/workspace.mjs').ConfigSource,
 *   sourceControl: import('./ports/source-control.mjs').SourceControl,
 * } & Parameters<typeof openJournal>[0]} InitDeps
 */

/**
 * Init — makes a slug the active pipeline of the working copy and opens its journal. A new
 * run journals the base of every repository it diffs against.
 * @param {InitDeps} deps
 */
export const createInit = (deps) => Object.freeze({
  /** @param {{ slug?: unknown, story?: Story, base?: unknown }} request @returns {Promise<InitOutcome>} */
  init: (request) => initRun(deps, request),
})

/**
 * @param {InitDeps} deps @param {{ slug?: unknown, story?: Story, base?: unknown }} request
 * @returns {Promise<InitOutcome>}
 */
const initRun = async (deps, { slug, story = null, base = null }) => {
  if (!isSlug(slug)) return invalidSlug(slug)
  const opened = await openJournal(deps, slug)
  if (!opened.ok) return refused(slug, 'journal-tampered', opened.reason)
  const created = opened.journal.events.length === 0
  const refusal = created ? await startRun(deps, opened.journal, { slug, story, base }) : null
  if (refusal !== null) return refusal
  await deps.activePipeline.activate(slug)
  return { ok: true, slug, created, code: null, reason: `${slug} is the active pipeline` }
}

/**
 * Journals `run.started` with the base of every repository the run diffs against; the
 * refusal when the configuration or a base does not hold, else null.
 * @param {InitDeps} deps @param {import('./run-journal.mjs').OpenJournal} journal
 * @param {{ slug: string, story: Story, base: unknown }} request
 * @returns {Promise<InitOutcome | null>}
 */
const startRun = async (deps, journal, { slug, story, base }) => {
  const loaded = await loadConfig(deps)
  if (!loaded.ok) return refused(slug, 'config-invalid', loaded.reason)
  const resolved = await resolveBases(deps, { config: loaded.config, flag: base })
  if (!resolved.ok) return refused(slug, resolved.code, resolved.reason)
  await journal.append('run.started', { slug, story, workflow: 'skraft', base: resolved.bases })
  return null
}

/** @param {unknown} slug @returns {InitOutcome} */
const invalidSlug = (slug) =>
  refused(/** @type {any} */ (slug) ?? null, 'invalid-slug', `slug must be kebab-case, got ${JSON.stringify(slug ?? null)}`)

/** @param {string | null} slug @param {InitCode} code @param {string} reason @returns {InitOutcome} */
const refused = (slug, code, reason) => ({ ok: false, slug, created: false, code, reason })
