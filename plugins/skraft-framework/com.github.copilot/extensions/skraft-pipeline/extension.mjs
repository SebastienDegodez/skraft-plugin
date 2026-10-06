// Copilot CLI extension entry: registers the `skraft-pipeline` dynamic workflow and the
// `skraft_decide` and `skraft_close_phase` tools with the SDK. Composition root only — the driving adapter is
// src/adapters/api/copilot-workflow/skraft-pipeline-workflow.mjs, the use case
// src/application/pipeline/run-pipeline.mjs. See docs/run-pipeline.md.
//
// Run it:  "Run the skraft-pipeline dynamic workflow for slug checkout, issue 42"
//     or:  copilot workflow run skraft-pipeline --args '{"slug":"checkout","issue":42}'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { defineWorkflow, joinSession } from '@github/copilot-sdk/extension'
import {
  SKRAFT_PIPELINE_META,
  runSkraftPipelineWorkflow,
  createSkraftDecideTool,
  createSkraftClosePhaseTool,
} from '../../../src/adapters/api/copilot-workflow/skraft-pipeline-workflow.mjs'

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const host = { cwd: process.cwd(), pluginRoot: PLUGIN_ROOT, env: process.env }

const skraftPipeline = defineWorkflow({
  meta: SKRAFT_PIPELINE_META,
  run: (ctx) => runSkraftPipelineWorkflow(ctx, host),
})

await joinSession({
  workflows: [skraftPipeline],
  tools: [
    createSkraftDecideTool({ ...host, cwd: () => process.cwd() }),
    createSkraftClosePhaseTool({ ...host, cwd: () => process.cwd() }),
  ],
})
