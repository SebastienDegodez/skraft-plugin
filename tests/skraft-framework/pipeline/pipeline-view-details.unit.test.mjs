// Unit tests of the pipeline view model (domain/pipeline/pipeline-view-policy.mjs): every
// field a viewer reads, its defaults, its boundaries and its ordering.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPipelineView, isViewableTrackedFile } from '../../../plugins/skraft-framework/src/domain/pipeline/pipeline-view-policy.mjs'

const CONFIG = Object.freeze({
  phaseOrder: ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER', 'DONE'],
  phaseAgents: {
    RESEARCH: { specialist: 'researcher' },
    DESIGN: { specialist: 'architect', reviewer: 'architect-reviewer' },
    DISTILL: { specialist: 'acceptance-designer', reviewer: 'acceptance-reviewer' },
    DELIVER: { specialist: 'engineer', reviewer: 'engineer-reviewer' },
  },
})
const phaseOf = (view, name) => view.phases.find((phase) => phase.name === name)
const stepOf = (view, phase, id) => phaseOf(view, phase).steps.find((step) => step.id === id)
const withoutSteps = ({ steps, ...rest }) => rest

test('view: phase durations — equal instants last 0 ms, an end before the start or no start has none, an open phase runs until now', () => {
  const view = buildPipelineView({
    slug: 'checkout',
    config: CONFIG,
    state: {
      currentPhase: 'DISTILL',
      phaseHistory: {
        RESEARCH: { startedAt: '2026-10-05T10:00:00.000Z', completedAt: '2026-10-05T10:00:00.000Z' },
        DESIGN: { startedAt: '2026-10-05T10:00:05.000Z', completedAt: '2026-10-05T10:00:00.000Z' },
        DISTILL: { startedAt: '2026-10-05T10:00:00.000Z' },
        DELIVER: { completedAt: '2026-10-05T10:00:00.000Z' },
      },
    },
    now: '2026-10-05T10:01:00.000Z',
  })
  assert.deepEqual(view.phases.map((phase) => phase.durationMs), [0, null, 60_000, null])
  assert.deepEqual(view.phases.map((phase) => phase.completedAt), ['2026-10-05T10:00:00.000Z', '2026-10-05T10:00:00.000Z', null, '2026-10-05T10:00:00.000Z'])

  const noClock = buildPipelineView({ slug: 'checkout', config: CONFIG, state: { currentPhase: 'RESEARCH', phaseHistory: { RESEARCH: { startedAt: '2026-10-05T10:00:00.000Z' } } } })
  assert.equal(phaseOf(noClock, 'RESEARCH').durationMs, null)
})

test('view: the open phase reads the run status only when the run is on that phase', () => {
  const state = { currentPhase: 'DESIGN' }
  const status = (run) => phaseOf(buildPipelineView({ slug: 's', config: CONFIG, state, run }), 'DESIGN').status
  assert.equal(status({ status: 'blocked', phase: 'RESEARCH' }), 'open')
  assert.equal(status({ status: 'awaiting-human', phase: 'RESEARCH' }), 'open')
  assert.equal(status({ status: 'running', phase: 'RESEARCH' }), 'active')
  assert.equal(status({ status: 'blocked', phase: 'DESIGN' }), 'blocked')
  assert.equal(status({ status: 'error', phase: 'DESIGN' }), 'blocked')
  assert.equal(status({ status: 'done', phase: 'DESIGN' }), 'open')
})

test('view: reports are the dated forecast/outcome files at the tracking root, sorted by path, and they tick the report steps', () => {
  const files = [
    'reporting/2026-10-02/outcome.md',
    'reporting/2026-10-01/forecast.md',
    'old/reporting/2026-09-01/forecast.md',
    'reporting/2026-09-01/outcome.md.bak',
    'reporting/2026-09-01/summary.md',
  ]
  const view = buildPipelineView({ slug: 's', config: CONFIG, state: { currentPhase: 'DISTILL' }, files })
  assert.deepEqual(view.reporting.reports, [
    { kind: 'forecast', date: '2026-10-01', path: 'reporting/2026-10-01/forecast.md' },
    { kind: 'outcome', date: '2026-10-02', path: 'reporting/2026-10-02/outcome.md' },
  ])
  assert.equal(stepOf(view, 'DISTILL', 'forecast-report').status, 'done')
  assert.equal(stepOf(view, 'DELIVER', 'outcome-report').status, 'done')

  const stray = buildPipelineView({ slug: 's', config: CONFIG, state: { currentPhase: 'DISTILL' }, files: ['old/reporting/2026-09-01/forecast.md', 'reporting/2026-09-01/forecast.md.bak'] })
  assert.deepEqual(stray.reporting.reports, [])
  assert.equal(stepOf(stray, 'DISTILL', 'forecast-report').status, 'pending')
})

test('view: no config and no state — the default phase order, nothing started, every default empty', () => {
  const view = buildPipelineView({ slug: 'checkout', state: null })
  assert.deepEqual(view.phases.map((phase) => phase.name), ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER'])
  assert.deepEqual(view.phases.map((phase) => phase.status), ['pending', 'pending', 'pending', 'pending'])
  assert.deepEqual(withoutSteps(phaseOf(view, 'DESIGN')), {
    name: 'DESIGN', specialist: null, reviewer: null, status: 'pending', attempt: 1, maxAttempts: 3, retries: 0, reworks: 0,
    findingsResolved: 0, verdict: null, startedAt: null, completedAt: null, durationMs: null, baseSha: null, artifacts: [], reviews: [],
  })
  assert.equal(view.started, false)
  assert.equal(view.currentPhase, null)
  assert.equal(view.done, false)
  assert.equal(view.run, null)
  assert.equal(view.checkpoint, null)
  assert.equal(view.story, null)
  assert.deepEqual(view.decisions, [])
  assert.equal(view.adrRatification, null)
  assert.deepEqual(view.reporting, { destinations: null, reports: [], publications: [], pending: null })
  assert.equal(view.cost.total.dispatches, 0)
  assert.deepEqual(view.cost.byPhase.map((group) => group.phase), ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER'])
})

test('view: a published phase order drops DONE and is used as given', () => {
  const view = buildPipelineView({ slug: 's', config: { phaseOrder: ['RESEARCH', 'DESIGN', 'DONE'], phaseAgents: {} }, state: { currentPhase: 'DESIGN' } })
  assert.deepEqual(view.phases.map((phase) => phase.name), ['RESEARCH', 'DESIGN'])
  assert.deepEqual(view.phases.map((phase) => phase.status), ['done', 'open'])
  assert.deepEqual(view.cost.byPhase.map((group) => group.phase), ['RESEARCH', 'DESIGN'])
})

test('view: a minimal state (only the open phase) and a config without agents read as defaults', () => {
  const view = buildPipelineView({
    slug: 's',
    config: {},
    state: { currentPhase: 'DESIGN', phaseArtifacts: { RESEARCH: ['details/2026-10-05/notes.md'] } },
  })
  assert.deepEqual(withoutSteps(phaseOf(view, 'DESIGN')), {
    name: 'DESIGN', specialist: null, reviewer: null, status: 'open', attempt: 1, maxAttempts: 3, retries: 0, reworks: 0,
    findingsResolved: 0, verdict: null, startedAt: null, completedAt: null, durationMs: null, baseSha: null, artifacts: [], reviews: [],
  })
  assert.deepEqual(phaseOf(view, 'RESEARCH').artifacts, ['details/2026-10-05/notes.md'])
  assert.equal(stepOf(view, 'DESIGN', 'structural-scan').status, 'pending', 'notes.md is no structural scan')
  assert.equal(view.reporting.destinations, null)
  assert.equal(view.adrRatification, null)
  assert.equal(view.started, true)
  assert.equal(view.currentPhase, 'DESIGN')
})

test('view: every recorded field of a phase is shown — retries capped by the budget, reviews recorded then on disk, oldest first', () => {
  const files = [
    'reviews/2026-10-01/design-review-1.md',
    'reviews/2026-10-02/design-review-3.md',
    'reviews/2026-10-01/design-review-2.md',
    'reviews/2026-10-01/distill-review-1.md',
  ]
  const view = buildPipelineView({
    slug: 's',
    config: CONFIG,
    state: {
      currentPhase: 'DESIGN',
      userPreferences: { maxRetriesPerPhase: 4, reporting: { destinations: ['pr', 'issue'] } },
      retryCount: { DESIGN: 6 },
      reworkCount: { DESIGN: 2 },
      findingsResolved: { DESIGN: 3 },
      verdicts: { DESIGN: 'CHANGES_REQUESTED' },
      phaseHistory: { DESIGN: { startedAt: '2026-10-05T10:00:00.000Z', completedAt: '2026-10-05T10:00:02.000Z', baseSha: 'abc123' } },
      phaseArtifacts: { RESEARCH: ['details/2026-10-05/structural-scan.json'], DESIGN: ['design/2026-10-05/architecture.md'] },
      reviewArtifacts: { DESIGN: ['reviews/2026-10-01/design-review-1.md'] },
      adrRatification: { checkpointStatus: 'awaiting_human', pending: ['001'] },
    },
    files,
    reviewVerdicts: { 'reviews/2026-10-01/design-review-2.md': 'NEEDS_REWORK' },
  })
  assert.deepEqual(withoutSteps(phaseOf(view, 'DESIGN')), {
    name: 'DESIGN', specialist: 'architect', reviewer: 'architect-reviewer', status: 'open', attempt: 5, maxAttempts: 5, retries: 6, reworks: 2,
    findingsResolved: 3, verdict: 'CHANGES_REQUESTED', startedAt: '2026-10-05T10:00:00.000Z', completedAt: '2026-10-05T10:00:02.000Z',
    durationMs: 2000, baseSha: 'abc123', artifacts: ['design/2026-10-05/architecture.md'],
    reviews: [
      { path: 'reviews/2026-10-01/design-review-1.md', verdict: null, recorded: true },
      { path: 'reviews/2026-10-01/design-review-2.md', verdict: 'NEEDS_REWORK', recorded: false },
      { path: 'reviews/2026-10-02/design-review-3.md', verdict: null, recorded: false },
    ],
  })
  assert.equal(stepOf(view, 'DESIGN', 'structural-scan').status, 'done')
  assert.equal(stepOf(view, 'DESIGN', 'adr-ratification').status, 'waiting')
  assert.deepEqual(view.adrRatification, { checkpointStatus: 'awaiting_human', pending: ['001'] })
  assert.deepEqual(view.reporting.destinations, ['pr', 'issue'])
})

test('view: the run block — every field kept, the last 60 log lines, defaults for an empty run', () => {
  const log = Array.from({ length: 61 }, (_, i) => ({ at: `t${i}`, message: `line ${i}` }))
  const view = buildPipelineView({
    slug: 's',
    config: CONFIG,
    state: { currentPhase: 'DESIGN' },
    run: {
      status: 'awaiting-human', phase: 'DESIGN', reason: 'a question', startedAt: 'S', updatedAt: 'U', log,
      story: { issue: 42 }, checkpoint: { key: 'k1', question: 'q?' },
    },
    decisions: [{ key: 'k1', answer: 'yes', at: '2026-10-05T10:00:00.000Z' }],
  })
  assert.deepEqual(view.run, { status: 'awaiting-human', phase: 'DESIGN', reason: 'a question', startedAt: 'S', updatedAt: 'U', log: log.slice(1) })
  assert.equal(view.run.log.length, 60)
  assert.deepEqual(view.checkpoint, { key: 'k1', question: 'q?', answered: true })
  assert.deepEqual(view.story, { issue: 42 })
  assert.equal(phaseOf(view, 'DESIGN').status, 'awaiting')

  const bare = buildPipelineView({ slug: 's', config: CONFIG, state: { currentPhase: 'DESIGN' }, run: { status: 'running', log: 'not a list' } })
  assert.deepEqual(bare.run, { status: 'running', phase: null, reason: '', startedAt: null, updatedAt: null, log: [] })
  assert.equal(bare.checkpoint, null)

  const unanswered = buildPipelineView({ slug: 's', config: CONFIG, state: { currentPhase: 'DESIGN' }, run: { status: 'awaiting-human', checkpoint: { key: 'k2' } } })
  assert.deepEqual(unanswered.checkpoint, { key: 'k2', answered: false })
})

test('view: decisions sorted by time, an undated one first, the input left as it was', () => {
  const decisions = [
    { key: 'b', answer: '2', at: '2026-10-05T11:00:00.000Z' },
    { key: 'a', answer: '1', at: '2026-10-05T10:00:00.000Z' },
    { key: 'c', answer: '3' },
  ]
  const view = buildPipelineView({ slug: 's', config: CONFIG, state: null, decisions })
  assert.deepEqual(view.decisions.map((decision) => decision.key), ['c', 'a', 'b'])
  assert.deepEqual(decisions.map((decision) => decision.key), ['b', 'a', 'c'])

  const nullDated = buildPipelineView({ slug: 's', config: CONFIG, state: null, decisions: [{ key: 'z', at: '2026-01-01' }, { key: 'y', at: null }] })
  assert.deepEqual(nullDated.decisions.map((decision) => decision.key), ['y', 'z'])
  const undatedFirst = buildPipelineView({ slug: 's', config: CONFIG, state: null, decisions: [{ key: 'y' }, { key: 'z', at: '2026-01-01' }] })
  assert.deepEqual(undatedFirst.decisions.map((decision) => decision.key), ['y', 'z'])
})

test('view: publications — one per receipt target, missing fields read as unknown / null, a null receipt ignored', () => {
  const view = buildPipelineView({
    slug: 's',
    config: CONFIG,
    state: null,
    receipts: [
      null,
      { kind: 'forecast', story: 'story-1', targets: { pr: null, issue: { status: 'posted', url: 'https://x/1', target: { number: 7 } }, other: { status: 'skipped' } } },
      { kind: 'outcome', story: 'story-1' },
    ],
  })
  assert.deepEqual(view.reporting.publications, [
    { kind: 'forecast', story: 'story-1', destination: 'pr', status: 'unknown', url: null, number: null },
    { kind: 'forecast', story: 'story-1', destination: 'issue', status: 'posted', url: 'https://x/1', number: 7 },
    { kind: 'forecast', story: 'story-1', destination: 'other', status: 'skipped', url: null, number: null },
  ])
})

test('view: the pending publication — the decision reason first, then the packet one, else null', () => {
  const pendingOf = (pending) => buildPipelineView({ slug: 's', config: CONFIG, state: null, pending }).reporting.pending
  assert.deepEqual(pendingOf({ packet: { kind: 'forecast', destination: 'pr', reason: 'packet says' }, decision: { reason: 'decision says' } }),
    { kind: 'forecast', destination: 'pr', reason: 'decision says' })
  assert.deepEqual(pendingOf({ packet: { kind: 'outcome', destination: 'issue', reason: 'packet says' } }),
    { kind: 'outcome', destination: 'issue', reason: 'packet says' })
  assert.deepEqual(pendingOf({ packet: { kind: 'outcome', destination: 'issue' }, decision: {} }),
    { kind: 'outcome', destination: 'issue', reason: null })
  assert.equal(pendingOf({ decision: { reason: 'x' } }), null)
  assert.equal(pendingOf(null), null)
})

test('view: a viewer opens only listed Markdown or JSON tracking files, never state.json', () => {
  const files = ['reviews/a.md', 'run.json', 'state.json', 'notes.md.txt', 'log.txt']
  assert.equal(isViewableTrackedFile('reviews/a.md', files), true)
  assert.equal(isViewableTrackedFile('run.json', files), true)
  assert.equal(isViewableTrackedFile('state.json', files), false)
  assert.equal(isViewableTrackedFile('notes.md.txt', files), false)
  assert.equal(isViewableTrackedFile('log.txt', files), false)
  assert.equal(isViewableTrackedFile('other.md', files), false)
  const pathLike = { toString: () => 'reviews/a.md' }
  assert.equal(isViewableTrackedFile(pathLike, [...files, pathLike]), false)
  assert.equal(isViewableTrackedFile(undefined, files), false)
})
