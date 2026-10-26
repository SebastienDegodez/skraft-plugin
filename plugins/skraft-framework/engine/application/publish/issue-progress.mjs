import { deriveRun } from '../../domain/journal/run-state.mjs'
import { bodyPath, COMMENTED, pendingTransitions, renderTransition, SKIPPED, transitionName } from '../../domain/reporting/issue-progress.mjs'

/**
 * The progress of a run from an issue, commented on that issue: each transition the journal holds
 * and no comment told yet, its body kept in the tracking folder, then posted when the developer
 * consented to publish and the forge takes it. A comment the forge cannot take is journaled
 * skipped with the reason, and never tried again; the run goes on either way.
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
 */

/** @param {ProgressDeps} deps @param {ProgressRequest} request */
export const reportProgress = async (deps, request) => {
  const issue = deriveRun(request.journal.events).story?.issue
  if (!issue || request.config.publish.pullRequest !== true) return
  for (const transition of pendingTransitions(request.journal.events)) await comment(deps, request, issue, transition)
}

/** @param {ProgressDeps} deps @param {ProgressRequest} request @param {number} issue @param {Transition} transition */
const comment = async (deps, { slug, journal, workflow }, issue, transition) => {
  const path = bodyPath(journal.events, transition)
  await deps.files.write(slug, path, renderTransition({ slug, phases: workflow.phases, events: journal.events }, transition))
  const posted = await post(deps.codeHost, issue, deps.files.location(slug, path))
  const told = { issue, kind: transition.kind, phase: transition.phase, event: transition.event }
  if (posted.ok) await journal.append(COMMENTED, { ...told, url: posted.url })
  else await journal.append(SKIPPED, { ...told, reason: posted.reason })
  deps.progress.log(posted.ok ? `${slug}: issue #${issue} commented: ${posted.url}` : `${slug}: issue #${issue} not commented (${transitionName(transition)}): ${posted.reason}`)
}

/**
 * @param {ProgressDeps['codeHost']} codeHost @param {number} number @param {string} bodyFile
 * @returns {Promise<{ ok: true, url: string } | { ok: false, reason: string }>}
 */
const post = async (codeHost, number, bodyFile) => {
  const unavailable = await codeHost.unavailable()
  return unavailable === null ? codeHost.commentIssue({ number, bodyFile }) : { ok: false, reason: unavailable }
}
