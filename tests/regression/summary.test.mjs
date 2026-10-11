import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeV1, summarizeV2, parseEventsJsonl } from '../../eng/regression/summary.mjs'

const v1Folder = () => ({
  state: {
    projectSlug: 'refund',
    currentPhase: 'DONE',
    phasesCompleted: ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER'],
    verdicts: { RESEARCH: 'APPROVED', DESIGN: 'APPROVED', DISTILL: 'APPROVED', DELIVER: 'APPROVED' },
    retryCount: { DESIGN: 1, DELIVER: 0 },
    reworkCount: { DELIVER: 1 },
    phaseHistory: {
      RESEARCH: { status: 'done', startedAt: '2026-10-01T10:00:00.000Z', completedAt: '2026-10-01T10:10:00.000Z' },
      DELIVER: { status: 'done', startedAt: '2026-10-01T11:00:00.000Z', completedAt: '2026-10-01T12:00:00.000Z' },
    },
  },
  reviews: [
    { path: 'reviews/2026-10-01/design-review-2.md', content: '```yaml\nverdict: "APPROVED"\n```' },
    { path: 'reviews/2026-10-01/design-review-1.md', content: '```yaml\nverdict: "NEEDS_REWORK"\n  status: APPROVED\n```' },
    { path: 'reviews/2026-10-01/research-review-1.md', content: 'verdict: APPROVED' },
  ],
  evidence: [
    { path: 'evidence/2026-10-01/refund/qg-refund.json', json: { story: 'refund', gates: [{ id: 'G1', status: 'pass' }, { id: 'G7', status: 'fail' }] } },
  ],
  files: ['state.json', 'research/report.md', 'design/architecture.md', 'reviews/2026-10-01/research-review-1.md', 'evidence/2026-10-01/refund/qg-refund.json', 'execution-log.json'],
})

test('v1 tracking folder: phases closed, review verdicts in review order, gates from evidence', () => {
  const summary = summarizeV1(v1Folder())

  assert.deepEqual(summary.phasesReached, ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER'])
  assert.deepEqual(summary.verdicts.DESIGN, ['NEEDS_REWORK', 'APPROVED'])
  assert.deepEqual(summary.verdicts.RESEARCH, ['APPROVED'])
  assert.deepEqual(summary.gates, [
    { component: 'refund', gate: 'G1', status: 'pass' },
    { component: 'refund', gate: 'G7', status: 'fail' },
  ])
  assert.equal(summary.status, 'completed')
  assert.equal(summary.retries, 2)
  assert.equal(summary.durationMs, 2 * 60 * 60 * 1000)
  assert.equal(summary.cost, null)
})

test('v1 artefacts exclude bookkeeping, reviews and evidence', () => {
  assert.deepEqual(summarizeV1(v1Folder()).artefacts, ['design/architecture.md', 'research/report.md'])
})

test('v1 reporting queue and archived invalid state are bookkeeping, not artefacts', () => {
  const folder = v1Folder()
  folder.files.push(
    'reporting/pending.json',
    'reporting/abandoned/6f1c2a9e-0b7d-4e8a-9c21-7d4e5f6a8b90.json',
    'state.json.invalid.2026-10-01T10-00-00Z',
  )
  assert.deepEqual(summarizeV1(folder).artefacts, ['design/architecture.md', 'research/report.md'])
})

test('v1 without review files falls back to state verdicts, CHANGES_REQUESTED read as NEEDS_REWORK', () => {
  const folder = v1Folder()
  folder.reviews = []
  folder.state.verdicts = { RESEARCH: 'APPROVED', DESIGN: 'CHANGES_REQUESTED', DISTILL: null }
  folder.state.currentPhase = 'DESIGN'

  const summary = summarizeV1(folder)

  assert.deepEqual(summary.verdicts, { RESEARCH: ['APPROVED'], DESIGN: ['NEEDS_REWORK'] })
  assert.equal(summary.status, 'incomplete')
})

const ev = (type, at, payload = {}) => ({ type, at, prev: 'x', ...payload })

test('v2 events: phases, verdicts, last gate status wins, cost and retries from steps', () => {
  const events = [
    ev('run.started', '2026-10-09T10:00:00.000Z', { base: 'abc', workflow: 'default' }),
    ev('step.started', '2026-10-09T10:00:01.000Z', { step: 'research', kind: 'agent', agent: 'solution-researcher' }),
    ev('step.recorded', '2026-10-09T10:05:00.000Z', { step: 'research', outcome: 'fail', durationMs: 1000, cost: 0.5 }),
    ev('step.started', '2026-10-09T10:05:01.000Z', { step: 'research', kind: 'agent', agent: 'solution-researcher' }),
    ev('step.recorded', '2026-10-09T10:09:00.000Z', { step: 'research', outcome: 'ok', durationMs: 2000, cost: 0.25 }),
    ev('gate.ran', '2026-10-09T10:09:10.000Z', { component: 'refund', gate: 'G1', status: 'fail' }),
    ev('gate.ran', '2026-10-09T10:09:20.000Z', { component: 'refund', gate: 'G1', status: 'pass' }),
    ev('review.decided', '2026-10-09T10:09:30.000Z', { phase: 'RESEARCH', verdict: 'APPROVED' }),
    ev('decision.recorded', '2026-10-09T10:09:40.000Z', { key: 'adr-1', answer: 'accept' }),
    ev('phase.closed', '2026-10-09T10:09:50.000Z', { phase: 'RESEARCH' }),
    ev('some.future.event', '2026-10-09T10:09:55.000Z', { whatever: true }),
    ev('run.finished', '2026-10-09T10:10:00.000Z', { status: 'completed' }),
  ]

  const summary = summarizeV2(events, { files: ['events.jsonl', 'research/report.md'] })

  assert.deepEqual(summary.phasesReached, ['RESEARCH'])
  assert.deepEqual(summary.verdicts, { RESEARCH: ['APPROVED'] })
  assert.deepEqual(summary.gates, [{ component: 'refund', gate: 'G1', status: 'pass' }])
  assert.deepEqual(summary.artefacts, ['research/report.md'])
  assert.equal(summary.durationMs, 10 * 60 * 1000)
  assert.equal(summary.cost, 0.75)
  assert.equal(summary.retries, 1)
  assert.equal(summary.status, 'completed')
})

test('v2 run without run.finished is incomplete; no cost recorded gives null', () => {
  const summary = summarizeV2([ev('run.started', '2026-10-09T10:00:00.000Z')])
  assert.equal(summary.status, 'incomplete')
  assert.equal(summary.cost, null)
  assert.equal(summary.durationMs, null)
})

test('parseEventsJsonl skips blank lines (CRLF too) and names the bad line', () => {
  assert.equal(parseEventsJsonl('{"type":"a","at":"t"}\r\n\r\n{"type":"b","at":"t"}\n').length, 2)
  assert.throws(() => parseEventsJsonl('{"type":"a"}\nnot json\n'), /line 2/)
})

test('artefact paths are normalised: backslashes to slashes, dates to {date}', () => {
  const summary = summarizeV2([], { files: ['design\\adr\\0001.md', 'reports/2026-10-09/summary.md'] })
  assert.deepEqual(summary.artefacts, ['design/adr/0001.md', 'reports/{date}/summary.md'])
})
