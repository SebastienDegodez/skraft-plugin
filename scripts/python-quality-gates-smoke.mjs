#!/usr/bin/env node
//
// python-quality-gates-smoke.mjs — do the Python quality-gate scripts judge a real run?
//
// The acceptance tests drive the scripts with a fake Python that answers what a test asks
// for. They prove the scripts read pytest output correctly; they cannot prove the real
// tools still write it, nor that the scripts start them the same way on Linux, macOS and Windows.
//
// So this runs the shipped scripts with the real toolchain on a small Clean Architecture
// project, in a throwaway Git copy of tests/skraft-framework/quality-gates/fixtures/python-payment:
//
//   test.acceptance / test.unit   capture.mjs records a green pytest run with its exit code
//   build.compile                 capture.mjs records a clean compileall run
//   test.no-mocks-core            no mocking library in the core (the domain and application folders)
//
// test.integrity reads the test files with `git show`: no script to smoke. Coverage and mutation
// never run in a delivery: the project's CI runs them, the developer runs /skraft-mutation.
//
// Usage:  node scripts/python-quality-gates-smoke.mjs [--python <interpreter>] [--keep]
//   --python  an interpreter that already holds pytest;
//             without it, a .venv is created in the copy and `pip install -e ".[dev]"` runs.
// Needs:  Python 3.11+ on PATH (python3, or python on Windows) and PyPI access without --python.
// Exits:  0 every probe passed, 1 a probe failed, 2 the toolchain could not run.

import { spawnSync } from 'node:child_process'
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { IGNORE_LINE } from '../plugins/skraft-framework/skills/quality-gates-python/scripts/gate-log.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURE = join(repoRoot, 'tests', 'skraft-framework', 'quality-gates', 'fixtures', 'python-payment')
const SCRIPTS = join(repoRoot, 'plugins', 'skraft-framework', 'skills', 'quality-gates-python', 'scripts')
const LOCAL_STATE = new Set(['.venv', '__pycache__', '.pytest_cache', 'build'])

const { values: opts } = parseArgs({
  options: {
    python: { type: 'string' },
    keep: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
})

const USAGE = `usage: node scripts/python-quality-gates-smoke.mjs [--python <interpreter>] [--keep]

  --python  use this interpreter (pytest installed) instead of a fresh .venv
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

const git = (cwd, ...args) => {
  const result = spawnSync('git', ['-c', 'user.email=smoke@skraft.invalid', '-c', 'user.name=smoke', '-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
  return result.stdout.trim()
}

const prepare = () => {
  const root = mkdtempSync(join(tmpdir(), 'skraft-python-gates-'))
  const repo = join(root, 'repo')
  cpSync(FIXTURE, repo, { recursive: true, filter: (source) => !LOCAL_STATE.has(basename(source)) && !source.endsWith('.egg-info') })
  // The evidence log sits in the copy, under the directory gate-log.mjs requires Git to ignore.
  appendFileSync(join(repo, '.gitignore'), `${IGNORE_LINE}\n`)
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

// Each gate records itself in the story's evidence log (quality-gates-evidence/v7); the probe
// reads back the entry of the gate it ran: its status and its one-line summary.
const LOG = join('.copilot-tracking', 'skraft-plans', 'smoke', 'evidence', 'qg-smoke.json')
const runGate = (ctx, script, gate, ...args) => {
  const log = join(ctx.repo, LOG)
  const result = spawnSync(process.execPath, [join(SCRIPTS, script), '--root', ctx.repo, '--log', log, ...args], { cwd: ctx.repo, encoding: 'utf8' })
  const entry = existsSync(log) ? JSON.parse(readFileSync(log, 'utf8')).gates?.find((recorded) => recorded.id === gate) : undefined
  const recorded = entry ? (entry.status === (result.status === 0 ? 'pass' : 'fail') ? '' : `logged ${entry.status} for exit ${result.status}`) : `no ${gate} entry in ${LOG}`
  return { status: recorded ? null : result.status, line: entry?.summary ?? '', stderr: [recorded, result.stderr ?? '', result.stdout ?? ''].filter(Boolean).join('\n') }
}

// --- the probes ---------------------------------------------------------------------

const probes = [
  {
    name: 'test.unit tests captured',
    run: (ctx) => runGate(ctx, 'capture.mjs', 'test.unit', ...pythonArgs(), '--gate', 'test.unit', '--', '{python}', '-m', 'pytest', '-q', '-p', 'no:cacheprovider'),
    status: 0,
    line: /^\d+ passed in [\d.]+s$/,
  },
  {
    name: 'build.compile captured',
    run: (ctx) => runGate(ctx, 'capture.mjs', 'build.compile', ...pythonArgs(), '--gate', 'build.compile', '--', '{python}', '-m', 'compileall', '-q', 'src'),
    status: 0,
    line: /^$/,
  },
  {
    name: 'test.no-mocks-core no mocks in core',
    run: (ctx) => runGate(ctx, 'no-mocks-in-core.mjs', 'test.no-mocks-core', ...pythonArgs()),
    status: 0,
    line: /^no mocking symbol in the core$/,
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
