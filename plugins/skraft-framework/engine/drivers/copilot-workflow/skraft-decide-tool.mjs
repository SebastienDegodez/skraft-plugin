import { createDecide } from '../../application/decisions/decide-usecase.mjs'
import { createNodeAdapters } from '../../infrastructure/node-adapters.mjs'

/**
 * The `skraft_decide` tool: records the human's answer to the question the active pipeline
 * waits on, through Decide. Resuming the paused run acts on it.
 * @param {{ cwd: string, pluginRoot: string }} host
 */
export const createSkraftDecideTool = ({ cwd, pluginRoot }) => Object.freeze({
  name: 'skraft_decide',
  description: DESCRIPTION,
  parameters: PARAMETERS,
  /** @param {{ key?: unknown, answer?: unknown, reason?: unknown }} args */
  handler: (args = {}) => decide({ cwd, pluginRoot }, args),
})

// Stryker disable StringLiteral: text shown to the host and the model; no engine behaviour reads it
const DESCRIPTION =
  "Record the human's answer to the question the active skraft-pipeline run is waiting on. " +
  'Use only with the exact answer the human gave, and their reason for a refusal; then tell them to resume the skraft-pipeline run.'
// Stryker restore StringLiteral

const PARAMETERS = Object.freeze({
  type: 'object',
  properties: Object.freeze({
    key: Object.freeze({ type: 'string', description: 'The question key the workflow logged' }),
    answer: Object.freeze({ type: 'string', description: "The human's answer, one of the options the workflow logged" }),
    reason: Object.freeze({ type: 'string', description: "The human's reason, verbatim; required for a refusal" }),
  }),
  required: Object.freeze(['key', 'answer']),
})

/**
 * @param {{ cwd: string, pluginRoot: string }} host
 * @param {{ key?: unknown, answer?: unknown, reason?: unknown }} args
 */
const decide = async ({ cwd, pluginRoot }, { key, answer, reason }) => {
  const outcome = await createDecide(createNodeAdapters({ cwd, pluginRoot })).decide({ key: typeof key === 'string' ? key : null, answer, reason })
  return outcome.ok ? `Recorded: ${outcome.reason}. Resume the paused skraft-pipeline run (/workflows).` : `Refused: ${outcome.reason}; nothing was recorded.`
}
