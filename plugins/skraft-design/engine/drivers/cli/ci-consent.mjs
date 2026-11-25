// The CI workflow's publication consent (#669): the team that commits the workflow consents to its
// architecture pull requests and issue comments on this repository. The consent is kept in the job's
// own ~/.skraft-design/config.json, never in the working copy; no model chooses it, so a run's `mode`
// argument implies none. node ci-consent.mjs
import { fileURLToPath } from 'node:url'
import { createNodeAdapters } from '../../infrastructure/node-adapters.mjs'
import { runStandalone } from './standalone-run.mjs'

const pluginRoot = fileURLToPath(new URL('../../../', import.meta.url))

const main = async () => {
  const cwd = process.cwd()
  const services = { cwd, pluginVersion: () => '0.1.0', pluginFolder: () => pluginRoot, adapters: () => createNodeAdapters({ cwd, pluginRoot }) }
  const console = { out: (line) => process.stdout.write(`${line}\n`), err: (line) => process.stderr.write(`${line}\n`) }
  process.exitCode = await runStandalone(['setup', JSON.stringify({ pullRequest: true })], services, console)
}

await main()
