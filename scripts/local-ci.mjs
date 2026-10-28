#!/usr/bin/env node
// Zero-dependency local CI runner — mirrors .github/workflows/skraft-framework-ci.yml
// and the checks of .github/workflows/skraft-backlog-ci.yml and skraft-brownfield-ci.yml,
// so a change can be controlled locally before it ever reaches the pipeline.
//
//   node scripts/local-ci.mjs            # fast gates: tests + drift guards
//   node scripts/local-ci.mjs --mutation # also run Stryker on the engine lines changed since origin/integration/v2-next
//   node scripts/local-ci.mjs --dotnet   # also run the .NET gate scripts on real Stryker.NET
//
// Cross-platform: spawns `node` directly, no shell globbing, no dependency.
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { withoutRepositoryEnv } from '../eng/lib/repository-env.mjs'

const flags = new Set(process.argv.slice(2))
const withMutation = flags.has('--mutation') || flags.has('-m')
const withDotnet = flags.has('--dotnet')

const ENGINE = join('plugins', 'skraft-framework', 'engine')

// Enumerate test files ourselves (no shell glob expansion). An absent folder has no tests.
const testFiles = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true })
        .map(String)
        .filter((f) => f.endsWith('.test.mjs'))
        .sort()
        .map((f) => join(dir, f))
    : []
// A bare `node --test` would auto-discover every test in the repository: an empty suite
// spawns a no-op instead.
const testArgs = (dir) => {
  const files = testFiles(dir)
  return files.length > 0 ? ['--test', ...files] : ['-e', `console.log('no test files under ${dir.split('\\').join('/')}')`]
}

// Fast gates — run on every push, fail the whole run if any fails.
const fastGates = [
  { name: 'Engine unit tests (node --test)', cmd: 'node', args: testArgs(join('tests', 'skraft-framework', 'unit')) },
  { name: 'Engine integration tests (node --test)', cmd: 'node', args: testArgs(join('tests', 'skraft-framework', 'integration')) },
  // Needs ESLint from the engine's node_modules, like the skill script tests need Stryker.
  { name: 'Engine lint (ESLint)', cmd: 'node', args: [join(ENGINE, 'node_modules', 'eslint', 'bin', 'eslint.js'), '--config', join(ENGINE, 'eslint.config.mjs'), ENGINE] },
  { name: 'Repository tooling tests (node --test)', cmd: 'node', args: testArgs(join('tests', 'tooling')) },
  // The JavaScript quality-gates runner tests resolve Stryker from the engine's node_modules.
  { name: 'Skill script tests (node --test)', cmd: 'node', args: testArgs(join('tests', 'skill-scripts')) },
  { name: 'Dashboard tooling tests (node --test)', cmd: 'node', args: testArgs(join('tests', 'dashboard')) },
  { name: 'Plugin catalogue scan', cmd: 'node', args: ['eng/catalog/scan.mjs'] },
  { name: 'Skill copies in sync', cmd: 'node', args: ['scripts/sync-skill-copies.mjs', '--check'] },
  { name: 'Plugin adapters in sync', cmd: 'node', args: ['scripts/project-plugin-adapters.mjs', '--check'] },
  { name: 'Dispatch tree and skills', cmd: 'node', args: ['scripts/agent-policy/build-config-bin.mjs'] },
  { name: 'Agent model policy (B12)', cmd: 'node', args: ['scripts/agent-policy/resolve-model-bin.mjs', '--check', '--forbid-model'] },
  // skraft-backlog: its own tests, agent trees, dispatch tree and model policy.
  { name: 'Backlog plugin tests (node --test)', cmd: 'node', args: testArgs(join('tests', 'skraft-backlog')) },
  { name: 'Backlog canvas browser tests (Playwright)', cmd: 'node', args: [join('node_modules', '@playwright', 'test', 'cli.js'), 'test', '-c', 'playwright.backlog-canvas.config.mjs'] },
  { name: 'Backlog plugin adapters in sync', cmd: 'node', args: ['scripts/project-plugin-adapters.mjs', '--check', '--plugin-root', 'plugins/skraft-backlog'] },
  { name: 'Backlog dispatch tree and skills', cmd: 'node', args: ['scripts/agent-policy/build-config-bin.mjs', '--emit', '--dir', 'plugins/skraft-backlog/com.github.copilot/agents'], quiet: true },
  { name: 'Backlog copies in sync', cmd: 'node', args: ['scripts/sync-backlog-copies.mjs', '--check'] },
  { name: 'Backlog agent model policy (B12)', cmd: 'node', args: ['scripts/agent-policy/resolve-model-bin.mjs', '--check', '--dir', 'plugins/skraft-backlog/com.github.copilot/agents'] },
  // skraft-brownfield: agent trees, dispatch tree and model policy (its validator twins run
  // with the skill script tests above).
  { name: 'Brownfield plugin adapters in sync', cmd: 'node', args: ['scripts/project-plugin-adapters.mjs', '--check', '--plugin-root', 'plugins/skraft-brownfield'] },
  { name: 'Brownfield dispatch tree and skills', cmd: 'node', args: ['scripts/agent-policy/build-config-bin.mjs', '--dir', 'plugins/skraft-brownfield/com.github.copilot/agents'] },
  { name: 'Brownfield agent model policy (B12)', cmd: 'node', args: ['scripts/agent-policy/resolve-model-bin.mjs', '--check', '--forbid-model', '--dir', 'plugins/skraft-brownfield/com.github.copilot/agents'] },
]

if (!existsSync(join(ENGINE, 'node_modules'))) {
  process.stdout.write(`\nℹ The engine lint, the skill script tests and the configuration schema parity test need ESLint, Stryker and Ajv from the engine: run \`npm ci --prefix ${ENGINE.split('\\').join('/')}\` first, or expect them to fail.\n`)
}

// Run from the pre-push hook, GIT_DIR would send every test's own git repository into this one.
const env = withoutRepositoryEnv(process.env)

const run = (gate) => {
  process.stdout.write(`\n▶ ${gate.name}\n`)
  const result = spawnSync(gate.cmd, gate.args, { env, stdio: gate.quiet ? ['inherit', 'ignore', 'inherit'] : 'inherit' })
  return { name: gate.name, ok: result.status === 0 }
}

const results = fastGates.map(run)

// Mutation only runs when the fast gates are green (it needs a passing suite).
if (withMutation && results.every((r) => r.ok)) {
  results.push(
    run({
      name: 'Engine mutation testing (Stryker, changed lines)',
      cmd: 'node',
      args: [join('eng', 'mutation-scope.mjs'), '--base', 'origin/integration/v2-next', '--run'],
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
