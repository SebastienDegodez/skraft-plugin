import { createInterface } from 'node:readline'
import { statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createNodeAdapters } from '../../infrastructure/node-adapters.mjs'
import { serveMcp } from './mcp-server.mjs'
import { runStandalone } from './standalone-run.mjs'

const pluginRoot = fileURLToPath(new URL('../../../', import.meta.url))
const servicesAt = (cwd) => ({
  cwd,
  pluginVersion: () => '0.1.0',
  pluginFolder: () => pluginRoot,
  adapters: () => createNodeAdapters({ cwd, pluginRoot }),
})

const isWorkingCopy = async (directory) => {
  if (!statSync(directory, { throwIfNoEntry: false })?.isDirectory()) return false
  return (await servicesAt(directory).adapters().sourceControl.repository('.')) === '.'
}

const main = async () => {
  const services = { ...servicesAt(process.cwd()), at: servicesAt, isWorkingCopy,
    lines: () => createInterface({ input: process.stdin, crlfDelay: Infinity }),
    workingDirectory: () => process.cwd(),
  }
  await serveMcp(services, {
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  }, runStandalone)
}

await main()
