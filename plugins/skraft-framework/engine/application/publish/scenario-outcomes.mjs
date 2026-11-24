import { runsUnder } from '../../domain/pipeline/component-files.mjs'
import { runsFolder } from '../../domain/evidence/run-trace.mjs'
import { deriveRun } from '../../domain/journal/run-state.mjs'
import { scenarioOutcomes } from '../../domain/reporting/scenario-outcomes.mjs'
import { readTrace } from '../evidence/run-trace-store.mjs'

/**
 * Each scenario's outcome, read from the journal, the signed trace of the last delivering attempt
 * that held its evidence, and the commit HEAD is on in each component: what the QA evidence of a
 * run shows. The engine starts no command for it.
 *
 * @typedef {import('../../domain/reporting/scenario-outcomes.mjs').ScenarioOutcome} ScenarioOutcome
 * @typedef {import('../../domain/reporting/scenario-outcomes.mjs').ComponentSuite} ComponentSuite
 * @typedef {import('../../domain/config/skraft-config.mjs').Component} Component
 * @typedef {import('../../domain/journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {{
 *   files: import('../ports/tracking-files.mjs').TrackingFiles,
 *   sourceControl: Pick<import('../ports/source-control.mjs').SourceControl, 'head'>,
 * } & Record<string, any>} OutcomeDeps
 */

/**
 * @param {OutcomeDeps} deps @param {{ slug: string, events: RunEvent[], components: Component[] }} request
 * @returns {Promise<ScenarioOutcome[]>}
 */
export const scenarioOutcomesOf = async (deps, { slug, events, components }) => {
  const { scenarios } = deriveRun(events)
  if (scenarios === null) return []
  const trace = await deliveryTrace(deps, slug, events)
  /** @type {Record<string, ComponentSuite>} */
  const suites = {}
  for (const component of components) suites[component.name] = await suiteOf(deps, { slug, trace, components }, component)
  return scenarioOutcomes({ scenarios, commits: checkedCommits(events), suites })
}

/** Every commit the engine judged, at its last verdict. @param {RunEvent[]} events */
const checkedCommits = (events) => {
  const commits = events.filter((event) => event.type === 'commits.checked').flatMap((event) => event.commits)
  return [...new Map(commits.map((commit) => [commit.sha, commit])).values()]
}

/**
 * The records of the trace of the last delivering attempt the journal kept the evidence of; null
 * when that trace does not read through its signatures, none without such an attempt.
 * @param {OutcomeDeps} deps @param {string} slug @param {RunEvent[]} events
 * @returns {Promise<import('../../domain/evidence/run-trace.mjs').TraceRecord[] | null>}
 */
const deliveryTrace = async (deps, slug, events) => {
  const checked = events.findLast((event) => event.type === 'evidence.checked' && event.red !== true)
  if (checked === undefined) return []
  const trace = await readTrace(deps, { slug, folder: runsFolder(checked.step, checked.visit, checked.attempt), events })
  return trace.ok ? trace.records : null
}

/**
 * The last traced `test` run of the component (none of a component nested under its root), its log, and the commit HEAD is on there.
 * @param {OutcomeDeps} deps @param {{ slug: string, trace: import('../../domain/evidence/run-trace.mjs').TraceRecord[] | null, components: Component[] }} delivery @param {Component} component
 * @returns {Promise<ComponentSuite>}
 */
const suiteOf = async (deps, { slug, trace, components }, component) => {
  const final = await deps.sourceControl.head(component.root)
  if (trace === null) return { final, verified: false, run: null, log: null }
  const run = /** @type {any} */ (trace.findLast((record) => record.type === 'run' && record.gate === 'test' && runsUnder(record.cwd, component, components))) ?? null
  return { final, verified: true, run, log: run === null ? null : await deps.files.read(slug, run.log) }
}
