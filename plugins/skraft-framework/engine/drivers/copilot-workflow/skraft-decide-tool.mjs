import { createDecide } from '../../application/decisions/decide-usecase.mjs'
import { createObserve } from '../../application/pipeline/observe-usecase.mjs'
import { decideUsage } from '../../domain/decisions/questions.mjs'
import { createNodeAdapters } from '../../infrastructure/node-adapters.mjs'
import { askInHost } from './host-question.mjs'

/**
 * @typedef {import('./host-confirmation.mjs').HostDialog} HostDialog
 * @typedef {{ directory: () => string | null, pluginRoot: string, home: string, dialog: HostDialog }} ToolHost
 *   directory: the session's working directory, read on each call; null while unknown.
 *   dialog: where the person answers the question, in Copilot's own dialog.
 */

/**
 * The `skraft_decide` tool: puts the question the active pipeline waits on to the person once, in
 * Copilot's own dialog, as the run puts it (host-question.mjs), and records what they give through
 * Decide, in the session's working directory at the time of the call. A model can call it, so it
 * takes no argument: neither the question nor the answer comes from the model. Resuming the
 * paused run acts on the answer. What it came to is said by a fixed text.
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
 * The question the active pipeline waits on, put to the person, then their answer recorded.
 * @param {ToolHost} host @param {unknown} args @returns {Promise<string>}
 */
const asked = async ({ directory, pluginRoot, home, dialog }, args) => {
  if (!isEmpty(args)) return refused(INVALID_ARGS)
  const cwd = directory()
  if (cwd === null) return refused(NO_DIRECTORY)
  const adapters = createNodeAdapters({ cwd, pluginRoot, home })
  const { question, status } = await createObserve(adapters).view()
  if (question === null) return refused(`no question is waiting (the active pipeline is ${status})`)
  const put = await askInHost(dialog, question)
  if (!put.ok) return refused(`${put.reason}; answer it with skraft decide ${question.key} ${decideUsage(question)} typed in a terminal`)
  return recorded(adapters, dialog.by, { key: question.key, ...put.given })
}

// Stryker disable StringLiteral: text shown to the host and the model; no engine behaviour reads it
const DESCRIPTION =
  'Put the question the active skraft-pipeline run is waiting on to the person in Copilot, and record their answer. Takes no argument. ' +
  'Then tell them to resume the skraft-pipeline run.'
const NO_DIRECTORY = 'the session has no working directory yet'
// Stryker restore StringLiteral

const INVALID_ARGS = 'skraft_decide takes no argument: it asks the person the question itself'

/** What a throw while deciding comes to: never its text, which names paths and reaches the model. */
const UNREADABLE = 'Refused: skraft could not read or write its tracking folder on this machine; nothing was recorded.'

const PARAMETERS = Object.freeze({ type: 'object', properties: Object.freeze({}), additionalProperties: false })

/** @param {string} why */
const refused = (why) => `Refused: ${why}; nothing was recorded.`

/** No argument: an empty object, or none. @param {unknown} args */
const isEmpty = (args) => typeof args === 'object' && args !== null && !Array.isArray(args) && Object.keys(args).length === 0

/**
 * The person's answer through Decide, with the provenance of the dialog they gave it in: Decide
 * reads it as it reads a typed one, and asks no confirmation of it.
 * @param {ReturnType<typeof createNodeAdapters>} adapters @param {string} by
 * @param {{ key: string, answer: string, reason: string | null }} decision
 */
const recorded = async (adapters, by, decision) => {
  const given = Object.freeze({ by, confirm: async () => /** @type {const} */ ({ ok: true }) })
  const outcome = await createDecide({ ...adapters, confirmation: given }).decide(decision)
  return outcome.ok ? `Recorded: ${outcome.reason}. Resume the paused skraft-pipeline run (/workflows).` : refused(outcome.reason)
}
