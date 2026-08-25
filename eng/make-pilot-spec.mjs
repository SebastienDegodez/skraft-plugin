#!/usr/bin/env node
// Write a pilot copy of an eval spec, keeping only the named stimuli.
//
// Usage: node eng/make-pilot-spec.mjs <spec> <destination> <selectors> [runs]
//   <selectors>  comma-separated stimulus name fragments, case-insensitive
//   [runs]       optional override for defaults.runs
//
// Prints the kept stimulus names to stdout. `eng/run-vally-evals.sh` calls this
// when STIMULI is set; nothing else should, because a pilot is a budget probe
// and never a publishable verdict.

import { readFileSync, writeFileSync } from 'node:fs'

import { pilotSpec } from './lib/pilot-spec.mjs'

const [spec, destination, selectors, runs] = process.argv.slice(2)

if (!spec || !destination || !selectors) {
  console.error('usage: make-pilot-spec.mjs <spec> <destination> <selectors> [runs]')
  process.exit(2)
}

try {
  const result = pilotSpec(readFileSync(spec, 'utf8'), selectors.split(','), runs ? Number(runs) : undefined)
  writeFileSync(destination, result.spec)
  console.log(result.kept.join('\n'))
} catch (error) {
  console.error(`pilot spec: ${error.message}`)
  process.exit(1)
}
