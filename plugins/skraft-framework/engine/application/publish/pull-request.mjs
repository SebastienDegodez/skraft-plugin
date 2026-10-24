import { CONFIG_FILE } from '../../domain/config/skraft-config.mjs'
import { adrNumber, adrTitle } from '../../domain/decisions/adr.mjs'
import { deriveRun } from '../../domain/journal/run-state.mjs'
import { PULL_REQUEST_BODY_FILE, PULL_REQUEST_FILE, renderPullRequest } from '../../domain/reporting/pull-request.mjs'
import { readProse } from '../../domain/reporting/pull-request-prose.mjs'
import { finalGates, modelsOf, redCommits, reviewFacts } from '../../domain/reporting/run-facts.mjs'
import { runReport } from '../../domain/reporting/run-report.mjs'
import { statusLine } from '../../domain/reporting/run-status.mjs'
import { branchOf } from '../../domain/reporting/branches.mjs'

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
 *   codeHost: import('../ports/code-host.mjs').CodeHost,
 * }} PublishDeps
 * @typedef {{
 *   slug: string, journal: import('../journal/run-journal.mjs').OpenJournal,
 *   config: import('../../domain/config/skraft-config.mjs').SkraftConfig,
 *   workflow: import('../../domain/workflow/workflow.mjs').Workflow,
 * }} PublishRequest
 * @typedef {{ published: boolean, reason: string }} Publication
 * @typedef {{ ok: true, base: string, head: string, defaultBranch: string | null } | { ok: false, reason: string }} Target
 */

/** @param {PublishDeps} deps @param {PublishRequest} request @returns {Promise<Publication>} */
export const publishPullRequest = async (deps, request) => {
  const run = deriveRun(request.journal.events)
  const target = await targetOf(deps, request.config, run)
  const rendered = renderPullRequest({ ...(await factsOf(deps, request, run)), closes: target.ok && target.base === target.defaultBranch })
  await deps.files.write(request.slug, PULL_REQUEST_FILE, rendered.description)
  await deps.files.write(request.slug, PULL_REQUEST_BODY_FILE, rendered.body)
  if (!target.ok) return notOpened(target.reason)
  return pushAndOpen(deps, request, { target, title: rendered.title, body: rendered.body })
}

/** @param {string} reason @returns {Publication} */
const notOpened = (reason) => ({ published: false, reason: `pull request not opened: ${reason}; ${PULL_REQUEST_FILE} holds its description, and skraft publish opens it once that is fixed` })

/**
 * Where the pull request goes: from the branch HEAD is on to the branch the working copy's
 * repository diffs against, the first base the run journaled.
 * @param {PublishDeps} deps @param {PublishRequest['config']} config @param {import('../../domain/journal/run-state.mjs').RunState} run
 * @returns {Promise<Target>}
 */
const targetOf = async ({ codeHost }, config, run) => {
  if (config.publish.pullRequest !== true) return { ok: false, reason: consentReason(config.publish.pullRequest) }
  const unavailable = await codeHost.unavailable()
  if (unavailable !== null) return { ok: false, reason: unavailable }
  const base = branchOf(run.base[0]?.ref ?? '')
  if (base === null) return { ok: false, reason: 'the run\'s base names no branch (a sha or a revision): set baseBranch in skraft-config.json, or start the run with --base <branch>' }
  return branchesOf(codeHost, base)
}

/** @param {boolean | null} given */
const consentReason = (given) => (given === null
  ? `nobody answered the publish-consent question yet (publish.pullRequest in ${CONFIG_FILE})`
  : `${CONFIG_FILE} sets publish.pullRequest to false`)

/**
 * The head: the branch HEAD is on, which is neither the base nor the default branch.
 * @param {PublishDeps['codeHost']} codeHost @param {string} base @returns {Promise<Target>}
 */
const branchesOf = async (codeHost, base) => {
  const head = await codeHost.currentBranch()
  if (head === null) return { ok: false, reason: 'HEAD is detached, on no branch to push' }
  const defaultBranch = await codeHost.defaultBranch()
  if (head === base || head === defaultBranch) return { ok: false, reason: `HEAD is on ${head}, the branch the pull request would merge into` }
  return { ok: true, base, head, defaultBranch }
}

/**
 * The facts the description shows, from the journal, the pr-writer's prose and the ADRs.
 * @param {PublishDeps} deps @param {PublishRequest} request @param {import('../../domain/journal/run-state.mjs').RunState} run
 */
const factsOf = async (deps, { slug, journal, workflow }, run) => ({
  slug,
  story: run.story,
  prose: await proseOf(deps, slug, workflow, run),
  adrs: await ratifiedAdrs(deps, journal.events),
  ...journalFacts(journal.events, run),
})

/**
 * What the journal alone tells: the gates unlocked, the red commits, the gates, the review, the
 * run report and the models.
 * @param {import('../../domain/journal/run-state.mjs').RunEvent[]} events @param {import('../../domain/journal/run-state.mjs').RunState} run
 */
const journalFacts = (events, run) => ({
  unlocked: events[0].unlocked ?? [],
  reds: redCommits(events),
  gates: finalGates(events),
  review: reviewFacts(events),
  status: statusLine(run),
  report: runReport(events),
  models: modelsOf(events),
})

/**
 * What the pr-writer wrote, read from the output of the pr-writer step the run went through; null
 * when it went through none.
 * @param {PublishDeps} deps @param {string} slug @param {PublishRequest['workflow']} workflow @param {import('../../domain/journal/run-state.mjs').RunState} run
 */
const proseOf = async ({ files }, slug, workflow, run) => {
  const visited = Object.entries(run.nodes).find(([id]) => workflow.nodes[id]?.agent === PR_WRITER)
  const text = visited === undefined ? null : await files.read(slug, visited[1].outputs[0])
  return text === null ? null : readProse(text)
}

/** The agent that writes the prose of the pull request. */
export const PR_WRITER = 'pr-writer'

/**
 * The ADRs a human ratified in this run, with their number and title.
 * @param {PublishDeps} deps @param {import('../../domain/journal/run-state.mjs').RunEvent[]} events
 */
const ratifiedAdrs = async ({ workspace }, events) => {
  const run = deriveRun(events)
  const paths = Object.values(run.questions).filter(({ kind, answer }) => kind === 'adr-ratification' && answer === 'RATIFIED').flatMap(({ subjects }) => subjects)
  const adrs = []
  for (const path of paths) adrs.push({ path, number: /** @type {number} */ (adrNumber(path)), title: adrTitle((await workspace.read(path)) ?? '') })
  return adrs
}

/**
 * Pushes the branch, then opens its pull request, or updates the open one when its body changed.
 * @param {PublishDeps} deps @param {PublishRequest} request
 * @param {{ target: Extract<Target, { ok: true }>, title: string, body: string }} pull
 * @returns {Promise<Publication>}
 */
const pushAndOpen = async (deps, request, pull) => {
  const pushed = await deps.codeHost.push(pull.target.head)
  if (!pushed.ok) return notOpened(pushed.reason)
  const open = await deps.codeHost.findPullRequest(pull.target.head)
  if (!open.ok) return notOpened(open.reason)
  const located = { ...pull, bodyFile: deps.files.location(request.slug, PULL_REQUEST_BODY_FILE), bodyHash: await deps.hasher.sha256(pull.body) }
  return open.found === null ? opened(deps, request, located) : updated(deps, request, { ...located, found: open.found })
}

/**
 * @typedef {{ target: Extract<Target, { ok: true }>, title: string, bodyFile: string, bodyHash: string }} Located
 */

/** @param {PublishDeps} deps @param {PublishRequest} request @param {Located} pull @returns {Promise<Publication>} */
const opened = async ({ codeHost }, { journal, config }, { target, title, bodyFile, bodyHash }) => {
  const { base, head } = target
  const made = await codeHost.create({ base, head, title, bodyFile, draft: config.publish.draft })
  if (!made.ok) return notOpened(made.reason)
  await journal.append('pull-request.opened', { number: made.number, url: made.url, base, head, draft: config.publish.draft, bodyHash })
  return { published: true, reason: `pull request #${made.number} opened${config.publish.draft ? ' as a draft' : ''}: ${made.url}` }
}

/**
 * The open pull request's body replaced, unless the journal shows it was last published with this one.
 * @param {PublishDeps} deps @param {PublishRequest} request @param {Located & { found: { number: number, url: string } }} pull
 * @returns {Promise<Publication>}
 */
const updated = async ({ codeHost }, { journal }, { found, bodyFile, bodyHash }) => {
  if (lastHash(journal.events, found.number) === bodyHash) return { published: true, reason: `pull request #${found.number} is up to date: ${found.url}` }
  const edited = await codeHost.edit({ number: found.number, bodyFile })
  if (!edited.ok) return notOpened(edited.reason)
  await journal.append('pull-request.updated', { number: found.number, url: found.url, bodyHash })
  return { published: true, reason: `pull request #${found.number} updated: ${found.url}` }
}

/** @param {import('../../domain/journal/run-state.mjs').RunEvent[]} events @param {number} number */
const lastHash = (events, number) => events.findLast((event) => event.type.startsWith('pull-request.') && event.number === number)?.bodyHash ?? null
