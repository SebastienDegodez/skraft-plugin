#!/usr/bin/env node
import { basename, isAbsolute, relative } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { readPluginVersion } from '../../infrastructure/plugin-manifest.mjs'
import { createNodeAdapters } from '../../infrastructure/node-adapters.mjs'
import { runCli } from './run-cli.mjs'
import { terminalConfirm } from './terminal-confirm.mjs'

const pluginRoot = new URL('../../../', import.meta.url)
const pluginFolder = fileURLToPath(pluginRoot)

/** The services of a command run in `directory`. @param {string} directory */
const servicesAt = (directory) => ({
  pluginVersion: () => readPluginVersion(new URL('plugin.json', pluginRoot)),
  workingCopyName: () => basename(directory),
  adapters: (/** @type {'copilot' | undefined} */ agentHost) => createNodeAdapters({ cwd: directory, pluginRoot: pluginFolder, agentHost }),
  command: () => `node "${fileURLToPath(import.meta.url)}"`,
  confirm: terminalConfirm({ input: process.stdin, output: process.stderr }),
})

/** Whether `directory` is the plugin folder or inside it, where a host may start the MCP server. @param {string} directory */
const insidePlugin = (directory) => {
  const path = relative(pluginFolder, directory)
  return !path.startsWith('..') && !isAbsolute(path)
}

process.exitCode = await runCli(
  process.argv.slice(2),
  {
    ...servicesAt(process.cwd()),
    lines: () => {
      // A host that goes away closes stdout; the server then has no one to answer and ends with stdin.
      process.stdout.on('error', () => {})
      return createInterface({ input: process.stdin, crlfDelay: Infinity })
    },
    at: servicesAt,
    workingDirectory: () => (insidePlugin(process.cwd()) ? null : process.cwd()),
  },
  { out: (line) => process.stdout.write(`${line}\n`), err: (line) => process.stderr.write(`${line}\n`) },
)
