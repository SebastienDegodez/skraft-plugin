#!/usr/bin/env node
// Fail (non-zero exit) only when a changed skill's verdict is a credible
// regression. `no-improvement`/`inconclusive` never block: the gate catches a
// proven regression, it does not demand proof of improvement on every PR. See
// the handbook page reference/evaluation-tooling.
//
//   node eng/check-pr-regressions.mjs --results-dir eval-results
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { hasRegression } from './lib/pr-comment.mjs'

const { values } = parseArgs({
  options: {
    'results-dir': { type: 'string', default: 'eval-results' },
    'reused-dir': { type: 'string' },
    help: { type: 'boolean', default: false },
  },
  strict: true,
})

if (values.help) {
  console.log('Usage: node eng/check-pr-regressions.mjs --results-dir <dir> [--reused-dir <dir>]')
  process.exit(0)
}

// A reused cell (eng/eval-reuse.mjs) is still this commit's verdict, so it gates
// the merge exactly like a fresh one.
const results = []
for (const dir of [values['results-dir'], values['reused-dir']].filter(Boolean)) {
  const root = resolve(dir)
  if (!existsSync(root)) continue
  for (const entry of readdirSync(root)) {
    const resultsFile = join(root, entry, 'results.json')
    if (existsSync(resultsFile)) results.push(JSON.parse(readFileSync(resultsFile, 'utf8')))
  }
}

if (hasRegression(results)) {
  console.error('::error::A changed skill regressed against baseline — see the PR comment.')
  process.exit(1)
}

console.log('No changed skill regressed against baseline.')
