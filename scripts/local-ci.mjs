#!/usr/bin/env node
// Zero-dependency local CI runner — mirrors .github/workflows/skraft-framework-ci.yml.
// Runs the same gates that guard the skraft-framework so you can control a change
// locally before it ever reaches the pipeline.
//
//   node scripts/local-ci.mjs            # fast gates: tests + drift guards
//   node scripts/local-ci.mjs --mutation # also run Stryker (slow, like CI)
//
// Cross-platform: spawns `node` directly, no shell globbing, no dependency.
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { TEST_GATE, STATIC_GATES } from './lib/ci-gates.mjs'

const flags = new Set(process.argv.slice(2))
const withMutation = flags.has('--mutation') || flags.has('-m')

// Enumerate the framework test files ourselves (no shell glob expansion).
const frameworkTestArgs = () => {
  const dir = 'tests/skraft-framework'
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.test.mjs'))
    .map((f) => join(dir, f))
  return ['--test', '--experimental-test-coverage', ...files]
}

// Fast gates — run on every push, fail the whole run if any fails.
// Gate list is shared with the CI-parity freshness check (scripts/lib/ci-gates.mjs).
const fastGates = [
  { name: TEST_GATE.name, cmd: 'node', args: frameworkTestArgs() },
  ...STATIC_GATES.map(({ name, cmd, args }) => ({ name, cmd, args })),
]

const run = (gate) => {
  process.stdout.write(`\n▶ ${gate.name}\n`)
  const result = spawnSync(gate.cmd, gate.args, { stdio: 'inherit' })
  return { name: gate.name, ok: result.status === 0 }
}

const results = fastGates.map(run)

// Mutation only runs when the fast gates are green (it needs a passing suite).
if (withMutation && results.every((r) => r.ok)) {
  results.push(
    run({
      name: 'Mutation testing (Stryker)',
      cmd: 'node',
      args: ['plugins/src/node_modules/.bin/stryker', 'run', 'plugins/src/stryker.config.mjs'],
    }),
  )
} else if (withMutation) {
  process.stdout.write('\n⏭  Mutation skipped — fast gates failed\n')
}

process.stdout.write('\n── local CI summary ──\n')
for (const { name, ok } of results) process.stdout.write(`${ok ? '✓' : '✗'} ${name}\n`)

const failed = results.filter((r) => !r.ok)
if (failed.length > 0) {
  process.stdout.write(`\n✗ local CI failed (${failed.length}) — push blocked\n`)
  process.exit(1)
}
process.stdout.write('\n✓ local CI passed — safe to push\n')
