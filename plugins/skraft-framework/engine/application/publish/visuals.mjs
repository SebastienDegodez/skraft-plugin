import { CONFIG_FILE } from '../../domain/config/skraft-config.mjs'
import { joinRelative, pathUnder } from '../../domain/config/relative-path.mjs'
import { engineMessage, issueOf } from '../../domain/pipeline/commits.mjs'
import { trackingFolder } from '../../domain/pipeline/roles.mjs'
import { evidenceCopies, isFrontend, readManifest, VISUALS_MANIFEST } from '../../domain/reporting/visuals.mjs'
import { readTrace } from '../evidence/run-trace-store.mjs'

/**
 * The visuals of a run: each front end's last traced e2e run of `skraft_repl` (the engine starts no
 * command), the screenshots its manifest lists then kept in the story's evidence folder and committed on the working branch,
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
 *   clock: import('../ports/clock.mjs').Clock,
 * }} VisualsDeps
 * @typedef {{
 *   slug: string, journal: import('../journal/run-journal.mjs').OpenJournal,
 *   config: import('../../domain/config/skraft-config.mjs').SkraftConfig,
 *   run: import('../../domain/journal/run-state.mjs').RunState,
 * }} VisualsRequest
 * @typedef {{ visuals: ComponentVisuals, copies: Array<{ from: string, within: string, kept: Screenshot }> }} E2eRun
 *   copies: the screenshots its manifest lists, each with where it is kept.
 * @typedef {{ outcome: 'recorded' | 'not-recorded' | 'e2e-failed', reason: string, visuals: Visuals }} VisualsRecord
 */

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
 * A front end's last traced e2e run, then the screenshots the manifest it wrote lists.
 * @param {VisualsDeps} deps @param {VisualsRequest} request @param {Component} component
 * @returns {Promise<E2eRun>}
 */
const e2eRun = async (deps, request, component) => {
  const traced = await lastE2e(deps, request, component)
  if (traced === null) return notRun(component)
  const ran = { component: component.name, command: traced.command, evidence: traced.log, screenshots: [] }
  if (traced.exitCode !== 0) return { visuals: { ...ran, e2e: 'failed', detail: 'no screenshots: the traced e2e run did not exit 0' }, copies: [] }
  return listed(deps, request, { component, ran })
}

/**
 * The last run traced as the e2e gate of the component, in any attempt of the run.
 * @param {VisualsDeps} deps @param {VisualsRequest} request @param {Component} component
 * @returns {Promise<import('../../domain/evidence/run-trace.mjs').RunRecord | null>}
 */
const lastE2e = async (deps, { slug, journal, config }, component) => {
  const folders = (await deps.files.list(slug, 'logs/runs')).filter((path) => path.endsWith('/runs.jsonl')).map((path) => path.slice(0, -'/runs.jsonl'.length)).sort()
  for (const folder of folders.reverse()) {
    const trace = await readTrace(/** @type {any} */ (deps), { slug, folder, events: journal.events })
    const found = trace.ok ? trace.records.findLast((record) => record.type === 'run' && record.gate === 'e2e' && pathUnder(record.cwd, component.root) !== null) : undefined
    if (found !== undefined) return /** @type {import('../../domain/evidence/run-trace.mjs').RunRecord} */ (found)
  }
  return null
}

/** @param {Component} component @returns {E2eRun} */
const notRun = (component) => ({
  visuals: { component: component.name, command: null, e2e: 'not-run', detail: 'no traced e2e run: run the front end\'s e2e command through skraft_repl with gate(\'e2e\', <command>, { cwd: <its root> })', evidence: null, screenshots: [] },
  copies: [],
})

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
  if (copies.length === 0) return { commit: null, components: runs.map(({ visuals }) => unlisted(visuals)) }
  // A front end's screenshots are listed only once the visuals node has the consent's answer: false here means declined.
  if (request.config.publish.visuals !== true) return { commit: null, components: runs.map(({ visuals, copies: own }) => told(visuals, own, `not published (consent): ${CONFIG_FILE} sets publish.visuals to false`)) }
  return committed(deps, request, runs)
}

/**
 * @param {ComponentVisuals} visuals @param {E2eRun['copies']} copies @param {string} what what became of its screenshots
 * @returns {ComponentVisuals}
 */
const told = (visuals, copies, what) => (copies.length === 0 ? unlisted(visuals) : { ...visuals, detail: `${screenshotCount(copies.length)} ${what}` })

/** A component whose e2e run passed with a manifest that lists nothing. @param {ComponentVisuals} visuals @returns {ComponentVisuals} */
const unlisted = (visuals) => (visuals.detail === '' ? { ...visuals, detail: 'its manifest lists no screenshot' } : visuals)

/**
 * Why the copies were not committed: the files the copy refused, or Git.
 * @param {string[] | undefined} refused
 */
const notCommitted = (refused) => (refused === undefined
  ? 'Git could not commit them'
  : `refused ${refused.join(', ')} (a symbolic link, a file outside its component, or not a PNG)`)


/**
 * The copies committed alone on the working branch, by the engine, citing the story's issue.
 * @param {VisualsDeps} deps @param {VisualsRequest} request @param {E2eRun[]} runs
 * @returns {Promise<Visuals>}
 */
const committed = async (deps, request, runs) => {
  const holding = runs.filter((run) => run.copies.length > 0).map((run) => run.visuals.component)
  const copies = runs.flatMap((run) => run.copies).map(({ from, within, kept: { path } }) => ({ from, to: path, within }))
  const made = await deps.sourceControl.commitCopies('.', copies, engineMessage(`docs(evidence): screenshots of ${holding.join(', ')}`, issueOf(request.run.story)))
  if (!made.ok) return { commit: null, components: runs.map(({ visuals, copies: own }) => told(visuals, own, `not recorded: ${notCommitted(made.refused)}`)) }
  // Stryker disable next-line StringLiteral: '' and '.' are both the working copy to SourceControl
  return { commit: await deps.sourceControl.head('.'), components: runs.map(({ visuals, copies: own }) => ({ ...told(visuals, own, 'committed'), screenshots: own.map((copy) => copy.kept) })) }
}
