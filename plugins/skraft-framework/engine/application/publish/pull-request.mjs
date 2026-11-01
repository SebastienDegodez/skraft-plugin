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
 * once it is up to date, its run details are kept in comments when the body sends to them.
 * @param {OnForge} deps @param {PublishRequest} request
 * @param {{ target: Extract<Target, { ok: true }>, title: string, body: string, details: string[], language: import('../../domain/reporting/language.mjs').Language }} pull
 * @returns {Promise<Publication>}
 */
const pushAndOpen = async (deps, request, pull) => {
  const pushed = await deps.codeHost.push(pull.target.head)
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
  if (open.found === null) return opened(deps, request, located)
  if (open.found.state !== 'open') return notOpened(`pull request #${open.found.number} of ${pull.target.head} is ${open.found.state}, and skraft opens no other one`)
  return updated(deps, request, { ...located, found: open.found, liveHash: await hashOf(deps, open.found.body) })
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

/** @param {OnForge} deps @param {PublishRequest} request @param {Located} pull @returns {Promise<Publication>} */
const opened = async ({ codeHost }, { journal, config }, { target, title, bodyFile, body, bodyHash }) => {
  const { base, head } = target
  const made = await codeHost.create({ base, head, title, bodyFile, body, draft: config.publish.draft, issue: deriveRun(journal.events).story?.issue ?? null })
  if (!made.ok) return notOpened(made.reason)
  await journal.append('pull-request.opened', { number: made.number, url: made.url, base, head, draft: config.publish.draft, bodyHash })
  return { published: true, number: made.number, reason: `pull request #${made.number} opened${config.publish.draft ? ' as a draft' : ''}: ${made.url}${made.note === undefined ? '' : `; ${made.note}`}` }
}

/**
 * The open pull request's body replaced: already this one, it is up to date; one that is not the
 * body skraft last wrote there (a human edited it, or skraft never wrote it) stays as it is.
 * @param {OnForge} deps @param {PublishRequest} request @param {Located & { found: { number: number, url: string }, liveHash: string }} pull
 * @returns {Promise<Publication>}
 */
const updated = async ({ codeHost }, { journal }, { found, bodyFile, body, bodyHash, liveHash }) => {
  if (liveHash === bodyHash) return { published: true, number: found.number, reason: `pull request #${found.number} is up to date: ${found.url}` }
  if (lastHash(journal.events, found.number) !== liveHash) return notOpened(`pull request #${found.number} was edited since skraft last wrote its body, which stays as it is`)
  const edited = await codeHost.edit({ number: found.number, bodyFile, body })
  if (!edited.ok) return notOpened(edited.reason)
  await journal.append('pull-request.updated', { number: found.number, url: found.url, bodyHash })
  return { published: true, number: found.number, reason: `pull request #${found.number} updated: ${found.url}` }
}

/** @param {import('../../domain/journal/run-state.mjs').RunEvent[]} events @param {number} number */
const lastHash = (events, number) => events.findLast((event) => event.number === number && BODY_EVENTS.includes(event.type))?.bodyHash

/** The events that tell the body skraft last wrote. */
const BODY_EVENTS = ['pull-request.opened', 'pull-request.updated']
