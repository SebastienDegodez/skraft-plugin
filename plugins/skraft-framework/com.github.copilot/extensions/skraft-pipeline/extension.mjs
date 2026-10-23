// Copilot CLI extension entry: registers the `skraft-pipeline` dynamic workflow and the
// `skraft_decide` tool. Composition only; the driver is engine/drivers/copilot-workflow/.
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineWorkflow, joinSession } from '@github/copilot-sdk/extension'
import { SKRAFT_PIPELINE_META, runSkraftPipelineWorkflow } from '../../../engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { createSkraftDecideTool } from '../../../engine/drivers/copilot-workflow/skraft-decide-tool.mjs'

const host = { cwd: process.cwd(), pluginRoot: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'), home: homedir() }

await joinSession({
  workflows: [defineWorkflow({ meta: SKRAFT_PIPELINE_META, run: (ctx) => runSkraftPipelineWorkflow(ctx, host) })],
  tools: [createSkraftDecideTool(host)],
})
