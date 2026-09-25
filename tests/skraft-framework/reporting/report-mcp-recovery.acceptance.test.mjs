import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gitExecutable, installGhSentinel, isolatedEnv } from './fixtures/isolated-cli-env.mjs'
import { preparePublication, decidePublication, recordPublication } from '../../../plugins/skraft-framework/src/application/report-publication-handoff.mjs'

// Successor contracts at the application and real local CLI boundaries.
// MCP observations are host attestations, not a publisher or network simulator.
const hashText = (text) => createHash('sha256').update(text).digest('hex')
const ports = { hashText }
const slug = 'recovery-plan'
const branch = 'feature/report'
const provenance = { server: 'fixture-host', tool: 'fixture-read' }
const github = { provider: 'github', host: 'github.com', repo: 'owner/repo' }
const azure = { provider: 'azure-devops', host: 'dev.azure.com', organization: 'team', project: 'Shop', repo: 'shop' }
const gitlab = { provider: 'gitlab', host: 'gitlab.com', repo: 'group/subgroup/shop' }
const preferences = (scope = github, overrides = {}) => ({
  confirmed: true, ...scope, branch, prNumber: 42, issueNumber: 23,
  destinations: { pr: true, issue: 'link', chat: true }, maxMedia: 0, allowDraftPr: false, ...overrides,
})
const request = (prefs = preferences(), overrides = {}) => ({
  preferences: prefs, story: 'S-1', kind: 'forecast', destination: 'pr', currentBranch: branch,
  body: '# Forecast\nFirst approved report.\n', ...overrides,
})
const prepare = (prefs, overrides) => preparePublication(request(prefs, overrides), ports)
const observed = (packet, comments = [], overrides = {}) => ({
  target: packet.target, branch: packet.branch, viewer: 'reporter', complete: true,
  capabilities: { read: true, create: true, update: true }, provenance, comments, ...overrides,
})
function comment(packet, overrides = {}) {
  const threaded = packet.target.provider === 'azure-devops' && packet.destination === 'pr'
  return { id: 101, author: 'reporter', body: packet.body, ...(threaded ? { threadId: 7 } : {}), ...overrides }
}
function readback(packet, entry = comment(packet), overrides = {}) {
  return { target: packet.target, branch: packet.branch, viewer: 'reporter', provenance,
    comment: entry, writeResult: { id: entry.id, ...(entry.threadId === undefined ? {} : { threadId: entry.threadId }) }, ...overrides }
}
function record(packet, decision, seen = readback(packet)) {
  let receipt
  assert.doesNotThrow(() => { receipt = recordPublication(packet, decision, seen, ports) }, 'Scoped readback must be recordable')
  return receipt
}
function urlFor(packet) {
  if (packet.target.provider === 'azure-devops') return 'https://dev.azure.com/team/Shop/_git/shop/pullrequest/42?discussionId=7'
  if (packet.target.provider === 'gitlab') return 'https://gitlab.com/group/subgroup/shop/-/merge_requests/42#note_101'
  return 'https://github.com/owner/repo/pull/42#issuecomment-101'
}
function published(prefs = preferences()) {
  const packet = prepare(prefs)
  const entry = comment(packet, { url: urlFor(packet) })
  const decision = decidePublication(packet, observed(packet), ports)
  const receipt = record(packet, decision, readback(packet, entry))
  return { packet, entry, receipt }
}
function updateAttempt(prefs = preferences()) {
  const prior = published(prefs)
  const packet = prepare(prefs, { body: '# Forecast\nRevised approved report.\n', previousReceipt: prior.receipt })
  const decision = decidePublication(packet, observed(packet, [prior.entry]), ports)
  assert.equal(decision.action, 'update')
  return { ...prior, packet, decision }
}

for (const scope of [github, azure, gitlab]) {
  test(`${scope.provider}: missing browser URL records scoped publication, but cannot produce a PR pointer`, () => {
    const prefs = preferences(scope)
    const packet = prepare(prefs)
    const receipt = record(packet, decidePublication(packet, observed(packet), ports))
    const entry = receipt.targets.pr
    assert.equal(entry.status, 'published')
    assert.equal(entry.id, 101)
    assert.deepEqual(entry.target, packet.target)
    assert.deepEqual(entry.provenance, provenance)
    assert.equal(entry.renderedBodyDigest, packet.digest)
    assert.equal(entry.url, undefined, 'Never invent a browser URL')
    assert.equal(entry.urlStatus, 'unavailable')
    if (scope === azure) assert.equal(entry.threadId, 7)
    const pointer = prepare(prefs, { destination: 'issue', previousReceipt: receipt })
    assert.equal(pointer.status, 'pending', 'A published receipt without a link is not a usable pointer')
    assert.match(pointer.reason, /URL|pointer|unavailable/i)
  })
}

for (const destination of ['pr', 'issue']) {
  test(`Azure ${destination}: a supplied target browser URL needs no invented comment anchor or mandatory discussion query`, () => {
    const prefs = preferences(azure, { destinations: { pr: true, issue: 'full', chat: true } })
    const packet = prepare(prefs, { destination })
    const url = destination === 'pr'
      ? 'https://dev.azure.com/team/Shop/_git/shop/pullrequest/42'
      : 'https://dev.azure.com/team/Shop/_workitems/edit/23'
    const entry = comment(packet, { url })
    const receipt = record(packet, decidePublication(packet, observed(packet), ports), readback(packet, entry))
    assert.equal(receipt.targets[destination].url, url)
    assert.equal(decidePublication(packet, observed(packet, [entry]), ports).action, 'unchanged')
  })
}

test('optional URL does not relax supplied URL validation or Azure thread identity', () => {
  const packet = prepare(preferences(azure))
  const create = decidePublication(packet, observed(packet), ports)
  for (const url of ['', null, 'http://dev.azure.com/team/Shop/_git/shop/pullrequest/42',
    'https://other.example/team/Shop/_git/shop/pullrequest/42',
    'https://dev.azure.com/other/Shop/_git/shop/pullrequest/42',
    'https://dev.azure.com/team/Other/_git/shop/pullrequest/42',
    'https://dev.azure.com/team/Shop/_git/other/pullrequest/42',
    'https://dev.azure.com/team/Shop/_git/shop/pullrequest/43',
    'https://dev.azure.com/team/Shop/_git/shop/pullrequest/42?discussionId=8']) {
    const entry = comment(packet, { url })
    assert.equal(decidePublication(packet, observed(packet, [entry]), ports).action, 'pending')
    assert.throws(() => recordPublication(packet, create, readback(packet, entry), ports), /URL|scope|thread/i)
  }
  for (const threadId of [undefined, 0, '7']) {
    const entry = comment(packet, { threadId })
    assert.equal(decidePublication(packet, observed(packet, [entry]), ports).action, 'pending')
    assert.throws(() => recordPublication(packet, create, readback(packet, entry), ports))
  }
})

test('URL-less owned Azure report can be selected and recorded as an authorized update', () => {
  const { packet, entry } = updateAttempt(preferences(azure))
  const { url, ...withoutUrl } = entry
  const decision = decidePublication(packet, observed(packet, [withoutUrl]), ports)
  assert.equal(decision.action, 'update')
  assert.equal(decision.commentId, 101)
  assert.equal(decision.threadId, 7)
  const receipt = record(packet, decision)
  assert.equal(receipt.targets.pr.urlStatus, 'unavailable')
})

for (const scope of [github, azure, gitlab]) {
  test(`${scope.provider}: interrupted successful UPDATE recovers only from the saved exact authorization`, () => {
    const { packet, decision } = updateAttempt(preferences(scope))
    assert.deepEqual(decision.target, packet.target, 'Saved authorization must carry its target scope')
    const entry = comment(packet, { url: urlFor(packet) })
    const observation = observed(packet, [entry], { capabilities: { read: true, create: false, update: false } })
    const recovered = decidePublication(packet, observation, { ...ports, priorDecision: decision })
    assert.equal(recovered.action, 'unchanged', 'Successful write must not need a second write')
    assert.equal(recovered.commentId, decision.commentId)
    assert.equal(recovered.threadId, decision.threadId)
    assert.equal(recovered.body, packet.body)
    assert.equal(recovered.digest, packet.digest)
    const receipt = record(packet, recovered, readback(packet, entry, { writeResult: undefined }))
    assert.equal(receipt.targets.pr.renderedBodyDigest, packet.digest)
    assert.notEqual(packet.previousDigest, packet.digest, 'Recovery must not rewrite trusted history to bypass conflict checks')
  })
}

test('desired remote body is still a conflict with no authorization or mismatched action, target, identity, thread, body or digest', () => {
  const { packet, decision } = updateAttempt(preferences(azure))
  const entry = comment(packet, { url: urlFor(packet) })
  const variants = [undefined, { ...decision, action: 'create' }, { ...decision, action: 'pending' },
    { ...decision, viewer: 'other' }, { ...decision, commentId: 102 }, { ...decision, threadId: 8 },
    { ...decision, body: `${packet.body} ` }, { ...decision, digest: packet.previousDigest },
    { ...decision, target: undefined },
    ...['provider', 'host', 'organization', 'project', 'repo', 'type', 'number'].map((key) => ({
      ...decision, target: { ...packet.target, [key]: key === 'number' ? 99 : 'other' },
    })),
  ]
  for (const priorDecision of variants) {
    assert.equal(decidePublication(packet, observed(packet, [entry]), { ...ports, priorDecision }).action, 'pending')
  }
  for (const observation of [observed(packet, [comment(packet, { body: `${packet.body}\nManual edit`, url: urlFor(packet) })]),
    observed(packet, [entry, { ...entry, id: 102 }]), observed(packet, [entry], { complete: false }),
    observed(packet, [entry], { provenance: undefined }), observed(packet, [entry], { branch: 'other' })]) {
    assert.equal(decidePublication(packet, observation, { ...ports, priorDecision: decision }).action, 'pending')
  }
})

const cli = fileURLToPath(new URL('../../../plugins/skraft-framework/src/cli/report.mjs', import.meta.url))
const stateCli = fileURLToPath(new URL('../../../plugins/skraft-framework/src/cli/state.mjs', import.meta.url))
const json = (path) => JSON.parse(readFileSync(path, 'utf8'))
function success(result) {
  assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND|SyntaxError|ReferenceError|TypeError/)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stderr, '')
  return JSON.parse(result.stdout)
}
function failure(result, reason) {
  assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND|SyntaxError|ReferenceError|TypeError/)
  assert.notEqual(result.status, 0)
  assert.equal(result.stdout, '')
  assert.match(JSON.parse(result.stderr).reason, reason)
}
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'skraft-report-recovery-'))
  const repo = join(root, 'repo')
  const bin = join(root, 'bin')
  const tracking = join(repo, 'tracking')
  const reporting = join(tracking, slug, 'reporting')
  const forbidden = join(root, 'forbidden-gh.log')
  mkdirSync(repo)
  mkdirSync(bin)
  writeFileSync(forbidden, '')
  const gh = installGhSentinel(bin, `require('node:fs').appendFileSync(process.env.FORBIDDEN_GH_LOG, 'called'); process.exit(1);\n`)
  const env = isolatedEnv({ bin, home: root, temp: root, extra: { SKRAFT_TRACKING_ROOT: tracking, FORBIDDEN_GH_LOG: forbidden } })
  const run = (executable, args) => {
    const result = spawnSync(executable, args, { cwd: repo, env, encoding: 'utf8', timeout: 15_000 })
    assert.equal(result.error, undefined)
    assert.equal(result.signal, null)
    return result
  }
  t.after(() => {
    try { assert.equal(readFileSync(forbidden, 'utf8'), '', 'No remote gh operation permitted') }
    finally { rmSync(root, { recursive: true, force: true }) }
  })
  assert.equal(run(gh.file, [...gh.args, 'probe']).status, 1)
  assert.equal(readFileSync(forbidden, 'utf8'), 'called')
  writeFileSync(forbidden, '')
  assert.equal(run(gitExecutable, ['init', '--initial-branch', branch]).status, 0)
  success(run(process.execPath, [stateCli, 'init', '--slug', slug]))
  const write = (name, value) => writeFileSync(join(repo, name), typeof value === 'string' ? value : JSON.stringify(value))
  const invoke = (...args) => run(process.execPath, [cli, ...args])
  const dataCommand = (command, value) => {
    write('input.json', value)
    return invoke(command, '--slug', slug, '--data', 'input.json')
  }
  write('report.md', request().body)
  return { reporting, write, invoke, pendingPath: join(reporting, 'pending.json'),
    receiptPath: join(reporting, 'publication.json'), identityPath: join(reporting, 'forecast', 'S-1.json'),
    statePath: join(tracking, slug, 'state.json'),
    setup: (prefs = preferences()) => success(dataCommand('setup', prefs)),
    prepare: (destination = 'pr') => invoke('prepare', '--slug', slug, '--story', 'S-1', '--kind', 'forecast', '--body', 'report.md', '--destination', destination),
    decide: (value) => dataCommand('decide', value), record: (value) => dataCommand('record', value),
    status: () => invoke('status', '--slug', slug),
    abandon: (reason) => invoke('abandon', '--slug', slug, ...(reason === undefined ? [] : ['--reason', reason])),
  }
}
function publishCli(f) {
  f.setup()
  const packet = success(f.prepare())
  const entry = comment(packet, { url: urlFor(packet) })
  assert.equal(success(f.decide(observed(packet))).action, 'create')
  const receipt = success(f.record(readback(packet, entry)))
  return { packet, entry, receipt }
}

test('CLI fresh status is idle, not a missing-file error', (t) => {
  const f = fixture(t)
  assert.deepEqual(success(f.status()), { status: 'idle' })
  assert.equal(existsSync(f.pendingPath), false)
})

test('CLI persists UPDATE authorization and recovers after successful remote write but interrupted record', (t) => {
  const f = fixture(t)
  const prior = publishCli(f)
  f.write('report.md', '# Forecast\nRevised approved report.\n')
  const packet = success(f.prepare())
  assert.equal(success(f.decide(observed(packet, [prior.entry]))).action, 'update')
  const entry = comment(packet, { url: urlFor(packet) })
  const recovered = success(f.decide(observed(packet, [entry], { capabilities: { read: true, create: false, update: false } })))
  assert.equal(recovered.action, 'unchanged')
  assert.equal(recovered.commentId, prior.entry.id)
  const receipt = success(f.record(readback(packet, entry, { writeResult: undefined })))
  assert.equal(receipt.targets.pr.id, prior.entry.id)
  assert.equal(receipt.targets.pr.renderedBodyDigest, packet.digest)
  assert.deepEqual(success(f.status()), receipt, 'No pending: existing receipt shape stays compatible')
  assert.equal(existsSync(f.pendingPath), false)
})

test('CLI latest pending takes precedence over previous receipt without losing that receipt', (t) => {
  const f = fixture(t)
  const { receipt } = publishCli(f)
  f.write('report.md', '# Forecast\nRevised approved report.\n')
  const packet = success(f.prepare())
  const decision = success(f.decide(observed(packet, [], { complete: false })))
  assert.equal(decision.action, 'pending')
  const latest = success(f.status())
  assert.deepEqual(latest.packet, packet)
  assert.deepEqual(latest.decision, decision)
  assert.deepEqual(latest.previousReceipt, receipt)
  assert.deepEqual(json(f.receiptPath), receipt)
})

test('CLI status flags changed scope, redacts stale previous targets, and leaves receipts on disk intact', (t) => {
  const f = fixture(t)
  const { receipt } = publishCli(f)
  f.write('report.md', '# Forecast\nRevised approved report.\n')
  const packet = success(f.prepare())
  f.setup(preferences(github, { prNumber: 99 }))
  const latest = success(f.status())
  assert.deepEqual(latest.packet, packet, 'Unresolved attempt remains visible for reconciliation or abandonment')
  assert.equal(latest.scopeChanged, true)
  assert.deepEqual(latest.previousReceipt, { ...receipt, targets: {} })
  assert.deepEqual(json(f.receiptPath), receipt)
})

test('CLI abandon requires a nonblank reason and preserves pending and receipts on rejection', (t) => {
  const f = fixture(t)
  publishCli(f)
  f.write('report.md', '# Revised\n')
  success(f.prepare())
  const before = readFileSync(f.pendingPath, 'utf8')
  const receipt = readFileSync(f.receiptPath, 'utf8')
  for (const reason of [undefined, '', '   ']) {
    failure(f.abandon(reason), /reason|required|blank|empty/i)
    assert.equal(readFileSync(f.pendingPath, 'utf8'), before)
    assert.equal(readFileSync(f.receiptPath, 'utf8'), receipt)
  }
})

test('CLI abandon archives exact pending and decision with unresolved warning before allowing a different target', (t) => {
  const f = fixture(t)
  const { entry, receipt } = publishCli(f)
  f.write('report.md', '# Revised\n')
  const packet = success(f.prepare())
  success(f.decide(observed(packet, [entry])))
  const pending = json(f.pendingPath)
  f.setup(preferences(github, { prNumber: 99 }))
  const state = readFileSync(f.statePath, 'utf8')
  const reason = 'Human confirmed: remote outcome unknown; reconcile old target separately.'
  const result = success(f.abandon(reason))
  assert.equal(result.status, 'abandoned')
  assert.match(result.warning, /unresolved|unknown/i)
  const directory = join(f.reporting, 'abandoned')
  const archives = readdirSync(directory)
  assert.equal(archives.length, 1)
  assert.match(archives[0], /^[A-Za-z0-9_-]+\.json$/)
  const archive = json(join(directory, archives[0]))
  assert.deepEqual(archive.packet, pending.packet)
  assert.deepEqual(archive.decision, pending.decision)
  assert.equal(archive.status, 'abandoned')
  assert.equal(archive.reason, reason)
  assert.match(archive.warning, /unresolved|unknown/i)
  assert.equal(existsSync(f.pendingPath), false)
  assert.deepEqual(json(f.receiptPath), receipt)
  assert.deepEqual(json(f.identityPath), receipt)
  assert.equal(readFileSync(f.statePath, 'utf8'), state)
  assert.equal(success(f.prepare()).target.number, 99)
  success(f.abandon('Human confirmed: second local attempt abandoned.'))
  assert.equal(readdirSync(directory).length, 2, 'Archives must not overwrite prior abandonment')
  assert.deepEqual(json(join(directory, archives[0])), archive)
})

test('CLI abandon also releases a non-ready attempt and reports idle when no receipt exists', (t) => {
  const f = fixture(t)
  f.setup(preferences(github, { prNumber: null }))
  const packet = success(f.prepare())
  assert.equal(packet.status, 'pending')
  success(f.abandon('Human confirmed: no PR will be selected.'))
  const directory = join(f.reporting, 'abandoned')
  assert.deepEqual(json(join(directory, readdirSync(directory)[0])).packet, packet)
  assert.deepEqual(success(f.status()), { status: 'idle' })
  failure(f.abandon('Nothing left to abandon.'), /pending|attempt/i)
})

test('CLI failed archive write retains pending and previous receipts', (t) => {
  const f = fixture(t)
  publishCli(f)
  f.write('report.md', '# Revised\n')
  success(f.prepare())
  const pending = readFileSync(f.pendingPath, 'utf8')
  const receipt = readFileSync(f.receiptPath, 'utf8')
  writeFileSync(join(f.reporting, 'abandoned'), 'Not a directory')
  failure(f.abandon('Human confirmed: abandon local attempt.'), /directory|EEXIST|ENOTDIR/i)
  assert.equal(readFileSync(f.pendingPath, 'utf8'), pending)
  assert.equal(readFileSync(f.receiptPath, 'utf8'), receipt)
})