#!/usr/bin/env node
import { readPluginVersion } from '../../infrastructure/plugin-manifest.mjs'
import { runCli } from './run-cli.mjs'

const manifest = new URL('../../../plugin.json', import.meta.url)

process.exitCode = runCli(
  process.argv.slice(2),
  { pluginVersion: () => readPluginVersion(manifest) },
  { out: (line) => process.stdout.write(`${line}\n`), err: (line) => process.stderr.write(`${line}\n`) },
)
