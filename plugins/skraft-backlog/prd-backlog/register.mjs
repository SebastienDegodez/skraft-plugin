// Registers the `skraft-prd-backlog` workflow and the backlog canvas in the Copilot session, from
// the SDK functions the extension entry hands over (the only file that imports the SDK).
import { backlogCanvas } from './canvas/canvas.mjs'
import { ghCli } from './publish.mjs'
import { createSessionDirectory } from './session-dir.mjs'
import { PRD_BACKLOG_META, runPrdBacklogWorkflow } from './workflow.mjs'

/**
 * @typedef {{
 *   log: (message: string, options?: { level?: string }) => unknown,
 *   rpc?: { metadata?: { snapshot?: () => Promise<{ workingDirectory?: unknown }> } },
 * }} JoinedSession
 * @typedef {{ workflows: object[], canvases: object[], onEvent: (event: any) => void }} JoinConfig
 * @typedef {{
 *   defineWorkflow: (definition: object) => object,
 *   joinSession: (config: JoinConfig) => Promise<JoinedSession>,
 *   createCanvas: (options: any) => any,
 *   CanvasError: new (code: string, message: string) => Error,
 * }} Registration
 */

export const NO_WORKFLOW = 'skraft-backlog: the skraft-prd-backlog workflow could not be defined; it is not available in this session.'
export const NO_CANVAS = 'skraft-backlog: the backlog canvas could not be built; review the backlog files under .copilot-tracking instead.'
export const CANVAS_REFUSED = 'skraft-backlog: the host refused the backlog canvas; review the backlog files under .copilot-tracking instead.'
export const CANVAS_FAILED = 'skraft-backlog: the backlog canvas hit an error; reopen it to start it again.'

/**
 * Each component is built on its own: one that fails leaves the other registered. A join the host
 * refuses is tried again without the canvas, never without the workflow. Each failure goes to the
 * session log once joined, with a fixed message; nothing is written to stdout (the JSON-RPC
 * channel) or stderr. The working directory follows the session: a run reads it when it starts,
 * the canvas on each open and each action.
 * @param {Registration} registration
 * @returns {Promise<JoinedSession | null>} null when the host refuses every join
 */
export const register = async ({ defineWorkflow, joinSession, createCanvas, CanvasError }) => {
  /** @type {string[]} */
  const missing = []
  const directory = createSessionDirectory()
  const current = { session: /** @type {JoinedSession | null} */ (null) }
  const report = () => logged(current.session, [CANVAS_FAILED])
  const workflows = built(() => defineWorkflow({ meta: PRD_BACKLOG_META, run: (/** @type {any} */ ctx) => runPrdBacklogWorkflow(ctx, { cwd: directory.current() }) }), NO_WORKFLOW, missing)
  const gh = (/** @type {string[]} */ args, /** @type {string | undefined} */ input) => ghCli(directory.current() ?? undefined)(args, input)
  const canvases = built(() => backlogCanvas({ createCanvas, CanvasError, cwd: directory.current, gh, log: report, icon: 'icon.png' }).canvas, NO_CANVAS, missing)
  current.session = await joined(joinSession, { onEvent: directory.onEvent, workflows, canvases }, missing)
  if (current.session === null) return null
  directory.seed(await joinedDirectory(current.session))
  await logged(current.session, missing)
  return current.session
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
 * The session, joined with every component, else without the canvas.
 * @param {Registration['joinSession']} joinSession @param {JoinConfig} config @param {string[]} missing
 * @returns {Promise<JoinedSession | null>}
 */
const joined = async (joinSession, config, missing) => {
  try {
    return await joinSession(config)
  } catch {
    if (config.canvases.length > 0) missing.push(CANVAS_REFUSED)
    return joinSession({ ...config, canvases: [] }).catch(() => null)
  }
}

/**
 * The session's working directory when it was joined (`SessionMetadataSnapshot.workingDirectory`,
 * SDK 1.0.101, probe check `snapshot-working-directory`).
 * @param {JoinedSession} session @returns {Promise<unknown>} undefined when the session cannot say
 */
const joinedDirectory = async (session) => {
  try {
    return (await session.rpc?.metadata?.snapshot?.())?.workingDirectory
  } catch {
    return undefined
  }
}

/** @param {JoinedSession | null} session @param {string[]} messages */
const logged = async (session, messages) => {
  for (const message of messages) {
    try {
      await session?.log(message, { level: 'error' })
    } catch {
      // the log is the only channel left; a failure there has nowhere to go
    }
  }
}
