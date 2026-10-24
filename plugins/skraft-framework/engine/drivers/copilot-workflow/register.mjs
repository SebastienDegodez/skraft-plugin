import { SKRAFT_PIPELINE_META, runSkraftPipelineWorkflow } from './skraft-pipeline-workflow.mjs'
import { createSkraftDecideTool } from './skraft-decide-tool.mjs'

/**
 * @typedef {{ log: (message: string, options?: { level?: string }) => unknown }} JoinedSession
 * @typedef {{ workflows: object[], tools: object[], [key: string]: unknown }} JoinConfig
 * @typedef {{
 *   defineWorkflow: (definition: object) => object,
 *   joinSession: (config: JoinConfig) => Promise<JoinedSession>,
 *   cwd: string, pluginRoot: string, home: string,
 * }} Registration defineWorkflow and joinSession: the SDK's, handed over by the extension entry,
 *   the only file that imports the SDK.
 */

// Stryker disable StringLiteral: text shown to the person in the session log; no engine behaviour reads it
const NO_WORKFLOW = 'skraft: the skraft-pipeline workflow could not be defined; it is not available in this session.'
const NO_TOOL = 'skraft: the skraft_decide tool could not be built; answer a skraft question with skraft decide in a terminal.'
const TOOL_REFUSED = 'skraft: the host refused the skraft_decide tool; answer a skraft question with skraft decide in a terminal.'
// Stryker restore StringLiteral

/**
 * Registers the `skraft-pipeline` workflow and the `skraft_decide` tool in the Copilot session,
 * each built on its own: one that fails leaves the other registered. A join the host refuses is
 * tried again without the tool, never without the workflow. Each failure goes to the session log
 * once joined, with a fixed message; nothing is written to stdout, the JSON-RPC channel.
 * @param {Registration} registration
 * @returns {Promise<JoinedSession | null>} null when the host refuses every join
 */
export const register = async ({ defineWorkflow, joinSession, cwd, pluginRoot, home }) => {
  /** @type {string[]} */
  const missing = []
  const workflows = built(() => defineWorkflow({ meta: SKRAFT_PIPELINE_META, run: (/** @type {any} */ ctx) => runSkraftPipelineWorkflow(ctx, { cwd, pluginRoot, home }) }), NO_WORKFLOW, missing)
  const tools = built(() => createSkraftDecideTool({ cwd, pluginRoot, home }), NO_TOOL, missing)
  const session = await joined(joinSession, { workflows, tools }, missing)
  // Stryker disable next-line ConditionalExpression,EqualityOperator: with no session the log call throws inside logged's catch; nothing observable changes
  if (session !== null) await logged(session, missing)
  return session
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
 * The session, joined with every component, else without the tool.
 * @param {Registration['joinSession']} joinSession @param {JoinConfig} config @param {string[]} missing
 * @returns {Promise<JoinedSession | null>}
 */
const joined = async (joinSession, config, missing) => {
  try {
    return await joinSession(config)
  } catch {
    missing.push(TOOL_REFUSED)
    return joinSession({ ...config, tools: [] }).catch(() => null)
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
