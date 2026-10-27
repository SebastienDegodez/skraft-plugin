// Copilot CLI extension entry, the only file that imports the SDK: hands defineWorkflow,
// joinSession, createCanvas and CanvasError to register (engine/drivers/copilot-workflow/register.mjs),
// which builds and joins the `skraft-pipeline` and `skraft-review` workflows, the `skraft_decide`
// tool and the `skraft-pipeline` canvas. Nothing else runs here. The SDK is read as a namespace:
// an SDK without createCanvas still loads the workflows and the tool, and register logs the
// canvas as missing.
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as sdk from '@github/copilot-sdk/extension'
import { register } from '../../../engine/drivers/copilot-workflow/register.mjs'

const { defineWorkflow, joinSession, createCanvas, CanvasError } = sdk

await register({ defineWorkflow, joinSession, createCanvas, CanvasError, pluginRoot: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'), home: homedir() })
