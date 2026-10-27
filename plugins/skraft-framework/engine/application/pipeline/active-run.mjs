import { openJournal } from '../journal/run-journal.mjs'

/**
 * @typedef {import('../ports/active-pipeline.mjs').ActivePipeline} ActivePipeline
 * @typedef {{ status: 'done' | 'blocked' | 'waiting' | 'refused', slug: string | null, phase: string | null, code: string | null, reason: string }} RunOutcome
 *   waiting: a question awaits a human's answer (`skraft decide`); code names the question.
 */

export const NO_ACTIVE_PIPELINE =
  'no active pipeline in this working copy (.copilot-tracking/skraft-plans/.active-slug); start one with an explicit slug'

/**
 * The run a call acts on: the working copy's active pipeline, never a guess. A slug the
 * caller names must be that one.
 * @param {{ activePipeline: ActivePipeline } & Parameters<typeof openJournal>[0]} deps
 * @param {string | null | undefined} requested
 * @returns {Promise<{ ok: true, slug: string, journal: import('../journal/run-journal.mjs').OpenJournal } | { ok: false, outcome: RunOutcome }>}
 */
export const openActiveRun = async (deps, requested) => {
  const chosen = await chosenRun(deps, requested ?? null)
  if (!chosen.ok) return chosen
  return openChosen(deps, chosen.slug)
}

/**
 * The active pipeline, which a slug the caller names must be.
 * @param {{ activePipeline: ActivePipeline }} deps @param {string | null} named
 * @returns {Promise<{ ok: true, slug: string } | { ok: false, outcome: RunOutcome }>}
 */
const chosenRun = async (deps, named) => {
  const active = await deps.activePipeline.current()
  if (active === null) return refused(named, 'no-active-pipeline', NO_ACTIVE_PIPELINE)
  if (named !== null && named !== active) {
    return refused(named, 'slug-mismatch', `the active pipeline of this working copy is ${active}, not ${named}; switch with an explicit init`)
  }
  return { ok: true, slug: active }
}

/**
 * The run's journal: blocked when tampered or unverifiable, refused before its init.
 * @param {Parameters<typeof openJournal>[0]} deps @param {string} slug
 * @returns {Promise<{ ok: true, slug: string, journal: import('../journal/run-journal.mjs').OpenJournal } | { ok: false, outcome: RunOutcome }>}
 */
const openChosen = async (deps, slug) => {
  const opened = await openJournal(deps, slug)
  if (!opened.ok) return { ok: false, outcome: { status: 'blocked', slug, phase: null, code: opened.code, reason: opened.reason } }
  if (opened.journal.events.length === 0) {
    return refused(slug, 'not-initialised', `${slug} has no journal (events.jsonl); start it with an explicit init`)
  }
  return { ok: true, slug, journal: opened.journal }
}

/** @returns {{ ok: false, outcome: RunOutcome }} */
const refused = (/** @type {string | null} */ slug, /** @type {string} */ code, /** @type {string} */ reason) =>
  ({ ok: false, outcome: { status: 'refused', slug, phase: null, code, reason } })
