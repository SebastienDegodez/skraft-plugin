#!/usr/bin/env node
//
// dotnet-quality-gates-smoke.mjs — do the .NET quality-gate scripts judge a real run?
//
// The unit tests drive the scripts with a fake dotnet that writes whatever report a test
// asks for. They prove the scripts read a report correctly; they cannot prove a real
// Stryker.NET writes that report. Stryker.NET 4.14 showed the gap three times: `--version`
// no longer printed a version, `init` wrote a config its own run refused, and a run where
// no test ran exited 0 with every mutant left Pending.
//
// So this runs the shipped scripts with the real toolchain on a small Clean Architecture
// solution, in a throwaway Git copy of tests/skraft-framework/quality-gates/fixtures/dotnet-checkout:
//
//   scaffold    configure-mutation.sh writes configs Stryker.NET accepts
//   G7, G11     no mocking framework in the core; 100% line coverage of Domain + Application
//   G6 core     every core mutant killed, the score recomputed from the report
//   G6 boundary API + Infrastructure over their bar
//   since       a differential run with nothing changed tests nothing and passes
//   weakened    one unit test removed: a core mutant survives and the gate fails
//
// Stryker.NET comes from the fixture's tool manifest, so the version is pinned there.
//
// Usage:  node scripts/dotnet-quality-gates-smoke.mjs [--keep]
// Needs:  the .NET 10 SDK on PATH, and NuGet access to restore the tool and packages.
// Exits:  0 every probe passed, 1 a probe failed, 2 the toolchain could not run.

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURE = join(repoRoot, 'tests', 'skraft-framework', 'quality-gates', 'fixtures', 'dotnet-checkout')
const SCRIPTS = join(repoRoot, 'plugins', 'skraft-framework', 'skills', 'quality-gates-dotnet', 'scripts')
const BUILD_OUTPUT = new Set(['bin', 'obj', 'StrykerOutput', 'TestResults'])

// The fact that alone kills the `amount < 0` → `amount <= 0` mutant of LoyaltyDiscount.
const WEAKENED_TEST = 'tests/Checkout.UnitTests/LoyaltyDiscountTests.cs'
const REMOVED_FACT = /\n {4}\[Fact\]\n {4}public void An_empty_order_costs_nothing\(\) =>\n[^\n]*\n/

const { values: opts } = parseArgs({
  options: {
    keep: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
})

const USAGE = `usage: node scripts/dotnet-quality-gates-smoke.mjs [--keep]

  --keep  keep the throwaway copy and its evidence on success
`

if (opts.help) { process.stdout.write(USAGE); process.exit(0) }

const log = (msg) => process.stdout.write(`${msg}\n`)

const git = (cwd, ...args) => {
  const result = spawnSync('git', ['-c', 'user.email=smoke@skraft.invalid', '-c', 'user.name=smoke', ...args], { cwd, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
  return result.stdout.trim()
}

const prepare = () => {
  const root = mkdtempSync(join(tmpdir(), 'skraft-dotnet-gates-'))
  const repo = join(root, 'repo')
  cpSync(FIXTURE, repo, { recursive: true, filter: (source) => !BUILD_OUTPUT.has(basename(source)) })
  git(repo, 'init', '-q')
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', 'chore(checkout): fixture')
  return { root, repo }
}

// --- running one script -------------------------------------------------------------

// Evidence lands beside the copy, never inside it: the differential run must see a clean tree.
const runGate = (ctx, script, prefix, evidence, ...args) => {
  const dir = join(ctx.root, evidence)
  const result = spawnSync('bash', [join(SCRIPTS, script), '--root', ctx.repo, '--evidence', dir, ...args], { cwd: ctx.repo, encoding: 'utf8' })
  const stdout = join(dir, `${prefix}.stdout`)
  const lines = existsSync(stdout) ? readFileSync(stdout, 'utf8').trimEnd().split('\n') : []
  return { status: result.status, line: lines.at(-1) ?? '', stderr: result.stderr ?? '' }
}

// --- the probes ---------------------------------------------------------------------

const probes = [
  {
    name: 'scaffold',
    run: (ctx) => {
      const result = spawnSync('bash', [join(SCRIPTS, 'configure-mutation.sh'), '--root', ctx.repo], { cwd: ctx.repo, encoding: 'utf8' })
      if (result.status === 0) {
        git(ctx.repo, 'add', '.')
        git(ctx.repo, 'commit', '-q', '-m', 'chore(checkout): mutation configs')
      }
      return { status: result.status, line: result.stdout.trimEnd().split('\n').at(-1) ?? '', stderr: result.stderr }
    },
    status: 0,
    line: /^wrote .*stryker-config-boundary\.json$/,
  },
  {
    name: 'G7 no mocks in core',
    run: (ctx) => runGate(ctx, 'no-mocks-in-core.sh', 'qg-mocks', 'evidence'),
    status: 0,
    line: /^$/,
  },
  {
    name: 'G11 core coverage',
    run: (ctx) => runGate(ctx, 'coverage-core.sh', 'qg-coverage', 'evidence'),
    status: 0,
    line: /^Line coverage \(Domain, Application\): ([1-9]\d*)\/\1 = 100%/,
  },
  {
    name: 'G6 core',
    run: (ctx) => runGate(ctx, 'mutation-core.sh', 'qg-mutation', 'evidence'),
    status: 0,
    line: /^Mutation score \(Domain,Application\): ([1-9]\d*)\/\1 tested mutants detected = 100%, bar 100%$/,
  },
  {
    name: 'G6 boundary',
    run: (ctx) => runGate(ctx, 'mutation-boundary.sh', 'qg-mutation-boundary', 'evidence'),
    status: 0,
    line: /^Mutation score \(API,Infrastructure\): \d+\/[1-9]\d* tested mutants detected = [\d.]+%, bar 80%$/,
  },
  {
    name: 'since, nothing changed',
    run: (ctx) => runGate(ctx, 'mutation-core.sh', 'qg-mutation', 'checkpoint', '--since', git(ctx.repo, 'rev-parse', 'HEAD')),
    status: 0,
    line: /^No Domain,Application mutant changed since [0-9a-f]{40}: nothing to test$/,
  },
  {
    name: 'weakened test fails G6 core',
    run: (ctx) => {
      const path = join(ctx.repo, WEAKENED_TEST)
      const source = readFileSync(path, 'utf8')
      const weakened = source.replace(REMOVED_FACT, '\n')
      if (weakened === source) throw new Error(`${WEAKENED_TEST} no longer holds the fact this probe removes`)
      writeFileSync(path, weakened)
      return runGate(ctx, 'mutation-core.sh', 'qg-mutation', 'weakened')
    },
    status: 1,
    line: /^Mutation score \(Domain,Application\): (\d+)\/(?!\1 )\d+ tested mutants detected = [\d.]+%, bar 100%$/,
  },
]

// --- main ---------------------------------------------------------------------------

if (spawnSync('dotnet', ['--version'], { encoding: 'utf8' }).status !== 0) {
  log('the .NET SDK is not on PATH — install it or skip this check')
  process.exit(2)
}

const ctx = prepare()
const restore = spawnSync('dotnet', ['tool', 'restore'], { cwd: ctx.repo, encoding: 'utf8' })
if (restore.status !== 0) {
  log(`dotnet tool restore failed — Stryker.NET is unavailable:\n${restore.stderr || restore.stdout}`)
  rmSync(ctx.root, { recursive: true, force: true })
  process.exit(2)
}
log(`fixture copied to ${ctx.repo}`)

let failed = 0
try {
  for (const probe of probes) {
    let result
    try {
      result = probe.run(ctx)
    } catch (error) {
      result = { status: null, line: '', stderr: error.message }
    }
    const failures = []
    if (result.status !== probe.status) failures.push(`exit ${result.status}, expected ${probe.status}`)
    if (!probe.line.test(result.line)) failures.push(`last output line ${JSON.stringify(result.line)} does not match ${probe.line}`)

    if (failures.length === 0) {
      log(`  PASS  ${probe.name} — ${result.line || 'no finding'}`)
      continue
    }
    failed += 1
    log(`  FAIL  ${probe.name}`)
    for (const failure of failures) log(`          ${failure}`)
    if (result.stderr.trim()) log(`          stderr: ${result.stderr.trim().split('\n').slice(-5).join('\n                  ')}`)
  }
} finally {
  if (opts.keep || failed > 0) log(`artifacts kept: ${ctx.root}`)
  else rmSync(ctx.root, { recursive: true, force: true })
}

log(failed === 0 ? '\n.NET quality-gates smoke: every probe passed' : `\n.NET quality-gates smoke: ${failed} probe(s) failed`)
process.exit(failed === 0 ? 0 : 1)
