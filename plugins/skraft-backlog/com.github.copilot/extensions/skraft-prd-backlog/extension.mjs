// Copilot CLI extension entry: registers the `skraft-prd-backlog` dynamic workflow. Composition
// only; the workflow lives in prd-backlog/workflow.mjs.
import { defineWorkflow, joinSession } from '@github/copilot-sdk/extension'
import { PRD_BACKLOG_META, runPrdBacklogWorkflow } from '../../../prd-backlog/workflow.mjs'

await joinSession({
  workflows: [defineWorkflow({ meta: PRD_BACKLOG_META, run: (ctx) => runPrdBacklogWorkflow(ctx, { cwd: process.cwd() }) })],
})
