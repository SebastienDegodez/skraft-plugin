import { isSlug } from '../domain/pipeline/slug.mjs'
import { openJournal } from './run-journal.mjs'

/**
 * @typedef {import('./ports/active-pipeline.mjs').ActivePipeline} ActivePipeline
 * @typedef {{ issue?: number | null, title?: string | null } | null} Story
 * @typedef {{ ok: boolean, slug: string | null, created: boolean, code: 'invalid-slug' | 'journal-tampered' | null, reason: string }} InitOutcome
 */

/**
 * Init — makes a slug the active pipeline of the working copy and opens its journal.
 * @param {{ activePipeline: ActivePipeline } & Parameters<typeof openJournal>[0]} deps
 */
export const createInit = (deps) => Object.freeze({
  /** @param {{ slug?: unknown, story?: Story }} request @returns {Promise<InitOutcome>} */
  init: async ({ slug, story = null }) => {
    if (!isSlug(slug)) {
      return { ok: false, slug: /** @type {any} */ (slug) ?? null, created: false, code: 'invalid-slug', reason: `slug must be kebab-case, got ${JSON.stringify(slug ?? null)}` }
    }
    const opened = await openJournal(deps, slug)
    if (!opened.ok) return { ok: false, slug, created: false, code: 'journal-tampered', reason: opened.reason }
    const created = opened.journal.events.length === 0
    if (created) await opened.journal.append('run.started', { slug, story, workflow: 'skraft' })
    await deps.activePipeline.activate(slug)
    return { ok: true, slug, created, code: null, reason: `${slug} is the active pipeline` }
  },
})
