#!/usr/bin/env node
// Fail (non-zero exit) only when a changed skill's verdict is a credible
// regression. `no-improvement`/`inconclusive` never block — with the default
// `RUNS=1` a PR run is almost always underpowered by construction, see
// docs/skill-evaluation.md.
//
//   node eng/check-pr-regressions.mjs --results-dir eval-results
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { hasRegression } from './lib/pr-comment.mjs'

const { values } = parseArgs({
  options: {
    'results-dir': { type: 'string', default: 'eval-results' },
    help: { type: 'boolean', default: false },
  },
  strict: true,
})

if (values.help) {
  console.log('Usage: node eng/check-pr-regressions.mjs --results-dir <dir>')
  process.exit(0)
}

const root = resolve(values['results-dir'])
const results = []
if (existsSync(root)) {
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
