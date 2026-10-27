import { test } from 'node:test'
import assert from 'node:assert/strict'
import { answerChoices, paneRows, viewRows, viewText } from '../../../../plugins/skraft-framework/engine/drivers/claude-mod/run-view.mjs'

const NO_STEP = Object.freeze({ graph: { nodes: [], edges: [] }, reviews: [], gates: [] })
const RUNNING = {
  slug: 'checkout',
  status: 'running',
  reason: '',
  phases: [{ phase: 'RESEARCH', state: 'open' }, { phase: 'DESIGN', state: 'pending' }],
  current: { step: 'research', phase: 'RESEARCH', agent: 'solution-researcher', gates: null, visit: 1, attempt: 2 },
  question: null,
  attempts: 1,
  costUsd: 0.25,
  ...NO_STEP,
}
const step = (id, phase, what, progress = {}) => ({ id, kind: 'agent', phase, what, state: 'pending', outcome: null, visits: 0, attempts: 0, retries: 0, durationMs: 0, costUsd: null, ...progress })

test('a running pipeline shows its phases, its current agent and its cost', () => {
  assert.deepEqual(viewRows(RUNNING), [
    { key: 'title', text: 'skraft checkout — running', tone: 'title' },
    { key: 'phase-RESEARCH', text: '▶ RESEARCH', tone: 'open' },
    { key: 'phase-DESIGN', text: '· DESIGN', tone: 'pending' },
    { key: 'current', text: 'agent: solution-researcher (research, attempt 2)', tone: 'detail' },
    { key: 'cost', text: 'cost: $0.25', tone: 'detail' },
  ])
})

test('in the pane, each phase lists its steps of the workflow graph: done, in progress or to come, with what they run, their outcome, pass and cost', () => {
  const view = {
    ...RUNNING,
    phases: [{ phase: 'DESIGN', state: 'open' }, { phase: 'DISTILL', state: 'pending' }],
    graph: {
      nodes: [
        step('design', 'DESIGN', 'solution-architect', { state: 'done', outcome: 'done', visits: 2, attempts: 2, costUsd: 1 }),
        step('design_review', 'DESIGN', 'consistency, fitness', { state: 'open', visits: 2, attempts: 2, costUsd: 0.375 }),
        step('adr', 'DESIGN', 'adr-ratification', { state: 'done', outcome: 'answered', visits: 1, attempts: 1 }),
        step('distill', 'DISTILL', null),
      ],
      edges: [],
    },
  }

  assert.deepEqual(viewRows(view).slice(1, 3), [{ key: 'phase-DESIGN', text: '▶ DESIGN', tone: 'open' }, { key: 'phase-DISTILL', text: '· DISTILL', tone: 'pending' }])
  assert.deepEqual(paneRows({ view, log: [] }).slice(1, 7), [
    { key: 'phase-DESIGN', text: '▶ DESIGN', tone: 'open' },
    { key: 'step-design', text: '  ✓ design — solution-architect: done, pass 2, $1.00', tone: 'closed' },
    { key: 'step-design_review', text: '  ▶ design_review — consistency, fitness: pass 2, $0.38', tone: 'open' },
    { key: 'step-adr', text: '  ✓ adr — adr-ratification: answered', tone: 'closed' },
    { key: 'phase-DISTILL', text: '· DISTILL', tone: 'pending' },
    { key: 'step-distill', text: '  · distill', tone: 'pending' },
  ])
})

test('the view shows the last pass of each review and the last result of each gate, by component', () => {
  const view = {
    ...RUNNING,
    phases: [],
    current: null,
    costUsd: null,
    reviews: [
      { step: 'design_review', visit: 1, verdict: 'needs-rework', lenses: [{ lens: 'consistency', verdict: 'fail', findings: 2 }, { lens: 'fitness', verdict: 'pass', findings: 0 }] },
      { step: 'deliver_review', visit: 2, verdict: null, lenses: [{ lens: 'test-integrity', verdict: 'pass', findings: 0 }] },
    ],
    gates: [
      { component: 'api', gate: 'test', command: 'dotnet test', status: 'pass', durationMs: 1, evidence: 'gates/api/test-2.log', survivors: undefined },
      { component: 'web', gate: 'lint', command: 'npx eslint .', status: 'fail', durationMs: 1, evidence: 'gates/web/lint-1.log', survivors: undefined },
      { component: 'api', gate: 'mutation', command: 'dotnet stryker', status: 'fail', durationMs: 1, evidence: 'gates/api/mutation-1.log', survivors: 3 },
      { component: 'api', gate: 'coverage', command: 'dotnet coverage', status: 'pass', durationMs: 1, evidence: 'gates/api/coverage-1.log', survivors: null },
    ],
  }

  assert.deepEqual(viewRows(view).slice(1), [
    { key: 'review-design_review', text: 'review design_review: needs-rework — consistency fail (2), fitness pass', tone: 'detail' },
    { key: 'review-deliver_review', text: 'review deliver_review: in progress, pass 2 — test-integrity pass', tone: 'detail' },
    { key: 'gates-api', text: 'gates api: test pass, mutation fail (3 survivors), coverage pass', tone: 'detail' },
    { key: 'gates-web', text: 'gates web: lint fail', tone: 'detail' },
  ])
})

test('the pane offers one answer button per option of the question the run waits on, and none while nothing waits', () => {
  const waiting = { ...RUNNING, status: 'waiting', question: { key: 'adr-1', kind: 'adr-ratification', text: 'Ratify?', options: ['RATIFIED', 'REJECTED'], refusals: ['REJECTED'], header: 'ADR' } }

  assert.deepEqual(answerChoices(waiting), [
    { key: 'answer-adr-1-RATIFIED', label: 'RATIFIED', question: 'adr-1', answer: 'RATIFIED' },
    { key: 'answer-adr-1-REJECTED', label: 'REJECTED', question: 'adr-1', answer: 'REJECTED' },
  ])
  assert.deepEqual(viewRows(waiting).find((row) => row.key === 'question'), { key: 'question', text: 'answer: /skraft decide adr-1 RATIFIED|REJECTED (with your reason after REJECTED)', tone: 'reason' })
  assert.deepEqual(answerChoices(RUNNING), [])
})

test('the current node names its pass after the first, and a gate node shows its gates instead of an agent', () => {
  const delivering = { ...RUNNING, phases: [], costUsd: null, current: { step: 'deliver', phase: 'DELIVER', agent: 'software-engineer', gates: null, visit: 2, attempt: 3 } }
  assert.equal(viewText(delivering), 'skraft checkout — running\nagent: software-engineer (deliver, pass 2, attempt 3)')
  const gating = { ...delivering, current: { step: 'gates', phase: 'DELIVER', agent: null, gates: ['build', 'test'], visit: 1, attempt: 1 } }
  assert.deepEqual(viewRows(gating).at(-1), { key: 'current', text: 'gates: build, test (gates)', tone: 'detail' })
  assert.equal(viewRows({ ...gating, current: { ...gating.current, visit: 3 } }).at(-1).text, 'gates: build, test (gates, pass 3)')
})

test('a finished pipeline shows its closed phases and its reason', () => {
  const done = { ...RUNNING, status: 'done', reason: 'RESEARCH closed', phases: [{ phase: 'RESEARCH', state: 'closed' }], current: null, costUsd: null }
  assert.equal(viewText(done), 'skraft checkout — done\n✓ RESEARCH\nRESEARCH closed')
})

test('the pane adds the newest log lines under the view, keyed by their place in the log', () => {
  const idle = { ...RUNNING, slug: null, status: 'idle', reason: 'none', phases: [], current: null, costUsd: null }
  assert.deepEqual(paneRows({ view: idle, log: ['a', 'b', 'c'] }, 2), [
    { key: 'title', text: 'skraft — idle', tone: 'title' },
    { key: 'reason', text: 'none', tone: 'reason' },
    { key: 'log-1', text: 'b', tone: 'log' },
    { key: 'log-2', text: 'c', tone: 'log' },
  ])
  assert.equal(paneRows({ view: idle, log: ['a'] }, -1).length, 2)
  assert.equal(paneRows({ view: idle, log: Array.from({ length: 20 }, (_, i) => `l${i}`) }).length, 14)
})
