import { deriveRun } from '../../domain/journal/run-state.mjs'
import { boundInputs } from '../pipeline/review-inputs.mjs'

/**
 * The documents a skraft run of this working copy wrote for the pull request it opened, so that
 * `skraft review --pr` judges it with the inputs the run's own review of that phase had: the
 * story, each agent's documents by phase (the change-log and its PLAN_DEVIATION lines, the test
 * plan, the implementation plan, the contracts), copied beside the pull request's review under
 * `run/`. The run is the one whose journal (`.copilot-tracking/skraft-plans/<slug>/events.jsonl`)
 * records opening or updating this pull request; there is none when no run or more than one
 * does, when the journal cannot be read, or when the pull request's head holds any file under
 * `.copilot-tracking/`: its author then wrote what that folder says, and no run of this machine did.
 *
 * @typedef {import('./review-runs.mjs').ReviewDocuments} ReviewDocuments
 * @typedef {import('../../domain/journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {{
 *   workspace: import('../ports/workspace.mjs').Workspace,
 *   reviewFiles: import('../ports/tracking-files.mjs').TrackingFiles,
 *   sourceControl: import('../ports/source-control.mjs').SourceControl,
 * }} RunDeps
 * @typedef {{
 *   slug: string, number: number, head: string,
 *   workflow: import('../../domain/workflow/workflow.mjs').Workflow, phase: string,
 * }} RunFacts
 *   slug: the pull request's review; head: the commit of its head; workflow: the pipeline the
 *   review is called from; phase: the phase of that call.
 */

/** Where the runs of the working copy keep their state, relative to it. */
const PLANS = '.copilot-tracking/skraft-plans'

/** Where the run's documents are copied, in the pull request's review. */
const COPIES = 'run'

/** The events that name the pull request a run opened or updated. */
const OPENED = Object.freeze(['pull-request.opened', 'pull-request.updated'])

/**
 * @param {RunDeps} deps @param {RunFacts} facts
 * @returns {Promise<ReviewDocuments | null>}
 */
export const runDocuments = async (deps, facts) => {
  if (await authored(deps.sourceControl, facts.head)) return null
  const runs = await runsNaming(deps.workspace, facts.number)
  if (runs.length !== 1) return null
  const [{ slug, events }] = runs
  const documents = documentsOf(facts, events)
  await copyAll(deps, { from: slug, to: facts.slug }, pathsOf(documents))
  return copiedAs(documents)
}

/**
 * What the run's review of the phase read, as the pipeline hands it.
 * @param {RunFacts} facts @param {RunEvent[]} events a journal whose first event is run.started
 * @returns {ReviewDocuments}
 */
const documentsOf = ({ workflow, phase }, events) => {
  // Stryker disable next-line ArrayDeclaration: the documents never depend on the components, which only the gates read
  const inputs = boundInputs(/** @type {any} */ ({ call: null }), { workflow, run: deriveRun(events), phase, components: [], events })
  return /** @type {ReviewDocuments} */ (inputs.documents)
}

/**
 * Whether the head holds a file under `.copilot-tracking/`; the review reached its inputs only
 * once Git listed what the head holds.
 * @param {RunDeps['sourceControl']} sourceControl @param {string} head
 */
const authored = async (sourceControl, head) => {
  // Stryker disable next-line StringLiteral: '' and '.' are both the working copy to SourceControl
  const held = /** @type {string[]} */ (await sourceControl.filesAt('.', head))
  return held.some((path) => path.startsWith('.copilot-tracking/'))
}

/**
 * The runs of the working copy whose journal names the pull request, with their events.
 * @param {RunDeps['workspace']} workspace @param {number} number
 * @returns {Promise<Array<{ slug: string, events: RunEvent[] }>>}
 */
const runsNaming = async (workspace, number) => {
  const folders = await listed(workspace, PLANS)
  const journals = await Promise.all(folders.map(async ({ name }) => ({ slug: name, events: eventsOf(await workspace.read(`${PLANS}/${name}/events.jsonl`)) })))
  return journals.filter(({ events }) => events.length > 0 && events[0].type === 'run.started' && events.some((event) => OPENED.includes(event.type) && event.number === number))
}

/**
 * A folder's entries; none when it is no folder or cannot be listed. An entry that is no run's
 * folder holds no journal, so it names no pull request.
 * @param {RunDeps['workspace']} workspace @param {string} path
 */
const listed = async (workspace, path) => {
  try {
    // Stryker disable next-line ArrayDeclaration: an entry that is no folder of a run holds no journal, so a made-up one finds no run either
    return (await workspace.list(path)) ?? []
  } catch {
    // Stryker disable next-line ArrayDeclaration: an entry that is no folder of a run holds no journal, so a made-up one finds no run either
    return []
  }
}

/** A journal's events; none when it is absent or a line is no event. @param {string | null} text @returns {RunEvent[]} */
const eventsOf = (text) => {
  try {
    return (text ?? '').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line))
  } catch {
    // Stryker disable next-line ArrayDeclaration: a journal whose first event is not run.started is no run's, as an empty one
    return []
  }
}

/** Every path the documents name, none climbing out of the tracking folder. @param {ReviewDocuments} documents */
const pathsOf = ({ outputs, context, phases }) => [...outputs, ...context, ...phases.flatMap(({ steps }) => steps.flatMap(({ documents }) => documents))]
  .filter((path) => !path.split('/').includes('..'))

/**
 * Each document the run's tracking folder holds, copied into the pull request's review.
 * @param {RunDeps} deps @param {{ from: string, to: string }} slugs @param {string[]} paths
 */
const copyAll = async ({ workspace, reviewFiles }, { from, to }, paths) => {
  for (const path of paths) {
    const text = await workspace.read(`${PLANS}/${from}/${path}`)
    if (text !== null) await reviewFiles.write(to, `${COPIES}/${path}`, text)
  }
}

/** The documents where the review holds their copies. @param {ReviewDocuments} documents @returns {ReviewDocuments} */
const copiedAs = ({ outputs, context, artifacts, phases }) => ({
  outputs: outputs.map(copyOf),
  context: context.map(copyOf),
  artifacts: artifacts.map(copyOf),
  phases: phases.map(({ phase, steps }) => ({ phase, steps: steps.map((step) => ({ ...step, documents: step.documents.map(copyOf) })) })),
})

/** @param {string} path */
const copyOf = (path) => `${COPIES}/${path}`
