import { CONFIG_FILE } from '../../domain/config/skraft-config.mjs'
import { consentOf } from '../../domain/decisions/consents.mjs'
import { deriveRun } from '../../domain/journal/run-state.mjs'
import { COMMENTED, ISSUE_PROGRESS_FILE, keptComment, markerOf, pendingTransitions, renderProgress, SKIPPED, transitionName } from '../../domain/reporting/issue-progress.mjs'

/**
 * The progress of a run from an issue, kept on that issue in one comment: once transitions the
 * journal holds were not kept yet, the comment is rendered again, kept in the tracking folder,
 * then posted or rewritten when the developer consented and the forge takes it. Each of those
 * transitions is journaled kept, with the comment's URL, or skipped, with the reason; none is
 * tried again, and the run goes on either way. The forge is asked nothing while no transition
 * waits, or without consent.
 *
 * @typedef {import('../../domain/reporting/issue-progress.mjs').Transition} Transition
 * @typedef {{
 *   files: import('../ports/tracking-files.mjs').TrackingFiles,
 *   codeHost: import('../ports/code-host.mjs').CodeHost,
 *   progress: import('../ports/pipeline-progress.mjs').PipelineProgress,
 * }} ProgressDeps
 * @typedef {{
 *   slug: string, journal: import('../journal/run-journal.mjs').OpenJournal,
 *   config: import('../../domain/config/skraft-config.mjs').SkraftConfig,
 *   workflow: import('../../domain/workflow/workflow.mjs').Workflow,
 * }} ProgressRequest
 * @typedef {{ ok: true, url: string } | { ok: false, reason: string }} Kept
 * @typedef {{ kind: 'consented' } | { kind: 'refused', reason: string }} Consent
 */

/** Why a run from an issue keeps nothing on it, its transitions journaled skipped. */
export const UNCONSENTED = `${CONFIG_FILE} does not set publish.pullRequest to true`
export const OUTDATED = `publish.pullRequest in ${CONFIG_FILE} answers an earlier publish-consent question, which did not cover the issue`

/** @param {import('../../domain/config/skraft-config.mjs').Publish} publish @returns {Consent} */
const consentTo = (publish) => {
  const state = consentOf(publish, 'pullRequest')
  if (state === 'accepted') return { kind: 'consented' }
  return { kind: 'refused', reason: state === 'outdated' ? OUTDATED : UNCONSENTED }
}

/** @param {ProgressDeps} deps @param {ProgressRequest} request */
export const reportProgress = async (deps, request) => {
  const issue = deriveRun(request.journal.events).story?.issue
  if (!issue) return
  const pending = pendingTransitions(request.journal.events)
  if (pending.length === 0) return
  const consent = consentTo(request.config.publish)
  if (consent.kind === 'refused') return journalAll(request, { issue, pending, kept: { ok: false, reason: consent.reason } })
  const kept = await keep(deps, request, { issue, last: /** @type {Transition} */ (pending.at(-1)) })
  await journalAll(request, { issue, pending, kept })
  const name = pending.map(transitionName).join(', ')
  deps.progress.log(kept.ok ? `${request.slug}: issue #${issue} updated (${name}): ${kept.url}` : `${request.slug}: issue #${issue} not updated (${name}): ${kept.reason}`)
}

/**
 * The comment rendered from the journal and kept in the tracking folder, then posted or rewritten
 * unless the forge cannot be reached.
 * @param {ProgressDeps} deps @param {ProgressRequest} request @param {{ issue: number, last: Transition }} told
 * @returns {Promise<Kept>}
 */
const keep = async (deps, { slug, journal, workflow }, { issue, last }) => {
  await deps.files.write(slug, ISSUE_PROGRESS_FILE, renderProgress({ slug, phases: workflow.phases, events: journal.events }, last))
  const unreachable = await deps.codeHost.unavailable()
  if (unreachable !== null) return { ok: false, reason: unreachable }
  return deps.codeHost.keepIssueComment({ number: issue, marker: markerOf(slug), url: keptComment(journal.events, issue), bodyFile: deps.files.location(slug, ISSUE_PROGRESS_FILE) })
}

/**
 * Each pending transition journaled kept or skipped, in journal order.
 * @param {ProgressRequest} request @param {{ issue: number, pending: Transition[], kept: Kept }} outcome
 */
const journalAll = async ({ journal }, { issue, pending, kept }) => {
  for (const { kind, phase, step, event } of pending) {
    const fields = { issue, kind, phase, ...(step === null ? {} : { step }), event }
    await journal.append(kept.ok ? COMMENTED : SKIPPED, kept.ok ? { ...fields, url: kept.url } : { ...fields, reason: kept.reason })
  }
}
