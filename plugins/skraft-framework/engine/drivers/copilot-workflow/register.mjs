import { SKRAFT_PIPELINE_META, runSkraftPipelineWorkflow } from './skraft-pipeline-workflow.mjs'
import { SKRAFT_REVIEW_META, runSkraftReviewWorkflow } from './skraft-review-workflow.mjs'
import { createSkraftDecideTool } from './skraft-decide-tool.mjs'
import { createSessionDirectory } from './session-dir.mjs'
import { createHostConfirmation } from './host-confirmation.mjs'
import { createPipelineCanvas } from './pipeline-canvas.mjs'

/**
 * @typedef {import('./host-confirmation.mjs').ConfirmingSession & {
 *   log: (message: string, options?: { level?: string }) => unknown,
 *   rpc: { metadata: { snapshot: () => Promise<{ workingDirectory?: unknown }> } },
 * }} JoinedSession
 * @typedef {{ workflows: object[], tools: object[], canvases: object[], [key: string]: unknown }} JoinConfig
 * @typedef {{
 *   defineWorkflow: (definition: object) => object,
 *   joinSession: (config: JoinConfig) => Promise<JoinedSession>,
 *   createCanvas?: (options: object) => object,
 *   CanvasError?: new (code: string, message: string) => Error,
 *   pluginRoot: string, home: string,
 * }} Registration defineWorkflow, joinSession, createCanvas and CanvasError: the SDK's, handed over
 *   by the extension entry, the only file that imports the SDK; an SDK without createCanvas leaves
 *   the session without the canvas.
 * @typedef {{ drop: Array<'canvases' | 'tools'>, refused: string[] }} Attempt
 */

// Stryker disable StringLiteral: text shown to the person in the session log; no engine behaviour reads it
const NO_WORKFLOW = 'skraft: the skraft-pipeline workflow could not be defined; it is not available in this session.'
const NO_REVIEW = 'skraft: the skraft-review workflow could not be defined; review a pull request with skraft review --pr in a terminal.'
const NO_TOOL = 'skraft: the skraft_decide tool could not be built; answer a skraft question with skraft decide in a terminal.'
const TOOL_REFUSED = 'skraft: the host refused the skraft_decide tool; answer a skraft question with skraft decide in a terminal.'
const NO_CANVAS = 'skraft: the skraft-pipeline canvas could not be built; follow the run with skraft status in a terminal.'
const CANVAS_REFUSED = 'skraft: the host refused the skraft-pipeline canvas; follow the run with skraft status in a terminal.'
// Stryker restore StringLiteral

/**
 * Registers the `skraft-pipeline` and `skraft-review` workflows, the `skraft_decide` tool and the
 * `skraft-pipeline` canvas in the Copilot session, each built on its own: one that fails leaves
 * the others registered. A join the host refuses is tried again without the canvas, then without
 * the tool, then without both, never without the workflows. Each failure goes to the session log
 * once joined, with a fixed message; nothing is written to stdout, the JSON-RPC channel, and
 * nothing starts (the canvas starts its server when a panel opens). The working directory
 * follows the session (session-dir.mjs): a run reads it when it starts, the tool on each call,
 * the canvas on each open, action and refresh. The tool and the canvas's answer buttons record a
 * decision only once the person confirmed it in the joined session's dialog
 * (host-confirmation.mjs), sharing its rate limit.
 * @param {Registration} registration
 * @returns {Promise<JoinedSession | null>} null when the host refuses every join
 */
export const register = async ({ defineWorkflow, joinSession, createCanvas, CanvasError, pluginRoot, home }) => {
  /** @type {string[]} */
  const missing = []
  const directory = createSessionDirectory()
  const current = { session: /** @type {JoinedSession | null} */ (null) }
  const confirmation = createHostConfirmation({ session: () => current.session })
  const workflows = definedWorkflows({ defineWorkflow, pluginRoot, home }, { directory, confirmation }, missing)
  const tools = built(() => createSkraftDecideTool({ directory: directory.current, pluginRoot, home, confirmation }), NO_TOOL, missing)
  const canvases = built(() => createPipelineCanvas({ createCanvas: /** @type {any} */ (createCanvas), CanvasError: /** @type {any} */ (CanvasError), directory: directory.current, pluginRoot, home, confirmation }), NO_CANVAS, missing)
  current.session = await joined(joinSession, { onEvent: directory.onEvent, workflows, tools, canvases }, missing)
  // Stryker disable next-line ConditionalExpression: with no session the snapshot and the log calls throw inside their catch; nothing observable changes
  if (current.session !== null) await settle(current.session, directory, missing)
  return current.session
}

/**
 * The two workflows, each defined on its own: one the SDK rejects leaves the other.
 * @param {Pick<Registration, 'defineWorkflow' | 'pluginRoot' | 'home'>} registration
 * @param {{ directory: import('./session-dir.mjs').SessionDirectory, confirmation: import('../../application/ports/decision-confirmation.mjs').DecisionConfirmation }} session
 * @param {string[]} missing
 */
const definedWorkflows = ({ defineWorkflow, pluginRoot, home }, { directory, confirmation }, missing) => [
  ...built(() => defineWorkflow({ meta: SKRAFT_PIPELINE_META, run: (/** @type {any} */ ctx) => runSkraftPipelineWorkflow(ctx, { cwd: directory.current(), pluginRoot, home }) }), NO_WORKFLOW, missing),
  ...built(() => defineWorkflow({ meta: SKRAFT_REVIEW_META, run: (/** @type {any} */ ctx) => runSkraftReviewWorkflow(ctx, { cwd: directory.current(), pluginRoot, home, confirmation }) }), NO_REVIEW, missing),
]

/**
 * Once joined: the directory the session started in, then each failure in the session log.
 * @param {JoinedSession} session @param {import('./session-dir.mjs').SessionDirectory} directory @param {string[]} missing
 */
const settle = async (session, directory, missing) => {
  directory.seed(await joinedDirectory(session))
  await logged(session, missing)
}

/**
 * One component, or none when building it throws.
 * @param {() => object} build @param {string} failure @param {string[]} missing
 * @returns {object[]}
 */
const built = (build, failure, missing) => {
  try {
    return [build()]
  } catch {
    missing.push(failure)
    return []
  }
}

/**
 * The session, joined with every component; else without the canvas, then without the tool, then
 * without both; each component left out is said once joined.
 * @param {Registration['joinSession']} joinSession @param {JoinConfig} config @param {string[]} missing
 * @returns {Promise<JoinedSession | null>}
 */
const joined = async (joinSession, config, missing) => {
  for (const { drop, refused } of attempts(config)) {
    const session = await joinSession({ ...config, ...Object.fromEntries(drop.map((key) => [key, []])) }).catch(() => null)
    if (session === null) continue
    missing.push(...refused)
    return session
  }
  return null
}

/**
 * The joins to try in turn, each dropping components the config has.
 * @param {JoinConfig} config @returns {Attempt[]}
 */
const attempts = (config) => /** @type {Attempt[]} */ ([
  { drop: [], refused: [] },
  { drop: ['canvases'], refused: [CANVAS_REFUSED] },
  { drop: ['tools'], refused: [TOOL_REFUSED] },
  { drop: ['canvases', 'tools'], refused: [CANVAS_REFUSED, TOOL_REFUSED] },
]).filter(({ drop }) => drop.every((key) => config[key].length > 0))

/**
 * The session's working directory when it was joined; documented in SDK 1.0.101
 * (`SessionMetadataSnapshot.workingDirectory`), measured by the probe check `snapshot-working-directory`.
 * @param {JoinedSession} session @returns {Promise<unknown>} undefined when the session cannot say
 */
const joinedDirectory = async (session) => {
  try {
    return (await session.rpc.metadata.snapshot()).workingDirectory
  } catch {
    // no snapshot: the directory stays unknown until a session.context_changed
  }
}

/** @param {JoinedSession} session @param {string[]} missing */
const logged = async (session, missing) => {
  for (const message of missing) {
    try {
      await session.log(message, { level: 'error' })
    } catch {
      // the log is the only channel left; a failure there has nowhere to go
    }
  }
}
