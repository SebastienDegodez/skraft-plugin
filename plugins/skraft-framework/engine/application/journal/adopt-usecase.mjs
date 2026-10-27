import { reviewSlug } from '../../domain/review/pull-request.mjs'
import { NO_ACTIVE_PIPELINE } from '../pipeline/active-run.mjs'
import { reviewJournalOf } from '../review/review-pull-request-usecase.mjs'
import { adoptionPreview, adoptJournal } from './run-journal.mjs'

/**
 * AdoptJournal — `skraft journal adopt [--pr <number>]`, typed by a person: signs a journal on
 * from here with a new key of this machine, when this machine cannot verify it: the active
 * pipeline's, or, given a pull request's number, that pull request's review journal.
 * @param {{ activePipeline: import('../ports/active-pipeline.mjs').ActivePipeline, reviewJournal: import('../ports/run-journal-store.mjs').RunJournalStore } & import('./run-journal.mjs').JournalDeps} deps
 * @typedef {{ pr?: number }} Target pr: the pull request whose review journal is adopted; the active pipeline's when absent
 */
export const createAdoptJournal = (deps) => Object.freeze({
  /**
   * @param {{ head?: string, unverified?: number }} shown what preview gave the person to agree to
   * @param {Target} [target]
   * @returns {Promise<{ ok: boolean, slug: string | null, code: string, reason: string }>}
   */
  adopt: (shown, target = {}) => onTarget(deps, target, (journalDeps, slug) => adoptJournal(journalDeps, slug, shown)),
  /**
   * What the adoption would leave unverified, for the person to agree to first.
   * @param {Target} [target]
   * @returns {Promise<{ ok: true, slug: string, unverifiedLines: string, head: string, unverified: number } | { ok: false, slug: string | null, code: string, reason: string }>}
   */
  preview: (target = {}) => onTarget(deps, target, adoptionPreview),
})

/**
 * @template T
 * @param {Parameters<typeof createAdoptJournal>[0]} deps @param {Target} target
 * @param {(deps: import('./run-journal.mjs').JournalDeps, slug: string) => Promise<T>} act
 */
const onTarget = async (deps, { pr }, act) => {
  if (pr !== undefined) return act(reviewJournalOf(deps, pr), reviewSlug(pr))
  const slug = await deps.activePipeline.current()
  if (slug === null) return { ok: false, slug, code: 'no-active-pipeline', reason: NO_ACTIVE_PIPELINE }
  return act(deps, slug)
}
