import { openJournal } from './run-journal.mjs'

/**
 * @typedef {import('./ports/active-pipeline.mjs').ActivePipeline} ActivePipeline
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
 * @returns {Promise<{ ok: true, slug: string, journal: import('./run-journal.mjs').OpenJournal } | { ok: false, outcome: RunOutcome }>}
 */
export const openActiveRun = async (deps, requested) => {
  const active = await deps.activePipeline.current()
  const named = requested ?? null
  if (active === null) return refused(named, 'no-active-pipeline', NO_ACTIVE_PIPELINE)
  if (named !== null && named !== active) {
    return refused(named, 'slug-mismatch', `the active pipeline of this working copy is ${active}, not ${named}; switch with an explicit init`)
  }
  const opened = await openJournal(deps, active)
  if (!opened.ok) return { ok: false, outcome: { status: 'blocked', slug: active, phase: null, code: 'journal-tampered', reason: opened.reason } }
  if (opened.journal.events.length === 0) {
    return refused(active, 'not-initialised', `${active} has no journal (events.jsonl); start it with an explicit init`)
  }
  return { ok: true, slug: active, journal: opened.journal }
}

/** @returns {{ ok: false, outcome: RunOutcome }} */
const refused = (/** @type {string | null} */ slug, /** @type {string} */ code, /** @type {string} */ reason) =>
  ({ ok: false, outcome: { status: 'refused', slug, phase: null, code, reason } })
