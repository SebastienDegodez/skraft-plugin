import { createDecide } from '../../application/decisions/decide-usecase.mjs'
import { createNodeAdapters } from '../../infrastructure/node-adapters.mjs'

/**
 * @typedef {import('../../application/ports/decision-confirmation.mjs').DecisionConfirmation} DecisionConfirmation
 * @typedef {{ directory: () => string | null, pluginRoot: string, home: string, confirmation: DecisionConfirmation }} ToolHost
 *   directory: the session's working directory, read on each call; null while unknown.
 *   confirmation: how the person confirms the answer in the host before it is recorded.
 * @typedef {{ key?: unknown, answer?: unknown, reason?: unknown }} DecideArgs
 */

/**
 * The `skraft_decide` tool: records a person's answer to the question the active pipeline waits
 * on, through Decide, in the session's working directory at the time of the call, once the person
 * confirmed it in the host. A model can call it: its arguments are read, never trusted.
 * Resuming the paused run acts on the answer.
 * @param {ToolHost} host
 */
export const createSkraftDecideTool = (host) => Object.freeze({
  name: 'skraft_decide',
  description: DESCRIPTION,
  parameters: PARAMETERS,
  /** @param {unknown} args */
  handler: (args = {}) => decideIn(host, args),
})

// Stryker disable StringLiteral: text shown to the host and the model; no engine behaviour reads it
const DESCRIPTION =
  "Record the person's answer to the question the active skraft-pipeline run is waiting on; Copilot asks them to confirm it first. " +
  'Then tell them to resume the skraft-pipeline run.'
const NO_DIRECTORY = 'Refused: the session has no working directory yet; nothing was recorded.'
const INVALID_ARGS = 'Refused: skraft_decide takes only key, answer and reason; nothing was recorded.'
// Stryker restore StringLiteral

const KEYS = Object.freeze(['key', 'answer', 'reason'])

const PARAMETERS = Object.freeze({
  type: 'object',
  properties: Object.freeze({
    key: Object.freeze({ type: 'string', description: 'The question key the workflow logged' }),
    answer: Object.freeze({ type: 'string', description: "The person's answer, one of the options the workflow logged" }),
    reason: Object.freeze({ type: 'string', description: "The person's reason, verbatim; required for a refusal" }),
  }),
  required: Object.freeze(['key', 'answer']),
})

/** @param {ToolHost} host @param {unknown} args */
const decideIn = async ({ directory, ...host }, args) => {
  if (!isArgs(args)) return INVALID_ARGS
  const cwd = directory()
  return cwd === null ? NO_DIRECTORY : decide({ cwd, ...host }, args)
}

/** Only the declared keys, in an object. @param {unknown} args @returns {args is DecideArgs} */
const isArgs = (args) => typeof args === 'object' && args !== null && !Array.isArray(args) && Object.keys(args).every((key) => KEYS.includes(key))

/**
 * @param {{ cwd: string, pluginRoot: string, home: string, confirmation: DecisionConfirmation }} host
 * @param {DecideArgs} args
 */
const decide = async ({ cwd, pluginRoot, home, confirmation }, { key, answer, reason }) => {
  const outcome = await createDecide({ ...createNodeAdapters({ cwd, pluginRoot, home }), confirmation }).decide({ key: typeof key === 'string' ? key : null, answer, reason })
  return outcome.ok ? `Recorded: ${outcome.reason}. Resume the paused skraft-pipeline run (/workflows).` : `Refused: ${outcome.reason}; nothing was recorded.`
}
