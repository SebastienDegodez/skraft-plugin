#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { main, remoteMain } from './check-freshness.mjs'

// Thin executable shim (glue, like build-config-bin.mjs): argv → main → exit code.
// `--remote` = cross-harness staleness check (Copilot/Cursor have no SessionStart
// hook); everything else = the local coherence gate.
const argv = process.argv.slice(2)

if (argv.includes('--remote')) {
  const { createLatestReleaseReader } = await import('../adapters/infrastructure/latest-release-reader.mjs')
  const { createUpdateCheckStore } = await import('../adapters/infrastructure/update-check-store.mjs')
  let installedVersion
  try { installedVersion = JSON.parse(readFileSync(new URL('../../.claude-plugin/plugin.json', import.meta.url), 'utf8')).version }
  catch { /* fail-open */ }
  const releaseReader = createLatestReleaseReader({
    store: createUpdateCheckStore({
      storePath: process.env.SKRAFT_UPDATE_CACHE ?? join(homedir(), '.skraft', 'update-check.json')
    }),
    frequency: process.env.SKRAFT_UPDATE_FREQUENCY,
    clock: { now: () => new Date().toISOString() }
  })
  process.exit(await remoteMain({ installedVersion, releaseReader, json: argv.includes('--json') }))
}

process.exit(main(argv))
