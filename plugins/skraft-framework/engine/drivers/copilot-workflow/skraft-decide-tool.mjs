import { createDecide } from '../../application/decisions/decide-usecase.mjs'
import { createObserve } from '../../application/pipeline/observe-usecase.mjs'
import { createNodeAdapters } from '../../infrastructure/node-adapters.mjs'

/**
 * @typedef {{ directory: () => string | null, pluginRoot: string, home: string }} ToolHost
 *   directory: the session's working directory, read on each call; null while unknown.
 */

/**
 * Reads the pending question, or records the native human reply relayed by the model.
 * Neither path elicits. The resumed workflow consumes the journaled answer.
 * @param {ToolHost} host
 */
export const createSkraftDecideTool = (host) => Object.freeze({
  name: 'skraft_decide',
  description: DESCRIPTION,
  parameters: PARAMETERS,
  /** @param {unknown} args */
  handler: (args = {}) => answerText(host, args),
})

/**
 * What the tool answers: a throw while reading or recording is a fixed refusal, never its text,
 * which names paths and would reach the model as a tool error.
 * @param {ToolHost} host @param {unknown} args @returns {Promise<string>}
 */
const answerText = async (host, args) => {
  try {
    return await asked(host, args)
  } catch {
    return UNREADABLE
  }
}

/**
 * Read or submit in the session's current workspace.
 * @param {ToolHost} host @param {unknown} args @returns {Promise<string>}
 */
const asked = async ({ directory, pluginRoot, home }, args) => {
  if (!validArgs(args)) return refused(INVALID_ARGS)
  const cwd = directory()
  if (cwd === null) return refused(NO_DIRECTORY)
  const adapters = createNodeAdapters({ cwd, pluginRoot, home })
  if (Object.keys(args).length > 0) return recorded(adapters, args)
  const { question, status } = await createObserve(adapters).view()
  return question === null
    ? refused(`no question is waiting (the active pipeline is ${status})`)
    : JSON.stringify({ question, guidance: NATIVE_GUIDANCE })
}

// Stryker disable StringLiteral: text shown to the host and the model; no engine behaviour reads it
const DESCRIPTION =
  'Read the exact pending question with {}. ' +
  'After the developer replies through the native question tool, submit {key, answer, reason?}. ' +
  'Never infer an answer or submit on dismissal. Resume the same skraft-pipeline workflow run ID.'
const NO_DIRECTORY = 'the session has no working directory yet'
export const NATIVE_GUIDANCE =
  'Present this exact question and options through the offered native ask_user or askQuestions tool. ' +
  'For a refusal, request its reason through that tool. Relay only the returned human reply with skraft_decide {key, answer, reason?}, ' +
  'then resume the SAME workflow run ID. If the native tool is unavailable or dismissed, report that blocker, leave the run paused and record nothing.'
// Stryker restore StringLiteral

const INVALID_ARGS = 'skraft_decide takes {} to read, or a non-empty key and answer with an optional non-empty reason to record'

/** What a throw while deciding comes to: never its text, which names paths and reaches the model. */
const UNREADABLE = 'Refused: skraft could not read or write its tracking folder on this machine; nothing was recorded.'

const PARAMETERS = Object.freeze({
  type: 'object', additionalProperties: false,
  properties: { key: { type: 'string', minLength: 1 }, answer: { type: 'string', minLength: 1 }, reason: { type: 'string', minLength: 1 } },
})

/** @param {string} why */
const refused = (why) => `Refused: ${why}; nothing was recorded.`

/** @param {unknown} args @returns {args is { key: string, answer: string, reason?: string }} */
const validArgs = (args) => {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return false
  const entries = Object.entries(args)
  if (entries.length === 0) return true
  return entries.every(([key, value]) => ['key', 'answer', 'reason'].includes(key) && typeof value === 'string' && value.trim().length > 0)
    && 'key' in args && 'answer' in args
}

/**
 * @param {ReturnType<typeof createNodeAdapters>} adapters
 * @param {{ key: string, answer: string, reason?: string }} decision
 */
const recorded = async (adapters, decision) => {
  const outcome = await createDecide(adapters).decide(decision)
  return outcome.ok ? `Recorded: ${outcome.reason}. Resume the paused skraft-pipeline run (/workflows).` : refused(outcome.reason)
}
