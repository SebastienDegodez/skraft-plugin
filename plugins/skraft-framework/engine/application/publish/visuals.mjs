import { CONFIG_FILE } from '../../domain/config/skraft-config.mjs'
import { joinRelative } from '../../domain/config/relative-path.mjs'
import { failureOf } from '../../domain/gates/gate-plan.mjs'
import { engineMessage, issueOf } from '../../domain/pipeline/commits.mjs'
import { trackingFolder } from '../../domain/pipeline/roles.mjs'
import { evidenceCopies, isFrontend, readManifest, VISUALS_MANIFEST } from '../../domain/reporting/visuals.mjs'
import { baseOf } from '../config/bases.mjs'
import { evidenceLog, startCommand } from '../gates/gate-runs.mjs'

/**
 * The visuals of a run: each front end's e2e command run from its root, the screenshots its
 * manifest lists then kept in the story's evidence folder and committed on the working branch,
 * with the developer's consent. Visuals are evidence, never a gate: what stops them is told,
 * and the run goes on.
 *
 * @typedef {import('../../domain/config/skraft-config.mjs').Component} Component
 * @typedef {import('../../domain/reporting/visuals.mjs').ComponentVisuals} ComponentVisuals
 * @typedef {import('../../domain/reporting/visuals.mjs').Screenshot} Screenshot
 * @typedef {import('../../domain/reporting/visuals.mjs').Visuals} Visuals
 * @typedef {{
 *   files: import('../ports/tracking-files.mjs').TrackingFiles,
 *   workspace: import('../ports/workspace.mjs').Workspace,
 *   sourceControl: import('../ports/source-control.mjs').SourceControl,
 *   commandRunner: import('../ports/command-runner.mjs').CommandRunner,
 *   clock: import('../ports/clock.mjs').Clock,
 * }} VisualsDeps
 * @typedef {{
 *   slug: string, journal: import('../journal/run-journal.mjs').OpenJournal,
 *   config: import('../../domain/config/skraft-config.mjs').SkraftConfig,
 *   run: import('../../domain/journal/run-state.mjs').RunState,
 * }} VisualsRequest
 * @typedef {{ visuals: ComponentVisuals, copies: Array<{ from: string, kept: Screenshot }> }} E2eRun
 *   copies: the screenshots its manifest lists, each with where it is kept.
 * @typedef {{ outcome: 'recorded' | 'not-recorded' | 'e2e-failed', reason: string, visuals: Visuals }} VisualsRecord
 */

/** How long an e2e run may take: what the Claude Code mod's process runner allows at most. */
const E2E_TIMEOUT_MS = 600_000

/** @param {VisualsDeps} deps @param {VisualsRequest} request @returns {Promise<VisualsRecord>} */
export const recordVisuals = async (deps, request) => {
  const runs = []
  for (const component of request.config.components.filter(isFrontend)) runs.push(await e2eRun(deps, request, component))
  return outcomeOf(await kept(deps, request, runs))
}

/** @param {Visuals} visuals @returns {VisualsRecord} */
const outcomeOf = (visuals) => {
  const failed = visuals.components.filter(({ e2e }) => e2e === 'failed').map(({ component }) => component)
  if (failed.length > 0) return { outcome: 'e2e-failed', reason: `the e2e run of ${failed.join(', ')} failed`, visuals }
  const count = visuals.components.flatMap(({ screenshots }) => screenshots).length
  if (visuals.commit !== null) return { outcome: 'recorded', reason: `${screenshotCount(count)} committed in ${visuals.commit}`, visuals }
  return { outcome: 'not-recorded', reason: `no screenshot committed: ${visuals.components.map(({ component, detail }) => `${component}: ${detail}`).join('; ')}`, visuals }
}

/** @param {number} count */
const screenshotCount = (count) => `${count} screenshot${count === 1 ? '' : 's'}`

/**
 * A front end's e2e command, run from its root once an earlier manifest is emptied, then the
 * screenshots the manifest it wrote lists.
 * @param {VisualsDeps} deps @param {VisualsRequest} request @param {Component} component
 * @returns {Promise<E2eRun>}
 */
const e2eRun = async (deps, request, component) => {
  const line = component.commands.e2e
  if (line === undefined) return notRun(component)
  await clearManifest(deps, component)
  const tried = await startCommand(deps, component, { line, baseSha: baseOf(request.run.base, component.name)?.sha ?? null, timeoutMs: E2E_TIMEOUT_MS })
  const failure = tried.result === null ? 'environment' : failureOf(tried.result)
  const evidence = nextEvidence(request.journal, component)
  await deps.files.write(request.slug, evidence, evidenceLog(component, failure, tried))
  const ran = { component: component.name, command: line, evidence, screenshots: [] }
  if (failure !== null) return { visuals: { ...ran, e2e: 'failed', detail: `no screenshots: ${tried.reason}` }, copies: [] }
  return listed(deps, request, { component, ran })
}

/** @param {Component} component @returns {E2eRun} */
const notRun = (component) => ({
  visuals: { component: component.name, command: null, e2e: 'not-run', detail: `no e2e command; give it commands.e2e in ${CONFIG_FILE}`, evidence: null, screenshots: [] },
  copies: [],
})

/** A manifest an earlier run left is emptied, so that only one this run wrote is read. @param {VisualsDeps} deps @param {Component} component */
const clearManifest = async (deps, component) => {
  const path = joinRelative(component.root, VISUALS_MANIFEST)
  if ((await deps.workspace.read(path)) !== null) await deps.workspace.write(path, '')
}

/** Each e2e run of a component keeps its own log. @param {VisualsRequest['journal']} journal @param {Component} component */
const nextEvidence = (journal, component) => {
  const earlier = journal.events.filter((event) => event.type === 'visuals.recorded').flatMap((event) => event.components).filter((run) => run.component === component.name && run.evidence !== null)
  return `visuals/${component.name}/e2e-${earlier.length + 1}.log`
}

/**
 * The screenshots the manifest lists, each file present, with where each is kept.
 * @param {VisualsDeps} deps @param {VisualsRequest} request
 * @param {{ component: Component, ran: Omit<ComponentVisuals, 'e2e' | 'detail'> }} passed
 * @returns {Promise<E2eRun>}
 */
const listed = async (deps, request, { component, ran }) => {
  const reading = await manifestOf(deps, component)
  if (!reading.ok) return { visuals: { ...ran, e2e: 'passed', detail: `screenshots not recorded: ${reading.reason}` }, copies: [] }
  return { visuals: { ...ran, e2e: 'passed', detail: '' }, copies: evidenceCopies(`${trackingFolder(request.slug)}/evidence/${request.slug}`, component, reading.screenshots) }
}

/**
 * @param {VisualsDeps} deps @param {Component} component
 * @returns {Promise<import('../../domain/reporting/visuals.mjs').ManifestReading>}
 */
const manifestOf = async ({ workspace }, component) => {
  const reading = readManifest(await workspace.read(joinRelative(component.root, VISUALS_MANIFEST)))
  if (!reading.ok) return reading
  const missing = []
  for (const [index, { path }] of reading.screenshots.entries()) if ((await workspace.read(joinRelative(component.root, path))) === null) missing.push(index + 1)
  return missing.length === 0 ? reading : { ok: false, reason: `the file of screenshot ${missing.join(', ')} of ${VISUALS_MANIFEST} is missing` }
}

/**
 * The listed screenshots committed with the developer's consent; each component told what
 * became of its own.
 * @param {VisualsDeps} deps @param {VisualsRequest} request @param {E2eRun[]} runs
 * @returns {Promise<Visuals>}
 */
const kept = async (deps, request, runs) => {
  const copies = runs.flatMap((run) => run.copies)
  if (copies.length === 0) return { commit: null, components: runs.map(({ visuals, copies: none }) => told(visuals, none, 'none listed')) }
  const consent = request.config.publish.visuals
  if (consent !== true) return { commit: null, components: runs.map(({ visuals, copies: own }) => told(visuals, own, `not published (consent): ${consentReason(consent)}`)) }
  return committed(deps, request, runs)
}

/**
 * @param {ComponentVisuals} visuals @param {E2eRun['copies']} copies @param {string} what what became of its screenshots
 * @returns {ComponentVisuals}
 */
const told = (visuals, copies, what) => (visuals.detail === '' ? { ...visuals, detail: copies.length === 0 ? 'its manifest lists no screenshot' : `${screenshotCount(copies.length)} ${what}` } : visuals)

/** @param {boolean | null} consent */
const consentReason = (consent) => (consent === null
  ? `nobody answered the reporting-consent question yet (publish.visuals in ${CONFIG_FILE})`
  : `${CONFIG_FILE} sets publish.visuals to false`)

/**
 * The copies committed alone on the working branch, by the engine, citing the story's issue.
 * @param {VisualsDeps} deps @param {VisualsRequest} request @param {E2eRun[]} runs
 * @returns {Promise<Visuals>}
 */
const committed = async (deps, request, runs) => {
  const holding = runs.filter((run) => run.copies.length > 0).map((run) => run.visuals.component)
  const copies = runs.flatMap((run) => run.copies).map(({ from, kept: { path } }) => ({ from, to: path }))
  const made = await deps.sourceControl.commitCopies('.', copies, engineMessage(`docs(evidence): screenshots of ${holding.join(', ')}`, issueOf(request.run.story)))
  if (!made.ok) return { commit: null, components: runs.map(({ visuals, copies: own }) => told(visuals, own, 'not recorded: Git could not commit them')) }
  return { commit: await deps.sourceControl.head('.'), components: runs.map(({ visuals, copies: own }) => ({ ...told(visuals, own, 'committed'), screenshots: own.map((copy) => copy.kept) })) }
}
