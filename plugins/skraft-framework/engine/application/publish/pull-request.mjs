import { CONFIG_FILE } from '../../domain/config/skraft-config.mjs'
import { adrNumber, adrTitle } from '../../domain/decisions/adr.mjs'
import { deriveRun } from '../../domain/journal/run-state.mjs'
import { PULL_REQUEST_BODY_FILE, PULL_REQUEST_FILE, renderPullRequest } from '../../domain/reporting/pull-request.mjs'
import { readProse } from '../../domain/reporting/pull-request-prose.mjs'
import { finalGates, matrixPaths, modelsOf, redCommits, reviewFacts, testPlanPaths } from '../../domain/reporting/run-facts.mjs'
import { runReport } from '../../domain/reporting/run-report.mjs'
import { statusLine } from '../../domain/reporting/run-status.mjs'
import { branchOf } from '../../domain/reporting/branches.mjs'
import { languageOf } from '../../domain/reporting/language.mjs'
import { keepRunDetails } from './run-details.mjs'
import { failedOutcome, journalWrite, pushedBranch } from './forge-writes.mjs'
import { CREATE_STARTED, FORGE_WRITE } from '../../domain/reporting/forge-writes.mjs'
import { forgeAdapters } from '../config/forge.mjs'

/**
 * The pull request of a run: its description rendered from the journal into the tracking
 * folder, then, with the developer's consent and a forge to reach, the branch pushed and its
 * pull request opened, or updated when its body changed. What stops the publication is a
 * reason the run reports, never an error: the description stays in the tracking folder and
 * `skraft publish` tries again.
 *
 * @typedef {{
 *   files: import('../ports/tracking-files.mjs').TrackingFiles,
 *   workspace: import('../ports/workspace.mjs').Workspace,
 *   hasher: import('../ports/hasher.mjs').Hasher,
 * } & import('../config/forge.mjs').ForgeDeps} PublishDeps
 * @typedef {Omit<PublishDeps, 'forges'> & { codeHost: import('../ports/code-host.mjs').CodeHost }} OnForge
 *   the code host of the forge the configuration chooses.
 * @typedef {{
 *   slug: string, journal: import('../journal/run-journal.mjs').OpenJournal,
 *   config: import('../../domain/config/skraft-config.mjs').SkraftConfig,
 *   workflow: import('../../domain/workflow/workflow.mjs').Workflow, requested?: boolean,
 * }} PublishRequest
 *   requested: the developer typed skraft publish, which consents for this publication whatever
 *   skraft-config.json answers.
 * @typedef {{ published: boolean, reason: string, number?: number }} Publication
 * @typedef {{ ok: true, base: string, head: string, defaultBranch: string } | { ok: false, reason: string }} Target
 */

/** @param {PublishDeps} deps @param {PublishRequest} request @returns {Promise<Publication>} */
export const publishPullRequest = async (deps, request) => {
  const { codeHost } = await forgeAdapters(deps, request.config.forge)
  return publishOn({ ...deps, codeHost }, request)
}

/** @param {OnForge} deps @param {PublishRequest} request @returns {Promise<Publication>} */
const publishOn = async (deps, request) => {
  const run = deriveRun(request.journal.events)
  const target = await targetOf(deps, request, run)
  const facts = { ...(await factsOf(deps, request, run)), link: linkOf(deps.codeHost, run.story, target), bodyLimit: deps.codeHost.bodyLimit, commentLimit: deps.codeHost.commentLimit }
  const rendered = renderPullRequest(facts)
  await deps.files.write(request.slug, PULL_REQUEST_FILE, rendered.description)
  await deps.files.write(request.slug, PULL_REQUEST_BODY_FILE, rendered.body)
  if (!target.ok) return notOpened(target.reason)
  return pushAndOpen(deps, request, { target, title: rendered.title, body: rendered.body, details: rendered.details, language: facts.language })
}

/**
 * The line the forge links the pull request to its story's issue with, closing it when the pull
 * request targets the default branch; none for a run without an issue.
 * @param {OnForge['codeHost']} codeHost @param {import('../../domain/journal/run-state.mjs').RunState['story']} story @param {Target} target
 */
const linkOf = (codeHost, story, target) => (story?.issue ? codeHost.storyLink(story.issue, target.ok && target.base === target.defaultBranch) : null)

/** @param {string} reason @returns {Publication} */
const notOpened = (reason) => ({ published: false, reason: `pull request not opened: ${reason}; ${PULL_REQUEST_FILE} holds its description, and skraft publish opens it once that is fixed` })

/**
 * Where the pull request goes: from the branch HEAD is on to the branch the working copy's
 * repository diffs against, the first base the run journaled.
 * @param {OnForge} deps @param {PublishRequest} request @param {import('../../domain/journal/run-state.mjs').RunState} run
 * @returns {Promise<Target>}
 */
const targetOf = async ({ codeHost }, { config, requested = false }, run) => {
  if (!requested && config.publish.pullRequest !== true) return { ok: false, reason: consentReason(config.publish.pullRequest) }
  const unavailable = await codeHost.unavailable()
  if (unavailable !== null) return { ok: false, reason: unavailable }
  const own = run.base[0]
  const base = own === undefined ? null : branchOf(own.ref, await codeHost.remotes())
  if (base === null) return { ok: false, reason: 'the run\'s base names no branch (a sha or a revision): set baseBranch in skraft-config.json, or start the run with --base <branch>' }
  return branchesOf(codeHost, base)
}

/** @param {boolean | null} given */
const consentReason = (given) => (given === null
  ? `nobody answered the publish-consent question yet (publish.pullRequest in ${CONFIG_FILE})`
  : `${CONFIG_FILE} sets publish.pullRequest to false`)

/**
 * The head: the branch HEAD is on, which is neither the base nor the default branch.
 * @param {OnForge['codeHost']} codeHost @param {string} base @returns {Promise<Target>}
 */
const branchesOf = async (codeHost, base) => {
  const head = await codeHost.currentBranch()
  if (head === null) return { ok: false, reason: 'HEAD is detached, on no branch to push' }
  const defaultBranch = await codeHost.defaultBranch()
  if (defaultBranch === null) return { ok: false, reason: 'the forge does not say which branch is the repository\'s default, so nothing is pushed' }
  if (head === base || head === defaultBranch) return { ok: false, reason: `HEAD is on ${head}, the branch the pull request would merge into` }
  return { ok: true, base, head, defaultBranch }
}

/**
 * The facts the description shows, from the journal, the pr-writer's prose and the ADRs.
 * @param {OnForge} deps @param {PublishRequest} request @param {import('../../domain/journal/run-state.mjs').RunState} run
 */
const factsOf = async (deps, { slug, journal }, run) => ({
  slug,
  story: run.story,
  language: await languageIn(deps, slug, run),
  prose: await proseOf(deps, slug, journal.events),
  adrs: await ratifiedAdrs(deps, journal.events),
  repository: await deps.codeHost.repository(),
  testPlans: await trackedDocuments(deps, slug, testPlanPaths(journal.events)),
  matrices: await trackedDocuments(deps, slug, matrixPaths(journal.events)),
  ...journalFacts(journal.events, run),
})

/**
 * The story's language, French or English, from its title and the issue the run kept in the
 * tracking folder (title and body as the forge gave them); English when it has neither.
 * @param {OnForge} deps @param {string} slug @param {import('../../domain/journal/run-state.mjs').RunState} run
 */
const languageIn = async ({ files }, slug, run) => {
  const kept = run.artifacts.find((path) => /(?:^|\/)issue-\d+\.md$/.test(path))
  const text = kept === undefined ? null : await files.read(slug, kept)
  return languageOf(`${run.story?.title ?? ''}\n${text ?? ''}`)
}

/**
 * The documents of the tracking folder the journal names, each with its path; those the folder lost are left out.
 * @param {OnForge} deps @param {string} slug @param {string[]} paths
 */
const trackedDocuments = async ({ files }, slug, paths) => {
  const documents = await Promise.all(paths.map(async (path) => ({ path, text: await files.read(slug, path) })))
  return documents.filter(({ text }) => text !== null).map(({ path, text }) => ({ path, text: /** @type {string} */ (text) }))
}

/**
 * What the journal alone tells: the gates unlocked, the red commits, the gates, the review, the
 * run report and the models.
 * @param {import('../../domain/journal/run-state.mjs').RunEvent[]} events @param {import('../../domain/journal/run-state.mjs').RunState} run
 */
const journalFacts = (events, run) => ({
  unlocked: events[0].unlocked,
  reds: redCommits(events),
  gates: finalGates(events),
  review: reviewFacts(events),
  status: statusLine(run),
  report: runReport(events),
  models: modelsOf(events),
  visuals: lastVisuals(events),
})

/**
 * What the run's last visuals step recorded; null when none ran.
 * @param {import('../../domain/journal/run-state.mjs').RunEvent[]} events
 * @returns {import('../../domain/reporting/visuals.mjs').Visuals | null}
 */
const lastVisuals = (events) => {
  const last = events.findLast((event) => event.type === 'visuals.recorded')
  return last === undefined ? null : { commit: last.commit, components: last.components }
}

/**
 * What the pr-writer wrote, read from the output its journaled step.started names (the only event
 * that carries a phase agent), whatever the workflow
 * says since; null when the run started no pr-writer.
 * @param {OnForge} deps @param {string} slug @param {import('../../domain/journal/run-state.mjs').RunEvent[]} events
 */
const proseOf = async ({ files }, slug, events) => {
  const started = events.findLast((event) => event.agent === PR_WRITER)
  const text = started === undefined ? null : await files.read(slug, started.outputs[0])
  return text === null ? null : readProse(text)
}

/** The agent that writes the prose of the pull request. */
export const PR_WRITER = 'pr-writer'

/**
 * The ADRs a human ratified in this run, with their number and title: RATIFIED answers only an ADR ratification.
 * @param {OnForge} deps @param {import('../../domain/journal/run-state.mjs').RunEvent[]} events
 */
const ratifiedAdrs = async ({ workspace }, events) => {
  const run = deriveRun(events)
  const paths = Object.values(run.questions).filter(({ answer }) => answer === 'RATIFIED').flatMap(({ subjects }) => subjects)
  const adrs = []
  for (const path of paths) adrs.push({ path, number: /** @type {number} */ (adrNumber(path)), title: adrTitle(/** @type {string} */ (await workspace.read(path))) })
  return adrs
}

/**
 * Pushes the branch, then opens its pull request, or updates the open one when its body changed;
 * once it is up to date, its run details are kept in comments when the body sends to them. A
 * branch the remote does not show at the local commit gets no pull request.
 * @param {OnForge} deps @param {PublishRequest} request
 * @param {{ target: Extract<Target, { ok: true }>, title: string, body: string, details: string[], language: import('../../domain/reporting/language.mjs').Language }} pull
 * @returns {Promise<Publication>}
 */
const pushAndOpen = async (deps, request, pull) => {
  const pushed = await pushedBranch(request.journal, deps.codeHost, pull.target.head)
  if (!pushed.ok) return notOpened(pushed.reason)
  const open = await deps.codeHost.findPullRequest(pull.target.head)
  if (!open.ok) return notOpened(open.reason)
  const done = await settled(deps, request, { pull, open })
  return done.published ? withDetails(deps, request, { done, details: pull.details, language: pull.language }) : done
}

/**
 * @param {OnForge} deps @param {PublishRequest} request
 * @param {{ pull: { target: Extract<Target, { ok: true }>, title: string, body: string }, open: { found: FoundPullRequest | null } }} found
 * @returns {Promise<Publication & { number?: number }>}
 */
const settled = async (deps, request, { pull, open }) => {
  const located = { ...pull, bodyFile: deps.files.location(request.slug, PULL_REQUEST_BODY_FILE), bodyHash: await hashOf(deps, pull.body) }
  const unsettled = unsettledOpening(request.journal.events, pull.target.head)
  if (open.found === null) return unsettled === null ? opened(deps, request, located) : notOpened(unsettledReason(pull.target.head))
  if (open.found.state !== 'open') return notOpened(`pull request #${open.found.number} of ${pull.target.head} is ${open.found.state}, and skraft opens no other one`)
  const whole = await deps.codeHost.readPullRequest(open.found.number)
  if (!whole.ok || whole.found === null) return notOpened(whole.ok ? unreadReason(open.found.number) : whole.reason)
  const live = { ...located, found: whole.found, liveHash: await hashOf(deps, whole.found.body) }
  return unsettled === null ? updated(deps, request, live) : reconciled(deps, request, { ...live, sent: unsettled.bodyHash })
}

/** @param {number} number */
const unreadReason = (number) => `pull request #${number} is listed by its branch, but the forge does not give it by its number`

/**
 * The last opening of the branch's pull request when it started and never settled: cut before
 * the forge answered, answered without an answer, or not shown when read back; null otherwise. A
 * refusal settles it: nothing was opened.
 * @param {import('../../domain/journal/run-state.mjs').RunEvent[]} events @param {string} head
 * @returns {import('../../domain/journal/run-state.mjs').RunEvent | null}
 */
const unsettledOpening = (events, head) => {
  const started = events.findLastIndex((event) => event.type === CREATE_STARTED && event.head === head)
  if (started === -1) return null
  const told = events.slice(started).findLast((event) => event.type === FORGE_WRITE && event.write === CREATE)
  return told === undefined || UNSETTLED.includes(told.outcome) ? events[started] : null
}

/** The outcomes of an opening that may have opened a pull request skraft never saw. */
const UNSETTLED = ['unknown', 'verification-failed']

/** The write that opens a pull request, as the journal names it. */
const CREATE = 'pull-request-create'

/** @param {string} head */
const unsettledReason = (head) => `an earlier opening of the pull request of ${head} was cut or not shown, and the forge lists none for ${head}: skraft opens no other one; open it by hand, or check the forge`

/**
 * The pull request an unsettled opening left, found again by its head: taken only when it comes
 * from the repository skraft pushed to and holds the very description that opening sent, so that
 * a pull request a human opened, or a fork's of the same branch name, is never written to; then
 * journaled opened and brought up to date like any other.
 * @param {OnForge} deps @param {PublishRequest} request
 * @param {Located & { found: import('../ports/code-host.mjs').ReadPullRequest, liveHash: string, sent: string }} pull
 * @returns {Promise<Publication>}
 */
const reconciled = async (deps, request, pull) => {
  const refusal = foreignReason(pull)
  return refusal === null ? adopted(deps, request, pull) : notOpened(refusal)
}

/**
 * Why the pull request found is not the one the opening left; null when it is.
 * @param {{ found: import('../ports/code-host.mjs').ReadPullRequest, target: Extract<Target, { ok: true }>, liveHash: string, sent: string }} pull
 */
const foreignReason = ({ found, target, liveHash, sent }) => {
  if (found.fromFork) return `pull request #${found.number} of ${target.head} comes from a fork, not from the repository skraft pushed to: skraft writes nothing on it`
  if (liveHash !== sent) return `pull request #${found.number} of ${target.head} does not hold the description skraft sent when it opened one, so skraft did not open it and does not overwrite it`
  return null
}

/**
 * The opening's pull request, journaled opened with the body it sent, then brought up to date.
 * @param {OnForge} deps @param {PublishRequest} request @param {Located & { found: import('../ports/code-host.mjs').ReadPullRequest, liveHash: string }} pull
 * @returns {Promise<Publication>}
 */
const adopted = async (deps, request, pull) => {
  const { found, target, liveHash } = pull
  await request.journal.append('pull-request.opened', { number: found.number, url: found.url, base: target.base, head: target.head, draft: request.config.publish.draft, bodyHash: liveHash, reconciled: true })
  await journalWrite(request.journal, { write: CREATE, subject: target.head }, { outcome: 'applied' })
  const done = await updated(deps, request, pull)
  return { ...done, reason: `found again after an opening that was cut; ${done.reason}` }
}

/** @typedef {import('../ports/code-host.mjs').FoundPullRequest} FoundPullRequest */

/** What follows the reason of a publication about its run details: nothing for a body that holds them. @param {import('./run-details.mjs').DetailsOutcome} outcome */
const detailsNote = (outcome) => {
  if (!outcome.ok) return `; its run details were not kept: ${outcome.reason}; ${DETAILS_FILE} holds them, and skraft publish keeps them once that is fixed`
  if (outcome.parts === 0) return ''
  return `; its run details were kept in ${outcome.parts} comment${outcome.parts === 1 ? '' : 's'}, the first at ${outcome.first}`
}

/** The file that holds the whole description, the run details included, as the tracking folder keeps it. */
const DETAILS_FILE = PULL_REQUEST_FILE

/**
 * The publication, its reason followed by where the run details are, or why they were not kept.
 * @param {OnForge} deps @param {PublishRequest} request @param {{ done: Publication & { number?: number }, details: string[], language: import('../../domain/reporting/language.mjs').Language }} kept
 * @returns {Promise<Publication>}
 */
const withDetails = async (deps, request, { done, details, language }) => {
  const outcome = await keepRunDetails(deps, request, { number: /** @type {number} */ (done.number), details, language })
  return { published: true, reason: `${done.reason}${detailsNote(outcome)}` }
}

/** A body's hash, its line endings and trailing blanks as the forge may change them left out. @param {OnForge} deps @param {string} body */
const hashOf = ({ hasher }, body) => hasher.sha256(body.replace(/\r\n/g, '\n').trimEnd())

/**
 * @typedef {{ target: Extract<Target, { ok: true }>, title: string, bodyFile: string, body: string, bodyHash: string }} Located
 */

/**
 * The pull request opened, its opening journaled first so that a run resumed after a cut finds it
 * again, then read back by its head: opened only once the forge lists it.
 * @param {OnForge} deps @param {PublishRequest} request @param {Located} pull @returns {Promise<Publication>}
 */
const opened = async ({ codeHost }, { journal, config }, { target, title, bodyFile, body, bodyHash }) => {
  const { base, head } = target
  const write = { write: CREATE, subject: head }
  await journal.append(CREATE_STARTED, { base, head, bodyHash })
  const made = await codeHost.create({ base, head, title, bodyFile, body, draft: config.publish.draft, issue: deriveRun(journal.events).story?.issue ?? null })
  if (!made.ok) return unwritten(journal, write, made)
  if (!(await listed(codeHost, head, made.number))) return unwritten(journal, write, { reason: `the forge said it opened pull request #${made.number} of ${head}, but listing the pull requests of ${head} does not show it`, outcome: 'verification-failed' })
  await journal.append('pull-request.opened', { number: made.number, url: made.url, base, head, draft: config.publish.draft, bodyHash })
  await journalWrite(journal, write, { outcome: 'applied' })
  return { published: true, number: made.number, reason: `pull request #${made.number} opened${config.publish.draft ? ' as a draft' : ''}: ${made.url}${made.note === undefined ? '' : `; ${made.note}`}` }
}

/** Whether the forge lists that pull request as the latest of the branch. @param {OnForge['codeHost']} codeHost @param {string} head @param {number} number */
const listed = async (codeHost, head, number) => {
  const found = await codeHost.findPullRequest(head)
  return found.ok && found.found?.number === number
}

/**
 * A write that did not happen, or nobody knows whether it did: journaled, and the pull request not opened.
 * @param {PublishRequest['journal']} journal @param {{ write: string, subject: string }} write
 * @param {{ reason: string, outcome?: 'refused' | 'unknown' | 'verification-failed' }} failed @returns {Promise<Publication>}
 */
const unwritten = async (journal, write, failed) => {
  await journalWrite(journal, write, { outcome: failedOutcome(failed), reason: failed.reason })
  return notOpened(failed.reason)
}

/**
 * The open pull request's body replaced, then read back: already this one, it is up to date; one
 * that is not the body skraft last wrote there (a human edited it, or skraft never wrote it) stays
 * as it is; one the forge does not show replaced when read back is not updated.
 * @param {OnForge} deps @param {PublishRequest} request @param {Located & { found: { number: number, url: string }, liveHash: string }} pull
 * @returns {Promise<Publication>}
 */
const updated = async (deps, { journal }, { found, bodyFile, body, bodyHash, liveHash }) => {
  if (liveHash === bodyHash) return { published: true, number: found.number, reason: `pull request #${found.number} is up to date: ${found.url}` }
  if (lastHash(journal.events, found.number) !== liveHash) return notOpened(`pull request #${found.number} was edited since skraft last wrote its body, which stays as it is`)
  const write = { write: 'pull-request-edit', subject: String(found.number) }
  const edited = await deps.codeHost.edit({ number: found.number, bodyFile, body })
  if (!edited.ok) return unwritten(journal, write, edited)
  if (!(await bodyShown(deps, found.number, bodyHash))) return unwritten(journal, write, { reason: `the forge said it updated pull request #${found.number}, but reading it back does not show the new body`, outcome: 'verification-failed' })
  await journal.append('pull-request.updated', { number: found.number, url: found.url, bodyHash })
  await journalWrite(journal, write, { outcome: 'applied' })
  return { published: true, number: found.number, reason: `pull request #${found.number} updated: ${found.url}` }
}

/** Whether the pull request, read back by its number, holds the whole body of that hash. @param {OnForge} deps @param {number} number @param {string} bodyHash */
const bodyShown = async (deps, number, bodyHash) => {
  const read = await deps.codeHost.readPullRequest(number)
  return read.ok && read.found !== null && (await hashOf(deps, read.found.body)) === bodyHash
}

/** @param {import('../../domain/journal/run-state.mjs').RunEvent[]} events @param {number} number */
const lastHash = (events, number) => events.findLast((event) => event.number === number && BODY_EVENTS.includes(event.type))?.bodyHash

/** The events that tell the body skraft last wrote. */
const BODY_EVENTS = ['pull-request.opened', 'pull-request.updated']
