import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareSummaries } from '../../eng/regression/compare.mjs'
import { summarizeV1, summarizeV2 } from '../../eng/regression/summary.mjs'
import { renderMarkdown, exitCode, applyWaivers, parseWaivers } from '../../eng/regression/report.mjs'

const baseline = () => ({
  phasesReached: ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER'],
  verdicts: { RESEARCH: ['APPROVED'], DESIGN: ['NEEDS_REWORK', 'APPROVED'], DELIVER: ['APPROVED'] },
  gates: [{ component: 'refund', gate: 'G1', status: 'pass' }, { component: 'refund', gate: 'G7', status: 'fail' }],
  artefacts: ['design/architecture.md', 'research/report.md'],
  durationMs: 100_000,
  cost: 10,
  retries: 1,
  status: 'completed',
})

const severityOf = (findings, criterion) => findings.find((f) => f.criterion === criterion)?.severity

test('identical runs: no regression, exit code 0', () => {
  const findings = compareSummaries(baseline(), baseline())
  assert.ok(findings.length > 0)
  assert.ok(findings.every((f) => f.severity === 'same'), JSON.stringify(findings))
  assert.equal(exitCode(findings, { fixture: 'payment' }), 0)
})

test('fewer phases reached and a run that no longer completes are regressions', () => {
  const v2 = { ...baseline(), phasesReached: ['RESEARCH', 'DESIGN'], status: 'incomplete' }
  const findings = compareSummaries(baseline(), v2)
  assert.equal(severityOf(findings, 'phases'), 'regression')
  assert.equal(severityOf(findings, 'status'), 'regression')
  assert.equal(exitCode(findings, { fixture: 'payment' }), 1)
})

test('more phases reached is an improvement', () => {
  const v1 = { ...baseline(), phasesReached: ['RESEARCH'] }
  assert.equal(severityOf(compareSummaries(v1, baseline()), 'phases'), 'improvement')
})

test('gate pass to fail is a regression, fail to pass an improvement, a vanished gate a regression', () => {
  const v2 = { ...baseline(), gates: [{ component: 'refund', gate: 'G1', status: 'fail' }, { component: 'refund', gate: 'G7', status: 'pass' }] }
  const findings = compareSummaries(baseline(), v2)
  assert.equal(severityOf(findings, 'gate refund/G1'), 'regression')
  assert.equal(severityOf(findings, 'gate refund/G7'), 'improvement')

  const missing = compareSummaries(baseline(), { ...baseline(), gates: [{ component: 'refund', gate: 'G7', status: 'fail' }] })
  assert.equal(severityOf(missing, 'gate refund/G1'), 'regression')
})

test('final verdict APPROVED to NEEDS_REWORK or REJECTED is a regression; intermediate verdicts do not count', () => {
  const v2 = { ...baseline(), verdicts: { RESEARCH: ['REJECTED'], DESIGN: ['APPROVED'], DELIVER: ['APPROVED', 'NEEDS_REWORK'] } }
  const findings = compareSummaries(baseline(), v2)
  assert.equal(severityOf(findings, 'verdict RESEARCH'), 'regression')
  assert.equal(severityOf(findings, 'verdict DESIGN'), 'same')
  assert.equal(severityOf(findings, 'verdict DELIVER'), 'regression')

  const reverse = compareSummaries(v2, baseline())
  assert.equal(severityOf(reverse, 'verdict RESEARCH'), 'improvement')
})

test('duration and cost beyond +25% are regressions; below -25% improvements; thresholds configurable', () => {
  const slower = compareSummaries(baseline(), { ...baseline(), durationMs: 126_000, cost: 12.4 })
  assert.equal(severityOf(slower, 'duration'), 'regression')
  assert.equal(severityOf(slower, 'cost'), 'same')

  const faster = compareSummaries(baseline(), { ...baseline(), durationMs: 70_000, cost: 5 })
  assert.equal(severityOf(faster, 'duration'), 'improvement')
  assert.equal(severityOf(faster, 'cost'), 'improvement')

  const tolerant = compareSummaries(baseline(), { ...baseline(), durationMs: 126_000 }, { durationPct: 50 })
  assert.equal(severityOf(tolerant, 'duration'), 'same')
})

test('unknown duration or cost on either side is info, never a regression', () => {
  const findings = compareSummaries({ ...baseline(), cost: null }, { ...baseline(), durationMs: null })
  assert.equal(severityOf(findings, 'cost'), 'info')
  assert.equal(severityOf(findings, 'duration'), 'info')
})

test('more retries is a regression, fewer an improvement', () => {
  assert.equal(severityOf(compareSummaries(baseline(), { ...baseline(), retries: 3 }), 'retries'), 'regression')
  assert.equal(severityOf(compareSummaries(baseline(), { ...baseline(), retries: 0 }), 'retries'), 'improvement')
})

test('a missing expected artefact is a regression; a new one is info', () => {
  const findings = compareSummaries(baseline(), { ...baseline(), artefacts: ['research/report.md', 'design/c4.md'] })
  assert.equal(severityOf(findings, 'artefact design/architecture.md'), 'regression')
  assert.equal(severityOf(findings, 'artefact design/c4.md'), 'info')
  assert.equal(severityOf(findings, 'artefact research/report.md'), 'same')
})

test('a waiver with a reason clears a regression for its fixture only', () => {
  const findings = compareSummaries(baseline(), { ...baseline(), retries: 3 })
  const waivers = parseWaivers(JSON.stringify([{ criterion: 'retries', fixture: 'payment', reason: 'reviewer stricter by design (#300)' }]))

  assert.equal(exitCode(findings, { fixture: 'payment', waivers }), 0)
  assert.equal(exitCode(findings, { fixture: 'payment-spring', waivers }), 1)
  assert.equal(applyWaivers(findings, { fixture: 'payment', waivers }).find((f) => f.criterion === 'retries').waiver, 'reviewer stricter by design (#300)')
})

test('a waiver without a written reason is rejected', () => {
  assert.throws(() => parseWaivers(JSON.stringify([{ criterion: 'retries', fixture: 'payment', reason: ' ' }])), /reason/)
  assert.throws(() => parseWaivers('{"criterion":"retries"}'), /array/)
})

test('markdown report: verdict line, regressions first, waived rows marked, pipes escaped', () => {
  const findings = compareSummaries(baseline(), { ...baseline(), retries: 3, artefacts: ['research/report.md', 'design/a|b.md', 'design/architecture.md'] })
  const waivers = parseWaivers(JSON.stringify([{ criterion: 'retries', fixture: 'payment', reason: 'accepted' }]))

  const md = renderMarkdown(findings, { fixture: 'payment', waivers })

  assert.match(md, /^## v1 → v2 regression check — `payment`/)
  assert.match(md, /No unwaived regression/)
  assert.match(md, /\| Criterion \| v1 \| v2 \| Result \|/)
  assert.match(md, /waived: accepted/)
  assert.match(md, /design\/a\\\|b\.md/)
  const rows = md.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Criterion') && !l.startsWith('| ---'))
  assert.match(rows[0], /retries/)
})

test('markdown report flags unwaived regressions', () => {
  const md = renderMarkdown(compareSummaries(baseline(), { ...baseline(), retries: 3 }), { fixture: 'payment' })
  assert.match(md, /1 unwaived regression/)
})

test('a v1 G3 pass and a v2 build pass on the same slug give no gate regression', () => {
  const v1 = summarizeV1({ state: {}, evidence: [{ path: 'evidence/2026-10-01/refund/qg-refund.json', json: { story: 'refund', gates: [{ id: 'G3', status: 'pass' }] } }] })
  const v2 = summarizeV2([
    { type: 'run.started', at: '2026-10-09T10:00:00.000Z', prev: null, slug: 'refund', workflow: 'skraft' },
    { type: 'gate.ran', at: '2026-10-09T10:01:00.000Z', prev: 'h1', component: 'api', gate: 'build', status: 'pass' },
    { type: 'gate.ran', at: '2026-10-09T10:01:01.000Z', prev: 'h2', component: 'web', gate: 'build', status: 'pass' },
  ])

  const gateFindings = compareSummaries(v1, v2).filter((f) => f.criterion.startsWith('gate '))

  assert.deepEqual(gateFindings, [{ criterion: 'gate refund/G3', v1: 'pass', v2: 'pass', severity: 'same' }])
})
