import { reviewSlug } from '../../domain/review/pull-request.mjs'
import { loadConfig } from '../config/bases.mjs'
import { reviewAssignmentsOf } from '../config/agent-models.mjs'
import { JournalConflict, openJournal } from '../journal/run-journal.mjs'
import { pullRequestInputs } from './pull-request-inputs.mjs'
import { keepComment } from './review-comment.mjs'
import { runReview } from './review-runs.mjs'
import { loadReview } from './review-workflow.mjs'

/**
 * @typedef {{ number: number, publish: boolean, workingCopyName: string }} ReviewRequest
 *   number: the pull request; publish: keep the verdict in one comment of the pull request;
 *   workingCopyName: the name of the working copy's folder, which names a component it detects.
 * @typedef {{
 *   status: 'APPROVED' | 'NEEDS_REWORK' | 'BLOCKED' | 'stopped', number: number, pass: number | null,
 *   code: string | null, reason: string, reasons: string[], details: string[], file: string | null, comment: string | null, unpublished: string | null,
 * }} ReviewOutcome
 *   pass: the review's pass, null when it stopped before one; reasons: what sends the work back;
 *   details: what does not (refuted findings, notes); file: the pass's verdict.yaml; comment: the
 *   URL of the comment kept on the pull request; unpublished: why `--publish` kept none.
 * @typedef {{
 *   pullRequests: import('../ports/pull-requests.mjs').PullRequests,
 *   reviewJournal: import('../ports/run-journal-store.mjs').RunJournalStore,
 *   reviewFiles: import('../ports/tracking-files.mjs').TrackingFiles,
 *   workspace: import('../ports/workspace.mjs').Workspace,
 *   userSettings: import('../ports/user-settings.mjs').UserSettings,
 *   sourceControl: import('../ports/source-control.mjs').SourceControl,
 *   workflowSource: import('../ports/workflow-source.mjs').WorkflowSource,
 *   agentCatalog: import('../ports/agent-catalog.mjs').AgentCatalog,
 *   agentRunner: import('../ports/agent-runner.mjs').AgentRunner,
 *   human: import('../ports/human-interaction.mjs').HumanInteraction,
 *   progress: import('../ports/pipeline-progress.mjs').PipelineProgress,
 *   hasher: import('../ports/hasher.mjs').Hasher,
 *   clock: import('../ports/clock.mjs').Clock,
 * }} ReviewDeps
 * @typedef {{ stop: { code: string, reason: string } }} Stop
 * @typedef {{
 *   config: import('../../domain/config/skraft-config.mjs').SkraftConfig,
 *   review: Extract<Awaited<ReturnType<typeof loadReview>>, { ok: true }>,
 *   pullRequest: import('../ports/pull-requests.mjs').PullRequestFacts,
 *   base: import('./review-runs.mjs').ReviewInputs['base'],
 * }} Prepared
 * @typedef {Prepared & { deps: ReviewDeps, request: ReviewRequest, slug: string, journal: import('../journal/run-journal.mjs').OpenJournal }} Context
 * @typedef {{ visit: number, assignments: import('../config/agent-models.mjs').ReviewAssignments }} Pass
 */

/**
 * ReviewPullRequest — `skraft review --pr <number>`: the review workflow on one pull request,
 * with no pipeline run. The working copy stands on the pull request's head; the review reads the
 * changes since the merge base with its base, its own journal under
 * `.copilot-tracking/skraft-reviews/pr-<number>/`, and a later pass takes over the lenses whose
 * inputs did not change.
 * @param {ReviewDeps} deps
 */
export const createReviewPullRequest = (deps) => Object.freeze({
  /** @param {ReviewRequest} request @returns {Promise<ReviewOutcome>} */
  review: (request) => reviewGuarded(deps, request),
})

/** A journal another writer changed under the review stops it. @param {ReviewDeps} deps @param {ReviewRequest} request */
const reviewGuarded = async (deps, request) => {
  try {
    return await reviewOf(deps, request)
  } catch (error) {
    if (!(error instanceof JournalConflict)) throw error
    return stopped(request.number, null, { code: 'journal-changed', reason: error.message })
  }
}

/** @param {ReviewDeps} deps @param {ReviewRequest} request @returns {Promise<ReviewOutcome>} */
const reviewOf = async (deps, request) => {
  const prepared = await prepare(deps, request)
  if ('stop' in prepared) return stopped(request.number, null, prepared.stop)
  const slug = reviewSlug(request.number)
  const opened = await openJournal({ journal: deps.reviewJournal, hasher: deps.hasher, clock: deps.clock }, slug)
  if (!opened.ok) return stopped(request.number, null, { code: 'journal-tampered', reason: opened.reason })
  return reviewPass({ ...prepared, deps, request, slug, journal: opened.journal })
}

/**
 * Everything the review needs before its journal: the configuration, the review workflow, the
 * pull request, and the base of its changes.
 * @param {ReviewDeps} deps @param {ReviewRequest} request @returns {Promise<Prepared | Stop>}
 */
const prepare = async (deps, { number }) => {
  const config = await loadConfig(deps)
  if (!config.ok) return stop('config-invalid', config.reason)
  const review = await loadReview(deps)
  if (!review.ok) return stop('workflow-invalid', review.reason)
  const read = await pullRequestOf(deps, number)
  if ('stop' in read) return read
  const base = await baseOf(deps, read.pullRequest)
  return 'stop' in base ? base : { config: config.config, review, pullRequest: read.pullRequest, base: base.base }
}

/** @param {string} code @param {string} reason @returns {Stop} */
const stop = (code, reason) => ({ stop: { code, reason } })

/**
 * The pull request, once the forge can be asked and has it.
 * @param {ReviewDeps} deps @param {number} number
 * @returns {Promise<{ pullRequest: import('../ports/pull-requests.mjs').PullRequestFacts } | Stop>}
 */
const pullRequestOf = async ({ pullRequests }, number) => {
  const unavailable = await pullRequests.unavailable()
  if (unavailable !== null) return stop('forge-unavailable', unavailable)
  const read = await pullRequests.find(number)
  if (!read.ok) return stop('pr-unreadable', read.reason)
  return read.found === null ? stop('pr-not-found', `the forge has no pull request #${number}`) : { pullRequest: read.found }
}

/**
 * The merge base of the pull request's head, which the working copy stands on, with its base.
 * @param {ReviewDeps} deps @param {import('../ports/pull-requests.mjs').PullRequestFacts} pullRequest
 * @returns {Promise<{ base: Prepared['base'] } | Stop>}
 */
const baseOf = async ({ sourceControl }, { number, base, head }) => {
  // Stryker disable next-line StringLiteral: '' and '.' are both the working copy to SourceControl
  if ((await sourceControl.head('.')) !== head.sha) return stop('pr-not-checked-out', `the working copy is not on the head of pull request #${number} (${head.ref} at ${head.sha}); check it out first: gh pr checkout ${number}`)
  // Stryker disable next-line StringLiteral: '' and '.' are both the working copy to SourceControl
  const sha = await sourceControl.mergeBase('.', base.sha)
  if (sha === null) return stop('pr-base-missing', `Git finds no merge base with ${base.ref} at ${base.sha}; fetch it first: git fetch origin ${base.ref}`)
  // Stryker disable next-line StringLiteral: '' and '.' are both the working copy to the review's paths
  return { base: /** @type {Prepared['base']} */ ([{ repository: '.', sha }]) }
}

/**
 * One pass of the review: opened, or picked up when the last one stopped; its lenses and the
 * refuter answer; its verdict journaled.
 * @param {Context} context @returns {Promise<ReviewOutcome>}
 */
const reviewPass = async (context) => {
  const pass = await openPass(context)
  context.deps.progress.log(`${context.slug}: review of pull request #${context.request.number}${pass.visit > 1 ? `, pass ${pass.visit}` : ''} (${context.review.node.lenses.join(', ')})`)
  const started = context.deps.clock.now()
  const reviewed = await runReview({ ...reviewRun(context, pass), inputs: await inputsOf(context) })
  if ('stop' in reviewed) return stoppedPass(context, pass, reviewed.stop)
  await recordVerdict(context, pass, { reviewed, started })
  context.deps.progress.log(`${context.slug}: ${reviewed.verdict.summary}`)
  return verdictOutcome(context, pass, reviewed, await commentOf(context, pass, reviewed.verdict))
}

/**
 * The host or the machine stopped the pass: journaled, and the next run picks the pass up.
 * @param {Context} context @param {Pass} pass @param {{ code: string, reason: string }} why
 */
const stoppedPass = async ({ journal, request }, { visit }, why) => {
  await journal.append('run.stopped', why)
  return stopped(request.number, visit, why)
}

/** The review the pass runs, without its inputs. @param {Context} context @param {Pass} pass */
const reviewRun = ({ deps, slug, journal, review }, { visit, assignments }) => ({
  deps: { ...deps, files: deps.reviewFiles },
  slug, journal, assignments, sources: review.sources,
  step: /** @type {import('../../domain/pipeline/next-step.mjs').WorkStep} */ ({ node: review.node, visit, phase: review.phase }),
})

/** @param {Context} context */
const inputsOf = ({ deps, slug, pullRequest, base, config, review, request }) => pullRequestInputs(deps, {
  slug, pullRequest, base, components: config.components, declared: review.inputs, workingCopyName: request.workingCopyName,
})

/**
 * The pass the review is on, counted over the pull request's journal: the last one again while it holds no verdict, with what its lenses
 * and refuter run on as it journaled them; else a new one, journaled.
 * @param {Context} context @returns {Promise<Pass>}
 */
const openPass = async ({ journal, review, config, pullRequest, base }) => {
  const step = review.node.id
  const last = journal.events.findLast((event) => event.type === 'step.started')
  if (last && !journal.events.some((event) => event.type === 'step.recorded' && event.visit === last.visit)) return { visit: last.visit, assignments: { lenses: last.assignments, refuter: last.refuter } }
  const { lenses, refuter } = reviewAssignmentsOf(config, review.node)
  const visit = (last?.visit ?? 0) + 1
  await journal.append('step.started', { step, phase: review.phase, pullRequest: pullRequest.number, base: base[0].sha, head: pullRequest.head.sha, lenses: review.node.lenses, visit, attempt: 1, assignments: lenses, refuter })
  return { visit, assignments: { lenses, refuter } }
}

/**
 * @param {Context} context @param {Pass} pass
 * @param {{ reviewed: { verdict: import('../../domain/review/verdict.mjs').ReviewVerdict, costUsd: number | undefined }, started: Date }} done
 */
const recordVerdict = async ({ deps, journal, review }, { visit }, { reviewed: { verdict, costUsd }, started }) => {
  await journal.append('step.recorded', {
    step: review.node.id, visit, attempt: 1, outcome: OUTCOMES[verdict.status], code: verdict.code, failures: verdict.reasons, reason: verdict.summary,
    durationMs: deps.clock.now().getTime() - started.getTime(), cost: costUsd,
  })
}

/** How the journal records each verdict, as a pipeline's review does. */
const OUTCOMES = Object.freeze({ APPROVED: 'approved', NEEDS_REWORK: 'needs-rework', BLOCKED: 'blocked' })

/** @param {Context} context @param {Pass} pass @param {import('../../domain/review/verdict.mjs').ReviewVerdict} verdict */
const commentOf = ({ deps, slug, request, journal, config }, { visit }, verdict) => keepComment({ deps, slug, number: request.number, publish: request.publish, journal, config }, { pass: visit, verdict })

/**
 * @param {Context} context @param {Pass} pass
 * @param {{ verdict: import('../../domain/review/verdict.mjs').ReviewVerdict, file: string }} reviewed
 * @param {import('./review-comment.mjs').Published} published
 * @returns {ReviewOutcome}
 */
const verdictOutcome = ({ request }, { visit }, { verdict, file }, { comment, unpublished }) => ({
  status: verdict.status, number: request.number, pass: visit, code: verdict.code,
  reason: verdict.summary, reasons: verdict.reasons, details: verdict.details, file, comment, unpublished,
})

/**
 * @param {number} number @param {number | null} pass @param {{ code: string, reason: string }} why
 * @returns {ReviewOutcome}
 */
const stopped = (number, pass, { code, reason }) => ({ status: 'stopped', number, pass, code, reason, reasons: [], details: [], file: null, comment: null, unpublished: null })
