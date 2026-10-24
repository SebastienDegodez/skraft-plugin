// Copilot CLI extension entry: registers the `skraft-prd-backlog` dynamic workflow and the backlog
// canvas that reviews its result. Composition only; the workflow lives in prd-backlog/workflow.mjs,
// the canvas in prd-backlog/canvas/.
import { CanvasError, createCanvas, defineWorkflow, joinSession } from '@github/copilot-sdk/extension'
import { backlogCanvas } from '../../../prd-backlog/canvas/canvas.mjs'
import { ghCli } from '../../../prd-backlog/publish.mjs'
import { PRD_BACKLOG_META, runPrdBacklogWorkflow } from '../../../prd-backlog/workflow.mjs'

const cwd = process.cwd()
const log = (text) => void process.stderr.write(`${new Date().toISOString()} [skraft-prd-backlog] ${text}\n`)
const { canvas } = backlogCanvas({ createCanvas, CanvasError, cwd, gh: ghCli(cwd), log, icon: 'icon.png' })

await joinSession({
  workflows: [defineWorkflow({ meta: PRD_BACKLOG_META, run: (ctx) => runPrdBacklogWorkflow(ctx, { cwd }) })],
  canvases: [canvas],
})
