import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'

// Local CLI boundary -> setup, rendering and preparation security. No application doubles.
// Host MCP lifecycle/receipts belong to report-mcp-cli.acceptance.test.mjs;
// provider-independent publication policy belongs to report-mcp-handoff.acceptance.test.mjs.
const cli = fileURLToPath(new URL('../../../plugins/skraft-framework/src/cli/report.mjs', import.meta.url))
const stateCli = fileURLToPath(new URL('../../../plugins/skraft-framework/src/cli/state.mjs', import.meta.url))
const slug = 'checkout-plan'
const branch = 'feature/checkout'
const body = '# Checkout evidence\n\nBasket survives decline.\n\nLiteral $(touch SHOULD_NOT_EXIST)\n'
const prefs = (overrides = {}) => ({
  confirmed: true, repo: 'owner/repo', branch, prNumber: 17, issueNumber: 23,
  destinations: { pr: true, issue: 'link', chat: true }, maxMedia: 0, allowDraftPr: false,
  ...overrides,
})
const hash = (text) => createHash('sha256').update(text).digest('hex')
const json = (path) => JSON.parse(readFileSync(path, 'utf8'))

const forbiddenGh = `#!${process.execPath}
require('node:fs').appendFileSync(process.env.FORBIDDEN_GH_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');
throw new Error('FORBIDDEN_GH_INVOCATION');
`

function fixture(t, { initialized = true, preferences, explicitRoot = true } = {}) {
  const temp = mkdtempSync(join(tmpdir(), 'skraft-report-cli-'))
  const ghLog = join(temp, 'forbidden-gh.jsonl')
  writeFileSync(ghLog, '')
  t.after(() => {
    try { assert.equal(readFileSync(ghLog, 'utf8'), '', 'No CLI command may invoke gh, even on failure') }
    finally { rmSync(temp, { recursive: true, force: true }) }
  })
  const repo = join(temp, 'repo')
  const bin = join(temp, 'bin')
  const home = join(temp, 'home')
  for (const directory of [repo, bin, home, join(temp, 'hooks')]) mkdirSync(directory)
  const write = (ref, value) => {
    const path = join(repo, ref)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value))
    return path
  }
  writeFileSync(join(bin, 'gh'), forbiddenGh, { mode: 0o755 })
  const tracking = explicitRoot ? join(repo, 'custom-tracking') : join(repo, '.copilot-tracking/skraft-plans')
  const env = {
    PATH: [bin, dirname(process.execPath), '/usr/bin', '/bin'].join(delimiter),
    HOME: home, TMPDIR: temp, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0', FORBIDDEN_GH_LOG: ghLog,
    ...(explicitRoot ? { SKRAFT_TRACKING_ROOT: tracking } : {}),
  }
  const run = (file, args) => {
    const result = spawnSync(file, args, { cwd: repo, env, encoding: 'utf8', timeout: 15_000 })
    assert.equal(result.error, undefined, `Fixture/process failure: ${result.error}`)
    assert.equal(result.signal, null, `Process killed: ${result.signal}`)
    return result
  }
  const probe = run(join(bin, 'gh'), ['sentinel-probe'])
  assert.notEqual(probe.status, 0)
  assert.match(probe.stderr, /FORBIDDEN_GH_INVOCATION/)
  assert.deepEqual(JSON.parse(readFileSync(ghLog, 'utf8')), ['sentinel-probe'])
  writeFileSync(ghLog, '')
  const git = (...args) => {
    const result = run('/usr/bin/git', ['-c', `core.hooksPath=${join(temp, 'hooks')}`, '-c', 'commit.gpgsign=false', ...args])
    assert.equal(result.status, 0, `Git fixture failed: ${result.stderr}`)
    return result.stdout.trim()
  }
  git('init', '--initial-branch', branch)
  write('README.md', 'Isolated CLI fixture.\n')
  git('add', 'README.md')
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'test: initialize isolated fixture')
  const revision = git('rev-parse', 'HEAD')
  const statePath = join(tracking, slug, 'state.json')
  if (initialized) {
    const result = run(process.execPath, [stateCli, 'init', '--slug', slug])
    assert.equal(result.status, 0, `Existing state init failed: ${result.stderr}`)
    const state = json(statePath)
    state.userPreferences.maxRetriesPerPhase = 7
    state.userPreferences.language = 'fr'
    if (preferences) state.userPreferences.reporting = preferences
    writeFileSync(statePath, JSON.stringify(state))
  }
  write('report.md', body)
  write('prefs.json', preferences ?? prefs())
  write('sources/test-plan.md', '# Approved plan\nRetry payment with saved basket.\n')
  const data = {
    kind: 'forecast', story: 'checkout', title: 'Preserve basket', revision, language: 'en',
    impact: { expected: 'Retry payment with basket intact.', actual: 'Basket retained; not deployed.' },
    criteria: [{ id: 'AC-1', description: 'Basket retained', test: 'tests/checkout.test.mjs' }],
    testPlanRef: 'sources/test-plan.md', limitations: [], media: [], maxMedia: 99,
  }
  write('report.json', data)
  const invoke = (...args) => {
    const result = run(process.execPath, [cli, ...args])
    assert.equal(readFileSync(ghLog, 'utf8'), '', 'Local CLI must never delegate network work to gh')
    return result
  }
  return {
    repo, temp, tracking, statePath, revision, data, write, git, invoke,
    prepare: (destination = 'pr', extra = []) => invoke('prepare', '--slug', slug,
      '--story', 'checkout', '--kind', 'forecast', '--body', 'report.md', '--destination', destination, ...extra),
  }
}

function success(result) {
  assert.equal(result.status, 0, `Expected successful CLI receipt: ${result.stderr}`)
  assert.equal(result.stderr, '', 'Successful CLI writes only JSON stdout')
  return JSON.parse(result.stdout)
}

function failure(result, reason) {
  assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|SyntaxError|ReferenceError|TypeError|NOT_IMPLEMENTED/,
    'Import, stub and runtime crashes are not behavioral RED')
  assert.notEqual(result.status, 0, 'CLI must reject this operation')
  assert.equal(result.stdout, '', 'Failed CLI writes only JSON stderr')
  const error = JSON.parse(result.stderr)
  assert.equal(typeof error.code, 'string')
  assert.equal(typeof error.reason, 'string')
  assert.match(error.reason, reason)
  return error
}

test('prepare parser rejects missing required arguments with JSON errors', (t) => {
  const f = fixture(t)
  failure(f.invoke('prepare', '--slug', slug), /story|kind|body|required/i)
})

test('setup persists confirmed preferences in resolved tracking root without changing pipeline fields', (t) => {
  for (const explicitRoot of [true, false]) {
    const f = fixture(t, { explicitRoot })
    const before = json(f.statePath)
    success(f.invoke('setup', '--slug', slug, '--data', 'prefs.json'))
    assert.deepEqual(json(f.statePath), { ...before, userPreferences: { ...before.userPreferences, reporting: prefs() } })
  }
})

test('setup requires existing user-initialized state and rejects unconfirmed preferences', (t) => {
  const missing = fixture(t, { initialized: false })
  failure(missing.invoke('setup', '--slug', slug, '--data', 'prefs.json'), /state|initializ|exist/i)
  assert.equal(existsSync(missing.statePath), false, 'Reporting must not initialize engineering')
  const f = fixture(t)
  const before = readFileSync(f.statePath, 'utf8')
  f.write('prefs.json', prefs({ confirmed: false }))
  failure(f.invoke('setup', '--slug', slug, '--data', 'prefs.json'), /confirm|consent/i)
  assert.equal(readFileSync(f.statePath, 'utf8'), before)
})

test('render reads approved repository plan and persisted media cap overrides report data', (t) => {
  const f = fixture(t, { preferences: prefs({ maxMedia: 1 }) })
  f.write('report.json', { ...f.data, media: [
    { label: 'Selected', url: 'https://example.invalid/selected.png' },
    { label: 'Withheld', url: 'https://example.invalid/withheld.png' },
  ] })
  success(f.invoke('render', '--slug', slug, '--data', 'report.json', '--out', 'forecast.md'))
  assert.ok(existsSync(join(f.repo, 'forecast.md')), 'render must write Markdown, not only a JSON success')
  const markdown = readFileSync(join(f.repo, 'forecast.md'), 'utf8')
  assert.match(markdown, /Retry payment with saved basket/)
  assert.match(markdown, /PLANNED/)
  assert.match(markdown, /https:\/\/example.invalid\/selected.png/)
  assert.doesNotMatch(markdown, /https:\/\/example.invalid\/withheld.png/)
  assert.match(markdown, /1 media omitted/)
})

test('outcome render wires real text hashing and marks altered stdout unverified', (t) => {
  const f = fixture(t, { preferences: prefs() })
  const stdout = 'Checkout behavior verified\n'
  f.write('sources/check.stdout', stdout)
  f.write('sources/check.exit', '0\n')
  f.write('sources/qg.json', {
    $schema: 'quality-gates-evidence/v3', story: 'checkout', repo_root_rev: f.revision,
    produced_at: '2026-09-17T10:00:00Z', producer: 'software-engineer', tech_adapter: 'fixture',
    commits_covered: [], test_integrity: { cycles: [] },
    gates: [{ id: 'G1', label: 'Acceptance tests', status: 'pass', command_executed: 'fixture-check',
      stdout_ref: 'sources/check.stdout', exit_code_ref: 'sources/check.exit', stdout_sha256: hash(stdout), stdout_tail: stdout }],
  })
  f.write('report.json', { ...f.data, kind: 'outcome', qualityEvidenceRef: 'sources/qg.json' })
  const render = () => {
    success(f.invoke('render', '--slug', slug, '--data', 'report.json', '--out', 'outcome.md'))
    assert.ok(existsSync(join(f.repo, 'outcome.md')), 'Outcome Markdown must be written')
    return readFileSync(join(f.repo, 'outcome.md'), 'utf8').split('\n').find(line => /^\| G1 \|/.test(line)) ?? ''
  }
  assert.match(render(), /\| pass \|/i)
  f.write('sources/check.stdout', 'Tampered\n' + stdout)
  assert.match(render(), /\| UNVERIFIED \|/)
})

test('render refuses traversal and symlink escape without leaking or overwriting external files', (t) => {
  for (const escape of ['traversal', 'symlink']) {
    const f = fixture(t, { preferences: prefs() })
    const outside = join(f.temp, 'private.md')
    writeFileSync(outside, 'PRIVATE SENTINEL\n')
    symlinkSync(outside, join(f.repo, 'sources/escape.md'))
    f.write('report.json', { ...f.data, testPlanRef: escape === 'traversal' ? '../private.md' : 'sources/escape.md' })
    const result = f.invoke('render', '--slug', slug, '--data', 'report.json', '--out', 'unsafe.md')
    failure(result, /path|reference|testPlanRef|outside|escape|symlink/i)
    assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE SENTINEL/)
    assert.equal(existsSync(join(f.repo, 'unsafe.md')), false)
    f.write('report.json', f.data)
    failure(f.invoke('render', '--slug', slug, '--data', 'report.json', '--out', 'sources/escape.md'), /path|outside|escape|symlink/i)
    assert.equal(readFileSync(outside, 'utf8'), 'PRIVATE SENTINEL\n')
  }
})

test('prepare without persisted consent refuses handoff even with a local Markdown body', (t) => {
  const f = fixture(t)
  const before = readFileSync(f.statePath, 'utf8')
  failure(f.prepare(), /consent|confirm|preferences|setup/i)
  assert.equal(readFileSync(f.statePath, 'utf8'), before)
  assert.equal(readFileSync(join(f.repo, 'report.md'), 'utf8'), body)
})

test('prepare rejects caller attempts to replace persisted target scope', (t) => {
  const f = fixture(t, { preferences: prefs() })
  for (const flags of [['--repo', 'other/project'], ['--pr', '99'], ['--issue', '99'], ['--branch', 'other']]) {
    failure(f.prepare('pr', flags), /argument|option|scope|persist|unknown/i)
  }
})

test('local render needs no reporting consent and honors an explicit zero media cap without enabling publication', (t) => {
  const f = fixture(t)
  const before = readFileSync(f.statePath, 'utf8')
  assert.equal(json(f.statePath).userPreferences.reporting, undefined)
  f.write('report.json', { ...f.data, maxMedia: 0, media: [
    { label: 'Private evidence', url: 'https://example.invalid/private-evidence.png' },
  ] })
  success(f.invoke('render', '--slug', slug, '--data', 'report.json', '--out', 'local.md'))
  const markdown = readFileSync(join(f.repo, 'local.md'), 'utf8')
  assert.match(markdown, /Retry payment with saved basket/)
  assert.match(markdown, /PLANNED/)
  assert.doesNotMatch(markdown, /https:\/\/example.invalid\/private-evidence.png/)
  assert.match(markdown, /1 media omitted/)
  assert.equal(readFileSync(f.statePath, 'utf8'), before, 'Local rendering must not invent remote consent')
  failure(f.invoke('prepare', '--slug', slug, '--story', 'checkout', '--kind', 'forecast', '--body', 'local.md', '--destination', 'pr'),
    /consent|confirm|preferences|setup/i)
})

test('confirmed full issue prepare works without a branch or PR preference', (t) => {
  const f = fixture(t)
  f.write('prefs.json', prefs({ branch: '', prNumber: null,
    destinations: { pr: false, issue: 'full', chat: false } }))
  success(f.invoke('setup', '--slug', slug, '--data', 'prefs.json'))
  const before = readFileSync(f.statePath, 'utf8')
  const packet = success(f.prepare('issue'))
  assert.equal(packet.status, 'ready')
  assert.equal(packet.destination, 'issue')
  assert.deepEqual(packet.target, { provider: 'github', host: 'github.com', repo: 'owner/repo', type: 'issue', number: 23 })
  assert.equal(packet.body.slice(packet.body.indexOf('\n\n') + 2), body, 'Reuse full Markdown verbatim')
  assert.equal(packet.digest, hash(packet.body))
  assert.equal(existsSync(join(f.repo, 'SHOULD_NOT_EXIST')), false, 'Markdown must never become shell input')
  assert.equal(readFileSync(f.statePath, 'utf8'), before)
})