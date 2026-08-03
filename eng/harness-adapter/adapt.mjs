#!/usr/bin/env node
// Publish an agent evaluation from skraft-test-harness reports.
//
// Vally environments load skills, not custom agents, so an agent is evaluated by
// the harness — which drives the real Copilot CLI with `--plugin-dir` and
// `--agent` against a `--no-custom-instructions` baseline. This adapter reads the
// reports that run produced and writes them in the same shape the Vally adapter
// writes for a skill, so both land on one dashboard through one contract:
//
//   <output-root>/agents/<agent>/results.json
//
//   node eng/harness-adapter/adapt.mjs --reports-dir eval-reports [--agent skraft-orchestrator]
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { harnessModel, verdictFromHarnessReport } from '../lib/harness-report.mjs'

const { values } = parseArgs({
  options: {
    'reports-dir': { type: 'string' },
    'output-root': { type: 'string', default: 'eval-results' },
    agent: { type: 'string' },
    'judge-model': { type: 'string', default: 'unknown' },
    help: { type: 'boolean', default: false },
  },
  strict: true,
})

if (values.help || !values['reports-dir']) {
  console.log(`Usage: node eng/harness-adapter/adapt.mjs --reports-dir <dir> [--agent <id>] [--output-root eval-results]

Fold every harness report under <dir> into one verdict per agent and write
<output-root>/agents/<agent>/results.json.`)
  process.exit(values.help ? 0 : 2)
}

const reportsDir = resolve(values['reports-dir'])
const outputRoot = resolve(values['output-root'])

const jsonFilesIn = (directory, found = []) => {
  if (!existsSync(directory)) return found
  for (const entry of readdirSync(directory).sort()) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) jsonFilesIn(path, found)
    else if (entry.endsWith('.json')) found.push(path)
  }
  return found
}

// The harness writes one report per run, named <subject>-<timestamp>.json, and
// carries the same subject inside. Group by subject so several phase runs of one
// agent become a single verdict over all their scenarios.
const runs = new Map()
for (const path of jsonFilesIn(reportsDir)) {
  let report
  try {
    report = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    console.warn(`⚠ ${basename(path)}: unreadable report (${error.message})`)
    continue
  }
  if (!Array.isArray(report.scenarios)) continue

  const agent = String(report.skill ?? '').trim()
  if (!agent) {
    console.warn(`⚠ ${basename(path)}: report names no subject, skipping`)
    continue
  }
  if (values.agent && agent !== values.agent) continue

  const merged = runs.get(agent) ?? { skill: agent, scenarios: [] }
  merged.scenarios.push(...report.scenarios)
  runs.set(agent, merged)
}

if (runs.size === 0) {
  console.warn(`⚠ No harness report found under ${reportsDir}.`)
  process.exit(0)
}

for (const [agent, report] of [...runs].sort(([left], [right]) => left.localeCompare(right))) {
  const verdict = verdictFromHarnessReport(report, {
    kind: 'agent',
    name: agent,
    path: `plugins/agents/${agent}.agent.md`,
  })
  const result = {
    runner: 'skraft-test-harness',
    model: harnessModel(report),
    judgeModel: values['judge-model'],
    timestamp: new Date().toISOString(),
    verdicts: [verdict],
  }

  const directory = join(outputRoot, 'agents', agent)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'results.json'), `${JSON.stringify(result, null, 2)}\n`)

  const icon = verdict.passed ? '✅' : verdict.underpowered || !verdict.conclusive ? '⚠️' : '❌'
  console.log(`${icon} ${agent}: ${verdict.reason}`)
}

console.log(`Wrote ${runs.size} agent verdict(s) under ${join(outputRoot, 'agents')}`)
