#!/usr/bin/env node
// Re-keys the published agent verdicts of a dashboard history to the behaviour
// hash (eng/lib/descriptor-hash-migration.mjs). eng/dashboard/publish.sh runs it,
// from the repository root, on the data branch's history.json before each
// publication; an entry it already stamped is skipped:
//
//   node eng/dashboard/migrate-descriptor-hash.mjs --history <history.json>
//
// It reads each verdict's descriptor with `git show <commit>:<path>`, fetching
// the commit when the clone lacks it, rewrites the file in place, and prints
// what it moved and what it kept.
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

import { migrateHistory } from '../lib/descriptor-hash-migration.mjs'
import { agentPathOf } from '../vally-agent-executor/agent-descriptor.mjs'

const { values } = parseArgs({ options: { history: { type: 'string' } } })
if (!values.history) {
  console.error('Usage: node eng/dashboard/migrate-descriptor-hash.mjs --history <history.json>')
  process.exit(2)
}

const git = (args) => spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

const readAt = (commit, agent) => {
  const path = agentPathOf(agent)
  if (!path) return null
  let shown = git(['show', `${commit}:${path}`])
  if (shown.status !== 0) {
    git(['fetch', '--quiet', '--depth=1', 'origin', commit])
    shown = git(['show', `${commit}:${path}`])
  }
  return shown.status === 0 ? shown.stdout : null
}

let history
try {
  history = JSON.parse(readFileSync(values.history, 'utf8'))
} catch {
  console.log(`no readable history at ${values.history}; nothing to migrate`)
  process.exit(0)
}
const { history: migrated, moved, kept } = migrateHistory(history, readAt)
writeFileSync(values.history, `${JSON.stringify(migrated, null, 2)}\n`)
console.log(`moved ${moved} verdict(s) to the behaviour hash`)
for (const { agent, commit, reason } of kept) console.log(`kept ${agent} @ ${commit ?? '-'}: ${reason}`)
