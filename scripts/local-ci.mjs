#!/usr/bin/env node
// Zero-dependency local CI runner — mirrors .github/workflows/skraft-framework-ci.yml.
// Runs the same gates that guard the skraft-framework so you can control a change
// locally before it ever reaches the pipeline.
//
//   node scripts/local-ci.mjs            # fast gates: tests + drift guards
//   node scripts/local-ci.mjs --mutation # also run Stryker (slow, like CI)
//   node scripts/local-ci.mjs --dotnet   # also run the .NET gate scripts on real Stryker.NET
//
// Cross-platform: spawns `node` directly, no shell globbing, no dependency.
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const flags = new Set(process.argv.slice(2))
const withMutation = flags.has('--mutation') || flags.has('-m')
const withDotnet = flags.has('--dotnet')

// Same coverage floor as CI, on the framework runtime only.
const coverageArgs = [
  '--experimental-test-coverage',
  '--test-coverage-include=plugins/skraft-framework/src/**',
  '--test-coverage-exclude=plugins/skraft-framework/src/node_modules/**',
  '--test-coverage-lines=95', '--test-coverage-branches=90', '--test-coverage-functions=93',
]

// Enumerate test files ourselves (no shell glob expansion).
const testArgs = (dir, coverage = false) => {
  const files = readdirSync(dir, { recursive: true })
    .filter((f) => f.endsWith('.test.mjs'))
    .sort()
    .map((f) => join(dir, f))
  return ['--test', ...(coverage ? coverageArgs : []), ...files]
}

// Fast gates — run on every push, fail the whole run if any fails.
const fastGates = [
  { name: 'Framework tests & coverage (node --test)', cmd: 'node', args: testArgs('tests/skraft-framework', true) },
  { name: 'Dashboard tooling tests (node --test)', cmd: 'node', args: testArgs('tests/dashboard') },
  { name: 'Plugin catalogue scan', cmd: 'node', args: ['eng/catalog/scan.mjs'] },
  { name: 'Plugin adapters in sync', cmd: 'node', args: ['scripts/project-plugin-adapters.mjs', '--check'] },
  { name: 'Guardrail config in sync (US2)', cmd: 'node', args: ['plugins/skraft-framework/src/cli/build-config-bin.mjs', '--check'] },
  { name: 'Agent model policy (B12)', cmd: 'node', args: ['plugins/skraft-framework/src/cli/resolve-model-bin.mjs', '--check'] },
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
      args: ['plugins/skraft-framework/src/node_modules/.bin/stryker', 'run', 'plugins/skraft-framework/src/stryker.config.mjs'],
    }),
  )
} else if (withMutation) {
  process.stdout.write('\n⏭  Mutation skipped — fast gates failed\n')
}

// Needs the .NET 10 SDK and NuGet access, which the fast gates never do.
if (withDotnet) {
  results.push(run({ name: '.NET quality-gate scripts (real Stryker.NET)', cmd: 'node', args: ['scripts/dotnet-quality-gates-smoke.mjs'] }))
}

process.stdout.write('\n── local CI summary ──\n')
for (const { name, ok } of results) process.stdout.write(`${ok ? '✓' : '✗'} ${name}\n`)

const failed = results.filter((r) => !r.ok)
if (failed.length > 0) {
  process.stdout.write(`\n✗ local CI failed (${failed.length}) — push blocked\n`)
  process.exit(1)
}
process.stdout.write('\n✓ local CI passed — safe to push\n')
