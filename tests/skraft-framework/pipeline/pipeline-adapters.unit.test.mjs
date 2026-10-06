// Driven adapters of the RunPipeline ports (src/adapters/infrastructure/pipeline,
// process, copilot-workflow). The process runner is replaced by a recording function;
// file-system adapters run against a temporary directory.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCliQualityGateVerifier, qualityGateOutcomeOf } from '../../../plugins/skraft-framework/src/adapters/infrastructure/pipeline/cli-quality-gate-verifier.mjs'
import { createCliStructuralScanner } from '../../../plugins/skraft-framework/src/adapters/infrastructure/pipeline/cli-structural-scanner.mjs'
import { createCliStateWriter } from '../../../plugins/skraft-framework/src/adapters/infrastructure/pipeline/cli-state-writer.mjs'
import { createTrackingDecisionStore, decisionPath } from '../../../plugins/skraft-framework/src/adapters/infrastructure/pipeline/tracking-decision-store.mjs'
import { createFsTrackingStore } from '../../../plugins/skraft-framework/src/adapters/infrastructure/pipeline/fs-tracking-store.mjs'
import { createFsRepositoryReader } from '../../../plugins/skraft-framework/src/adapters/infrastructure/pipeline/fs-repository-reader.mjs'
import { createGitSourceControl } from '../../../plugins/skraft-framework/src/adapters/infrastructure/pipeline/git-source-control.mjs'
import { createNodeProcessRunner } from '../../../plugins/skraft-framework/src/adapters/infrastructure/process/node-process-runner.mjs'
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

// ── QualityGateVerifier ───────────────────────────────────────────────────────

test('cli-quality-gate-verifier: runs qg-verify on the repository-relative log, with the base commit', async () => {
  const runner = recordingRunner({ exitCode: 0, stdout: '{"verdict":"pass"}', stderr: '' })
  const verifier = createCliQualityGateVerifier({ runProcess: runner.run, pluginRoot: '/plugin', trackingStore })
  const result = await verifier.verify({ slug: 'checkout', evidenceLog: 'evidence/d/s1/qg-s1.json', baseSha: 'abc1234' })

  assert.deepEqual(runner.calls[0].argv, [
    'node', '/plugin/src/cli/qg-verify.mjs',
    '--log', '.copilot-tracking/skraft-plans/checkout/evidence/d/s1/qg-s1.json',
    '--base', 'abc1234',
  ])
  assert.deepEqual(result, { outcome: 'pass', findings: '{"verdict":"pass"}' })
})

test('cli-quality-gate-verifier: no --base when none was recorded', async () => {
  const runner = recordingRunner({ exitCode: 2, stdout: '', stderr: 'REVISION_STALE' })
  const result = await createCliQualityGateVerifier({ runProcess: runner.run, pluginRoot: '/p', trackingStore })
    .verify({ slug: 's', evidenceLog: 'e.json', baseSha: null })
  assert.ok(!runner.calls[0].argv.includes('--base'))
  assert.deepEqual(result, { outcome: 'inconclusive', findings: 'REVISION_STALE' })
})

test('cli-quality-gate-verifier: exit codes map to pass, fail, inconclusive, and error otherwise', () => {
  assert.deepEqual([0, 1, 2, 3, 124, 127].map(qualityGateOutcomeOf), ['pass', 'fail', 'inconclusive', 'error', 'error', 'error'])
})

test('cli-quality-gate-verifier: a runner that throws is outcome error, never a rejection', async () => {
  const runner = recordingRunner(new Error('spawn ENOENT'))
  const result = await createCliQualityGateVerifier({ runProcess: runner.run, pluginRoot: '/p', trackingStore })
    .verify({ slug: 's', evidenceLog: 'e.json', baseSha: null })
  assert.equal(result.outcome, 'error')
  assert.match(result.findings, /spawn ENOENT/)
})

// ── StructuralScanner ─────────────────────────────────────────────────────────

test('cli-structural-scanner: runs structural-scan with the repository-relative output', async () => {
  const runner = recordingRunner({ exitCode: 0, stdout: '', stderr: '' })
  const result = await createCliStructuralScanner({ runProcess: runner.run, pluginRoot: '/plugin', trackingStore })
    .scan({ slug: 'checkout', outputPath: 'details/d/structural-scan.json' })
  assert.deepEqual(runner.calls[0].argv, ['node', '/plugin/src/cli/structural-scan.mjs', '--out', '.copilot-tracking/skraft-plans/checkout/details/d/structural-scan.json'])
  assert.deepEqual(result, { ok: true })
})

test('cli-structural-scanner: a failing scan is ok:false with the exit code and stderr', async () => {
  const runner = recordingRunner({ exitCode: 1, stdout: '', stderr: 'no src/ directory\n' })
  const result = await createCliStructuralScanner({ runProcess: runner.run, pluginRoot: '/p', trackingStore }).scan({ slug: 's', outputPath: 'o.json' })
  assert.deepEqual(result, { ok: false, reason: 'structural-scan exit 1: no src/ directory' })
})

// ── StateWriter for the mod ───────────────────────────────────────────────────

test('cli-state-writer: sends the state on stdin to state-io and answers Ok', async () => {
  const runner = recordingRunner({ exitCode: 0, stdout: '', stderr: '' })
  const result = await createCliStateWriter({ runProcess: runner.run, pluginRoot: '/plugin', trackingRoot: '/repo/.t' })
    .write('checkout', { currentPhase: 'DESIGN' })
  assert.deepEqual(runner.calls[0].argv, ['node', '/plugin/src/cli/state-io.mjs', 'write', '--root', '/repo/.t', '--slug', 'checkout'])
  assert.equal(runner.calls[0].opts.stdin, '{"currentPhase":"DESIGN"}')
  assert.deepEqual(result, { ok: true, value: undefined })
})

test('cli-state-writer: a refused state is CORRUPTED_STATE, an IO failure IO_ERROR, a throw IO_ERROR', async () => {
  const write = (answer) => createCliStateWriter({ runProcess: recordingRunner(answer).run, pluginRoot: '/p', trackingRoot: '/t' }).write('s', {})
  assert.equal((await write({ exitCode: 1, stdout: '', stderr: 'bad' })).error.code, 'CORRUPTED_STATE')
  assert.equal((await write({ exitCode: 2, stdout: '', stderr: '' })).error.code, 'IO_ERROR')
  assert.equal((await write(new Error('boom'))).error.code, 'IO_ERROR')
})

test('state-io command: writes a valid state atomically and refuses an invalid one', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skraft-state-io-'))
  try {
    const writer = createCliStateWriter({ runProcess: createNodeProcessRunner(), pluginRoot: PLUGIN_ROOT, trackingRoot: root })
    const ok = await writer.write('checkout', { currentPhase: 'RESEARCH' })
    assert.equal(ok.ok, true)
    assert.equal(JSON.parse(await readFile(join(root, 'checkout/state.json'), 'utf8')).currentPhase, 'RESEARCH')
    const refused = await writer.write('checkout', { currentPhase: 42 })
    assert.equal(refused.ok, false)
    assert.equal(refused.error.code, 'CORRUPTED_STATE')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

// ── DecisionStore ─────────────────────────────────────────────────────────────

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

test('fs-repository-reader and git-source-control read the session repository', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'skraft-repo-'))
  try {
    await mkdir(join(repo, 'docs/adr'), { recursive: true })
    await writeFile(join(repo, 'docs/adr/decisions-index.md'), '| ADR |')
    assert.equal(await createFsRepositoryReader({ cwd: repo }).read('docs/adr/decisions-index.md'), '| ADR |')
    assert.equal(await createFsRepositoryReader({ cwd: repo }).read('missing.md'), null)
    assert.equal(await createGitSourceControl({ cwd: repo }).headSha(), null)
    execFileSync('git', ['init', '-q'], { cwd: repo })
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'chore(repo): init'], { cwd: repo })
    assert.match(await createGitSourceControl({ cwd: repo }).headSha(), /^[0-9a-f]{40}$/)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('node-process-runner: exit code, stdin, a missing command (127) and a timeout (124)', async () => {
  const run = createNodeProcessRunner()
  const echoed = await run(['node', '-e', 'process.stdin.pipe(process.stdout); process.on("exit", () => { process.exitCode = 3 })'], { stdin: 'hello' })
  assert.deepEqual(echoed, { exitCode: 3, stdout: 'hello', stderr: '' })
  assert.equal((await run(['skraft-no-such-command'])).exitCode, 127)
  assert.equal((await run(['node', '-e', 'setTimeout(() => {}, 5000)'], { timeoutMs: 100 })).exitCode, 124)
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
  assert.deepEqual(parseSkraftArgs('checkout #42 Pay by card'), { slug: 'checkout', story: { issue: 42, title: 'Pay by card' } })
  assert.deepEqual(parseSkraftArgs('checkout'), { slug: 'checkout', story: null })
  assert.deepEqual(parseSkraftArgs(''), { slug: null, story: null })
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
