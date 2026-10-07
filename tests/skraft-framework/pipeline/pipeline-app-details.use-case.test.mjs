// Use-case tests, with hand-written in-memory doubles, of the pipeline application steps:
// ObservePipeline (what it reads and what it leaves out), the pipeline recovery, the run
// journal decorator, CloseManually and RecordDecision (validation, messages, failures).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createObservePipeline } from '../../../plugins/skraft-framework/src/application/pipeline/observe-pipeline.mjs'
import { createPipelineRecovery } from '../../../plugins/skraft-framework/src/application/pipeline/recover-pipeline.mjs'
import { createRunJournal } from '../../../plugins/skraft-framework/src/application/pipeline/run-journal.mjs'
import { createCloseManually } from '../../../plugins/skraft-framework/src/application/pipeline/close-manually.mjs'
import { createRecordDecision } from '../../../plugins/skraft-framework/src/application/pipeline/record-decision.mjs'
import { createRunPipeline } from '../../../plugins/skraft-framework/src/application/pipeline/run-pipeline.mjs'
import { Ok, Err } from '../../../plugins/skraft-framework/src/domain/result.mjs'
import { createFakeHost, CONFIG, TODAY } from './fake-host.mjs'

const SLUG = 'checkout'
const NOW = '2026-10-05T10:00:00.000Z'

// A TrackingStore over a plain object: path → text; `unreadable` paths are listed but throw on read.
const memoryStore = (files, { unreadable = [], listFails = false } = {}) => ({
  list: async () => {
    if (listFails) throw new Error('EIO')
    return [...Object.keys(files), ...unreadable]
  },
  read: async (slug, path) => {
    if (!(path in files)) throw Object.assign(new Error(`absent ${path}`), { code: 'ENOENT' })
    return files[path]
  },
})
const observer = (files, { state = null, stateFails = false, ...options } = {}) => createObservePipeline({
  config: CONFIG,
  stateReader: { read: async () => { if (stateFails || !state) throw new Error('absent'); return state } },
  trackingStore: memoryStore(files, options),
  time: { isoString: () => NOW },
})

// ── ObservePipeline ──────────────────────────────────────────────────────────

test('observe: decisions are read only from decisions/*.json at the tracking root, and only with a key', async () => {
  const json = (value) => JSON.stringify(value)
  const view = await observer({
    'decisions/a.json': json({ key: 'k-a', answer: 'yes', by: 'alice', at: '2026-10-05T11:00:00.000Z' }),
    'decisions/b.json': json({ answer: 'no key' }),
    'decisions/c.json': 'not json',
    'decisions/g.json': json({ key: 'k-g', answer: 'later' }),
    'x/decisions/d.json': json({ key: 'k-d', answer: 'nested' }),
    'decisions/e.json.bak': json({ key: 'k-e', answer: 'backup' }),
    'notes/f.json': json({ key: 'k-f', answer: 'elsewhere' }),
  }).snapshot(SLUG)
  assert.deepEqual(view.decisions, [
    { key: 'k-g', answer: 'later', by: null, at: null },
    { key: 'k-a', answer: 'yes', by: 'alice', at: '2026-10-05T11:00:00.000Z' },
  ])
})

test('observe: receipts are read only from reporting/{forecast,outcome}/*.json at the tracking root', async () => {
  const receipt = (story) => JSON.stringify({ kind: 'forecast', story, targets: { pr: { status: 'posted', url: `https://x/${story}`, target: { number: 3 } } } })
  const view = await observer({
    'reporting/forecast/r1.json': receipt('s1'),
    'x/reporting/forecast/r2.json': receipt('s2'),
    'reporting/outcome/r3.json.bak': receipt('s3'),
    'reporting/summary/r4.json': receipt('s4'),
    'reporting/outcome/bad.json': '{',
  }).snapshot(SLUG)
  assert.deepEqual(view.reporting.publications, [
    { kind: 'forecast', story: 's1', destination: 'pr', status: 'posted', url: 'https://x/s1', number: 3 },
  ])
})

test('observe: review verdicts are read only for reviews/**.md files; an unreadable review has none', async () => {
  const approved = 'verdict: APPROVED\n'
  const recorded = [
    `reviews/${TODAY}/design-review-1.md`,
    'other/design.md',
    'x/reviews/design.md',
    `reviews/${TODAY}/design-review-9.md.bak`,
    `reviews/${TODAY}/design-review-2.md`,
  ]
  const view = await observer({
    [`reviews/${TODAY}/design-review-1.md`]: approved,
    'other/design.md': approved,
    'x/reviews/design.md': approved,
    [`reviews/${TODAY}/design-review-9.md.bak`]: approved,
  }, {
    state: { currentPhase: 'DESIGN', reviewArtifacts: { DESIGN: recorded } },
    unreadable: [`reviews/${TODAY}/design-review-2.md`],
  }).snapshot(SLUG)
  const design = view.phases.find((phase) => phase.name === 'DESIGN')
  assert.deepEqual(design.reviews.map((r) => [r.path, r.verdict]), [
    [`reviews/${TODAY}/design-review-1.md`, 'APPROVED'],
    ['other/design.md', null],
    ['x/reviews/design.md', null],
    [`reviews/${TODAY}/design-review-9.md.bak`, null],
    [`reviews/${TODAY}/design-review-2.md`, null],
  ])
})

test('observe: the evidence log is the newest evidence/**/qg-*.json on disk, a state without artefacts included', async () => {
  const log = `evidence/${TODAY}/story-1/qg-story-1.json`
  const view = await observer({
    [log]: JSON.stringify({ produced_at: 'P', repo_root_rev: 'R', gates: [] }),
    'x/evidence/2026-10-06/s/qg-s.json': JSON.stringify({ produced_at: 'nested' }),
    'zzz/qg-z.json': JSON.stringify({ produced_at: 'stray' }),
  }, { state: { currentPhase: 'DELIVER' } }).snapshot(SLUG)
  assert.equal(view.tests.evidenceLog, log)
  assert.equal(view.tests.producedAt, 'P')
  assert.equal(view.tests.revision, 'R')
  assert.equal(view.cost.eurPerUsd, null)
})

test('observe: nothing readable — no state, no listing — is still a view, with every list empty', async () => {
  const view = await observer({}, { listFails: true, stateFails: true }).snapshot(SLUG)
  assert.equal(view.started, false)
  assert.equal(view.run, null)
  assert.deepEqual(view.decisions, [])
  assert.deepEqual(view.reporting, { destinations: null, reports: [], publications: [], pending: null })
  assert.equal(view.tests.evidenceLog, null)
  assert.deepEqual(view.phases.map((phase) => phase.reviews), [[], [], [], []])
})

test('observe: readTracked returns only a listed, readable Markdown or JSON file, and null otherwise', async () => {
  const files = { 'reviews/a.md': '# a', 'state.json': '{}', 'log.txt': 'x' }
  const viewer = observer(files, { unreadable: ['reviews/gone.md'] })
  assert.equal(await viewer.readTracked(SLUG, 'reviews/a.md'), '# a')
  assert.equal(await viewer.readTracked(SLUG, 'reviews/gone.md'), null)
  assert.equal(await viewer.readTracked(SLUG, 'state.json'), null)
  assert.equal(await viewer.readTracked(SLUG, 'log.txt'), null)
  assert.equal(await viewer.readTracked(SLUG, 'reviews/other.md'), null)
  assert.equal(await observer(files, { listFails: true }).readTracked(SLUG, 'reviews/a.md'), null)
})

// ── Pipeline recovery ────────────────────────────────────────────────────────

const RECOVERY_CONFIG = {
  phaseAgents: {
    RESEARCH: { specialist: 'researcher' },
    DESIGN: { specialist: 'architect', reviewer: 'architect-reviewer' },
    DISTILL: { specialist: 'acceptance-designer', reviewer: 'acceptance-reviewer' },
  },
  agentArtifacts: {
    researcher: { outputs: ['.copilot-tracking/skraft-plans/{projectSlug}/research/{date}/findings.md'] },
    architect: { outputs: ['.copilot-tracking/skraft-plans/{projectSlug}/design/{date}/architecture.md'] },
    'acceptance-designer': { outputs: ['.copilot-tracking/skraft-plans/{projectSlug}/distill/{date}/scenarios.md'] },
  },
}
const DISK = {
  [`research/${TODAY}/findings.md`]: '# r',
  [`design/${TODAY}/architecture.md`]: '# d',
  [`reviews/${TODAY}/design-review-1.md`]: 'verdict: NEEDS_REWORK\n',
  [`reviews/${TODAY}/design-review-2.md`]: 'verdict: APPROVED\n',
}

const recoveryHarness = ({ guidance, files = DISK, answers = [], applyFails = null, results = {}, state = {} }) => {
  const logs = []
  const asked = []
  const applied = []
  const calls = []
  const recovery = createPipelineRecovery({
    recovery: {
      diagnose: async () => Ok(guidance),
      rollback: async () => { calls.push('rollback'); return results.rollback ?? Ok({ restoredFrom: 'state.json.bak.2', currentPhase: 'DESIGN' }) },
      reset: async () => { calls.push('reset'); return results.reset ?? Ok({}) },
      resolveStale: async (slug, phase) => { calls.push(`resolveStale:${phase}`); return results.resolveStale ?? Ok({}) },
    },
    stateService: { init: async () => { calls.push('init'); return results.init ?? Ok({}) } },
    trackingStore: memoryStore(files),
    config: RECOVERY_CONFIG,
    phaseOrder: ['RESEARCH', 'DESIGN', 'DISTILL', 'DONE'],
    ask: async (slug, phase, checkpoint) => { asked.push({ slug, phase, checkpoint }); return answers.shift() },
    apply: async (slug, event) => {
      applied.push(event)
      if (applyFails && applyFails.match(event)) throw applyFails.error
    },
    readState: async () => state,
    progress: { log: (message) => logs.push(message) },
    now: () => NOW,
  })
  return { recover: () => recovery.recover(SLUG), logs, asked, applied, calls }
}
const halted = (outcome) => (error) => { assert.deepEqual(error.outcome, outcome); return true }

test('recovery: a new state rebuilt from the files — the human is asked, then each completed phase is recorded', async () => {
  const h = recoveryHarness({ guidance: { step: 'init', code: 'NO_STATE', why: 'absent' }, answers: ['Resume'] })
  await h.recover()
  assert.deepEqual(h.calls, ['init'])
  assert.deepEqual(h.asked, [{
    slug: SLUG,
    phase: null,
    checkpoint: {
      key: 'recovery:RESEARCH,DESIGN',
      question: 'state.json was rebuilt. The files on disk show RESEARCH, DESIGN completed. ' +
        'Answer "resume" to record them and resume at the next phase, or "restart" to run every phase again.',
      options: ['resume', 'restart'],
    },
  }])
  assert.deepEqual(h.applied, [
    { type: 'RECORD_ARTIFACT', phase: 'RESEARCH', path: `research/${TODAY}/findings.md` },
    { type: 'CLOSE_PHASE', phase: 'RESEARCH', verdict: 'APPROVED', at: NOW },
    { type: 'RECORD_ARTIFACT', phase: 'DESIGN', path: `design/${TODAY}/architecture.md` },
    { type: 'CLOSE_PHASE', phase: 'DESIGN', verdict: 'APPROVED', path: `reviews/${TODAY}/design-review-2.md`, at: NOW },
  ])
  assert.deepEqual(h.logs, ['recovery: RESEARCH recorded as completed', 'recovery: DESIGN recorded as completed'])
})

test('recovery: a reset state, then "restart" — the phases are not recorded', async () => {
  const h = recoveryHarness({ guidance: { step: 'reset', code: 'INVALID_STATE', why: 'schema violated' }, answers: ['restart'] })
  await h.recover()
  assert.deepEqual(h.calls, ['reset'])
  assert.deepEqual(h.applied, [])
  assert.deepEqual(h.logs, ['state.json INVALID_STATE: schema violated', 'recovery: restarting from the first phase'])
})

test('recovery: nothing on disk is completed — nobody is asked', async () => {
  const h = recoveryHarness({ guidance: { step: 'init', code: 'NO_STATE', why: 'absent' }, files: {} })
  await h.recover()
  assert.deepEqual(h.asked, [])
  assert.deepEqual(h.logs, [])
})

test('recovery: a phase the state machine refuses stays open, and the recording stops there', async () => {
  for (const [error, said] of [
    [{ reason: 'gate refused' }, 'gate refused'],
    [new Error('boom'), 'boom'],
    ['plain refusal', 'plain refusal'],
  ]) {
    const h = recoveryHarness({
      guidance: { step: 'init', code: 'NO_STATE', why: 'absent' },
      answers: ['resume'],
      applyFails: { match: (event) => event.type === 'CLOSE_PHASE', error },
    })
    await h.recover()
    assert.deepEqual(h.logs, [`recovery: RESEARCH stays open — ${said}`])
    assert.deepEqual(h.applied.map((event) => event.type), ['RECORD_ARTIFACT', 'CLOSE_PHASE'])
  }
})

test('recovery: a healthy state does nothing; a rollback says what it restored', async () => {
  const none = recoveryHarness({ guidance: { step: 'none', code: 'HEALTHY', why: 'ok' } })
  await none.recover()
  assert.deepEqual([none.logs, none.calls], [[], []])

  const rollback = recoveryHarness({ guidance: { step: 'rollback', code: 'CORRUPTED_STATE', why: 'bad json' } })
  await rollback.recover()
  assert.deepEqual(rollback.logs, ['state.json CORRUPTED_STATE: bad json', 'recovery: restored state.json.bak.2 (DESIGN)'])
})

test('recovery: every refused step stops the run, saying why', async () => {
  await assert.rejects(recoveryHarness({ guidance: { step: 'init', code: 'NO_STATE', why: 'absent' }, results: { init: Err({ code: 'EACCES' }) } }).recover(),
    halted({ status: 'blocked', phase: null, reason: 'state.json for checkout: EACCES' }))
  await assert.rejects(recoveryHarness({ guidance: { step: 'rollback', code: 'C', why: 'w' }, results: { rollback: Err({ reason: 'no backup' }) } }).recover(),
    halted({ status: 'blocked', phase: null, reason: 'rollback refused: no backup' }))
  await assert.rejects(recoveryHarness({ guidance: { step: 'reset', code: 'C', why: 'w' }, results: { reset: Err({ reason: 'archive failed' }) } }).recover(),
    halted({ status: 'blocked', phase: null, reason: 'reset refused: archive failed' }))
  await assert.rejects(recoveryHarness({ guidance: { step: 'resolve-stale', code: 'STALE', why: 'w' }, answers: ['relaunch'], state: { currentPhase: 'DESIGN' }, results: { resolveStale: Err({ reason: 'not stale' }) } }).recover(),
    halted({ status: 'blocked', phase: 'DESIGN', reason: 'resolve-stale refused: not stale' }))
  await assert.rejects(recoveryHarness({ guidance: { step: 'halt', code: 'IO_ERROR', why: 'disk unreadable' } }).recover(),
    halted({ status: 'blocked', phase: null, reason: 'IO_ERROR: disk unreadable' }))
})

test('recovery: a stale phase with no recorded retries nor reviews — the question, then a fresh budget on "relaunch"', async () => {
  const h = recoveryHarness({ guidance: { step: 'resolve-stale', code: 'STALE_PHASE', why: 'budget spent' }, answers: ['RELAUNCH'], state: { currentPhase: 'DESIGN' } })
  await h.recover()
  assert.deepEqual(h.asked, [{
    slug: SLUG,
    phase: 'DESIGN',
    checkpoint: {
      key: 'stale:DESIGN:t0:r0',
      question: 'DESIGN spent its retry budget without an APPROVED review. Answer "relaunch" to give it a fresh budget and run it again, or "stop".',
      options: ['relaunch', 'stop'],
    },
  }])
  assert.deepEqual(h.calls, ['resolveStale:DESIGN'])
  assert.deepEqual(h.logs, ['state.json STALE_PHASE: budget spent', 'recovery: DESIGN gets a fresh retry budget'])
})

// ── Run journal ──────────────────────────────────────────────────────────────

const journalHarness = ({ previous = null } = {}) => {
  const writes = []
  let tick = 0
  let clock = 0
  const journal = createRunJournal({
    trackingStore: {
      read: async () => { if (!previous) throw new Error('absent'); return JSON.stringify(previous) },
      write: async (slug, path, text) => { await new Promise((resolve) => setTimeout(resolve, 2)); writes.push({ slug, path, text }) },
    },
    time: {
      isoString: () => `T${++tick}`,
      now: () => new Date(Date.UTC(2026, 9, 5) + 1500 * clock++),
    },
  })
  const last = () => JSON.parse(writes.at(-1).text)
  return { journal, writes, last }
}

test('run journal: no slug, no write', async () => {
  const { journal, writes } = journalHarness()
  await journal.begin(null, null)
  await journal.observeProgress({ phase: () => {}, log: () => {} }).log('hello')
  await journal.flush()
  assert.deepEqual(writes, [])
})

test('run journal: dispatches keep their phase, role, duration, ok and usage; flush waits for the last write', async () => {
  const { journal, writes, last } = journalHarness()
  await journal.begin(SLUG, { issue: 1 })
  assert.deepEqual([writes[0].slug, writes[0].path], [SLUG, 'run.json'])
  assert.equal(last().startedAt, 'T1')
  assert.deepEqual(last().story, { issue: 1 })

  const runner = journal.observeAgents({ run: async (dispatch) => (dispatch.agent === 'a' ? null : { ok: true, usage: { credits: 2 } }) })
  assert.equal(await runner.run({ phase: 'DESIGN', role: 'reviewer', agent: 'a', label: 'review' }), null)
  await runner.run({ agent: 'b', label: 'other' })
  assert.deepEqual(last().dispatches, [
    { at: '2026-10-05T00:00:00.000Z', phase: 'DESIGN', role: 'reviewer', agent: 'a', label: 'review', durationMs: 1500, ok: false },
    { at: '2026-10-05T00:00:03.000Z', phase: null, role: null, agent: 'b', label: 'other', durationMs: 1500, ok: true, usage: { credits: 2 } },
  ])

  const seen = []
  journal.observeProgress({ phase: (title) => seen.push(title), log: (message) => seen.push(message) }).log('hello')
  await journal.flush()
  assert.deepEqual(seen, ['hello'])
  assert.deepEqual(last().log.at(-1), { at: 'T2', message: 'hello' })
})

test('run journal: an empty, blank or missing answer leaves the run waiting; a real one resumes it', async () => {
  const answers = [null, undefined, '', '   ', 'yes']
  const { journal, last } = journalHarness()
  await journal.begin(SLUG)
  const questions = journal.observeQuestions({ ask: async () => answers.shift() })
  const checkpoint = { key: 'k', question: 'go on?', options: ['yes', 'no'] }
  for (const expected of ['awaiting-human', 'awaiting-human', 'awaiting-human', 'awaiting-human', 'running']) {
    await questions.ask(checkpoint)
    await journal.flush()
    assert.equal(last().status, expected)
  }
  assert.deepEqual(last().log.at(-1).message, 'answer recorded for k')
})

// ── CloseManually ────────────────────────────────────────────────────────────

const runOnce = (host) => createRunPipeline(host.dependencies(SLUG)).run({ slug: SLUG, story: { issue: 42, title: 'Pay by card' } })
const closer = (deps) => createCloseManually(deps)

test('close-manually: the slug must be a kebab-case string, the findings a non-negative integer — with the reasons', async () => {
  const close = (args) => closer(createFakeHost().dependencies(SLUG)).close(args)
  assert.deepEqual(await close({}), { ok: false, error: { code: 'INVALID_SLUG', reason: 'slug must be kebab-case, got undefined' } })
  assert.equal((await close()).error.code, 'INVALID_SLUG')
  assert.deepEqual(await close({ slug: 'Not A Slug' }), { ok: false, error: { code: 'INVALID_SLUG', reason: 'slug must be kebab-case, got "Not A Slug"' } })
  assert.equal((await close({ slug: 'checkout!' })).error.code, 'INVALID_SLUG')
  assert.equal((await close({ slug: 'check-out' })).error.code, 'ENOENT', 'a multi-letter segment is kebab-case')
  assert.deepEqual(await close({ slug: SLUG, findings: -1 }), { ok: false, error: { code: 'INVALID_ARGUMENT', reason: 'findings must be a non-negative integer, got -1' } })
})

test('close-manually: a config without phase agents knows no reviewer', async () => {
  const host = createFakeHost({ verdicts: { DESIGN: ['REJECTED'] } })
  await runOnce(host)
  const refused = await closer({ ...host.dependencies(SLUG), config: { ...CONFIG, phaseAgents: undefined } }).close({ slug: SLUG })
  assert.deepEqual(refused, { ok: false, error: { code: 'NO_REVIEWER', reason: 'DESIGN has no reviewer; the pipeline closes it itself' } })
})

test('close-manually: only DELIVER checks the commits; DELIVER lists every non-conventional one', async () => {
  const commits = [{ sha: 'abcdef0123', subject: 'wip' }, { sha: '1234567890', subject: 'fix stuff' }]
  const design = createFakeHost({ verdicts: { DESIGN: ['REJECTED'] }, commits })
  await runOnce(design)
  assert.equal((await closer(design.dependencies(SLUG)).close({ slug: SLUG })).ok, true)

  const deliver = createFakeHost({ verdicts: { DELIVER: ['REJECTED'] }, commits })
  await runOnce(deliver)
  const refused = await closer(deliver.dependencies(SLUG)).close({ slug: SLUG })
  assert.equal(refused.error.code, 'NON_CONVENTIONAL_COMMITS')
  assert.equal(refused.error.reason, 'rename these commits to type(scope): subject first: abcdef0 "wip", 1234567 "fix stuff"')
})

test('close-manually: a failed rework count stops before the review is written; a failed closure is returned', async () => {
  const host = createFakeHost({ verdicts: { DESIGN: ['REJECTED'] } })
  await runOnce(host)
  const full = Err({ code: 'DISK_FULL', reason: 'no space left' })
  const failing = { ...host.dependencies(SLUG), stateWriter: { write: async () => full } }
  assert.deepEqual(await closer(failing).close({ slug: SLUG }), full)
  assert.equal(host.tracking(SLUG, `reviews/${TODAY}/manual-close.md`), undefined)
  assert.equal(host.state(SLUG).currentPhase, 'DESIGN')

  const deps = host.dependencies(SLUG)
  let writes = 0
  const secondFails = { ...deps, stateWriter: { write: async (slug, state) => (++writes === 1 ? deps.stateWriter.write(slug, state) : full) } }
  assert.deepEqual(await closer(secondFails).close({ slug: SLUG, findings: 2 }), full)
  assert.equal(host.state(SLUG).currentPhase, 'DESIGN')
  assert.equal(host.state(SLUG).reworkCount.DESIGN, 1)
})

// ── RecordDecision ───────────────────────────────────────────────────────────

test('record-decision: slug, key and answer validated with their reasons; key and answer trimmed', async () => {
  const written = []
  const { record } = createRecordDecision({ decisionStore: { write: async (...args) => { written.push(args) } } })
  assert.deepEqual(await record({ slug: 'abc!', key: 'k', answer: 'a' }), { ok: false, error: { code: 'INVALID_SLUG', reason: 'slug must be kebab-case, got "abc!"' } })
  assert.deepEqual(await record({ key: 'k', answer: 'a' }), { ok: false, error: { code: 'INVALID_SLUG', reason: 'slug must be kebab-case, got undefined' } })
  assert.deepEqual(await record({ slug: 'ab-cd', key: 42, answer: 'a' }), { ok: false, error: { code: 'INVALID_KEY', reason: 'a checkpoint key is required' } })
  assert.deepEqual(await record({ slug: 'ab-cd', key: '   ', answer: 'a' }), { ok: false, error: { code: 'INVALID_KEY', reason: 'a checkpoint key is required' } })
  assert.deepEqual(await record({ slug: 'ab-cd', key: 'k', answer: '  ' }), { ok: false, error: { code: 'INVALID_ANSWER', reason: 'an answer is required' } })
  assert.deepEqual(written, [])
  assert.deepEqual(await record({ slug: 'pay-by-card', key: ' stale:DESIGN ', answer: ' relaunch ' }), { ok: true, value: { key: 'stale:DESIGN' } })
  assert.deepEqual(written, [['pay-by-card', 'stale:DESIGN', 'relaunch', 'human']])
})
