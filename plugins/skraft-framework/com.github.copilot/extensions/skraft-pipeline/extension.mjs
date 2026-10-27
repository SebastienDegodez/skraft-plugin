// Copilot CLI extension entry, the only file that imports the SDK: hands defineWorkflow and
// joinSession to register (engine/drivers/copilot-workflow/register.mjs), which builds and joins
// the `skraft-pipeline` and `skraft-review` workflows and the `skraft_decide` tool. Nothing else runs here.
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineWorkflow, joinSession } from '@github/copilot-sdk/extension'
import { register } from '../../../engine/drivers/copilot-workflow/register.mjs'

await register({ defineWorkflow, joinSession, pluginRoot: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'), home: homedir() })
