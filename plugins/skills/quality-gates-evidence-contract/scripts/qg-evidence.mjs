#!/usr/bin/env node
// qg-evidence — deterministic assembler + renderer for the
// quality-gates evidence contract (quality-gates-evidence/v1).
//
// The LLM owns parameter binding only (qg-manifest.json). This tool
// owns every fact: sha256, exit codes, TRX / Stryker metric parsing,
// git revisions, RED/GREEN snapshots, and both emitted artifacts
// (qg-{story}.json + qg-{story}.md). Never trusts pre-computed values.
//
// Usage: node qg-evidence.mjs --help

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { basename, dirname, join, resolve } from 'node:path'

export const SCHEMA_VERSION = 'quality-gates-evidence/v1'

export const GATE_LABELS = {
  G1: 'Acceptance test(s) pass',
  G2: 'All unit tests pass',
  G3: 'Build passes',
  G4: 'Static analysis pass',
  G5: 'Architecture rules pass',
  G6: 'Mutation score meets threshold',
  G7: 'No mocks in Domain/Application core',
  G8: 'Conventional commit format',
  G9: 'No test tampering (RED\u2192GREEN integrity)',
}

export class ContradictionError extends Error {}
class UsageError extends Error {}

// ---------------------------------------------------------------- facts

export const sha256 = (buffer) =>
  createHash('sha256').update(buffer).digest('hex')

export const tail = (text, lines = 40) =>
  text.split('\n').slice(-lines).join('\n')

export const parseTrx = (content) => {
  const counters = content.match(/<Counters\b[^>]*>/)
  if (!counters) {
    throw new ContradictionError('TRX metrics source has no <Counters> element')
  }
  const attr = (name) => {
    const m = counters[0].match(new RegExp(`\\b${name}="(\\d+)"`))
    return m ? Number(m[1]) : 0
  }
  return {
    tests_total: attr('total'),
    tests_passed: attr('passed'),
    tests_failed: attr('failed'),
  }
}

export const parseStrykerJson = (content) => {
  let report
  try {
    report = JSON.parse(content)
  } catch {
    throw new ContradictionError('Stryker metrics source is not valid JSON')
  }
  if (typeof report.mutationScore === 'number') {
    return { mutation_score: report.mutationScore }
  }
  const detected = { killed: 0, total: 0 }
  for (const file of Object.values(report.files ?? {})) {
    for (const mutant of file.mutants ?? []) {
      if (mutant.status === 'Ignored' || mutant.status === 'CompileError') continue
      detected.total += 1
      if (mutant.status === 'Killed' || mutant.status === 'Timeout') detected.killed += 1
    }
  }
  if (detected.total === 0) {
    throw new ContradictionError('Stryker report contains no detected mutants')
  }
  return { mutation_score: (detected.killed / detected.total) * 100 }
}

const parseMetrics = (source, evidenceDir) => {
  if (!source) return null
  const path = join(evidenceDir, source.path)
  if (!existsSync(path)) {
    throw new ContradictionError(`metrics source missing: ${source.path}`)
  }
  const content = readFileSync(path, 'utf8')
  if (source.type === 'trx') return parseTrx(content)
  if (source.type === 'stryker-json') return parseStrykerJson(content)
  throw new ContradictionError(`unknown metrics source type: ${source.type}`)
}

export const evaluateGateStatus = ({ exitCode, metrics, threshold }) => {
  if (exitCode !== 0) return 'fail'
  if (metrics && typeof metrics.tests_failed === 'number' && metrics.tests_failed > 0) {
    return 'fail'
  }
  if (typeof threshold === 'number') {
    if (!metrics || typeof metrics.mutation_score !== 'number') return 'fail'
    return metrics.mutation_score >= threshold ? 'pass' : 'fail'
  }
  return 'pass'
}

// ------------------------------------------------------------------ git

const git = (args, cwd) => {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trimEnd()
  } catch (error) {
    throw new ContradictionError(
      `git ${args.join(' ')} failed: ${error.stderr?.toString().trim() || error.message}`,
    )
  }
}

const collectCommits = (range, repoRoot) => {
  const log = git(['log', '--format=%H%x09%s', range], repoRoot)
  if (!log) {
    throw new ContradictionError(`commit range resolves to zero commits: ${range}`)
  }
  return log.split('\n').map((line) => {
    const [sha, subject] = line.split('\t')
    const files = git(['show', '--name-only', '--format=', sha], repoRoot)
      .split('\n')
      .filter(Boolean)
    return { sha, subject, files_changed: files }
  })
}

// ------------------------------------------------------------- assemble

const buildGate = (spec, evidenceDir, refPrefix) => {
  const label = GATE_LABELS[spec.id]
  if (!label) throw new ContradictionError(`unknown gate id: ${spec.id}`)

  if (spec.status === 'not_applicable') {
    if (!spec.rationale) {
      throw new ContradictionError(`gate ${spec.id}: not_applicable requires a rationale`)
    }
    return { id: spec.id, label, status: 'not_applicable', rationale: spec.rationale }
  }

  for (const field of ['command_executed', 'stdout', 'exit']) {
    if (!spec[field]) {
      throw new ContradictionError(`gate ${spec.id}: missing manifest field "${field}"`)
    }
  }
  const stdoutPath = join(evidenceDir, spec.stdout)
  const exitPath = join(evidenceDir, spec.exit)
  if (!existsSync(stdoutPath)) {
    throw new ContradictionError(`gate ${spec.id}: stdout file missing: ${spec.stdout}`)
  }
  if (!existsSync(exitPath)) {
    throw new ContradictionError(`gate ${spec.id}: exit file missing: ${spec.exit}`)
  }
  const stdoutBuffer = readFileSync(stdoutPath)
  const exitRaw = readFileSync(exitPath, 'utf8').trim()
  if (!/^\d+$/.test(exitRaw)) {
    throw new ContradictionError(`gate ${spec.id}: exit file is not a number: "${exitRaw}"`)
  }
  const exitCode = Number(exitRaw)
  const metrics = parseMetrics(spec.metrics_source, evidenceDir)

  const gate = {
    id: spec.id,
    label,
    status: evaluateGateStatus({ exitCode, metrics, threshold: spec.threshold }),
    command_executed: spec.command_executed,
    exit_code_ref: refPrefix + spec.exit,
    stdout_ref: refPrefix + spec.stdout,
    stdout_sha256: sha256(stdoutBuffer),
    stdout_tail: tail(stdoutBuffer.toString('utf8')),
  }
  if (metrics) gate.metrics = metrics
  if (typeof spec.threshold === 'number') gate.threshold = spec.threshold
  return gate
}

const buildCycle = (spec, evidenceDir, refPrefix, repoRoot) => {
  for (const field of ['cycle', 'behavior', 'test_files', 'red_commit', 'green_commit']) {
    if (spec[field] === undefined) {
      throw new ContradictionError(`cycle entry missing field "${field}"`)
    }
  }
  const snapshotsDir = join(evidenceDir, 'snapshots')
  mkdirSync(snapshotsDir, { recursive: true })
  const refs = {}
  for (const [phase, commit] of [['red', spec.red_commit], ['green', spec.green_commit]]) {
    for (const testFile of spec.test_files) {
      const name = `${phase}-${spec.cycle}-${basename(testFile)}`
      const content = git(['show', `${commit}:${testFile}`], repoRoot)
      writeFileSync(join(snapshotsDir, name), content + '\n')
      refs[`${phase}_snapshot_ref`] = `${refPrefix}snapshots/${name}`
    }
  }
  return {
    cycle: spec.cycle,
    behavior: spec.behavior,
    test_files: spec.test_files,
    red_commit: spec.red_commit,
    green_commit: spec.green_commit,
    ...refs,
  }
}

export const assemble = ({ manifestPath, evidenceDir, repoRoot, now }) => {
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    throw new ContradictionError(`cannot read manifest: ${error.message}`)
  }
  for (const field of ['story', 'projectSlug', 'date', 'tech_adapter', 'commit_range', 'gates']) {
    if (!manifest[field]) {
      throw new ContradictionError(`manifest missing field "${field}"`)
    }
  }
  const ev = resolve(evidenceDir ?? dirname(manifestPath))
  const root = resolve(repoRoot ?? git(['rev-parse', '--show-toplevel'], process.cwd()))
  const refPrefix = `evidence/${manifest.date}/`

  const gates = manifest.gates.map((spec) => buildGate(spec, ev, refPrefix))
  const cycles = (manifest.cycles ?? []).map((spec) => buildCycle(spec, ev, refPrefix, root))

  const evidence = {
    $schema: SCHEMA_VERSION,
    story: manifest.story,
    produced_at: (now ?? new Date()).toISOString(),
    producer: 'software-engineer',
    tech_adapter: manifest.tech_adapter,
    repo_root_rev: git(['rev-parse', 'HEAD'], root),
    commits_covered: collectCommits(manifest.commit_range, root),
    gates,
    test_integrity: { cycles },
  }

  const outputPath = join(ev, `qg-${manifest.story}.json`)
  writeFileSync(outputPath, JSON.stringify(evidence, null, 2) + '\n')
  const count = (status) => gates.filter((gate) => gate.status === status).length
  return {
    ok: true,
    output: outputPath,
    gates: { pass: count('pass'), fail: count('fail'), na: count('not_applicable') },
  }
}

// --------------------------------------------------------------- render

const mdEscape = (value) => String(value).replaceAll('|', '\\|')

export const renderMarkdown = (evidence) => {
  if (evidence.$schema !== SCHEMA_VERSION) {
    throw new ContradictionError(
      `refusing to render: $schema is "${evidence.$schema}", expected "${SCHEMA_VERSION}"`,
    )
  }
  const lines = [
    '<!-- markdownlint-disable-file -->',
    `# Quality Gates \u2014 ${evidence.story}`,
    '',
    '> Derived view generated by `qg-evidence render`. The JSON evidence log',
    `> (\`qg-${evidence.story}.json\`) is authoritative; reviewers falsify the JSON,`,
    '> never this file.',
    '',
    `- **Produced at**: ${evidence.produced_at}`,
    `- **Producer**: ${evidence.producer}`,
    `- **Tech adapter**: ${evidence.tech_adapter}`,
    `- **Repo revision**: \`${evidence.repo_root_rev}\``,
    '',
    '## Gates',
    '',
    '| Gate | Label | Status | Details |',
    '|---|---|---|---|',
  ]
  for (const gate of evidence.gates) {
    const details =
      gate.status === 'not_applicable'
        ? mdEscape(gate.rationale)
        : [
            gate.metrics?.tests_total !== undefined
              ? `${gate.metrics.tests_passed}/${gate.metrics.tests_total} passed, ${gate.metrics.tests_failed} failed`
              : null,
            gate.metrics?.mutation_score !== undefined
              ? `score ${gate.metrics.mutation_score.toFixed(2)} (threshold ${gate.threshold})`
              : null,
          ]
            .filter(Boolean)
            .join('; ') || `exit \`${gate.exit_code_ref}\``
    lines.push(
      `| ${gate.id} | ${mdEscape(gate.label)} | ${gate.status.toUpperCase()} | ${details} |`,
    )
  }
  lines.push('', '## Commits covered', '', '| SHA | Subject | Files |', '|---|---|---|')
  for (const commit of evidence.commits_covered) {
    lines.push(
      `| \`${commit.sha.slice(0, 12)}\` | ${mdEscape(commit.subject)} | ${commit.files_changed.length} |`,
    )
  }
  const cycles = evidence.test_integrity?.cycles ?? []
  lines.push(
    '',
    '## Test integrity (RED \u2192 GREEN)',
    '',
    '| Cycle | Behavior | RED commit | GREEN commit |',
    '|---|---|---|---|',
  )
  for (const cycle of cycles) {
    lines.push(
      `| ${cycle.cycle} | ${mdEscape(cycle.behavior)} | \`${cycle.red_commit.slice(0, 12)}\` | \`${cycle.green_commit.slice(0, 12)}\` |`,
    )
  }
  lines.push('', '## Evidence references', '', '| Gate | stdout ref | sha256 |', '|---|---|---|')
  for (const gate of evidence.gates) {
    if (gate.stdout_ref) {
      lines.push(`| ${gate.id} | \`${gate.stdout_ref}\` | \`${gate.stdout_sha256}\` |`)
    }
  }
  return lines.join('\n') + '\n'
}

export const render = ({ inputPath, outputPath }) => {
  let evidence
  try {
    evidence = JSON.parse(readFileSync(inputPath, 'utf8'))
  } catch (error) {
    throw new ContradictionError(`cannot read evidence JSON: ${error.message}`)
  }
  const markdown = renderMarkdown(evidence)
  const output = outputPath ?? inputPath.replace(/\.json$/, '.md')
  writeFileSync(output, markdown)
  return { ok: true, output }
}

// ------------------------------------------------------------------ cli

const HELP = `qg-evidence — deterministic quality-gates evidence toolchain (${SCHEMA_VERSION})

Subcommands:
  assemble --manifest <qg-manifest.json> [--evidence-dir <dir>] [--repo-root <dir>]
      Reads the LLM-authored manifest plus the raw captured files
      (stdout/exit/TRX/stryker) and recomputes every fact itself
      (sha256, exit codes, metrics, git data, snapshots). Writes
      qg-{story}.json. Never trusts pre-computed values.
  render --input <qg-{story}.json> [--output <qg-{story}.md>]
      Renders the markdown report from the evidence JSON. The
      markdown is a derived view; the JSON stays authoritative.

Output: one JSON envelope on stdout ({"ok":true,...}); diagnostics on stderr.
Exit codes: 0 ok | 1 contradiction (evidence cannot be truthfully produced) | 2 bad usage.
`

const parseArgs = (argv) => {
  const [command, ...rest] = argv
  const options = {}
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i]
    if (!key?.startsWith('--') || rest[i + 1] === undefined) {
      throw new UsageError(`bad argument: ${key}`)
    }
    options[key.slice(2)] = rest[i + 1]
  }
  return { command, options }
}

const main = (argv) => {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    process.stdout.write(HELP)
    return 0
  }
  const { command, options } = parseArgs(argv)
  if (command === 'assemble') {
    if (!options.manifest) throw new UsageError('assemble requires --manifest')
    const result = assemble({
      manifestPath: options.manifest,
      evidenceDir: options['evidence-dir'],
      repoRoot: options['repo-root'],
    })
    process.stdout.write(JSON.stringify(result) + '\n')
    return 0
  }
  if (command === 'render') {
    if (!options.input) throw new UsageError('render requires --input')
    const result = render({ inputPath: options.input, outputPath: options.output })
    process.stdout.write(JSON.stringify(result) + '\n')
    return 0
  }
  throw new UsageError(`unknown subcommand: ${command}`)
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  try {
    process.exit(main(process.argv.slice(2)))
  } catch (error) {
    process.stderr.write(`qg-evidence: ${error.message}\n`)
    process.exit(error instanceof UsageError ? 2 : 1)
  }
}
