import { CONFIG_FILE } from '../../domain/config/skraft-config.mjs'
import { adrNumber, adrTitle } from '../../domain/decisions/adr.mjs'
import { ADR_ACCEPTED_ON_MERGE } from '../../domain/decisions/questions.mjs'
import { deriveRun } from '../../domain/journal/run-state.mjs'
import { PULL_REQUEST_BODY_FILE, PULL_REQUEST_FILE, renderPullRequest } from '../../domain/reporting/pull-request.mjs'
import { readProse } from '../../domain/reporting/pull-request-prose.mjs'
import { qualityEvidence, matrixPaths, modelsOf, redCommits, reviewFacts, testPlanPaths } from '../../domain/reporting/run-facts.mjs'
import { runReport } from '../../domain/reporting/run-report.mjs'
import { statusLine, waitingOn } from '../../domain/reporting/run-status.mjs'
import { branchOf } from '../../domain/reporting/branches.mjs'
import { trackingFolder } from '../../domain/pipeline/roles.mjs'
import { attachedReference, referredIn, shownScreenshots } from '../../domain/reporting/visuals.mjs'
import { scenarioOutcomesOf } from './scenario-outcomes.mjs'
import { storyLanguage } from './story-language.mjs'
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
 *   skraft-design-config.json answers.
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
  const { facts, unattached } = await attachable(deps.codeHost, target, { ...(await factsOf(deps, request, run)), link: linkOf(deps.codeHost, run.story, target), bodyLimit: deps.codeHost.bodyLimit, commentLimit: deps.codeHost.commentLimit })
  const rendered = renderPullRequest(facts)
  await deps.files.write(request.slug, PULL_REQUEST_FILE, rendered.description)
  await deps.files.write(request.slug, PULL_REQUEST_BODY_FILE, rendered.body)
  if (!target.ok) return notOpened(target.reason)
  const skipped = await skippedNote(request.journal, unattached)
  const published = await pushAndOpen(deps, request, { target, ...pulled(deps, request.slug, { rendered, visuals: facts.visuals }), language: facts.language })
  return { ...published, reason: `${published.reason}${skipped}` }
}

/**
 * What the pull request is sent with: its title, body and run details, the screenshots the body
 * refers to, and every one the forge's client attaches.
 * @param {OnForge} deps @param {string} slug
 * @param {{ rendered: ReturnType<typeof renderPullRequest>, visuals: Visuals | null }} pull
 */
const pulled = (deps, slug, { rendered, visuals }) => {
  const shown = attachmentsOf(visuals, bodyFolder(deps, slug))
  return { title: rendered.title, body: rendered.body, details: rendered.details, attachments: referredIn(shown, rendered.body), shown }
}

/**
 * The facts with the screenshots the forge's client attaches left out when this machine's client
 * cannot attach them (a gh without --attach): each component then says why, and the pull request
 * is opened without them. unattached: why, and the screenshots left out; null when none is.
 * @template {{ visuals: Visuals | null }} F @param {OnForge['codeHost']} codeHost @param {Target} target @param {F} facts
 * @returns {Promise<{ facts: F, unattached: { reason: string, screenshots: string[] } | null }>}
 */
const attachable = async (codeHost, target, facts) => {
  const screenshots = target.ok && facts.visuals?.attached ? facts.visuals.components.flatMap((component) => component.screenshots) : []
  const blocked = screenshots.length === 0 ? null : await codeHost.screenshotsBlocked()
  if (blocked === null) return { facts: screenshots.length === 0 ? facts : { ...facts, visuals: withinLimit(/** @type {Visuals} */ (facts.visuals), codeHost.attachLimit ?? Number.POSITIVE_INFINITY) }, unattached: null }
  return { facts: { ...facts, visuals: withoutScreenshots(/** @type {Visuals} */ (facts.visuals), blocked) }, unattached: { reason: blocked, screenshots: screenshots.map(({ path }) => path) } }
}

/** The visuals without their screenshots, each component that had some saying why. @param {Visuals} visuals @param {string} reason */
const withoutScreenshots = (visuals, reason) => ({
  ...visuals,
  components: visuals.components.map((component) => (component.screenshots.length === 0 ? component : { ...component, detail: `${screenshotCount(component.screenshots.length)} not attached: ${reason}`, screenshots: [] })),
})

/**
 * The visuals whose screenshots the pull request shows number no more than the forge's client
 * takes in one command: the front ends past them, in order, show none and say where theirs are.
 * @param {Visuals} visuals @param {number} limit
 * @returns {Visuals}
 */
const withinLimit = (visuals, limit) => ({
  ...visuals,
  components: visuals.components.reduce((kept, component) => [...kept, fitted(kept, component, limit)], /** @type {Visuals['components']} */ ([])),
})

/**
 * The component as shown once those before it are: whole while its screenshots fit, else none.
 * @param {Visuals['components']} kept @param {Visuals['components'][number]} component @param {number} limit
 */
const fitted = (kept, component, limit) => {
  const used = shownScreenshots({ commit: null, components: kept }).length
  if (used + shownScreenshots({ commit: null, components: [component] }).length <= limit) return component
  const path = component.screenshots[0].path
  return { ...component, detail: `${screenshotCount(component.screenshots.length)} not attached: the forge's client attaches at most ${limit} screenshots to a pull request; they are in \`${path.slice(0, path.lastIndexOf('/'))}\``, screenshots: [] }
}

/** @param {number} count */
const screenshotCount = (count) => `${count} screenshot${count === 1 ? '' : 's'}`

/**
 * The screenshots left out of the pull request, journaled, and what the publication's reason says
 * of them; nothing when none was. @param {PublishRequest['journal']} journal @param {{ reason: string, screenshots: string[] } | null} unattached
 */
const skippedNote = async (journal, unattached) => {
  if (unattached === null) return ''
  await journal.append('pull-request.screenshots-skipped', unattached)
  return `; ${screenshotCount(unattached.screenshots.length)} not attached: ${unattached.reason}`
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
  if (!requested && config.publish.pullRequest !== true) return { ok: false, reason: `${CONFIG_FILE} sets publish.pullRequest to false` }
  const unavailable = await codeHost.unavailable()
  if (unavailable !== null) return { ok: false, reason: unavailable }
  const own = run.base[0]
  const base = own === undefined ? null : branchOf(own.ref, await codeHost.remotes())
  if (base === null) return { ok: false, reason: 'the run\'s base names no branch (a sha or a revision): set baseBranch in skraft-design-config.json, or start the run with --base <branch>' }
  return branchesOf(codeHost, base)
}

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
 * The facts the description shows, from the journal, the design-pr-writer's prose and the ADRs.
 * @param {OnForge} deps @param {PublishRequest} request @param {import('../../domain/journal/run-state.mjs').RunState} run
 */
const factsOf = async (deps, request, run) => factsIn(deps, request, { run, language: await storyLanguage(deps, request.slug, run) })

/**
 * @param {OnForge} deps @param {PublishRequest} request
 * @param {{ run: import('../../domain/journal/run-state.mjs').RunState, language: import('../../domain/reporting/language.mjs').Language }} story
 */
const factsIn = async (deps, { slug, journal, config }, { run, language }) => ({
  slug,
  story: run.story,
  language,
  prose: await proseOf(deps, slug, journal.events),
  ...await forgeFacts(deps, slug, journal.events),
  testPlans: await trackedDocuments(deps, slug, testPlanPaths(journal.events)),
  matrices: await trackedDocuments(deps, slug, matrixPaths(journal.events)),
  outcomes: await scenarioOutcomesOf(/** @type {any} */ (deps), { slug, events: journal.events, components: config.components }),
  ...journalFacts(journal.events, run, language),
})

/**
 * What the forge holds for the description: the ADRs the merge accepts, the repository the PR opens
 * on, the screenshots it shows.
 * @param {OnForge} deps @param {string} slug @param {any[]} events
 */
const forgeFacts = async (deps, slug, events) => ({
  adrs: await acceptedOnMergeAdrs(deps, events),
  repository: await deps.codeHost.repository(),
  visuals: await shownVisuals(deps.codeHost, events, bodyFolder(deps, slug)),
})

/**
 * The documents of the tracking folder the journal names, each with its path; those the folder lost are left out.
 * @param {OnForge} deps @param {string} slug @param {string[]} paths
 */
const trackedDocuments = async ({ files }, slug, paths) => {
  const documents = await Promise.all(paths.map(async (path) => ({ path, text: await files.read(slug, path) })))
  return documents.filter(({ text }) => text !== null).map(({ path, text }) => ({ path, text: /** @type {string} */ (text) }))
}

/**
 * What the journal alone tells: the red commits, the gates, the review, the
 * run report and the models; the run's status in the story's language.
 * @param {import('../../domain/journal/run-state.mjs').RunEvent[]} events @param {import('../../domain/journal/run-state.mjs').RunState} run
 * @param {import('../../domain/reporting/language.mjs').Language} language
 */
const journalFacts = (events, run, language) => ({
  reds: redCommits(events),
  evidence: qualityEvidence(events),
  review: reviewFacts(events),
  status: statusLine(run, language),
  pendingQuestion: waitingOn(run),
  report: runReport(events),
  models: modelsOf(events),
})

/**
 * What the run's last visuals step recorded, each screenshot with where the pull request shows
 * it: the reference the forge's client rewrites once it attached the file, else the committed
 * file's address at its commit; null when no visuals step ran.
 * @param {OnForge['codeHost']} codeHost @param {import('../../domain/journal/run-state.mjs').RunEvent[]} events @param {string} folder the body file's
 * @returns {Promise<Visuals | null>}
 */
const shownVisuals = async (codeHost, events, folder) => {
  const last = events.findLast((event) => event.type === 'visuals.recorded')
  if (last === undefined) return null
  const recorded = { commit: last.commit, attached: last.attached === true, components: last.components, folder }
  const components = []
  for (const component of recorded.components) components.push({ ...component, screenshots: await locatedAll(codeHost, recorded, component.screenshots) })
  return { ...recorded, components }
}

/** @typedef {import('../../domain/reporting/visuals.mjs').Visuals} Visuals */
/** @typedef {import('../../domain/reporting/visuals.mjs').Screenshot} Screenshot */

/** @param {OnForge['codeHost']} codeHost @param {Visuals & { folder: string }} visuals @param {Screenshot[]} screenshots */
const locatedAll = async (codeHost, visuals, screenshots) => {
  const located = []
  for (const screenshot of screenshots) located.push({ ...screenshot, url: await urlOf(codeHost, visuals, screenshot.path) })
  return located
}

/** @param {OnForge['codeHost']} codeHost @param {Visuals & { folder: string }} visuals @param {string} path @returns {Promise<string | null>} */
const urlOf = async (codeHost, { attached, commit, folder }, path) => {
  if (attached) return attachedReference(path, folder)
  return commit === null ? null : codeHost.fileUrl(commit, path)
}

/**
 * The screenshots the forge's client uploads with what shows them, each with how a body refers to it.
 * @param {Visuals | null} visuals @param {string} folder the body file's @returns {Attachment[]}
 */
const attachmentsOf = (visuals, folder) => (visuals?.attached
  ? shownScreenshots(visuals).map(({ path, title }) => ({ path, alt: title, reference: attachedReference(path, folder) }))
  : [])


/** The folder of the files a body is read from, relative to the working copy: the run's tracking folder. @param {OnForge} deps @param {string} slug */
const bodyFolder = ({ files }, slug) => trackingFolder(slug, files.folder)

/**
 * What the design-pr-writer wrote, read from the output its journaled step.started names (the only event
 * that carries a phase agent), whatever the workflow
 * says since; null when the run started no design-pr-writer.
 * @param {OnForge} deps @param {string} slug @param {import('../../domain/journal/run-state.mjs').RunEvent[]} events
 */
const proseOf = async ({ files }, slug, events) => {
  const started = events.findLast((event) => event.agent === PR_WRITER)
  const text = started === undefined ? null : await files.read(slug, started.outputs[0])
  return text === null ? null : readProse(text)
}

/** The agent that writes the prose of the pull request. */
export const PR_WRITER = 'design-pr-writer'

/**
 * The ADRs the architecture PR will accept on merge, with their number and title.
 * @param {OnForge} deps @param {import('../../domain/journal/run-state.mjs').RunEvent[]} events
 */
const acceptedOnMergeAdrs = async ({ workspace }, events) => {
  const paths = events.filter(({ type, step, answer }) => type === 'step.recorded' && step === 'adr' && answer === ADR_ACCEPTED_ON_MERGE)
    .flatMap(({ subjects = [] }) => subjects)
  const adrs = []
  for (const path of paths) adrs.push({ path, number: /** @type {number} */ (adrNumber(path)), title: adrTitle(/** @type {string} */ (await workspace.read(path))) })
  return adrs
}

/**
 * Pushes the branch, then opens its pull request, or updates the open one when its body changed;
 * once it is up to date, its run details are kept in comments when the body sends to them. A
 * branch the remote does not show at the local commit gets no pull request.
 * @param {OnForge} deps @param {PublishRequest} request
 * @param {{ target: Extract<Target, { ok: true }>, title: string, body: string, details: string[], language: import('../../domain/reporting/language.mjs').Language, attachments: Attachment[], shown: Attachment[] }} pull
 *   attachments: those the body refers to; shown: every screenshot the forge's client attaches
 * @returns {Promise<Publication>}
 */
const pushAndOpen = async (deps, request, pull) => {
  const pushed = await pushedBranch(request.journal, deps.codeHost, pull.target.head)
  if (!pushed.ok) return notOpened(pushed.reason)
  const open = await deps.codeHost.findPullRequest(pull.target.head)
  if (!open.ok) return notOpened(open.reason)
  const done = await settled(deps, request, { pull, open })
  return done.published ? withDetails(deps, request, { done, details: pull.details, language: pull.language, shown: pull.shown }) : done
}

/**
 * @param {OnForge} deps @param {PublishRequest} request
 * @param {{ pull: { target: Extract<Target, { ok: true }>, title: string, body: string, attachments: Attachment[] }, open: { found: FoundPullRequest | null } }} found
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
/** @typedef {import('../ports/code-host.mjs').Attachment} Attachment */

/** What follows the reason of a publication about its run details: nothing for a body that holds them. @param {import('./run-details.mjs').DetailsOutcome} outcome */
const detailsNote = (outcome) => {
  if (!outcome.ok) return `; its run details were not kept: ${outcome.reason}; ${DETAILS_FILE} holds them, and skraft publish keeps them once that is fixed`
  if (outcome.parts === 0) return ''
  return `; its run details were kept in ${outcome.parts} comment${outcome.parts === 1 ? '' : 's'}, the first at ${outcome.first}${unattachedNote(outcome.unattached)}`
}

/** The screenshots the forge's client did not attach, by path; nothing when none. @param {string[]} paths */
const unattachedNote = (paths) => (paths.length === 0 ? '' : `; ${paths.length} screenshot${paths.length === 1 ? '' : 's'} did not attach: ${paths.join(', ')}`)

/** The file that holds the whole description, the run details included, as the tracking folder keeps it. */
const DETAILS_FILE = PULL_REQUEST_FILE

/**
 * The publication, its reason followed by where the run details are, or why they were not kept.
 * @param {OnForge} deps @param {PublishRequest} request @param {{ done: Publication & { number?: number }, details: string[], language: import('../../domain/reporting/language.mjs').Language, shown: Attachment[] }} kept
 * @returns {Promise<Publication>}
 */
const withDetails = async (deps, request, { done, details, language, shown }) => {
  const outcome = await keepRunDetails(deps, request, { number: /** @type {number} */ (done.number), details, language, attachments: shown })
  return { published: true, reason: `${done.reason}${detailsNote(outcome)}` }
}

/**
 * A body's hash, its line endings and trailing blanks as the forge may change them left out, and
 * the address of each image too: the forge's client rewrites the reference to a file it attached.
 * @param {OnForge} deps @param {string} body
 */
const hashOf = ({ hasher }, body) => hasher.sha256(body.replace(/\r\n/g, '\n').replace(IMAGE, '![$1]()').trimEnd())

/** An image of a body: its alt text, then its address. */
const IMAGE = /!\[([^\]\n]*)\]\([^)\n]*\)/g

/**
 * What follows the reason of a publication about its attached screenshots: those whose reference
 * the body read back still holds, which the forge's client did not attach; nothing when it attached them all.
 * @param {string | null} live the body read back, null when the forge gave none @param {Attachment[]} attachments
 */
const attachNote = (live, attachments) => {
  return unattachedNote(attachments.filter(({ reference }) => live === null || live.includes(`](${reference})`)).map(({ path }) => path))
}

/** The body of the pull request read back by its number; null when the forge does not give it. @param {OnForge} deps @param {number} number */
const liveBody = async (deps, number) => {
  const read = await deps.codeHost.readPullRequest(number)
  return read.ok && read.found !== null ? read.found.body : null
}

/**
 * @typedef {{ target: Extract<Target, { ok: true }>, title: string, bodyFile: string, body: string, bodyHash: string, attachments: Attachment[] }} Located
 */

/**
 * The pull request opened, its opening journaled first so that a run resumed after a cut finds it
 * again, then read back by its head: opened only once the forge lists it.
 * @param {OnForge} deps @param {PublishRequest} request @param {Located} pull @returns {Promise<Publication>}
 */
const opened = async (deps, { journal, config }, { target, title, bodyFile, body, bodyHash, attachments }) => {
  const { base, head } = target
  const write = { write: CREATE, subject: head }
  await journal.append(CREATE_STARTED, { base, head, bodyHash })
  const made = await deps.codeHost.create({ base, head, title, bodyFile, body, draft: config.publish.draft, issue: deriveRun(journal.events).story?.issue ?? null, attachments })
  if (!made.ok) return unwritten(journal, write, made)
  if (!(await listed(deps.codeHost, head, made.number))) return unwritten(journal, write, { reason: `the forge said it opened pull request #${made.number} of ${head}, but listing the pull requests of ${head} does not show it`, outcome: 'verification-failed' })
  await journal.append('pull-request.opened', { number: made.number, url: made.url, base, head, draft: config.publish.draft, bodyHash, screenshots: pathsOf(attachments) })
  await journalWrite(journal, write, { outcome: 'applied' })
  const note = attachments.length === 0 ? '' : attachNote(await liveBody(deps, made.number), attachments)
  return { published: true, number: made.number, reason: `pull request #${made.number} opened${config.publish.draft ? ' as a draft' : ''}: ${made.url}${made.note === undefined ? '' : `; ${made.note}`}${note}` }
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
const updated = async (deps, { journal }, { found, bodyFile, body, bodyHash, liveHash, attachments }) => {
  if (liveHash === bodyHash && shownAsSent(journal.events, found, attachments)) return { published: true, number: found.number, reason: `pull request #${found.number} is up to date: ${found.url}` }
  if (lastHash(journal.events, found.number) !== liveHash) return notOpened(`pull request #${found.number} was edited since skraft last wrote its body, which stays as it is`)
  const write = { write: 'pull-request-edit', subject: String(found.number) }
  const edited = await deps.codeHost.edit({ number: found.number, bodyFile, body, attachments })
  if (!edited.ok) return unwritten(journal, write, edited)
  const live = await liveBody(deps, found.number)
  if (live === null || (await hashOf(deps, live)) !== bodyHash) return unwritten(journal, write, { reason: `the forge said it updated pull request #${found.number}, but reading it back does not show the new body`, outcome: 'verification-failed' })
  await journal.append('pull-request.updated', { number: found.number, url: found.url, bodyHash, screenshots: pathsOf(attachments) })
  await journalWrite(journal, write, { outcome: 'applied' })
  return { published: true, number: found.number, reason: `pull request #${found.number} updated: ${found.url}${attachNote(live, attachments)}` }
}

/** @param {import('../../domain/journal/run-state.mjs').RunEvent[]} events @param {number} number */
const lastHash = (events, number) => lastWrite(events, number)?.bodyHash

/** The event of skraft's last write of the pull request's body. @param {import('../../domain/journal/run-state.mjs').RunEvent[]} events @param {number} number */
const lastWrite = (events, number) => events.findLast((event) => event.number === number && BODY_EVENTS.includes(event.type))

/** @param {Attachment[]} attachments */
const pathsOf = (attachments) => attachments.map(({ path }) => path)

/**
 * Whether the body read back shows the screenshots as this publication sends them: none still at
 * the local reference the forge's client rewrites once it attached the file, and the same
 * screenshots as skraft's last write sent; a body whose images were left unattached, or whose
 * screenshots changed, is sent again with them.
 * @param {import('../../domain/journal/run-state.mjs').RunEvent[]} events @param {{ number: number, body?: string }} found @param {Attachment[]} attachments
 */
const shownAsSent = (events, found, attachments) => {
  const live = found.body ?? ''
  if (attachments.some(({ reference }) => live.includes(`](${reference})`))) return false
  const sent = lastWrite(events, found.number)?.screenshots ?? []
  return sent.length === attachments.length && pathsOf(attachments).every((path) => sent.includes(path))
}

/** The events that tell the body skraft last wrote. */
const BODY_EVENTS = ['pull-request.opened', 'pull-request.updated']
