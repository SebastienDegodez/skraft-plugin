#!/usr/bin/env node
// Keep the replay data branch bounded.
//
// Every evaluation run adds a full set of agent trajectories. Without a
// retention rule the `dashboard-data` branch grows without limit and the
// AGENTVIZ session list becomes unusable. This script drops scheduled runs older
// than the retention window (and, on request, one closed pull request's runs),
// then rewrites manifest.json so it never references a deleted file.
//
//   node eng/dashboard/purge-replay-sessions.mjs --root <dir> [--retention-days 14] [--drop-pr N]
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { expiredScheduledDates } from '../lib/replay-sessions.mjs'

const { values } = parseArgs({
  options: {
    root: { type: 'string' },
    'retention-days': { type: 'string', default: '14' },
    'drop-pr': { type: 'string' },
    help: { type: 'boolean', default: false },
  },
  strict: true,
})

if (values.help || !values.root) {
  console.log('Usage: node eng/dashboard/purge-replay-sessions.mjs --root <dir> [--retention-days 14] [--drop-pr N]')
  process.exit(values.help ? 0 : 2)
}

const root = resolve(values.root)
const parsedRetention = Number.parseInt(values['retention-days'], 10)
const retentionDays = Number.isFinite(parsedRetention) && parsedRetention >= 0 ? parsedRetention : 14
const scheduledRoot = join(root, 'sessions/scheduled')
const removed = []

if (existsSync(scheduledRoot)) {
  for (const date of expiredScheduledDates(readdirSync(scheduledRoot), retentionDays)) {
    rmSync(join(scheduledRoot, date), { recursive: true, force: true })
    removed.push(`sessions/scheduled/${date}`)
  }
}

if (values['drop-pr']) {
  const prDirectory = join(root, 'sessions/pr', values['drop-pr'])
  if (existsSync(prDirectory)) {
    rmSync(prDirectory, { recursive: true, force: true })
    removed.push(`sessions/pr/${values['drop-pr']}`)
  }
}

// The manifest is the contract AGENTVIZ reads; a dangling entry is a broken
// replay, so prune it in the same pass that deletes the files.
const manifestPath = join(root, 'manifest.json')
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const kept = (manifest.sessions ?? []).filter((session) => existsSync(join(root, session.url)))
  const dropped = (manifest.sessions ?? []).length - kept.length
  writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, sessions: kept }, null, 2)}\n`)
  console.log(`Purged ${removed.length} directory(ies) and ${dropped} manifest entry(ies); ${kept.length} session(s) remain.`)
} else {
  console.log(`Purged ${removed.length} directory(ies); no manifest to rewrite.`)
}

for (const path of removed) console.log(`  removed ${path}`)
