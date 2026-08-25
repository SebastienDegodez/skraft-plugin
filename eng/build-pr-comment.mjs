#!/usr/bin/env node
// Render the changed-skill verdicts from a PR run as a PR comment.
//
//   node eng/build-pr-comment.mjs --results-dir eval-results [--out file]
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { buildPrComment } from './lib/pr-comment.mjs'

const { values } = parseArgs({
  options: {
    'results-dir': { type: 'string', default: 'eval-results' },
    out: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
  strict: true,
})

if (values.help) {
  console.log('Usage: node eng/build-pr-comment.mjs --results-dir <dir> [--out <file>]')
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

const comment = buildPrComment(results)
if (values.out) writeFileSync(values.out, comment)
else console.log(comment)
