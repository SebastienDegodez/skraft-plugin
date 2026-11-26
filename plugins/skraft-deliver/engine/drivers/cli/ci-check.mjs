// The CI workflow's last step (#662): fails the job when the run waits on a question that neither a
// draft nor an issue comment holds, so a refused publication is never a passed job. No model runs.
// node ci-check.mjs
import { fileURLToPath } from 'node:url'
import { createNodeAdapters } from '../../infrastructure/node-adapters.mjs'
import { runStandalone } from './standalone-run.mjs'

const pluginRoot = fileURLToPath(new URL('../../../', import.meta.url))
const cwd = process.cwd()
const services = { cwd, pluginVersion: () => '0.1.0', pluginFolder: () => pluginRoot, adapters: () => createNodeAdapters({ cwd, pluginRoot }) }
const console = { out: (line) => process.stdout.write(`${line}\n`), err: (line) => process.stderr.write(`${line}\n`) }
process.exitCode = await runStandalone(['ci-check', '{}'], services, console)
