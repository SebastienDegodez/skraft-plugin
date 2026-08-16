#!/usr/bin/env node
// Turn one agent-suite run into publishable verdicts for the agents it exercised.
//
// eng/run-vally-evals.sh runs an agent suite once, through the SKRAFT agent
// executor, and hands the resulting JSONL stream here. There is no second arm to
// compare against — a suite asserts conformance, not lift — so the tally becomes
// a verdict at <output-root>/<suite>/results.json, the same file the publisher
// and the PR comment already read for skills.
//
//   node eng/vally-adapter/adapt-agent.mjs --results <jsonl> --spec <eval.yaml> --suite <name>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { agentByStimulus, agentSuiteVerdicts } from '../lib/agent-verdict.mjs'

const { values: options } = parseArgs({
  options: {
    results: { type: 'string' },
    spec: { type: 'string' },
    suite: { type: 'string' },
    'output-root': { type: 'string', default: 'eval-results' },
    model: { type: 'string', default: 'unknown' },
    help: { type: 'boolean', default: false },
  },
  strict: true,
})

if (options.help || !options.results || !options.spec || !options.suite) {
  console.log(`Usage: node eng/vally-adapter/adapt-agent.mjs --results <jsonl> --spec <eval.yaml> --suite <name> [options]

Read one agent suite's Vally records and write <output-root>/<suite>/results.json.`)
  process.exit(options.help ? 0 : 1)
}

const parseJsonl = (file) => {
  const text = readFileSync(resolve(file), 'utf8').trim()
  return text ? text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)) : []
}

const records = parseJsonl(options.results)
const spec = readFileSync(resolve(options.spec), 'utf8')
// The threshold a trial must reach is the suite's own; it is not a CLI knob,
// because loosening it from the command line would silently redefine what
// "the agent conformed" means for that suite.
const threshold = Number(/^scoring:\s*$[\s\S]*?^\s+threshold:\s*([\d.]+)/m.exec(spec)?.[1] ?? 1)

const verdicts = agentSuiteVerdicts(records, { agents: agentByStimulus(spec), threshold })

if (!verdicts.length) {
  console.warn(`⚠ ${options.suite}: no trial named an agent (missing \`tags.agent\`?); nothing to publish`)
  process.exit(0)
}

const summary = records.find((record) => record?.type === 'run-summary')
const result = {
  runner: 'vally-agent',
  model: summary?.evals?.[0]?.model ?? options.model,
  // A suite is graded by deterministic code graders, not by a judge model.
  judgeModel: 'none',
  timestamp: new Date().toISOString(),
  verdicts,
}

const directory = join(resolve(options['output-root']), options.suite)
mkdirSync(directory, { recursive: true })
writeFileSync(join(directory, 'results.json'), `${JSON.stringify(result, null, 2)}\n`)

for (const verdict of verdicts) {
  const icon = verdict.passed ? '✅' : verdict.conclusive ? '❌' : '⚠️'
  console.log(`${icon} ${verdict.subject.name}: ${verdict.reason}`)
}
