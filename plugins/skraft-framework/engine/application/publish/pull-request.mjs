import { CONFIG_FILE } from '../../domain/config/skraft-config.mjs'
import { adrNumber, adrTitle } from '../../domain/decisions/adr.mjs'
import { deriveRun } from '../../domain/journal/run-state.mjs'
import { PULL_REQUEST_BODY_FILE, PULL_REQUEST_FILE, renderPullRequest } from '../../domain/reporting/pull-request.mjs'
import { readProse } from '../../domain/reporting/pull-request-prose.mjs'
import { finalGates, matrixPath, modelsOf, redCommits, reviewFacts, testPlanPath } from '../../domain/reporting/run-facts.mjs'
import { runReport } from '../../domain/reporting/run-report.mjs'
import { statusLine } from '../../domain/reporting/run-status.mjs'
import { branchOf } from '../../domain/reporting/branches.mjs'
import { forgeAdapters } from '../config/forge.mjs'
import { routeOf } from '../config/github-mcp.mjs'

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
 * @typedef {{ published: boolean, reason: string }} Publication
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
  const rendered = renderPullRequest({ ...(await factsOf(deps, request, run)), link: linkOf(deps.codeHost, run.story, target), bodyLimit: deps.codeHost.bodyLimit })
  await deps.files.write(request.slug, PULL_REQUEST_FILE, rendered.description)
  await deps.files.write(request.slug, PULL_REQUEST_BODY_FILE, rendered.body)
  if (!target.ok) return notOpened(target.reason)
  return pushAndOpen(deps, request, { target, title: rendered.title, body: rendered.body })
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
  prose: await proseOf(deps, slug, journal.events),
  adrs: await ratifiedAdrs(deps, journal.events),
  repository: await deps.codeHost.repository(),
  testPlan: await trackedDocument(deps, slug, testPlanPath(journal.events)),
  matrix: await trackedDocument(deps, slug, matrixPath(journal.events)),
  ...journalFacts(journal.events, run),
})

/**
 * A document of the tracking folder the journal names, with its path; null when it names none or
 * the file is gone.
 * @param {OnForge} deps @param {string} slug @param {string | null} path
 */
const trackedDocument = async ({ files }, slug, path) => {
  const text = path === null ? null : await files.read(slug, path)
  return text === null ? null : { path: /** @type {string} */ (path), text }
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
 * Pushes the branch, then opens its pull request, or updates the open one when its body changed.
 * @param {OnForge} deps @param {PublishRequest} request
 * @param {{ target: Extract<Target, { ok: true }>, title: string, body: string }} pull
 * @returns {Promise<Publication>}
 */
const pushAndOpen = async (deps, request, pull) => {
  const pushed = await deps.codeHost.push(pull.target.head)
  if (!pushed.ok) return notOpened(pushed.reason)
  const open = await deps.codeHost.findPullRequest(pull.target.head)
  if (!open.ok) return notOpened(open.reason)
  const located = { ...pull, bodyFile: deps.files.location(request.slug, PULL_REQUEST_BODY_FILE), bodyHash: await hashOf(deps, pull.body) }
  if (open.found === null) return opened(deps, request, located)
  if (open.found.state !== 'open') return notOpened(`pull request #${open.found.number} of ${pull.target.head} is ${open.found.state}, and skraft opens no other one`)
  return updated(deps, request, { ...located, found: open.found, liveHash: await hashOf(deps, open.found.body) })
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
  await journal.append('pull-request.opened', { number: made.number, url: made.url, base, head, draft: config.publish.draft, bodyHash, ...routeOf(made) })
  return { published: true, reason: `pull request #${made.number} opened${config.publish.draft ? ' as a draft' : ''}: ${made.url}${made.note === undefined ? '' : `; ${made.note}`}` }
}

/**
 * The open pull request's body replaced: already this one, it is up to date; one that is not the
 * body skraft last wrote there (a human edited it, or skraft never wrote it) stays as it is.
 * @param {OnForge} deps @param {PublishRequest} request @param {Located & { found: { number: number, url: string }, liveHash: string }} pull
 * @returns {Promise<Publication>}
 */
const updated = async ({ codeHost }, { journal }, { found, bodyFile, body, bodyHash, liveHash }) => {
  if (liveHash === bodyHash) return { published: true, reason: `pull request #${found.number} is up to date: ${found.url}` }
  if (lastHash(journal.events, found.number) !== liveHash) return notOpened(`pull request #${found.number} was edited since skraft last wrote its body, which stays as it is`)
  const edited = await codeHost.edit({ number: found.number, bodyFile, body })
  if (!edited.ok) return notOpened(edited.reason)
  await journal.append('pull-request.updated', { number: found.number, url: found.url, bodyHash, ...routeOf(edited) })
  return { published: true, reason: `pull request #${found.number} updated: ${found.url}` }
}

/** @param {import('../../domain/journal/run-state.mjs').RunEvent[]} events @param {number} number */
const lastHash = (events, number) => events.findLast((event) => event.number === number)?.bodyHash
