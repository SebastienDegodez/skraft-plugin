#!/usr/bin/env node
// Render the changed-skill and changed-agent verdicts from a PR run as a PR comment.
//
//   node eng/build-pr-comment.mjs --results-dir eval-results [--reused-dir eval-plan/reused] [--planned <n>] [--out file]
//
// --planned 0: the PR changed no subject's AI content, so nothing was planned.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { buildPrComment } from './lib/pr-comment.mjs'

const { values } = parseArgs({
  options: {
    'results-dir': { type: 'string', default: 'eval-results' },
    'reused-dir': { type: 'string' },
    planned: { type: 'string' },
    out: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
  strict: true,
})

if (values.help) {
  console.log('Usage: node eng/build-pr-comment.mjs --results-dir <dir> [--reused-dir <dir>] [--planned <n>] [--out <file>]')
  process.exit(0)
}

// Fresh cells first, then the cells reused from an earlier evaluation of the PR
// (eng/eval-reuse.mjs), each stamped with the run that measured it.
const results = []
for (const dir of [values['results-dir'], values['reused-dir']].filter(Boolean)) {
  const root = resolve(dir)
  if (!existsSync(root)) continue
  for (const entry of readdirSync(root)) {
    const resultsFile = join(root, entry, 'results.json')
    if (existsSync(resultsFile)) results.push(JSON.parse(readFileSync(resultsFile, 'utf8')))
  }
}

const planned = values.planned === undefined ? undefined : Number(values.planned)
const comment = buildPrComment(results, { planned })
if (values.out) writeFileSync(values.out, comment)
else console.log(comment)
