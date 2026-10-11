#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { readPluginVersion } from '../../infrastructure/plugin-manifest.mjs'
import { createNodeAdapters } from '../../infrastructure/node-adapters.mjs'
import { runCli } from './run-cli.mjs'

const pluginRoot = new URL('../../../', import.meta.url)

process.exitCode = await runCli(
  process.argv.slice(2),
  {
    pluginVersion: () => readPluginVersion(new URL('plugin.json', pluginRoot)),
    adapters: () => createNodeAdapters({ cwd: process.cwd(), pluginRoot: fileURLToPath(pluginRoot) }),
  },
  { out: (line) => process.stdout.write(`${line}\n`), err: (line) => process.stderr.write(`${line}\n`) },
)
