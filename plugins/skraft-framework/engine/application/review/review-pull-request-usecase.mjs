import { reviewedPaths } from '../../domain/review/changes.mjs'
import { reviewHeldReason, reviewJournalCommands, reviewLostReason, reviewSlug, reviewUnavailableReason } from '../../domain/review/pull-request.mjs'
import { LOCAL_CONFIG_FILE, readConfigLayers } from '../../domain/config/skraft-config.mjs'
import { loadConfig } from '../config/bases.mjs'
import { forgeAdapters } from '../config/forge.mjs'
import { reviewAssignmentsOf } from '../config/agent-models.mjs'
import { JournalConflict, openJournal } from '../journal/run-journal.mjs'
import { holdRun, LockLost, writingWhileHeld } from '../pipeline/run-lock.mjs'
import { pullRequestInputs } from './pull-request-inputs.mjs'
import { keepComment } from './review-comment.mjs'
import { runReview } from './review-runs.mjs'
import { loadReview } from './review-workflow.mjs'
import { assignmentsText } from '../../domain/reporting/agent-models.mjs'

/**
 * @typedef {{ number: number, publish: boolean, workingCopyName: string, handedBack?: boolean }} ReviewRequest
 *   number: the pull request; publish: keep the verdict in one comment of the pull request;
 *   workingCopyName: the name of the working copy's folder, which names a component it detects;
 *   handedBack: the review takes back the agents it handed over (`--record`), and the lease it
 *   left with them; false when absent.
 * @typedef {{
 *   status: 'APPROVED' | 'NEEDS_REWORK' | 'BLOCKED' | 'stopped', number: number, pass: number | null,
 *   code: string | null, reason: string, reasons: string[], details: string[], file: string | null, comment: string | null, unpublished: string | null,
 * }} ReviewOutcome
 *   pass: the review's pass, null when it stopped before one; reasons: what sends the work back;
 *   details: what does not (refuted findings, notes); file: the pass's verdict.yaml; comment: the
 *   URL of the comment kept on the pull request; unpublished: why `--publish` kept none.
 * @typedef {{
 *   forges: import('../config/forge.mjs').ForgeDeps['forges'],
 *   reviewJournal: import('../ports/run-journal-store.mjs').RunJournalStore,
 *   reviewFolder: import('../ports/review-folder.mjs').ReviewFolder,
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
 *   journalKeys: import('../ports/journal-keys.mjs').JournalKeys,
 *   reviewLock: import('../ports/run-lock.mjs').RunLock,
 *   timer: import('../ports/timer.mjs').Timer,
 * }} ReviewDeps
 *   reviewLock: the lease of `.copilot-tracking/skraft-reviews/pr-<number>/`: one session reviews
 *   a pull request at a time.
 * @typedef {ReviewDeps & { pullRequests: import('../ports/pull-requests.mjs').PullRequests }} OnForge
 *   the pull requests of the forge the working copy is on.
 * @typedef {{ stop: { code: string, reason: string } }} Stop
 * @typedef {{
 *   config: import('../../domain/config/skraft-config.mjs').SkraftConfig, team: unknown,
 *   review: Extract<Awaited<ReturnType<typeof loadReview>>, { ok: true }>,
 *   pullRequest: import('../ports/pull-requests.mjs').PullRequestFacts,
 *   base: import('./review-runs.mjs').ReviewInputs['base'],
 * }} Prepared
 * @typedef {Prepared & { deps: OnForge, request: ReviewRequest, slug: string, journal: import('../journal/run-journal.mjs').OpenJournal }} Context
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

/**
 * A journal another writer changed under the review, or a lease another session took, stops it.
 * @param {ReviewDeps} deps @param {ReviewRequest} request
 */
const reviewGuarded = async (deps, request) => {
  try {
    return await reviewOf(deps, request)
  } catch (error) {
    if (error instanceof LockLost) return stopped(request.number, null, { code: 'lock-lost', reason: reviewLostReason(request.number) })
    if (!(error instanceof JournalConflict)) throw error
    return stopped(request.number, null, { code: 'journal-changed', reason: error.message })
  }
}

/** @param {ReviewDeps} deps @param {ReviewRequest} request @returns {Promise<ReviewOutcome>} */
const reviewOf = async (deps, request) => {
  if (!(await deps.reviewFolder.contained())) return stopped(request.number, null, { code: 'review-folder-linked', reason: LINKED_FOLDER })
  return reviewOn(await onForge(deps), request)
}

/**
 * The pull requests of the working copy's forge: the one the developer's own files name
 * (~/.skraft/config.json, skraft-config.local.json), else the one its remote names, also when
 * those files cannot be read. The team's skraft-config.json at the pull request's head, which its
 * author wrote, chooses no forge.
 * @param {ReviewDeps} deps @returns {Promise<OnForge>}
 */
const onForge = async (deps) => {
  const { workspace, userSettings } = deps
  const personal = readConfigLayers({ user: await userSettings.read(), team: null, local: await workspace.read(LOCAL_CONFIG_FILE) })
  const { pullRequests } = await forgeAdapters(deps, personal.ok ? personal.config.forge : null)
  return { ...deps, pullRequests }
}

/** @param {OnForge} deps @param {ReviewRequest} request @returns {Promise<ReviewOutcome>} */
const reviewOn = async (deps, request) => {
  const prepared = await prepare(deps, request)
  if ('stop' in prepared) return stopped(request.number, null, prepared.stop)
  const slug = reviewSlug(request.number)
  const lock = await holdRun({ runLock: deps.reviewLock, timer: deps.timer, clock: deps.clock }, slug, { handedBack: request.handedBack === true })
  if (!lock.ok) return stopped(request.number, null, refusedLease(request.number, lock.outcome))
  return reviewHeld({ ...prepared, deps, request, slug }, lock.held)
}

/** What a refused lease says of the review, by the code holdRun gives. @type {Record<string, (number: number) => string>} */
const LEASE_REASONS = { 'pipeline-locked': reviewHeldReason, 'lock-lost': reviewLostReason, 'lock-unavailable': reviewUnavailableReason }

/** The lease refused, said of the pull request's review. @param {number} number @param {{ code: string }} refusal */
const refusedLease = (number, { code }) => ({ code, reason: LEASE_REASONS[code](number) })

/**
 * The review while this session holds its lease, on its signed journal; then the lease ended,
 * or left for the agents it handed over.
 * @param {Omit<Context, 'journal'>} context @param {import('../pipeline/run-lock.mjs').HeldRun} held
 * @returns {Promise<ReviewOutcome>}
 */
const reviewHeld = async (context, held) => {
  try {
    return await reviewOpened(context, held)
  } catch (error) {
    await leftForAgents(context.deps, held, error)
    throw error
  } finally {
    await held.release()
  }
}

/** @param {Omit<Context, 'journal'>} context @param {import('../pipeline/run-lock.mjs').HeldRun} held @returns {Promise<ReviewOutcome>} */
const reviewOpened = async (context, held) => {
  await context.deps.agentRunner.held?.()
  const opened = await openSigned(context.deps, context.request.number)
  if ('stop' in opened) return stopped(context.request.number, null, opened.stop)
  return reviewPass({ ...context, journal: writingWhileHeld(opened.journal, held, context.slug) })
}

/** When the error is the agent runner's hand-over, the lease is left for its agents. @param {ReviewDeps} deps @param {import('../pipeline/run-lock.mjs').HeldRun} held @param {unknown} error */
const leftForAgents = async (deps, held, error) => {
  const agents = deps.agentRunner.handedOver?.(error) ?? null
  if (agents !== null) await held.handOver(agents)
}

/** Where the key that signs a review journal is kept, when the machine names no such folder. */
const NO_KEY_FOLDER = 'the environment names no home folder (HOME or USERPROFILE), where the key that signs the review journal is kept; set it and review again'

/**
 * The review's journal, signed under a key of this machine: refused when the machine has nowhere
 * to keep one, when the chain breaks, or when it cannot verify the journal.
 * @param {ReviewDeps} deps @param {number} number
 * @returns {Promise<{ journal: import('../journal/run-journal.mjs').OpenJournal } | Stop>}
 */
const openSigned = async (deps, number) => {
  if (!(await deps.journalKeys.available())) return stop('journal-key-unavailable', NO_KEY_FOLDER)
  const opened = await openJournal(reviewJournalOf(deps, number), reviewSlug(number))
  return opened.ok ? opened : stop(opened.code, opened.reason)
}

/**
 * Everything the review needs before its journal: the pull request, the base of its changes, and
 * the configuration and the review workflow as its base commit holds them.
 * @param {OnForge} deps @param {ReviewRequest} request @returns {Promise<Prepared | Stop>}
 */
const prepare = async (deps, { number }) => {
  const read = await pullRequestOf(deps, number)
  if ('stop' in read) return read
  const base = await baseOf(deps, read.pullRequest)
  if ('stop' in base) return base
  const settings = await settingsAt(deps, read.pullRequest.base.sha)
  // Stryker disable next-line StringLiteral: a stop spread with the pull request is still a stop to its caller
  return 'stop' in settings ? settings : { ...settings, pullRequest: read.pullRequest, base: base.base }
}

/**
 * skraft-config.json and the review workflow as the base commit holds them: what the pull
 * request's head says counts for nothing; a file the base lacks is the plugin's default.
 * @param {ReviewDeps} deps @param {string} sha the base commit
 * @returns {Promise<Pick<Prepared, 'config' | 'team' | 'review'> | Stop>}
 */
const settingsAt = async (deps, sha) => {
  const atBase = { ...deps, workspace: committedAt(deps.sourceControl, sha) }
  const config = await loadConfig(atBase)
  if (!config.ok) return stop('config-invalid', config.reason)
  const review = await loadReview(atBase)
  if (!review.ok) return stop('workflow-invalid', review.reason)
  return { config: config.config, team: config.raw.publish?.reviewComment, review }
}

/**
 * The files of the working copy as a commit holds them, and their list.
 * @param {import('../ports/source-control.mjs').SourceControl} sourceControl @param {string} sha
 * @returns {import('./review-runs.mjs').CommittedFiles}
 */
const committedAt = (sourceControl, sha) => Object.freeze({
  // Stryker disable next-line StringLiteral: '' and '.' are both the working copy to SourceControl
  read: (path) => sourceControl.show('.', sha, path),
  // Stryker disable next-line StringLiteral: '' and '.' are both the working copy to SourceControl
  files: () => sourceControl.filesAt('.', sha),
})

/** @param {string} code @param {string} reason @returns {Stop} */
const stop = (code, reason) => ({ stop: { code, reason } })

/**
 * The pull request, once the forge can be asked and has it.
 * @param {OnForge} deps @param {number} number
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
 * @param {OnForge} deps @param {import('../ports/pull-requests.mjs').PullRequestFacts} pullRequest
 * @returns {Promise<{ base: Prepared['base'] } | Stop>}
 */
const baseOf = async ({ sourceControl, reviewFolder, pullRequests }, { number, base, head }) => {
  // Stryker disable next-line StringLiteral: '' and '.' are both the working copy to SourceControl
  if ((await sourceControl.head('.')) !== head.sha) return stop('pr-not-checked-out', `the working copy is not on the head of pull request #${number} (${head.sha}); check it out first: ${pullRequests.checkoutCommand(number)}`)
  const dirty = await uncommitted(sourceControl, head.sha)
  if (dirty !== null) return stop('working-copy-dirty', dirty)
  // Stryker disable next-line StringLiteral: '' and '.' are both the working copy to SourceControl
  const sha = await sourceControl.mergeBase('.', base.sha)
  if (sha === null) return stop('pr-base-missing', `Git finds no merge base with ${base.ref} at ${base.sha}; fetch it first: git fetch origin ${base.ref}`)
  const carried = await carriedState({ sourceControl, reviewFolder }, { number, head: head.sha, since: sha })
  if (carried !== null) return stop('review-state-committed', carried)
  // Stryker disable next-line StringLiteral: '' and '.' are both the working copy to the review's paths
  return { base: /** @type {Prepared['base']} */ ([{ repository: '.', sha }]) }
}

/** Why the review keeps no state where the working copy's review folder leads. */
const LINKED_FOLDER = 'the review folder .copilot-tracking/skraft-reviews/ of this working copy is a link, lies under one, is not a folder, or could not be checked; the review keeps its state only in the working copy: remove what stands there, then review again'

/** Where every pull request review keeps its state, relative to the working copy. */
const REVIEW_STATE = '.copilot-tracking/skraft-reviews/'

/** A Windows short name (8.3), which may open any long one: `COPILO~1`, `SKRAFT~12.TXT`. */
const SHORT_NAME = /^[^.~]{1,6}~\d+(\.[^.]{0,3})?$/i

/**
 * A path segment as macOS and Windows may open it: composed, case folded through upper case
 * (`ſ` opens as `s`), trailing dots and spaces dropped.
 * @param {string} segment
 */
const folded = (segment) => segment.normalize('NFC').toUpperCase().toLowerCase().replace(/[. ]+$/, '')

/** @param {string} segment @param {string} name */
const opensAs = (segment, name) => folded(segment) === name || SHORT_NAME.test(segment)

/**
 * Whether a path the pull request holds may open as review state, or as a file or link in place
 * of one of its folders, under any spelling those file systems fold onto theirs.
 * @param {string} path
 */
const isReviewState = (path) => {
  const [tracking, reviews] = path.split('/')
  if (!opensAs(tracking, '.copilot-tracking')) return false
  return reviews === undefined || opensAs(reviews, 'skraft-reviews')
}

/**
 * Why the pull request may carry review state of its own: files of the review folder its head
 * holds or its commits changed, by their names, then those the working copy opens as such
 * whatever their spelling; null when it carries none.
 * @param {Pick<ReviewDeps, 'sourceControl' | 'reviewFolder'>} deps
 * @param {{ number: number, head: string, since: string }} pull since: the merge base
 * @returns {Promise<string | null>}
 */
const carriedState = async ({ sourceControl, reviewFolder }, { number, head, since }) => {
  // Stryker disable next-line StringLiteral: '' and '.' are both the working copy to SourceControl
  const [held, commits] = await Promise.all([sourceControl.filesAt('.', head), sourceControl.commits('.', since)])
  if (held === null || commits === null) return `Git could not list the files the head of pull request #${number} holds, so no review state it may carry can be ruled out`
  const carried = new Set([...held, ...commits.flatMap(({ files }) => files)].filter(isReviewState))
  if (carried.size > 0) return `the commits of pull request #${number} hold ${carried.size} files under ${REVIEW_STATE} or in place of one of its folders; a review never takes its state from a pull request: remove them from it`
  return (await reviewFolder.holdsTracked(held)) ? spelledReason(number) : null
}

/** @param {number} number */
const spelledReason = (number) =>
  `the head of pull request #${number} holds files this working copy opens as ${REVIEW_STATE} or in place of one of its folders, under another spelling, or the working copy could not tell; a review never takes its state from a pull request: remove them from it`

/**
 * Why the working copy holds more than the pull request's head: the files changed since it, the
 * tracking folder left out; null when it holds nothing else.
 * @param {import('../ports/source-control.mjs').SourceControl} sourceControl @param {string} head
 * @returns {Promise<string | null>}
 */
const uncommitted = async (sourceControl, head) => {
  // Stryker disable next-line StringLiteral: '' and '.' are both the working copy to SourceControl
  const changed = await sourceControl.changedFiles('.', head)
  if (changed === null) return 'Git could not tell whether the working copy has uncommitted changes; check git status, then review again'
  // Stryker disable next-line StringLiteral: '' and '.' are both the working copy to the review's paths
  const paths = reviewedPaths(changed, '.')
  return paths.length === 0 ? null : `the working copy has uncommitted changes (${paths.join(', ')}); commit or stash them, then review again`
}

/**
 * One pass of the review: opened, or picked up when the last one stopped; its lenses and the
 * refuter answer; its verdict journaled.
 * @param {Context} context @returns {Promise<ReviewOutcome>}
 */
const reviewPass = async (context) => {
  const pass = await openPass(context)
  context.deps.progress.log(`${context.slug}: review of pull request #${context.request.number}${pass.visit > 1 ? `, pass ${pass.visit}` : ''} (${context.review.node.lenses.join(', ')}) — ${assignmentsText(pass.assignments.lenses, context.deps.agentRunner.host)}`)
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
const reviewRun = ({ deps, slug, journal, review, pullRequest }, { visit, assignments }) => ({
  deps: { ...deps, files: deps.reviewFiles },
  slug, journal, assignments, sources: review.sources, rulesAt: committedAt(deps.sourceControl, pullRequest.base.sha),
  step: /** @type {import('../../domain/pipeline/next-step.mjs').WorkStep} */ ({ node: review.node, visit, phase: review.phase }),
})

/** @param {Context} context */
const inputsOf = ({ deps, slug, pullRequest, base, config, review, request }) => pullRequestInputs(deps, {
  slug, pullRequest, base, components: config.components, declared: review.inputs, workingCopyName: request.workingCopyName,
  committed: committedAt(deps.sourceControl, pullRequest.base.sha),
})

/**
 * The pass the review is on, counted over the pull request's journal: the last one again while it
 * holds no verdict, else a new one, journaled; its lenses and refuter run on what the base's
 * configuration says, never on what the journal holds.
 * @param {Context} context @returns {Promise<Pass>}
 */
const openPass = async ({ deps, journal, review, config, pullRequest, base }) => {
  const step = review.node.id
  const { lenses, refuter } = reviewAssignmentsOf(config, review.node)
  const last = journal.events.findLast((event) => event.type === 'step.started')
  if (last && !journal.events.some((event) => event.type === 'step.recorded' && event.visit === last.visit)) return { visit: last.visit, assignments: { lenses, refuter } }
  const visit = (last?.visit ?? 0) + 1
  await journal.append('step.started', { step, phase: review.phase, pullRequest: pullRequest.number, base: base[0].sha, head: pullRequest.head.sha, lenses: review.node.lenses, visit, attempt: 1, assignments: lenses, refuter, host: deps.agentRunner.host })
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
const commentOf = ({ deps, slug, request, journal, team }, { visit }, verdict) => keepComment({ deps, slug, number: request.number, publish: request.publish, journal, team }, { pass: visit, verdict })

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

/**
 * A pull request's review journal, with what a person types for it.
 * @param {Pick<ReviewDeps, 'reviewJournal' | 'hasher' | 'clock' | 'journalKeys'>} deps @param {number} number
 * @returns {import('../journal/run-journal.mjs').JournalDeps}
 */
export const reviewJournalOf = (deps, number) =>
  ({ journal: deps.reviewJournal, hasher: deps.hasher, clock: deps.clock, journalKeys: deps.journalKeys, commands: reviewJournalCommands(number) })
