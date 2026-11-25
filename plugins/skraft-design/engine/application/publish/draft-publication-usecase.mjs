import { deriveRun } from '../../domain/journal/run-state.mjs'
import { draftPublication } from '../../domain/reporting/draft-publication.mjs'
import { JournalConflict } from '../journal/run-journal.mjs'
import { loadConfig } from '../config/bases.mjs'
import { loadWorkflow } from '../workflow/load-workflow.mjs'
import { openActiveRun } from '../pipeline/active-run.mjs'
import { publishPullRequest } from './pull-request.mjs'

/**
 * @typedef {Parameters<typeof openActiveRun>[0] & Parameters<typeof loadConfig>[0] & Parameters<typeof loadWorkflow>[0] & import('./pull-request.mjs').PublishDeps} DraftPublicationDeps
 * @typedef {{ ok: boolean, slug: string | null, code: string | null, reason: string }} DraftPublicationOutcome
 */

/** @param {DraftPublicationDeps} deps */
export const createDraftPublication = (deps) => Object.freeze({
  /** @returns {Promise<DraftPublicationOutcome>} */
  publish: () => publishDraft(deps),
})

/** @param {DraftPublicationDeps} deps @returns {Promise<DraftPublicationOutcome>} */
const publishDraft = async (deps) => {
  const opened = await openActiveRun(deps, null)
  if (!opened.ok) return refused(opened.outcome.slug, opened.outcome.code, opened.outcome.reason)
  return publishOpenedRun(deps, opened)
}

const publishOpenedRun = async (deps, { slug, journal }) => {
  const eligibility = draftPublication(deriveRun(journal.events))
  if (!eligibility.allowed) return refused(slug, 'draft-not-allowed', eligibility.reason)
  return publishEligibleDraft(deps, slug, journal)
}

const publishEligibleDraft = async (deps, slug, journal) => {
  const config = await loadConfig(deps)
  if (!config.ok) return refused(slug, 'config-invalid', config.reason)
  if (config.config.publish.pullRequest !== true) return refused(slug, 'publication-not-consented', 'Draft publication requires the publication consent for this repository (skraft_design_setup)')
  const loaded = await loadWorkflow(deps, { agents: false })
  if (!loaded.ok) return refused(slug, 'workflow-invalid', loaded.reason)
  return guarded(slug, () => publishPullRequest(deps, {
    slug, journal, workflow: loaded.workflow, config: { ...config.config, publish: { ...config.config.publish, draft: true } },
  }))
}

/** @param {string} slug @param {() => ReturnType<typeof publishPullRequest>} publishing */
const guarded = async (slug, publishing) => {
  try {
    const { published, reason } = await publishing()
    return { ok: published, slug, code: published ? null : 'not-published', reason }
  } catch (error) {
    if (!(error instanceof JournalConflict)) throw error
    return refused(slug, 'journal-changed', error.message)
  }
}

/** @param {string | null} slug @param {string} code @param {string} reason @returns {DraftPublicationOutcome} */
const refused = (slug, code, reason) => ({ ok: false, slug, code, reason })
