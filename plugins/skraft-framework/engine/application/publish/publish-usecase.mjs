import { deriveRun } from '../../domain/journal/run-state.mjs'
import { openActiveRun } from '../pipeline/active-run.mjs'
import { loadConfig } from '../config/bases.mjs'
import { loadWorkflow } from '../workflow/load-workflow.mjs'
import { JournalConflict } from '../journal/run-journal.mjs'
import { publishPullRequest } from './pull-request.mjs'

/**
 * @typedef {Parameters<typeof openActiveRun>[0] & import('./pull-request.mjs').PublishDeps & import('../workflow/load-workflow.mjs').WorkflowDeps & Parameters<typeof loadConfig>[0]} PublishCommandDeps
 * @typedef {{ ok: boolean, slug: string | null, code: string | null, reason: string }} PublishOutcome
 *   ok: the pull request is open with the run's description.
 */

/**
 * Publish — `skraft publish`: the pull request of the active pipeline's completed run, opened or
 * updated as its publish node would, once what stopped it there is fixed. The developer typing it
 * consents for this publication, whatever skraft-config.json answers; the journal says so.
 * @param {PublishCommandDeps} deps
 */
export const createPublish = (deps) => Object.freeze({
  /** @returns {Promise<PublishOutcome>} */
  publish: () => publish(deps),
})

/** @param {PublishCommandDeps} deps @returns {Promise<PublishOutcome>} */
const publish = async (deps) => {
  const opened = await openActiveRun(deps, null)
  if (!opened.ok) return refused(opened.outcome.slug, /** @type {string} */ (opened.outcome.code), opened.outcome.reason)
  const { slug, journal } = opened
  if (deriveRun(journal.events).finished?.status !== 'completed') return refused(slug, 'not-done', `${slug} has not completed; skraft publish opens the pull request of a completed run`)
  const config = await loadConfig(deps)
  if (!config.ok) return refused(slug, 'config-invalid', config.reason)
  const loaded = await loadWorkflow(deps, { agents: false })
  if (!loaded.ok) return refused(slug, 'workflow-invalid', loaded.reason)
  return guarded(slug, () => requestedPublication(deps, { slug, journal, config: config.config, workflow: loaded.workflow }))
}

/**
 * The publication the developer asked for, journaled first with the answer skraft-config.json holds.
 * @param {PublishCommandDeps} deps @param {Omit<import('./pull-request.mjs').PublishRequest, 'requested'>} request
 */
const requestedPublication = async (deps, request) => {
  await request.journal.append('publish.requested', { by: 'skraft publish', consent: request.config.publish.pullRequest })
  return publishPullRequest(deps, { ...request, requested: true })
}

/**
 * The publication, unless another writer changed the journal meanwhile.
 * @param {string} slug @param {() => ReturnType<typeof publishPullRequest>} publishing @returns {Promise<PublishOutcome>}
 */
const guarded = async (slug, publishing) => {
  try {
    const { published, reason } = await publishing()
    return { ok: published, slug, code: published ? null : 'not-published', reason }
  } catch (error) {
    if (!(error instanceof JournalConflict)) throw error
    return refused(slug, 'journal-changed', error.message)
  }
}

/** @param {string | null} slug @param {string} code @param {string} reason @returns {PublishOutcome} */
const refused = (slug, code, reason) => ({ ok: false, slug, code, reason })
