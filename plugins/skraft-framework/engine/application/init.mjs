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
  init: async ({ slug, story = null, base = null }) => {
    if (!isSlug(slug)) {
      return { ok: false, slug: /** @type {any} */ (slug) ?? null, created: false, code: 'invalid-slug', reason: `slug must be kebab-case, got ${JSON.stringify(slug ?? null)}` }
    }
    if (base !== null && typeof base !== 'string') {
      return { ok: false, slug, created: false, code: 'invalid-base', reason: `--base must be a git ref, got ${JSON.stringify(base)}` }
    }
    const opened = await openJournal(deps, slug)
    if (!opened.ok) return { ok: false, slug, created: false, code: 'journal-tampered', reason: opened.reason }
    const created = opened.journal.events.length === 0
    if (created) {
      const loaded = await loadConfig(deps)
      if (!loaded.ok) return { ok: false, slug, created: false, code: 'config-invalid', reason: loaded.reason }
      const resolved = await resolveBases(deps, { config: loaded.config, flag: /** @type {string | null} */ (base) })
      if (!resolved.ok) return { ok: false, slug, created: false, code: resolved.code, reason: resolved.reason }
      await opened.journal.append('run.started', { slug, story, workflow: 'skraft', base: resolved.bases })
    }
    await deps.activePipeline.activate(slug)
    return { ok: true, slug, created, code: null, reason: `${slug} is the active pipeline` }
  },
})
