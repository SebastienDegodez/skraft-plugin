#!/usr/bin/env node
//
// python-quality-gates-smoke.mjs — do the Python quality-gate scripts judge a real run?
//
// The acceptance tests drive the scripts with a fake Python that answers what a test asks
// for. They prove the scripts read pytest, coverage.py and cosmic-ray output correctly;
// they cannot prove the real tools still write it, nor that the scripts start them the
// same way on Linux, macOS and Windows.
//
// So this runs the shipped scripts with the real toolchain on a small Clean Architecture
// project, in a throwaway Git copy of tests/skraft-framework/quality-gates/fixtures/python-payment:
//
//   scaffold    configure-mutation.mjs writes the two cosmic-ray configs
//   G1          capture.mjs records a green pytest run with its exit code
//   G7, G11     no mocking library in the core; 100% line coverage of domain + application
//   G6 core     every core mutant killed, the equivalent @final mutant suppressed with a reason
//   G6 boundary infrastructure + api over their bar
//   since       a differential run with nothing changed mutates nothing and passes
//   weakened    one test case removed: a core mutant survives and the gate fails
//
// Usage:  node scripts/python-quality-gates-smoke.mjs [--python <interpreter>] [--keep]
//   --python  an interpreter that already holds pytest, coverage and cosmic-ray 8.x;
//             without it, a .venv is created in the copy and `pip install -e ".[dev]"` runs.
// Needs:  Python 3.11+ on PATH (python3, or python on Windows) and PyPI access without --python.
// Exits:  0 every probe passed, 1 a probe failed, 2 the toolchain could not run.

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURE = join(repoRoot, 'tests', 'skraft-framework', 'quality-gates', 'fixtures', 'python-payment')
const SCRIPTS = join(repoRoot, 'plugins', 'skraft-framework', 'skills', 'quality-gates-python', 'scripts')
const LOCAL_STATE = new Set(['.venv', '__pycache__', '.pytest_cache', 'build'])

// The case that alone kills the `amount <= 0` → `amount < 0` mutant of Money.
const WEAKENED_TEST = 'tests/unit/test_money.py'
const REMOVED_CASE = '[Decimal("0"), Decimal("-1")]'

const { values: opts } = parseArgs({
  options: {
    python: { type: 'string' },
    keep: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
})

const USAGE = `usage: node scripts/python-quality-gates-smoke.mjs [--python <interpreter>] [--keep]

  --python  use this interpreter (pytest, coverage, cosmic-ray 8.x installed) instead of a fresh .venv
  --keep    keep the throwaway copy and its evidence on success
`

if (opts.help) { process.stdout.write(USAGE); process.exit(0) }

const log = (msg) => process.stdout.write(`${msg}\n`)
// On GitHub Actions a failure also becomes an annotation, readable without the job log.
const annotate = (title, detail) => {
  if (!process.env.GITHUB_ACTIONS) return
  const data = String(detail).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
  log(`::error title=${`Python smoke on ${process.platform}: ${title}`.replaceAll(':', '%3A').replaceAll(',', '%2C')}::${data}`)
}
const lastLine = (text) => (text ?? '').trimEnd().split(/\r?\n/).at(-1) ?? ''

const git = (cwd, ...args) => {
  const result = spawnSync('git', ['-c', 'user.email=smoke@skraft.invalid', '-c', 'user.name=smoke', '-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
  return result.stdout.trim()
}

const prepare = () => {
  const root = mkdtempSync(join(tmpdir(), 'skraft-python-gates-'))
  const repo = join(root, 'repo')
  cpSync(FIXTURE, repo, { recursive: true, filter: (source) => !LOCAL_STATE.has(basename(source)) && !source.endsWith('.egg-info') })
  git(repo, 'init', '-q')
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', 'chore(payment): fixture')
  return { root, repo }
}

const basePython = () => {
  for (const candidate of process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python']) {
    const probe = spawnSync(candidate, ['-c', 'import sys; print(sys.version_info >= (3, 11))'], { encoding: 'utf8' })
    if (probe.status === 0 && probe.stdout.trim() === 'True') return candidate
  }
  return null
}

// The interpreter the scripts find on their own: the copy's .venv, created and installed here.
const installVenv = (ctx) => {
  const base = basePython()
  if (!base) return 'no Python 3.11+ on PATH'
  const venv = spawnSync(base, ['-m', 'venv', '.venv'], { cwd: ctx.repo, encoding: 'utf8' })
  if (venv.status !== 0) return `python -m venv failed: ${venv.stderr || venv.stdout}`
  const python = process.platform === 'win32' ? join(ctx.repo, '.venv', 'Scripts', 'python.exe') : join(ctx.repo, '.venv', 'bin', 'python')
  const pip = spawnSync(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '-q', '-e', '.[dev]'], { cwd: ctx.repo, encoding: 'utf8' })
  if (pip.status !== 0) return `pip install -e ".[dev]" failed: ${pip.stderr || pip.stdout}`
  return null
}

// --- running one script -------------------------------------------------------------

const pythonArgs = () => (opts.python ? ['--python', resolve(opts.python)] : [])

// Evidence lands beside the copy, never inside it: the differential run must see a clean tree.
const runGate = (ctx, script, prefix, evidence, ...args) => {
  const dir = join(ctx.root, evidence)
  const result = spawnSync(process.execPath, [join(SCRIPTS, script), '--root', ctx.repo, '--evidence', dir, ...args], { cwd: ctx.repo, encoding: 'utf8' })
  const stdout = join(dir, `${prefix}.stdout`)
  const recorded = existsSync(stdout) ? readFileSync(stdout, 'utf8') : ''
  return { status: result.status, line: lastLine(recorded), stderr: `${result.stderr ?? ''}${result.stdout ?? ''}` }
}

// --- the probes ---------------------------------------------------------------------

const probes = [
  {
    name: 'scaffold',
    run: (ctx) => {
      const result = spawnSync(process.execPath, [join(SCRIPTS, 'configure-mutation.mjs'), '--root', ctx.repo], { cwd: ctx.repo, encoding: 'utf8' })
      if (result.status === 0) {
        git(ctx.repo, 'add', '.')
        git(ctx.repo, 'commit', '-q', '-m', 'chore(payment): mutation configs')
      }
      return { status: result.status, line: lastLine(result.stdout), stderr: result.stderr }
    },
    status: 0,
    line: /cosmic-ray-boundary\.toml/,
  },
  {
    name: 'G1 tests captured',
    run: (ctx) => runGate(ctx, 'capture.mjs', 'qg-tests', 'evidence', ...pythonArgs(), '--name', 'qg-tests', '--', '{python}', '-m', 'pytest', '-q', '-p', 'no:cacheprovider'),
    status: 0,
    line: /^\d+ passed in [\d.]+s$/,
  },
  {
    name: 'G7 no mocks in core',
    run: (ctx) => runGate(ctx, 'no-mocks-in-core.mjs', 'qg-mocks', 'evidence', ...pythonArgs()),
    status: 0,
    line: /^$/,
  },
  {
    name: 'G11 core coverage',
    run: (ctx) => runGate(ctx, 'coverage-core.mjs', 'qg-coverage', 'evidence', ...pythonArgs()),
    status: 0,
    line: /^Domain\/Application line coverage 100% \(([1-9]\d*)\/\1 statements\)$/,
  },
  {
    name: 'G6 core',
    run: (ctx) => runGate(ctx, 'mutation-gate.mjs', 'qg-mutation', 'evidence', ...pythonArgs(), '--scope', 'core', '--config', 'cosmic-ray-core.toml'),
    status: 0,
    line: /^core mutation score 100\.00% meets 100% \([1-9]\d* killed, 0 survived, \d+ incompetent, [1-9]\d* suppressed by pragma\)$/,
  },
  {
    name: 'G6 boundary',
    run: (ctx) => runGate(ctx, 'mutation-gate.mjs', 'qg-mutation-boundary', 'evidence', ...pythonArgs(), '--scope', 'boundary', '--config', 'cosmic-ray-boundary.toml'),
    status: 0,
    line: /^boundary mutation score [\d.]+% meets 80% \([1-9]\d* killed, \d+ survived, \d+ incompetent, \d+ suppressed by pragma\)$/,
  },
  {
    name: 'since, nothing changed',
    run: (ctx) => runGate(ctx, 'mutation-gate.mjs', 'qg-mutation', 'checkpoint', ...pythonArgs(), '--scope', 'core', '--config', 'cosmic-ray-core.toml', '--since', git(ctx.repo, 'rev-parse', 'HEAD')),
    status: 0,
    line: /^No core source changed since [0-9a-f]{40}: nothing to mutate\.$/,
  },
  {
    name: 'weakened test fails G6 core',
    run: (ctx) => {
      const path = join(ctx.repo, WEAKENED_TEST)
      const source = readFileSync(path, 'utf8')
      if (!source.includes(REMOVED_CASE)) throw new Error(`${WEAKENED_TEST} no longer holds the case this probe removes`)
      writeFileSync(path, source.replace(REMOVED_CASE, '[Decimal("-1")]'))
      return runGate(ctx, 'mutation-gate.mjs', 'qg-mutation', 'weakened', ...pythonArgs(), '--scope', 'core', '--config', 'cosmic-ray-core.toml')
    },
    status: 1,
    line: /^core mutation gate failed: score [\d.]+% is below 100%$/,
  },
]

// --- main ---------------------------------------------------------------------------

const ctx = prepare()
if (!opts.python) {
  const problem = installVenv(ctx)
  if (problem) {
    log(`the Python toolchain could not be installed — ${problem}`)
    annotate('toolchain', problem)
    rmSync(ctx.root, { recursive: true, force: true })
    process.exit(2)
  }
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
    annotate(probe.name, [...failures, (result.stderr ?? '').trim().split(/\r?\n/).slice(-15).join('\n')].join('\n'))
    log(`  FAIL  ${probe.name}`)
    for (const failure of failures) log(`          ${failure}`)
    if (result.stderr?.trim()) log(`          output: ${result.stderr.trim().split(/\r?\n/).slice(-8).join('\n                  ')}`)
  }
} finally {
  if (opts.keep || failed > 0) log(`artifacts kept: ${ctx.root}`)
  else rmSync(ctx.root, { recursive: true, force: true })
}

log(failed === 0 ? '\nPython quality-gates smoke: every probe passed' : `\nPython quality-gates smoke: ${failed} probe(s) failed`)
process.exit(failed === 0 ? 0 : 1)
