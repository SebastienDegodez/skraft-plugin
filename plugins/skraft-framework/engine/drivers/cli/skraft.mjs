#!/usr/bin/env node
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readPluginVersion } from '../../infrastructure/plugin-manifest.mjs'
import { createNodeAdapters } from '../../infrastructure/node-adapters.mjs'
import { runCli } from './run-cli.mjs'
import { terminalConfirm } from './terminal-confirm.mjs'

const pluginRoot = new URL('../../../', import.meta.url)

process.exitCode = await runCli(
  process.argv.slice(2),
  {
    pluginVersion: () => readPluginVersion(new URL('plugin.json', pluginRoot)),
    workingCopyName: () => basename(process.cwd()),
    adapters: (agentHost) => createNodeAdapters({ cwd: process.cwd(), pluginRoot: fileURLToPath(pluginRoot), agentHost }),
    command: () => `node "${fileURLToPath(import.meta.url)}"`,
    confirm: terminalConfirm({ input: process.stdin, output: process.stderr }),
  },
  { out: (line) => process.stdout.write(`${line}\n`), err: (line) => process.stderr.write(`${line}\n`) },
)
