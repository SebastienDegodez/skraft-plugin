import { createObserve } from '../../application/observe.mjs'
import { createNodeAdapters } from '../../infrastructure/node-adapters.mjs'

/**
 * The `skraft_decide` tool: records the human's answer to the active pipeline's pending
 * question. No step asks one yet, so it only says whether there is an active pipeline.
 * @param {{ cwd: string, pluginRoot: string }} host
 */
export const createSkraftDecideTool = ({ cwd, pluginRoot }) => Object.freeze({
  name: 'skraft_decide',
  description:
    "Record the human's answer to the question the active skraft-pipeline run is waiting on. " +
    'Use only with the exact answer the human gave, then tell them to resume the skraft-pipeline run.',
  parameters: Object.freeze({
    type: 'object',
    properties: Object.freeze({
      key: Object.freeze({ type: 'string', description: 'The question key the workflow logged' }),
      answer: Object.freeze({ type: 'string', description: "The human's answer, verbatim" }),
    }),
    required: Object.freeze(['key', 'answer']),
  }),
  handler: async () => {
    const view = await createObserve(createNodeAdapters({ cwd, pluginRoot })).view()
    if (view.status === 'idle' || view.status === 'tampered') return `Refused: ${view.reason}`
    return `Refused: ${view.slug} has no pending question; nothing was recorded.`
  },
})
