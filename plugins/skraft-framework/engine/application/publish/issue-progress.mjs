import { CONFIG_FILE } from '../../domain/config/skraft-config.mjs'
import { deriveRun } from '../../domain/journal/run-state.mjs'
import { bodyPath, COMMENTED, pendingTransitions, renderTransition, SKIPPED, transitionName } from '../../domain/reporting/issue-progress.mjs'

/**
 * The progress of a run from an issue, commented on that issue: each transition the journal holds
 * and no comment told yet, its body kept in the tracking folder, then posted when the developer
 * consented to publish and the forge takes it. Without consent, or when the forge cannot take it,
 * the transition is journaled skipped with the reason and never told again; the run goes on
 * either way. The forge is asked whether it can be reached once per call.
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

/** Why a run from an issue tells it nothing, its transitions journaled skipped. */
export const UNCONSENTED = `${CONFIG_FILE} does not set publish.pullRequest to true`

/** @param {ProgressDeps} deps @param {ProgressRequest} request */
export const reportProgress = async (deps, request) => {
  const issue = deriveRun(request.journal.events).story?.issue
  const pending = pendingTransitions(request.journal.events)
  if (!issue || pending.length === 0) return
  const refusal = request.config.publish.pullRequest === true ? await deps.codeHost.unavailable() : UNCONSENTED
  for (const transition of pending) await tell(deps, request, { issue, transition, refusal })
}

/**
 * One transition: skipped without consent; else its body kept, then posted unless the forge
 * cannot be reached.
 * @param {ProgressDeps} deps @param {ProgressRequest} request
 * @param {{ issue: number, transition: Transition, refusal: string | null }} told refusal: why nothing can be posted, null when it can
 */
const tell = async (deps, request, { issue, transition, refusal }) => {
  const fields = { issue, kind: transition.kind, phase: transition.phase, event: transition.event }
  if (refusal === UNCONSENTED) return request.journal.append(SKIPPED, { ...fields, reason: refusal })
  const path = bodyPath(request.journal.events, transition)
  await deps.files.write(request.slug, path, renderTransition({ slug: request.slug, phases: request.workflow.phases, events: request.journal.events }, transition))
  const posted = refusal === null ? await deps.codeHost.commentIssue({ number: issue, bodyFile: deps.files.location(request.slug, path) }) : { ok: /** @type {const} */ (false), reason: refusal }
  await record(deps, request, { fields, transition, posted })
}

/**
 * @param {ProgressDeps} deps @param {ProgressRequest} request
 * @param {{ fields: Record<string, unknown>, transition: Transition, posted: { ok: true, url: string } | { ok: false, reason: string } }} outcome
 */
const record = async (deps, { slug, journal }, { fields, transition, posted }) => {
  if (posted.ok) await journal.append(COMMENTED, { ...fields, url: posted.url })
  else await journal.append(SKIPPED, { ...fields, reason: posted.reason })
  deps.progress.log(posted.ok ? `${slug}: issue #${fields.issue} commented: ${posted.url}` : `${slug}: issue #${fields.issue} not commented (${transitionName(transition)}): ${posted.reason}`)
}
