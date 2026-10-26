import { NO_ACTIVE_PIPELINE } from '../pipeline/active-run.mjs'
import { adoptJournal } from './run-journal.mjs'

/**
 * AdoptJournal — `skraft journal adopt`, typed by a person: signs the active pipeline's journal
 * on from here with a new key of this machine, when this machine cannot verify it.
 * @param {{ activePipeline: import('../ports/active-pipeline.mjs').ActivePipeline } & import('./run-journal.mjs').JournalDeps} deps
 */
export const createAdoptJournal = (deps) => Object.freeze({
  /** @returns {Promise<{ ok: boolean, slug: string | null, code: string, reason: string }>} */
  adopt: () => adoptActive(deps),
})

/** @param {Parameters<typeof createAdoptJournal>[0]} deps */
const adoptActive = async (deps) => {
  const slug = await deps.activePipeline.current()
  if (slug === null) return { ok: false, slug, code: 'no-active-pipeline', reason: NO_ACTIVE_PIPELINE }
  return adoptJournal(deps, slug)
}
