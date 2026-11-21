#!/usr/bin/env node
// What an agent did in each turn of the trials of a results.jsonl.
//
//   node eng/agent-turns.mjs <results.jsonl> [--trial <n>] [--out turns.md]
//
// Without --trial, prints every trial one after the other.

import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

import { renderTurns, turnsOf } from './lib/agent-turns.mjs'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { trial: { type: 'string' }, out: { type: 'string' } },
})

if (positionals.length !== 1) {
  console.error('Usage: agent-turns.mjs <results.jsonl> [--trial <n>] [--out turns.md]')
  process.exit(2)
}

const trials = readFileSync(positionals[0], 'utf8')
  .split('\n')
  .filter((line) => line.trim())
  .flatMap((line) => {
    try {
      return [JSON.parse(line)]
    } catch {
      return []
    }
  })
  .filter((record) => record?.type === 'trial-result')

const chosen = values.trial ? [trials[Number(values.trial) - 1]].filter(Boolean) : trials
if (chosen.length === 0) {
  console.error(`No trial ${values.trial ?? ''} in ${positionals[0]} (${trials.length} trial(s)).`)
  process.exit(1)
}

const markdown = chosen
  .map((record, at) => {
    const index = values.trial ? Number(values.trial) : at + 1
    const verdict = record.gradeResult?.passed ? 'réussi' : 'échoué'
    return renderTurns(turnsOf(record.trajectory?.events), { title: `Essai ${index} — ${record.stimulus ?? ''} (${verdict})` })
  })
  .join('\n')

if (values.out) writeFileSync(values.out, markdown)
process.stdout.write(markdown)
