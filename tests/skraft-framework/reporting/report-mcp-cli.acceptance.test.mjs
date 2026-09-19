import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'

// Real CLI processes -> local git, persisted packets/decisions and receipts.
// Observations are supplied host-output fixtures, never a simulated publisher.
// Detailed provider policy belongs to report-mcp-handoff.acceptance.test.mjs.
// Disk contract: reporting/pending.json = { packet, decision? }; one per plan.
// Receipts: reporting/publication.json and reporting/<kind>/<story>.json.
const cli = fileURLToPath(new URL('../../../plugins/skraft-framework/src/cli/report.mjs', import.meta.url))
const stateCli = fileURLToPath(new URL('../../../plugins/skraft-framework/src/cli/state.mjs', import.meta.url))
const slug = 'report-plan'
const story = 'S-1'
const branch = 'feature/report'
const marker = '<!-- skraft-report:forecast:00005300002d000031 -->'
const markdown = '# Forecast\n\n| Criterion | State |\n| --- | --- |\n| Café ☕ | Planned |\n\n```js\nconst x = "{{literal}}"\n```\n\nLiteral $(touch SHOULD_NOT_EXIST)\n'
const marked = `${marker}\n\n${markdown}`
const hash = (text) => createHash('sha256').update(text).digest('hex')
const json = (path) => JSON.parse(readFileSync(path, 'utf8'))
const provenance = { server: 'fixture-host-server', tool: 'fixture-observation-operation' }
const readProvenance = { server: 'fixture-host-server', tool: 'fixture-readback-operation' }
const scopes = [
  { provider: 'github', host: 'github.com', repo: 'owner/repo',
    url: 'https://github.com/owner/repo/pull/42#issuecomment-101' },
  { provider: 'azure-devops', host: 'dev.azure.com', organization: 'team', project: 'Shop',
    repo: '12345678-1234-1234-1234-123456789abc', threadId: 7,
    url: 'https://dev.azure.com/team/Shop/_git/12345678-1234-1234-1234-123456789abc/pullrequest/42?discussionId=7' },
  { provider: 'gitlab', host: 'gitlab.com', repo: 'group/subgroup/shop',
    url: 'https://gitlab.com/group/subgroup/shop/-/merge_requests/42#note_101' },
]
const preferences = (overrides = {}) => ({
  confirmed: true, repo: 'owner/repo', branch, prNumber: 42, issueNumber: 23,
  destinations: { pr: true, issue: 'link', chat: true }, maxMedia: 0, allowDraftPr: false,
  ...overrides,
})
function target(scope = scopes[0]) {
  const { url, threadId, ...identity } = scope
  return { ...identity, number: 42, type: 'pr' }
}
function snapshot(packet, overrides = {}) {
  return { target: packet.target, branch: packet.branch, viewer: 'reporter',
    comments: [], complete: true, capabilities: { read: true, create: true, update: true },
    provenance, ...overrides }
}
function readback(packet, scope = scopes[0], overrides = {}) {
  const thread = scope.threadId ? { threadId: scope.threadId } : {}
  return { target: packet.target, branch: packet.branch, viewer: 'reporter',
    provenance: readProvenance, writeResult: { id: 101, ...thread },
    comment: { id: 101, body: packet.body, author: 'reporter', url: scope.url, ...thread },
    ...overrides }
}

const forbiddenGh = `#!${process.execPath}
require('node:fs').appendFileSync(process.env.FORBIDDEN_GH_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');
throw new Error('FORBIDDEN_GH_INVOCATION');
`

function fixture(t) {
  const temp = mkdtempSync(join(tmpdir(), 'skraft-report-mcp-cli-'))
  const repo = join(temp, 'repo')
  const bin = join(temp, 'bin')
  const home = join(temp, 'home')
  const hooks = join(temp, 'hooks')
  const ghLog = join(temp, 'forbidden-gh.jsonl')
  t.after(() => {
    try { assert.equal(readFileSync(ghLog, 'utf8'), '', 'No CLI command may invoke gh, even on failure') }
    finally { rmSync(temp, { recursive: true, force: true }) }
  })
  for (const path of [repo, bin, home, hooks]) mkdirSync(path)
  writeFileSync(ghLog, '')
  writeFileSync(join(bin, 'gh'), forbiddenGh, { mode: 0o755 })
  const tracking = join(repo, 'custom-tracking')
  const reporting = join(tracking, slug, 'reporting')
  const env = {
    PATH: [bin, dirname(process.execPath), '/usr/bin', '/bin'].join(delimiter),
    HOME: home, TMPDIR: temp, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0', SKRAFT_TRACKING_ROOT: tracking, FORBIDDEN_GH_LOG: ghLog,
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
  const write = (ref, value) => {
    const path = join(repo, ref)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value))
    return path
  }
  const git = (...args) => {
    const result = run('/usr/bin/git', ['-c', `core.hooksPath=${hooks}`, '-c', 'commit.gpgsign=false', ...args])
    assert.equal(result.status, 0, `Local git fixture failed: ${result.stderr}`)
    return result.stdout.trim()
  }
  git('init', '--initial-branch', branch)
  write('README.md', 'Local reporting fixture. No remote configured.\n')
  git('add', 'README.md')
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'test: local fixture')
  const revision = git('rev-parse', 'HEAD')
  success(run(process.execPath, [stateCli, 'init', '--slug', slug]))
  const statePath = join(tracking, slug, 'state.json')
  write('report.md', markdown)
  write('sources/test-plan.md', '# Approved plan\nRetry payment with saved basket.\n')
  write('report.json', { kind: 'forecast', story, title: 'Preserve basket', revision, language: 'en',
    impact: { expected: 'Basket retained on retry.', actual: 'Not yet delivered.' },
    criteria: [{ id: 'AC-1', description: 'Basket retained', test: 'tests/checkout.test.mjs' }],
    testPlanRef: 'sources/test-plan.md', limitations: [], media: [], maxMedia: 0 })
  const invoke = (...args) => {
    const result = run(process.execPath, [cli, ...args])
    assert.equal(readFileSync(ghLog, 'utf8'), '', 'Local CLI must never delegate network work to gh')
    return result
  }
  return { repo, reporting, statePath, write, git, invoke,
    pendingPath: join(reporting, 'pending.json'), receiptPath: join(reporting, 'publication.json'),
    identityPath: (kind = 'forecast') => join(reporting, kind, `${story}.json`),
    setup: (prefs = preferences()) => {
      write('prefs.json', prefs)
      return success(invoke('setup', '--slug', slug, '--data', 'prefs.json'))
    },
    prepare: (destination = 'pr', kind = 'forecast') => invoke('prepare', '--slug', slug,
      '--story', story, '--kind', kind, '--body', 'report.md', '--destination', destination),
    decide: (observed) => {
      write('snapshot.json', observed)
      return invoke('decide', '--slug', slug, '--data', 'snapshot.json')
    },
    record: (observed) => {
      write('readback.json', observed)
      return invoke('record', '--slug', slug, '--data', 'readback.json')
    },
  }
}
function noRuntimeCrash(result) {
  assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|SyntaxError|ReferenceError|TypeError|NOT_IMPLEMENTED/,
    'Import and runtime crashes are not behavior RED')
}
function success(result) {
  noRuntimeCrash(result)
  assert.equal(result.status, 0, `Expected successful local CLI operation: ${result.stderr}`)
  assert.equal(result.stderr, '')
  return JSON.parse(result.stdout)
}
function failure(result, reason) {
  noRuntimeCrash(result)
  assert.notEqual(result.status, 0, 'Unsafe operation must be rejected')
  assert.equal(result.stdout, '')
  const error = JSON.parse(result.stderr)
  assert.equal(typeof error.code, 'string')
  assert.match(error.reason, reason)
}
function pending(value, reason) {
  assert.equal(value.action ?? value.status, 'pending')
  assert.match(value.reason, reason)
}
function begin(f) {
  f.setup()
  const packet = success(f.prepare())
  assert.equal(packet.status, 'ready')
  return packet
}
function decideCreate(f, packet) {
  const decision = success(f.decide(snapshot(packet)))
  assert.equal(decision.action, 'create')
  assert.deepEqual(json(f.pendingPath).packet, packet)
  assert.deepEqual(json(f.pendingPath).decision, decision)
  return decision
}
function assertReceipt(f, receipt, packet, seen) {
  const entry = receipt.targets?.[packet.destination]
  assert.ok(entry, 'Publication must identify destination')
  assert.equal(receipt.story, story)
  assert.equal(receipt.kind, packet.kind)
  assert.equal(entry.status, 'published')
  assert.deepEqual(entry.target, packet.target)
  assert.equal(entry.id, seen.comment.id)
  assert.equal(entry.url, seen.comment.url)
  assert.equal(entry.renderedBodyDigest, hash(packet.body))
  assert.equal(entry.verification, 'host-mcp-readback')
  assert.equal(entry.localValidation, 'body-target-match')
  assert.deepEqual(entry.provenance, readProvenance)
  if (seen.comment.threadId !== undefined) assert.equal(entry.threadId, seen.comment.threadId)
  assert.deepEqual(json(f.receiptPath), receipt)
  assert.deepEqual(json(f.identityPath(packet.kind)), receipt)
  assert.deepEqual(success(f.invoke('status', '--slug', slug)), receipt, 'Separate process must recover receipts')
}

test('help expands local lifecycle with explicit abandon, never old publish', (t) => {
  const f = fixture(t)
  const help = success(f.invoke('--help'))
  assert.deepEqual(Object.keys(help.commands).sort(), ['setup', 'render', 'status', 'prepare', 'decide', 'record', 'abandon'].sort())
  assert.deepEqual(help.commands.abandon, ['slug', 'reason'])
  failure(f.invoke('unknown'), /command|usage/i)
})

for (const scope of scopes) {
  test(`${scope.provider} setup → prepare → decide → record persists exact packet and scoped receipts without gh`, (t) => {
    const f = fixture(t)
    const before = json(f.statePath)
    const { number, type, ...providerPreferences } = target(scope)
    const prefs = preferences(providerPreferences)
    f.setup(prefs)
    assert.deepEqual(json(f.statePath), { ...before, userPreferences: { ...before.userPreferences, reporting: prefs } })
    const packet = success(f.prepare())
    assert.deepEqual(packet, { status: 'ready', story, kind: 'forecast', destination: 'pr',
      target: target(scope), branch, marker, body: marked, digest: hash(marked) })
    assert.deepEqual(json(f.pendingPath).packet, packet)
    assert.equal(json(f.pendingPath).decision, undefined)
    decideCreate(f, packet)
    const seen = readback(packet, scope)
    assertReceipt(f, success(f.record(seen)), packet, seen)
    assert.equal(readFileSync(join(f.repo, 'report.md'), 'utf8'), markdown)
    assert.equal(existsSync(join(f.repo, 'SHOULD_NOT_EXIST')), false)
    assert.deepEqual(json(f.statePath).userPreferences.reporting, prefs)
  })
}

test('omitted provider remains compatible with legacy GitHub setup', (t) => {
  const f = fixture(t)
  const packet = begin(f)
  assert.deepEqual(packet.target, target())
  assert.equal(json(f.statePath).userPreferences.reporting.provider, undefined)
})

test('local render needs no publication consent and does not prepare or publish', (t) => {
  const f = fixture(t)
  const before = readFileSync(f.statePath, 'utf8')
  success(f.invoke('render', '--slug', slug, '--data', 'report.json', '--out', 'forecast.md'))
  const rendered = readFileSync(join(f.repo, 'forecast.md'), 'utf8')
  assert.match(rendered, /Retry payment with saved basket/)
  assert.match(rendered, /PLANNED/)
  assert.equal(existsSync(f.pendingPath), false)
  assert.equal(existsSync(f.receiptPath), false)
  assert.equal(readFileSync(f.statePath, 'utf8'), before)
})

test('prepare without persisted consent rejects publication while retaining Markdown and pipeline state', (t) => {
  const f = fixture(t)
  const before = readFileSync(f.statePath, 'utf8')
  failure(f.prepare(), /consent|confirm|preferences|setup/i)
  assert.equal(existsSync(f.receiptPath), false)
  assert.equal(readFileSync(f.statePath, 'utf8'), before)
  assert.equal(readFileSync(join(f.repo, 'report.md'), 'utf8'), markdown)
})

test('missing PR remains durably pending despite draft permission, without creating any remote resource', (t) => {
  const f = fixture(t)
  f.setup(preferences({ prNumber: null, allowDraftPr: true }))
  const packet = success(f.prepare())
  pending(packet, /target|number|PR/i)
  assert.deepEqual(json(f.pendingPath).packet, packet)
  assert.equal(existsSync(f.receiptPath), false)
})

test('prepare resolves branch from local git, not caller assertions', (t) => {
  const f = fixture(t)
  f.setup()
  f.git('checkout', '-b', 'feature/unapproved')
  failure(f.prepare(), /branch|scope/i)
  assert.equal(existsSync(f.receiptPath), false)
})

test('one plan cannot replace an unresolved packet with another destination or report kind', (t) => {
  const f = fixture(t)
  const packet = begin(f)
  decideCreate(f, packet)
  const before = readFileSync(f.pendingPath, 'utf8')
  for (const [destination, kind] of [['issue', 'forecast'], ['pr', 'outcome']]) {
    failure(f.prepare(destination, kind), /pending|attempt|outstanding|in.progress/i)
    assert.equal(readFileSync(f.pendingPath, 'utf8'), before)
  }
})

test('remote snapshot target mismatch is persisted as pending and cannot authorize record', (t) => {
  const f = fixture(t)
  const packet = begin(f)
  const decision = success(f.decide(snapshot(packet, { target: { ...packet.target, number: 99 } })))
  pending(decision, /target|scope/i)
  assert.deepEqual(json(f.pendingPath).packet, packet)
  assert.deepEqual(json(f.pendingPath).decision, decision)
  failure(f.record(readback(packet)), /pending|decision|action/i)
  assert.equal(existsSync(f.receiptPath), false)
})

test('unavailable MCP write capability stays pending with no fallback transport', (t) => {
  const f = fixture(t)
  const packet = begin(f)
  const decision = success(f.decide(snapshot(packet, { capabilities: { read: true, create: false, update: true } })))
  pending(decision, /capabilit|create/i)
  assert.deepEqual(json(f.pendingPath).decision, decision)
  failure(f.record(readback(packet)), /pending|decision|action/i)
  assert.equal(existsSync(f.receiptPath), false)
})

for (const phase of ['decide', 'record']) {
  test(`changed configured target since prepare is rejected at ${phase}`, (t) => {
    const f = fixture(t)
    const packet = begin(f)
    if (phase === 'record') decideCreate(f, packet)
    f.setup(preferences({ prNumber: 99 }))
    const result = phase === 'decide' ? f.decide(snapshot(packet)) : f.record(readback(packet))
    failure(result, /target|scope|changed|stale|pending/i)
    assert.equal(existsSync(f.receiptPath), false)
  })
}

test('record rechecks current local branch after prepare and decision', (t) => {
  const f = fixture(t)
  const packet = begin(f)
  decideCreate(f, packet)
  f.git('checkout', '-b', 'feature/unapproved')
  failure(f.record(readback(packet)), /branch|scope/i)
  assert.equal(existsSync(f.receiptPath), false)
})

test('record requires a persisted decision, not just a plausible readback', (t) => {
  const f = fixture(t)
  const packet = begin(f)
  failure(f.record(readback(packet)), /decision|decide/i)
  assert.equal(existsSync(f.receiptPath), false)
  assert.deepEqual(json(f.pendingPath).packet, packet)
})

test('record cannot accept caller-supplied replacement packet and decision matching a forged body', (t) => {
  const f = fixture(t)
  const packet = begin(f)
  const decision = decideCreate(f, packet)
  const forged = { ...packet, body: `${marked}\nUnapproved replacement\n` }
  forged.digest = hash(forged.body)
  const supplied = { ...readback(forged), packet: forged,
    decision: { ...decision, body: forged.body, digest: forged.digest } }
  failure(f.record(supplied), /body|digest|packet|decision|field|unknown|unexpected/i)
  assert.equal(existsSync(f.receiptPath), false)
  assert.deepEqual(json(f.pendingPath).packet, packet)
  assert.deepEqual(json(f.pendingPath).decision, decision)
})

test('altered saved packet body cannot be recorded against its original decision and digest', (t) => {
  const f = fixture(t)
  const packet = begin(f)
  decideCreate(f, packet)
  const saved = json(f.pendingPath)
  saved.packet.body += '\nTampered on disk\n'
  writeFileSync(f.pendingPath, JSON.stringify(saved))
  failure(f.record(readback(saved.packet)), /body|digest|packet/i)
  assert.equal(existsSync(f.receiptPath), false)
})

test('false readback never creates a receipt and leaves saved packet available for genuine readback', (t) => {
  const f = fixture(t)
  const packet = begin(f)
  decideCreate(f, packet)
  const seen = readback(packet)
  failure(f.record({ ...seen, comment: { ...seen.comment, body: `${packet.body} ` } }), /body|digest|match/i)
  assert.equal(existsSync(f.receiptPath), false)
  assert.deepEqual(json(f.pendingPath).packet, packet)
  assertReceipt(f, success(f.record(seen)), packet, seen)
})

test('issue pointer waits for recorded PR URL rather than predicted or merely decided publication', (t) => {
  const f = fixture(t)
  f.setup()
  const packet = success(f.prepare('issue'))
  pending(packet, /PR|receipt|pointer/i)
  assert.deepEqual(json(f.pendingPath).packet, packet)
  assert.equal(existsSync(f.receiptPath), false)
})

test('issue pointer uses recorded PR comment and merges both targets into durable per-kind/story receipt', (t) => {
  const f = fixture(t)
  const packet = begin(f)
  decideCreate(f, packet)
  const pr = success(f.record(readback(packet)))
  const issue = success(f.prepare('issue'))
  assert.equal(issue.status, 'ready')
  assert.deepEqual(issue.target, { ...packet.target, type: 'issue', number: 23 })
  assert.equal(issue.body, `${marker}\n\nReport: ${pr.targets.pr.url}\n`)
  assert.equal(issue.digest, hash(issue.body))
  decideCreate(f, issue)
  const seen = readback(issue, scopes[0], { writeResult: { id: 202 }, comment: {
    id: 202, body: issue.body, author: 'reporter', url: 'https://github.com/owner/repo/issues/23#issuecomment-202',
  } })
  const merged = success(f.record(seen))
  assertReceipt(f, merged, issue, seen)
  assert.deepEqual(merged.targets.pr, pr.targets.pr, 'Issue record must retain previous trusted PR target')
  assert.deepEqual(Object.keys(merged.targets).sort(), ['issue', 'pr'])
  const outcome = success(f.prepare('pr', 'outcome'))
  assert.equal(outcome.previousDigest, undefined, 'Forecast digest must not authorize outcome overwrite')
  decideCreate(f, outcome)
  const outcomeSeen = readback(outcome, scopes[0], { writeResult: { id: 303 }, comment: {
    id: 303, body: outcome.body, author: 'reporter', url: 'https://github.com/owner/repo/pull/42#issuecomment-303',
  } })
  assertReceipt(f, success(f.record(outcomeSeen)), outcome, outcomeSeen)
  assert.deepEqual(json(f.identityPath('forecast')), merged, 'Later kind must not overwrite forecast receipt')
})

test('exact observed retry records unchanged without a write result or write capability', (t) => {
  const f = fixture(t)
  const packet = begin(f)
  const seen = readback(packet)
  const decision = success(f.decide(snapshot(packet, { comments: [seen.comment],
    capabilities: { read: true, create: false, update: false } })))
  assert.equal(decision.action, 'unchanged')
  assert.equal(decision.commentId, 101)
  assert.deepEqual(json(f.pendingPath).decision, decision)
  delete seen.writeResult
  assertReceipt(f, success(f.record(seen)), packet, seen)
})

test('changed Markdown after prepare never implicitly rerenders or replaces saved publication body', (t) => {
  const f = fixture(t)
  const packet = begin(f)
  f.write('report.md', '# Changed after prepare\n')
  f.write('report.json', 'not valid JSON: rendering must not run\n')
  f.write('sources/test-plan.md', '# Changed source plan\n')
  decideCreate(f, packet)
  const seen = readback(packet)
  assertReceipt(f, success(f.record(seen)), packet, seen)
  assert.equal(packet.body, marked)
  assert.equal(readFileSync(join(f.repo, 'report.md'), 'utf8'), '# Changed after prepare\n')
  const next = success(f.prepare())
  assert.equal(next.body, `${marker}\n\n# Changed after prepare\n`)
  assert.equal(next.previousDigest, packet.digest, 'Explicit prepare reuses last trusted per-story digest')
})