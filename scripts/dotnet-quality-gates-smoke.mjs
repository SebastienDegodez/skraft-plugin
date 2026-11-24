#!/usr/bin/env node
//
// dotnet-quality-gates-smoke.mjs — do the .NET quality-gate scripts judge a real run?
//
// The unit tests drive the scripts with a fake dotnet that writes whatever report a test
// asks for. They prove the scripts read a report correctly; they cannot prove the real
// toolchain still writes it. Architecture, coverage and mutation are not pipeline gates: the
// project's CI runs them, so none of them runs here.
//
// So this runs the shipped scripts with the real toolchain on a small Clean Architecture
// solution, in a throwaway Git copy of tests/skraft-framework/quality-gates/fixtures/dotnet-checkout:
//
//   test.no-mocks-core  no mocking framework in the core
//   init                clean-architecture-dotnet's init-project.mjs scaffolds a solution that builds
//
// Usage:  node scripts/dotnet-quality-gates-smoke.mjs [--keep]
// Needs:  the .NET 10 SDK on PATH, and NuGet access to restore the packages.
// Exits:  0 every probe passed, 1 a probe failed, 2 the toolchain could not run.

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURE = join(repoRoot, 'tests', 'skraft-framework', 'quality-gates', 'fixtures', 'dotnet-checkout')
const SCRIPTS = join(repoRoot, 'plugins', 'skraft-framework', 'skills', 'quality-gates-dotnet', 'scripts')
const INIT_PROJECT = join(repoRoot, 'plugins', 'skraft-framework', 'skills', 'clean-architecture-dotnet', 'scripts', 'init-project.mjs')
const BUILD_OUTPUT = new Set(['bin', 'obj', 'StrykerOutput', 'TestResults'])

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
const lastLine = (text) => (text ?? '').trimEnd().split(/\r?\n/).at(-1) ?? ''
// On GitHub Actions a failure also becomes an annotation, readable without the job log.
const annotate = (title, detail) => {
  if (!process.env.GITHUB_ACTIONS) return
  const data = String(detail).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
  log(`::error title=${`.NET smoke on ${process.platform}: ${title}`.replaceAll(':', '%3A').replaceAll(',', '%2C')}::${data}`)
}

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
  const result = spawnSync(process.execPath, [join(SCRIPTS, script), '--root', ctx.repo, '--evidence', dir, ...args], { cwd: ctx.repo, encoding: 'utf8' })
  const stdout = join(dir, `${prefix}.stdout`)
  const lines = existsSync(stdout) ? readFileSync(stdout, 'utf8').trimEnd().split('\n') : []
  return { status: result.status, line: lines.at(-1) ?? '', stderr: result.stderr ?? '', output: lines.slice(-25).join('\n') }
}

// --- the probes ---------------------------------------------------------------------

const probes = [
  {
    name: 'test.no-mocks-core',
    run: (ctx) => runGate(ctx, 'no-mocks-in-core.mjs', 'qg-mocks', 'evidence'),
    status: 0,
    line: /^$/,
  },
  {
    name: 'clean-architecture-dotnet init-project builds',
    run: (ctx) => {
      const cwd = join(ctx.root, 'scaffold')
      mkdirSync(cwd)
      const result = spawnSync(process.execPath, [INIT_PROJECT, 'Ordering'], { cwd, encoding: 'utf8' })
      const built = existsSync(join(cwd, 'tests', 'Ordering.IntegrationTests', 'ArchitectureTests.cs'))
      return { status: result.status, line: built ? lastLine(result.stdout) : 'no architecture tests written', stderr: `${result.stderr}${result.stdout}` }
    },
    status: 0,
    line: /^architecture tests with: dotnet test/,
  },
]

// --- main ---------------------------------------------------------------------------

if (spawnSync('dotnet', ['--version'], { encoding: 'utf8' }).status !== 0) {
  log('the .NET SDK is not on PATH — install it or skip this check')
  annotate('toolchain', 'the .NET SDK is not on PATH')
  process.exit(2)
}

const ctx = prepare()
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
    annotate(probe.name, [
      ...failures,
      (result.stderr ?? '').trim().split(/\r?\n/).slice(-15).join('\n'),
      ...(result.output ? ['--- gate output (tail) ---', result.output] : []),
    ].join('\n'))
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
