#!/usr/bin/env node
// Append one evaluation run to the published dashboard history.
//
// History is the trend the dashboard sparkline draws: the last few verdicts per
// skill, with the evidence that produced them (commit, workflow run, models).
// It lives on the `dashboard-data` branch, never on main, so publishing a run
// never rewrites the source tree.
//
//   node eng/dashboard/update-history.mjs --results eval-results/<skill>/results.json \
//     [--history dashboard-data/history.json] [--commit sha] [--run id] [--url link]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { verdictState } from '../lib/verdict.mjs'

const RETAINED_ENTRIES = 10

const { values } = parseArgs({
  options: {
    results: { type: 'string', multiple: true, default: [] },
    history: { type: 'string', default: 'dashboard-data/history.json' },
    commit: { type: 'string' },
    run: { type: 'string' },
    url: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
  strict: true,
})

if (values.help || !values.results.length) {
  console.log('Usage: node eng/dashboard/update-history.mjs --results <results.json> [...] [--history file] [--commit sha] [--run id] [--url link]')
  process.exit(values.help ? 0 : 2)
}

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'))
const historyPath = resolve(repoRoot, values.history)

let history = { schemaVersion: 1, skills: {} }
try {
  history = JSON.parse(readFileSync(historyPath, 'utf8'))
} catch {
  // First publication starts from an empty history.
}
if (history.schemaVersion !== 1 || typeof history.skills !== 'object' || history.skills === null) {
  throw new Error(`Unsupported dashboard history: ${historyPath}`)
}

let appended = 0
for (const resultInput of values.results) {
  const result = JSON.parse(readFileSync(resolve(repoRoot, resultInput), 'utf8'))
  for (const verdict of result.verdicts ?? []) {
    const skill = /^plugins\/skills\/([^/]+)$/.exec(verdict.skillPath ?? '')?.[1] ?? verdict.skillName
    if (!skill) continue

    const timestamp = result.timestamp ?? new Date().toISOString()
    const entry = {
      id: `${values.run ?? 'local'}:${skill}:${timestamp}`,
      timestamp,
      commit: values.commit ?? null,
      run: values.run ?? null,
      url: values.url ?? null,
      model: result.model ?? 'unknown',
      judgeModel: result.judgeModel ?? 'unknown',
      state: verdictState(verdict),
      reason: verdict.reason ?? '',
      netWin: verdict.netWin ?? 0,
      trialCount: verdict.trialCount ?? 0,
      signTest: {
        wins: verdict.signTest?.wins ?? 0,
        ties: verdict.signTest?.ties ?? 0,
        losses: verdict.signTest?.losses ?? 0,
        pValue: verdict.signTest?.pValue ?? null,
      },
    }

    const previous = Array.isArray(history.skills[skill]) ? history.skills[skill] : []
    history.skills[skill] = [...previous.filter((item) => item.id !== entry.id), entry]
      .sort((left, right) => String(left.timestamp).localeCompare(String(right.timestamp)))
      .slice(-RETAINED_ENTRIES)
    appended += 1
  }
}

history.updatedAt = new Date().toISOString()
mkdirSync(dirname(historyPath), { recursive: true })
writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`)
console.log(`Appended ${appended} verdict(s) to ${values.history}`)
