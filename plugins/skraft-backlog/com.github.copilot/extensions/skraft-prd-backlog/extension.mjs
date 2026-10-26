// Copilot CLI extension entry, the only file that imports the SDK: hands defineWorkflow,
// joinSession, createCanvas and CanvasError to register (prd-backlog/register.mjs), which builds and
// joins the `skraft-prd-backlog` workflow and the backlog canvas. Nothing else runs here.
import { CanvasError, createCanvas, defineWorkflow, joinSession } from '@github/copilot-sdk/extension'
import { register } from '../../../prd-backlog/register.mjs'

await register({ defineWorkflow, joinSession, createCanvas, CanvasError })
