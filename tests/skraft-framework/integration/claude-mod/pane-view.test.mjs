import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paneRows, viewRows, viewText } from '../../../../plugins/skraft-framework/engine/drivers/claude-mod/run-view.mjs'

const RUNNING = {
  slug: 'checkout',
  status: 'running',
  reason: '',
  phases: [{ phase: 'RESEARCH', state: 'open' }, { phase: 'DESIGN', state: 'pending' }],
  current: { step: 'research', phase: 'RESEARCH', agent: 'solution-researcher', gates: null, visit: 1, attempt: 2 },
  attempts: 1,
  costUsd: 0.25,
}

test('a running pipeline shows its phases, its current agent and its cost', () => {
  assert.deepEqual(viewRows(RUNNING), [
    { key: 'title', text: 'skraft checkout — running', tone: 'title' },
    { key: 'phase-RESEARCH', text: '▶ RESEARCH', tone: 'open' },
    { key: 'phase-DESIGN', text: '· DESIGN', tone: 'pending' },
    { key: 'current', text: 'agent: solution-researcher (research, attempt 2)', tone: 'detail' },
    { key: 'cost', text: 'cost: $0.25', tone: 'detail' },
  ])
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
