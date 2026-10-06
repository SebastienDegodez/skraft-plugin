// Copilot CLI / Copilot app extension entry: registers with the SDK the `skraft-pipeline`
// dynamic workflow, the `skraft_decide` and `skraft_close_phase` tools, and the
// `skraft-pipeline` canvas (the Copilot app draws it). Composition root only — the driving
// adapters are src/adapters/api/copilot-workflow/ and src/adapters/api/copilot-canvas/,
// the use cases src/application/pipeline/. See docs/run-pipeline.md.
//
// Run it:  "Run the skraft-pipeline dynamic workflow for slug checkout, issue 42"
//     or:  copilot workflow run skraft-pipeline --args '{"slug":"checkout","issue":42}'
// Follow it in the Copilot app: "Open the Skraft pipeline canvas for checkout"
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CanvasError, createCanvas, defineWorkflow, joinSession } from '@github/copilot-sdk/extension'
import {
  SKRAFT_PIPELINE_META,
  runSkraftPipelineWorkflow,
  createSkraftDecideTool,
  createSkraftClosePhaseTool,
} from '../../../src/adapters/api/copilot-workflow/skraft-pipeline-workflow.mjs'
import { createSkraftPipelineCanvas } from '../../../src/adapters/api/copilot-canvas/skraft-pipeline-canvas.mjs'

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const host = { cwd: process.cwd(), pluginRoot: PLUGIN_ROOT, env: process.env }

const skraftPipeline = defineWorkflow({
  meta: SKRAFT_PIPELINE_META,
  run: (ctx) => runSkraftPipelineWorkflow(ctx, host),
})

// The canvas's buttons reach the chat through the session, joined just below.
let session = null
const skraftCanvas = createCanvas(createSkraftPipelineCanvas({
  ...host,
  cwd: () => process.cwd(),
  sendPrompt: async (prompt) => {
    if (!session) throw new Error('session not joined yet')
    await session.send({ prompt })
  },
  makeError: (code, message) => new CanvasError(code, message),
}))

session = await joinSession({
  workflows: [skraftPipeline],
  tools: [
    createSkraftDecideTool({ ...host, cwd: () => process.cwd() }),
    createSkraftClosePhaseTool({ ...host, cwd: () => process.cwd() }),
  ],
  canvases: [skraftCanvas],
})
