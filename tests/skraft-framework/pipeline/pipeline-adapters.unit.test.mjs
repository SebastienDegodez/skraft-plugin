// Driven adapters of the RunPipeline ports (src/adapters/infrastructure/pipeline,
// process, copilot-workflow). The process runner is replaced by a recording function;
// file-system adapters run against a temporary directory.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFileStateReader, createFileStateBackupReader, createFileStateArchive } from '../../../plugins/skraft-framework/src/adapters/infrastructure/state/file-state-store.mjs'
import { createNodeTemplateReader } from '../../../plugins/skraft-framework/src/adapters/infrastructure/templates/node-template-reader.mjs'
import { createSnapshotStateWriter } from '../../../plugins/skraft-framework/src/adapters/infrastructure/state/snapshot-state-writer.mjs'
import { createTrackingDecisionStore, decisionPath } from '../../../plugins/skraft-framework/src/adapters/infrastructure/pipeline/tracking-decision-store.mjs'
import { createFsTrackingStore } from '../../../plugins/skraft-framework/src/adapters/infrastructure/pipeline/fs-tracking-store.mjs'
import { createFsRepositoryReader } from '../../../plugins/skraft-framework/src/adapters/infrastructure/pipeline/fs-repository-reader.mjs'
import { createFsActivePipeline } from '../../../plugins/skraft-framework/src/adapters/infrastructure/pipeline/fs-active-pipeline.mjs'
import { createActiveSlugStore } from '../../../plugins/skraft-framework/src/adapters/infrastructure/active-slug-store.mjs'
import { createNodeSourceControl } from '../../../plugins/skraft-framework/src/adapters/infrastructure/git/node-source-control.mjs'
import { createProcessGitRunner } from '../../../plugins/skraft-framework/src/adapters/infrastructure/git/process-git-runner.mjs'
import { createGitSourceTree } from '../../../plugins/skraft-framework/src/adapters/infrastructure/source-tree/git-source-tree.mjs'
import { createNodeSourceTree } from '../../../plugins/skraft-framework/src/adapters/infrastructure/source-tree/node-source-tree.mjs'
import { createWebCryptoHasher } from '../../../plugins/skraft-framework/src/adapters/infrastructure/web-crypto-hasher.mjs'
import { createWorkflowAgentRunner } from '../../../plugins/skraft-framework/src/adapters/infrastructure/copilot-workflow/workflow-agent-runner.mjs'
import { createWorkflowHumanInteraction } from '../../../plugins/skraft-framework/src/adapters/infrastructure/copilot-workflow/workflow-human-interaction.mjs'
import { createWorkflowProgress } from '../../../plugins/skraft-framework/src/adapters/infrastructure/copilot-workflow/workflow-progress.mjs'
import { claudeAgentId, walkFiles, askable } from '../../../plugins/skraft-framework/src/adapters/infrastructure/claude-code-mod/mod-helpers.mjs'
import { parseSkraftArgs } from '../../../plugins/skraft-framework/src/adapters/api/claude-code-mod/command-args.mjs'
import { createRecordDecision } from '../../../plugins/skraft-framework/src/application/pipeline/record-decision.mjs'
import { CONFIG, PLUGIN_ROOT } from './fake-host.mjs'

const recordingRunner = (answer) => {
  const calls = []
  const run = async (argv, opts) => {
    calls.push({ argv, opts })
    if (answer instanceof Error) throw answer
    return answer
  }
  return { run, calls }
}
const trackingStore = { prefix: (slug) => `.copilot-tracking/skraft-plans/${slug}/` }
const memoryTracking = () => {
  const files = new Map()
  return {
    files,
    exists: async (s, p) => files.has(`${s}/${p}`),
    read: async (s, p) => {
      if (!files.has(`${s}/${p}`)) throw Object.assign(new Error('absent'), { code: 'ENOENT' })
      return files.get(`${s}/${p}`)
    },
    list: async () => [],
    write: async (s, p, t) => { files.set(`${s}/${p}`, t) },
    prefix: trackingStore.prefix,
  }
}
const fixedTime = { now: () => new Date('2026-10-06T08:00:00.000Z'), isoString: () => '2026-10-06T08:00:00.000Z' }

// ── StateWriter (the Claude Code mod's) ────────────────────────────────────

const memoryFiles = (initial = {}) => {
  const files = new Map(Object.entries(initial))
  return {
    files,
    exists: async (path) => files.has(path),
    read: async (path) => {
      if (!files.has(path)) throw Object.assign(new Error('absent'), { code: 'ENOENT' })
      return files.get(path)
    },
    write: async (path, text) => { files.set(path, text) },
  }
}

test('snapshot-state-writer: writes state.json, backing the previous one up only when the phase changes', async () => {
  let clock = 1000
  const fs = memoryFiles()
  const writer = createSnapshotStateWriter({ files: fs, trackingRoot: '/r', now: () => clock++ })
  assert.deepEqual(await writer.write('checkout', { currentPhase: 'RESEARCH', n: 1 }), { ok: true, value: undefined })
  await writer.write('checkout', { currentPhase: 'RESEARCH', n: 2 })
  await writer.write('checkout', { currentPhase: 'DESIGN', n: 3 })
  assert.deepEqual(JSON.parse(fs.files.get('/r/checkout/state.json')), { currentPhase: 'DESIGN', n: 3 })
  assert.deepEqual([...fs.files.keys()].sort(), ['/r/checkout/state.json', '/r/checkout/state.json.bak.1000'])
  assert.deepEqual(JSON.parse(fs.files.get('/r/checkout/state.json.bak.1000')), { currentPhase: 'RESEARCH', n: 2 })
})

test('snapshot-state-writer: a torn write or a failing file system is IO_ERROR, never a throw', async () => {
  const torn = { ...memoryFiles(), read: async () => '{"currentPhase":"RES' }
  const tornResult = await createSnapshotStateWriter({ files: torn, trackingRoot: '/r', now: () => 1 }).write('s', { currentPhase: 'RESEARCH' })
  assert.equal(tornResult.ok, false)
  assert.equal(tornResult.error.code, 'IO_ERROR')
  const failing = { exists: async () => false, read: async () => '', write: async () => { throw new Error('EACCES') } }
  const failed = await createSnapshotStateWriter({ files: failing, trackingRoot: '/r', now: () => 1 }).write('s', {})
  assert.deepEqual(failed, { ok: false, error: { code: 'IO_ERROR', reason: 'EACCES' } })
})

test('snapshot-state-writer: an unreadable previous state is backed up before it is replaced', async () => {
  const fs = memoryFiles({ '/r/s/state.json': '{ torn' })
  await createSnapshotStateWriter({ files: fs, trackingRoot: '/r', now: () => 7 }).write('s', { currentPhase: 'RESEARCH' })
  assert.equal(fs.files.get('/r/s/state.json.bak.7'), '{ torn')
})

const listing = (fs) => async (dir) => {
  const names = [...fs.files.keys()].filter((path) => path.startsWith(`${dir}/`)).map((path) => path.slice(dir.length + 1))
  if (names.length === 0) throw Object.assign(new Error('absent'), { code: 'ENOENT' })
  return names.filter((name) => !name.includes('/'))
}

test('file-state-reader: ENOENT when absent; invalid JSON kept as state.json.corrupted.{ms}, then CORRUPTED_STATE', async () => {
  const fs = memoryFiles({ '/r/s/state.json': '{ torn' })
  const reader = createFileStateReader({ files: fs, trackingRoot: '/r', now: () => 5 })
  await assert.rejects(reader.read('absent'), { code: 'ENOENT' })
  await assert.rejects(reader.read('s'), { code: 'CORRUPTED_STATE' })
  assert.equal(fs.files.get('/r/s/state.json.corrupted.5'), '{ torn')
  fs.files.set('/r/s/state.json', '{"currentPhase":"DESIGN"}')
  assert.deepEqual(await reader.read('s'), { currentPhase: 'DESIGN' })
})

test('file-state-backup-reader: state.json.bak.{ms} newest first, unreadable ones raw null, none for a missing folder', async () => {
  const fs = memoryFiles({
    '/r/s/state.json': '{}',
    '/r/s/state.json.bak.10': '{"currentPhase":"RESEARCH"}',
    '/r/s/state.json.bak.20': 'torn',
    '/r/s/state.json.corrupted.30': '{}',
  })
  const reader = createFileStateBackupReader({ files: { ...fs, list: listing(fs) }, trackingRoot: '/r' })
  assert.deepEqual(await reader.list('s'), [
    { name: 'state.json.bak.20', timestamp: 20, raw: null },
    { name: 'state.json.bak.10', timestamp: 10, raw: { currentPhase: 'RESEARCH' } },
  ])
  assert.deepEqual(await reader.list('absent'), [])
})

test('file-state-archive: keeps state.json as state.json.invalid.{ms}; a failure is IO_ERROR', async () => {
  const fs = memoryFiles({ '/r/s/state.json': '{"currentPhase":42}' })
  const archive = createFileStateArchive({ files: fs, trackingRoot: '/r', now: () => 9 })
  assert.deepEqual(await archive.setAside('s'), { ok: true, value: 'state.json.invalid.9' })
  assert.equal(fs.files.get('/r/s/state.json.invalid.9'), '{"currentPhase":42}')
  assert.equal((await archive.setAside('absent')).error.code, 'IO_ERROR')
})

test('node-template-reader: reads a template under the plugin root', async () => {
  assert.match(await createNodeTemplateReader({ pluginRoot: PLUGIN_ROOT }).read('assets/templates/review-verdict.template.md'), /\{\{payload\}\}/)
  await assert.rejects(createNodeTemplateReader({ pluginRoot: PLUGIN_ROOT }).read('assets/templates/none.md'))
})

test('tracking-decision-store: write then read the answer, under decisions/<key>.json', async () => {
  const tracking = memoryTracking()
  const store = createTrackingDecisionStore({ trackingStore: tracking, time: fixedTime })
  await store.write('checkout', 'adr-ratification:007', 'accept all', 'human')
  assert.equal(await store.read('checkout', 'adr-ratification:007'), 'accept all')
  assert.deepEqual(JSON.parse(tracking.files.get('checkout/decisions/adr-ratification_007.json')), {
    key: 'adr-ratification:007', answer: 'accept all', by: 'human', at: '2026-10-06T08:00:00.000Z',
  })
})

test('tracking-decision-store: absent or unreadable answers read as null; keys cannot escape the folder', async () => {
  const tracking = memoryTracking()
  tracking.files.set('s/decisions/broken.json', 'not json')
  const store = createTrackingDecisionStore({ trackingStore: tracking, time: fixedTime })
  assert.equal(await store.read('s', 'missing'), null)
  assert.equal(await store.read('s', 'broken'), null)
  assert.equal(decisionPath('../../etc/passwd'), 'decisions/.._.._etc_passwd.json')
})

// ── File system, git, process ─────────────────────────────────────────────────

test('fs-tracking-store: lists every file posix-style, writes nested paths, prefixes from the repository', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'skraft-tracking-'))
  try {
    const store = createFsTrackingStore({ trackingRoot: join(repo, '.copilot-tracking/skraft-plans'), cwd: repo })
    await store.write('checkout', 'reviews/2026-10-06/design-review-1.md', 'verdict: "APPROVED"')
    await store.write('checkout', 'research/2026-10-06/checkout-research.md', '# r')
    assert.deepEqual(await store.list('checkout'), ['research/2026-10-06/checkout-research.md', 'reviews/2026-10-06/design-review-1.md'])
    assert.equal(await store.exists('checkout', 'research/2026-10-06/checkout-research.md'), true)
    assert.equal(await store.exists('checkout', 'nope.md'), false)
    assert.equal(await store.read('checkout', 'research/2026-10-06/checkout-research.md'), '# r')
    assert.equal(store.prefix('checkout'), '.copilot-tracking/skraft-plans/checkout/')
    assert.deepEqual(await store.list('unknown'), [])
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('fs-repository-reader and the Node git source control read the session repository', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'skraft-repo-'))
  try {
    await mkdir(join(repo, 'docs/adr'), { recursive: true })
    await writeFile(join(repo, 'docs/adr/decisions-index.md'), '| ADR |')
    assert.equal(await createFsRepositoryReader({ cwd: repo }).read('docs/adr/decisions-index.md'), '| ADR |')
    assert.equal(await createFsRepositoryReader({ cwd: repo }).read('missing.md'), null)
    assert.equal(await createNodeSourceControl({ cwd: repo }).headSha(), null)
    execFileSync('git', ['init', '-q'], { cwd: repo })
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'chore(repo): init'], { cwd: repo })
    assert.match(await createNodeSourceControl({ cwd: repo }).headSha(), /^[0-9a-f]{40}$/)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('process-git-runner: git through any process runner; a failure, a throw or a cut output is null', async () => {
  const runner = recordingRunner({ exitCode: 0, stdout: 'abc\n', stderr: '', isStdoutTruncated: false })
  assert.equal(await createProcessGitRunner({ runProcess: runner.run })(['rev-parse', 'HEAD']), 'abc\n')
  assert.deepEqual(runner.calls[0].argv, ['git', 'rev-parse', 'HEAD'])
  assert.equal(await createProcessGitRunner({ runProcess: recordingRunner({ exitCode: 128, stdout: '' }).run })(['log']), null)
  assert.equal(await createProcessGitRunner({ runProcess: recordingRunner({ exitCode: 0, stdout: 'x', isStdoutTruncated: true }).run })(['show']), null)
  assert.equal(await createProcessGitRunner({ runProcess: recordingRunner(new Error('timeout')).run })(['log']), null)
})

test('git-source-tree: git ls-files when git answers, the fallback walk otherwise; large or absent sources read null', async () => {
  const sizes = { 'a.cs': 10, 'big.cs': 2048 }
  const tree = (git) => createGitSourceTree({
    git,
    sizeOf: async (path) => sizes[path] ?? null,
    readText: async (path) => `// ${path}`,
    listAll: async () => ['dir\\b.cs'],
  })
  assert.deepEqual(await tree(async () => 'a.cs\0big.cs\0').listFiles(), ['a.cs', 'big.cs'])
  assert.deepEqual(await tree(async () => null).listFiles(), ['dir/b.cs'])
  const reader = tree(async () => null)
  assert.equal(await reader.readSource('a.cs', 1024), '// a.cs')
  assert.equal(await reader.readSource('big.cs', 1024), null)
  assert.equal(await reader.readSource('missing.cs', 1024), null)
})

test('node-source-tree: tracked and untracked-not-ignored files of a repository, and their text', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'skraft-tree-'))
  try {
    execFileSync('git', ['init', '-q'], { cwd: repo })
    await mkdir(join(repo, 'src'), { recursive: true })
    await writeFile(join(repo, 'src/Order.cs'), 'class Order {}')
    await writeFile(join(repo, '.gitignore'), 'bin/\n')
    await mkdir(join(repo, 'bin'), { recursive: true })
    await writeFile(join(repo, 'bin/Order.dll'), 'x')
    const tree = createNodeSourceTree({ cwd: repo })
    assert.deepEqual((await tree.listFiles()).sort(), ['.gitignore', 'src/Order.cs'])
    assert.equal(await tree.readSource('src/Order.cs', 1024), 'class Order {}')
    assert.equal(await tree.readSource('src', 1024), null, 'a directory is not a source')
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('web-crypto-hasher: the SHA-256 of a text, in hex', async () => {
  assert.equal(await createWebCryptoHasher().sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  assert.equal(await createWebCryptoHasher().sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

// ── Copilot workflow adapters ─────────────────────────────────────────────────

test('workflow-agent-runner: ctx.agent with the label and the agent name, or the agentIds override', async () => {
  const calls = []
  const ctx = { agent: async (prompt, options) => { calls.push({ prompt, ...options }); return options.label === 'fail' ? null : 'done' } }
  const runner = createWorkflowAgentRunner({ ctx, agentIds: { 'Skraft - Solution Architect': 'skraft/solution-architect' } })
  assert.deepEqual(await runner.run({ agent: 'Skraft - Solution Researcher', label: 'RESEARCH:specialist', prompt: 'p' }), { ok: true, text: 'done' })
  assert.deepEqual(await runner.run({ agent: 'Skraft - Solution Architect', label: 'fail', prompt: 'p' }), { ok: false, text: '' })
  assert.deepEqual(calls.map((c) => c.agent), ['Skraft - Solution Researcher', 'skraft/solution-architect'])
  assert.equal(calls[0].label, 'RESEARCH:specialist')
})

test('workflow-human-interaction: logs the question and pauses durably; a resumed pause answers null', async () => {
  const logs = []
  const paused = new Set()
  const ctx = {
    log: (m) => logs.push(m),
    pause: async (key) => {
      if (paused.has(key)) return
      paused.add(key)
      throw Object.assign(new Error(`paused at ${key}`), { name: 'AbortError' })
    },
  }
  const interaction = createWorkflowHumanInteraction({ ctx })
  const checkpoint = { key: 'rejected:DESIGN:1', question: 'REJECTED.\nmore', options: ['rework', 'stop'] }
  await assert.rejects(interaction.ask(checkpoint), { name: 'AbortError' })
  assert.equal(await interaction.ask(checkpoint), null)
  assert.match(logs[0], /^Waiting for you — REJECTED\.$/)
  assert.match(logs[1], /skraft_decide tool \(key "rejected:DESIGN:1", one of: rework \| stop\)/)
})

test('workflow-progress: phases and lines go to ctx.phase and ctx.log', () => {
  const seen = []
  const progress = createWorkflowProgress({ ctx: { phase: (t) => seen.push(['phase', t]), log: (m) => seen.push(['log', m]) } })
  progress.phase('DESIGN')
  progress.log('→ architect')
  assert.deepEqual(seen, [['phase', 'DESIGN'], ['log', '→ architect']])
})

// ── Claude Code mod helpers ───────────────────────────────────────────────────

test('mod helpers: agent ids, recursive listing, askable questions, command arguments', async () => {
  assert.equal(claudeAgentId('Skraft - Software Engineer', CONFIG, 'skraft'), 'skraft:software-engineer')
  assert.equal(claudeAgentId('Unknown Agent', CONFIG, 'skraft'), 'Unknown Agent')
  const tree = { '/t': [{ name: 'b.md', kind: 'file' }, { name: 'a', kind: 'dir' }, { name: 'link', kind: 'other' }], '/t/a': [{ name: 'x.json', kind: 'file' }] }
  assert.deepEqual(await walkFiles(async (dir) => tree[dir] ?? [], '/t'), ['a/x.json', 'b.md'])
  assert.deepEqual(await walkFiles(async () => { throw new Error('ENOENT') }, '/none'), [])
  assert.equal(askable('Ready?'), 'Ready?')
  assert.equal(askable('Fix it.'), 'Fix it.\nYour answer?')
  assert.deepEqual(parseSkraftArgs('checkout #42 Pay by card'), { command: 'run', slug: 'checkout', story: { issue: 42, title: 'Pay by card' } })
  assert.deepEqual(parseSkraftArgs('checkout'), { command: 'run', slug: 'checkout', story: null })
  assert.deepEqual(parseSkraftArgs('  '), { command: 'status' })
  assert.deepEqual(parseSkraftArgs('decide checkout rejected:DESIGN:1 rework now'), { command: 'decide', slug: 'checkout', key: 'rejected:DESIGN:1', answer: 'rework now' })
  assert.deepEqual(parseSkraftArgs('decide checkout'), { command: 'decide', slug: 'checkout', key: null, answer: null })
  assert.deepEqual(parseSkraftArgs('close checkout 3'), { command: 'close', slug: 'checkout', findings: 3 })
  assert.deepEqual(parseSkraftArgs('close checkout'), { command: 'close', slug: 'checkout', findings: 0 })
  assert.ok(Number.isNaN(parseSkraftArgs('close checkout many').findings))
})

// ── RecordDecision use case ───────────────────────────────────────────────────

test('record-decision: validates, trims and stores through the DecisionStore port', async () => {
  const stored = []
  const recordDecision = createRecordDecision({ decisionStore: { write: async (...args) => stored.push(args) } })
  assert.deepEqual(await recordDecision.record({ slug: 'checkout', key: ' environment:DELIVER ', answer: ' fixed ' }), { ok: true, value: { key: 'environment:DELIVER' } })
  assert.deepEqual(stored, [['checkout', 'environment:DELIVER', 'fixed', 'human']])
  assert.equal((await recordDecision.record({ slug: 'Not A Slug', key: 'k', answer: 'a' })).error.code, 'INVALID_SLUG')
  assert.equal((await recordDecision.record({ slug: 's', key: '', answer: 'a' })).error.code, 'INVALID_KEY')
  assert.equal((await recordDecision.record({ slug: 's', key: 'k', answer: ' ' })).error.code, 'INVALID_ANSWER')
  assert.equal(stored.length, 1)
})

test('fs-active-pipeline: writes the pointer the hooks read, replacing a stale one', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skraft-active-'))
  try {
    const store = createActiveSlugStore(root)
    store.write('old-story')
    const active = createFsActivePipeline({ trackingRoot: root })
    await active.activate('checkout')
    assert.equal(store.read(), 'checkout')
    assert.equal(await active.current(), 'checkout')
    await writeFile(join(root, '.active-slug'), '../etc\n')
    assert.equal(await active.current(), null, 'a malformed pointer is no pipeline')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

// ── Reporting transport and hasher ────────────────────────────────────────────

test('agent-report-transport: a general-purpose agent observes read-only, then writes the exact body; its JSON is the answer', async () => {
  const { createAgentReportTransport, parseAgentJson } = await import('../../../plugins/skraft-framework/src/adapters/infrastructure/reporting/agent-report-transport.mjs')
  const runs = []
  const answers = ['Done.\n```json\n{"viewer":"bot","comments":[]}\n```', '```json\n{"unavailable":"no create tool"}\n```']
  const transport = createAgentReportTransport({
    agentRunner: { run: async (dispatch) => { runs.push(dispatch); return { ok: true, text: answers.shift() } } },
    pluginRoot: '/plugin',
  })
  const packet = {
    kind: 'forecast', destination: 'pr', branch: 'feature/x', marker: '<!-- m -->', body: '<!-- m -->\n\nBody `x`', digest: 'f'.repeat(64),
    target: { provider: 'github', host: 'github.com', repo: 'acme/shop', type: 'pr', number: 12 },
  }
  assert.deepEqual(await transport.observe({ packet }), { viewer: 'bot', comments: [] })
  assert.equal(await transport.publish({ packet, decision: { action: 'create' } }), null, 'unavailable is no readback')
  assert.equal(runs[0].agent, null)
  assert.match(runs[0].prompt, /observe \(read-only\)[\s\S]*Write nothing[\s\S]*head branch must be: feature\/x[\s\S]*\/plugin\/skills\/github-search-protocol\/SKILL\.md/)
  assert.match(runs[1].prompt, /Create ONE new comment[\s\S]*````markdown\n<!-- m -->\n\nBody `x`\n````/)
  assert.notEqual(runs[0].label, runs[1].label)
  assert.equal(parseAgentJson('no json here'), null)
  assert.deepEqual(parseAgentJson('{"a":1}'), { a: 1 })
  assert.deepEqual(parseAgentJson('```json\n{"a":1}\n```\ntext\n```json\n{"a":2}\n```'), { a: 2 }, 'the last block wins')
  assert.equal(parseAgentJson('```json\n[1]\n```'), null)
})

test('agent runners: a null agent is the host\'s general-purpose agent', async () => {
  assert.equal(claudeAgentId(null, CONFIG, 'skraft'), 'general-purpose')
  const calls = []
  const runner = createWorkflowAgentRunner({ ctx: { agent: async (prompt, options) => { calls.push(options); return 'ok' } } })
  await runner.run({ agent: null, label: 'report', prompt: 'p' })
  assert.deepEqual(calls, [{ label: 'report' }])
})

test('web-crypto-hasher: sha256Sync is the same digest as sha256, for any text', async () => {
  const hasher = createWebCryptoHasher()
  for (const text of ['', 'abc', 'é'.repeat(300), 'x'.repeat(55), 'x'.repeat(64), 'y'.repeat(10_000)]) {
    assert.equal(hasher.sha256Sync(text), await hasher.sha256(text))
  }
})
