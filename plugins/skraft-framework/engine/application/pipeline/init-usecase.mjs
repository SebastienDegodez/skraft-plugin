import { isSlug } from '../../domain/pipeline/slug.mjs'
import { discussArtifacts, ENTRY_AFTER_DISCUSS, issueDocument, issuePath } from '../../domain/pipeline/artifacts.mjs'
import { dayOf } from '../../domain/pipeline/outputs.mjs'
import { loadConfig, resolveBases } from '../config/bases.mjs'
import { forgeAdapters } from '../config/forge.mjs'
import { routeOf } from '../config/github-mcp.mjs'
import { loadWorkflow } from '../workflow/load-workflow.mjs'
import { openJournal } from '../journal/run-journal.mjs'

/**
 * @typedef {import('../ports/active-pipeline.mjs').ActivePipeline} ActivePipeline
 * @typedef {{ issue?: number | null, title?: string | null } | null} Story
 * @typedef {'invalid-slug' | 'invalid-base' | 'journal-tampered' | 'journal-unverifiable' | 'config-invalid' | 'base-unresolved' | 'source-control-unavailable'
 *   | 'workflow-invalid' | 'already-started' | 'no-artifacts' | 'journal-key-unavailable' | 'issue-not-found' | 'issue-is-pull-request'} InitCode
 * @typedef {{ ok: boolean, slug: string | null, created: boolean, code: InitCode | null, reason: string }} InitOutcome
 * @typedef {{
 *   activePipeline: ActivePipeline,
 *   workspace: import('../ports/workspace.mjs').ConfigSource,
 *   userSettings: import('../ports/user-settings.mjs').UserSettings,
 *   sourceControl: import('../ports/source-control.mjs').SourceControl,
 *   files: Pick<import('../ports/tracking-files.mjs').TrackingFiles, 'list' | 'write'>,
 * } & import('../config/forge.mjs').ForgeDeps & import('../workflow/load-workflow.mjs').WorkflowDeps & Parameters<typeof openJournal>[0]} InitDeps
 * @typedef {{ slug: string, story: Story, base: unknown, fromArtifacts: boolean }} StartRequest
 * @typedef {Extract<Awaited<ReturnType<typeof loadWorkflow>>, { ok: true }>} LoadedWorkflow
 */

/**
 * Init — makes a slug the active pipeline of the working copy and opens its journal. A new
 * run checks its workflow, journals the base of every repository it diffs against and the
 * DISCUSS stories already in its tracking folder; from those artefacts, it starts in DESIGN.
 * Otherwise, a new run from an issue reads it once from the forge and keeps it beside them, for
 * every agent to read, or journals why its body was not read; a resumed run reads it no more.
 * @param {InitDeps} deps
 */
export const createInit = (deps) => Object.freeze({
  /**
   * @param {{ slug?: unknown, story?: Story, base?: unknown, fromArtifacts?: boolean }} request
   * @returns {Promise<InitOutcome>}
   */
  init: ({ slug, story = null, base = null, fromArtifacts = false }) => init(deps, { slug, story, base, fromArtifacts }),
})

/**
 * @param {InitDeps} deps
 * @param {{ slug: unknown, story: Story, base: unknown, fromArtifacts: boolean }} request
 * @returns {Promise<InitOutcome>}
 */
const init = async (deps, request) => {
  const { slug } = request
  if (!isSlug(slug)) return refuseInvalidSlug(slug)
  const opened = await openJournal(deps, slug)
  if (!opened.ok) return refusal(slug, opened.code, opened.reason)
  if (opened.journal.events.length > 0) return resumeStartedRun(deps, slug, request.fromArtifacts)
  const refused = await start(deps, opened.journal, /** @type {StartRequest} */ (request))
  if (refused) return refused
  return activate(deps, slug, true, unreadNote(opened.journal.events[0]))
}

/** A new journal is signed with a key kept in the home folder, which the host must name. */
export const NO_KEY_FOLDER = 'the environment names no home folder (HOME or USERPROFILE), where the key that signs the journal is kept; set it and start again'

/** @param {string | null} slug @param {InitCode} code @param {string} reason @returns {InitOutcome} */
const refusal = (slug, code, reason) => ({ ok: false, slug, created: false, code, reason })

/** @param {unknown} slug @returns {InitOutcome} */
const refuseInvalidSlug = (slug) =>
  refusal(null, 'invalid-slug', 'slug must be kebab-case: lowercase letters and digits, joined by single hyphens')

/**
 * A run that already has a journal resumes; --from-artifacts only starts a new one.
 * @param {InitDeps} deps @param {string} slug @param {boolean} fromArtifacts
 * @returns {Promise<InitOutcome>}
 */
const resumeStartedRun = async (deps, slug, fromArtifacts) => {
  if (fromArtifacts) return refusal(slug, 'already-started', `${slug} already has a journal; resume it without --from-artifacts`)
  return activate(deps, slug, false)
}

/** @param {InitDeps} deps @param {string} slug @param {boolean} created @param {string} [note] @returns {Promise<InitOutcome>} */
const activate = async (deps, slug, created, note = '') => {
  await deps.activePipeline.activate(slug)
  return { ok: true, slug, created, code: null, reason: `${slug} is the active pipeline${note}` }
}

/**
 * What a new run started without the body of its issue tells the developer; nothing otherwise.
 * @param {import('../../domain/journal/run-state.mjs').RunEvent} started its run.started
 */
const unreadNote = ({ story, issueUnread }) => (issueUnread === undefined ? '' : `; the body of issue #${story.issue} was not read (${issueUnread}): its agents get its number and title only`)

/**
 * @param {InitDeps} deps
 * @param {import('../journal/run-journal.mjs').OpenJournal} journal
 * @param {StartRequest} request
 * @returns {Promise<InitOutcome | null>} the refusal, null once the run started
 */
const start = async (deps, journal, request) => {
  if (!(await deps.journalKeys.available())) return refusal(request.slug, 'journal-key-unavailable', NO_KEY_FOLDER)
  const checked = await checkConfigAndWorkflow(deps, request.slug)
  if (checked.refusal) return checked.refusal
  const artifacts = discussArtifacts(await deps.files.list(request.slug, 'plans'))
  const found = findEntry(checked.workflow, artifacts, request)
  if (found.refusal) return found.refusal
  const sources = await sourcesOf(deps, request, checked.config)
  if (sources.refusal) return sources.refusal
  await journalStart(journal, request, { workflow: checked.workflow, bases: sources.bases, artifacts, entry: found.entry, issue: sources.issue })
  return null
}

/**
 * The base of every repository the run diffs against, then its story's issue kept in the tracking folder.
 * @param {InitDeps} deps @param {StartRequest} request @param {any} config
 * @returns {Promise<{ refusal: InitOutcome } | { refusal: null, bases: any, issue: KeptIssue }>}
 */
const sourcesOf = async (deps, request, config) => {
  const resolved = await resolveBases(deps, { config, flag: request.base })
  if (!resolved.ok) return { refusal: refusal(request.slug, resolved.code, resolved.reason) }
  const issue = await keepIssue(deps, request, config.forge)
  return issue.refusal ? { refusal: issue.refusal } : { refusal: null, bases: resolved.bases, issue }
}

/**
 * @typedef {{ refusal: null, artifacts: string[], unread: string | null, route: ReturnType<typeof routeOf> }} KeptIssue
 *   artifacts: the issue kept in the tracking folder, none when it was not read; unread: why its
 *   body was not read, null when it was or the run has no issue to read; route: which way read
 *   it (the host's GitHub MCP server or gh), none without an MCP server.
 */

/** Nothing read: a run without an issue, or started from DISCUSS artefacts, which hold its stories already. */
const NO_ISSUE = Object.freeze({ refusal: null, artifacts: [], unread: null, route: {} })

/**
 * The story's issue read from the forge and kept in the tracking folder. A forge that cannot be
 * asked lets the run start on the issue's number and title alone; a number the forge says is no
 * issue refuses it.
 * @param {InitDeps} deps @param {StartRequest} request @param {import('../config/forge.mjs').Forge | null} forge the forge skraft-config.json names
 * @returns {Promise<{ refusal: InitOutcome } | KeptIssue>}
 */
const keepIssue = async (deps, { slug, story, fromArtifacts }, forge) => {
  const number = story?.issue
  if (!number || fromArtifacts) return NO_ISSUE
  const reading = await (await forgeAdapters(deps, forge)).codeHost.issue(number)
  const route = routeOf(reading)
  if (reading.read === 'failed') return { ...NO_ISSUE, unread: reading.reason, route }
  if (reading.read !== 'issue') return { refusal: notAnIssue(slug, number, reading.read) }
  const path = issuePath({ date: dayOf(deps.clock.now()), number })
  await deps.files.write(slug, path, issueDocument(reading.issue))
  return { ...NO_ISSUE, artifacts: [path], route }
}

/**
 * The refusal of a number the forge answered for with no issue.
 * @param {string} slug @param {number} number @param {'missing' | 'pull-request'} read
 */
const notAnIssue = (slug, number, read) => (read === 'missing'
  ? refusal(slug, 'issue-not-found', `the forge has no issue #${number}; start the run with the number of the story's issue`)
  : refusal(slug, 'issue-is-pull-request', `#${number} is a pull request, not an issue; start the run with the number of the story's issue`))

/**
 * @param {InitDeps} deps @param {string} slug
 * @returns {Promise<{ refusal: InitOutcome } | { refusal: null, config: any, workflow: LoadedWorkflow }>}
 */
const checkConfigAndWorkflow = async (deps, slug) => {
  const loaded = await loadConfig(deps)
  if (!loaded.ok) return { refusal: refusal(slug, 'config-invalid', loaded.reason) }
  const workflow = await loadWorkflow(deps, {})
  if (!workflow.ok) return { refusal: refusal(slug, 'workflow-invalid', workflow.reason) }
  return { refusal: null, config: loaded.config, workflow }
}

/**
 * The node a run starts on: null for a new run, the first DESIGN node from DISCUSS stories.
 * @param {LoadedWorkflow} workflow @param {string[]} artifacts @param {StartRequest} request
 * @returns {{ refusal: InitOutcome, entry?: undefined } | { refusal: null, entry: string | null }}
 */
const findEntry = (workflow, artifacts, { slug, fromArtifacts }) => {
  if (!fromArtifacts) return { refusal: null, entry: null }
  // Stryker disable next-line Regex: every DISCUSS artefact already ends in its .md file name, so only a folder named stories-*.md* could tell the anchor
  if (!artifacts.some((path) => /\/stories-[^/]+\.md$/.test(path))) {
    return { refusal: refusal(slug, 'no-artifacts', `${slug} has no DISCUSS stories (plans/<date>/stories-<milestone>.md) to start from`) }
  }
  const entry = workflow.workflow.order.find((id) => workflow.workflow.nodes[id].phase === ENTRY_AFTER_DISCUSS) ?? null
  if (entry === null) return { refusal: refusal(slug, 'workflow-invalid', `${workflow.name} has no ${ENTRY_AFTER_DISCUSS} phase to start from`) }
  return { refusal: null, entry }
}

/**
 * @param {import('../journal/run-journal.mjs').OpenJournal} journal @param {StartRequest} request
 * @param {{ workflow: LoadedWorkflow, bases: any, artifacts: string[], entry: string | null, issue: KeptIssue }} started
 *   artifacts: the DISCUSS ones, after the issue kept
 */
const journalStart = async (journal, { slug, story }, { workflow, bases, artifacts, entry, issue }) => {
  await journal.append('run.started', { slug, story, workflow: workflow.name, base: bases, artifacts: [...issue.artifacts, ...artifacts], start: entry, unlocked: workflow.unlocked, ...issueFacts(issue) })
  for (const phase of skippedPhases(workflow, entry)) await journal.append('phase.closed', { phase, skipped: 'from-artifacts' })
}

/**
 * What the journal keeps of the issue's reading: why its body was not read, and which way read it.
 * @param {KeptIssue} issue
 */
const issueFacts = ({ unread, route }) => {
  const facts = unread === null ? {} : { issueUnread: unread }
  return Object.keys(route).length === 0 ? facts : { ...facts, issueRoute: route }
}

/** The phases a run started after DISCUSS never runs. @param {LoadedWorkflow} workflow @param {string | null} entry */
const skippedPhases = (workflow, entry) => {
  if (entry === null) return []
  return workflow.workflow.phases.slice(0, workflow.workflow.phases.indexOf(ENTRY_AFTER_DISCUSS))
}
