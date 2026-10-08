import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  PHASES, WEIGHTS, computeVerdict, main, parseArgs, renderReview, validateLensResult,
} from '../../../plugins/skraft-backlog/skills/backlog-review-lenses/scripts/review-verdict.mjs'

const pass = (lens) => ({ lens, verdict: 'pass', defects: [] })
const defect = (gate, severity, extra = {}) => ({ id: 'D1', gate, severity, location: 'S-1', description: `${gate} ${severity}`, suggestion: 'fix it', ...extra })
const fail = (lens, ...defects) => ({ lens, verdict: 'fail', defects })
const allPass = (phase) => PHASES[phase].lenses.map(pass)

test('every lens passing with no defect is APPROVED, and every question contributes its full weight', () => {
  for (const phase of Object.keys(PHASES)) {
    const review = computeVerdict(phase, allPass(phase))
    assert.equal(review.verdict, 'APPROVED', phase)
    for (const [question, weight] of Object.entries(WEIGHTS)) {
      assert.equal(review.synthesis.questions[question].contribution, weight, `${phase} ${question}`)
    }
    assert.deepEqual(review.synthesis.problems, [])
  }
})

test('a blocker anywhere rejects; a high or a medium asks for rework; a low still approves', () => {
  const withDefect = (severity) => [fail('planning-ac-quality', defect('G4', severity)), pass('planning-invest'), pass('planning-coherence'), pass('planning-dor')]
  assert.equal(computeVerdict('discuss', withDefect('blocker')).verdict, 'REJECTED')
  assert.equal(computeVerdict('discuss', withDefect('high')).verdict, 'NEEDS_REWORK')
  assert.equal(computeVerdict('discuss', withDefect('medium')).verdict, 'NEEDS_REWORK')
  const low = [{ lens: 'planning-ac-quality', verdict: 'pass', defects: [defect('G3', 'low')] }, pass('planning-invest'), pass('planning-coherence'), pass('planning-dor')]
  assert.equal(computeVerdict('discuss', low).verdict, 'APPROVED')
})

test('the contribution of a question drops to half on a high finding and to zero on a blocker', () => {
  const half = computeVerdict('discover', [fail('discovery-duplicate', defect('G5', 'high')), pass('discovery-completeness'), pass('discovery-prioritization')])
  assert.equal(half.synthesis.questions.quality.contribution, 0.08)
  const zero = computeVerdict('discover', [fail('discovery-completeness', defect('G2', 'blocker')), pass('discovery-duplicate'), pass('discovery-prioritization')])
  assert.equal(zero.synthesis.questions.completeness.contribution, 0)
  assert.equal(zero.verdict, 'REJECTED')
  assert.match(zero.synthesis.blocking_findings[0], /^G2/)
})

test('a missing, inconclusive or unusable lens never reads as approval', () => {
  const missing = computeVerdict('discover', [pass('discovery-completeness'), pass('discovery-duplicate')])
  assert.equal(missing.verdict, 'NEEDS_REWORK')
  assert.ok(missing.synthesis.problems.some((p) => p.includes('discovery-prioritization: no result')))
  assert.equal(missing.lenses['discovery-prioritization'].status, 'inconclusive')

  const inconclusive = computeVerdict('refine', [{ lens: 'planning-dor', verdict: 'inconclusive', defects: [] }, pass('planning-invest'), pass('planning-ac-quality')])
  assert.equal(inconclusive.verdict, 'NEEDS_REWORK')
  assert.equal(inconclusive.synthesis.questions.completeness.contribution, 0)

  const garbage = computeVerdict('refine', [{ lens: 'planning-dor', verdict: 'maybe' }, pass('planning-invest'), pass('planning-ac-quality')])
  assert.equal(garbage.verdict, 'NEEDS_REWORK')
  assert.ok(garbage.synthesis.problems.some((p) => p.startsWith('planning-dor: unusable result')))
})

test('a lens that says pass while listing a medium defect is rejected as unusable', () => {
  const { problems } = validateLensResult({ lens: 'planning-dor', verdict: 'pass', defects: [defect('G7', 'medium')] })
  assert.ok(problems.some((p) => p.includes('pass but a medium')))
})

test('lens names with or without the -lens suffix are the same lens', () => {
  const review = computeVerdict('refine', ['planning-invest-lens', 'planning-ac-quality-lens', 'planning-dor-lens'].map(pass))
  assert.equal(review.verdict, 'APPROVED')
})

test('a lens that is not part of the phase, or a gate outside it, keeps the review from approving', () => {
  const foreign = computeVerdict('refine', [...allPass('refine'), pass('planning-coherence')])
  assert.equal(foreign.verdict, 'NEEDS_REWORK')
  const gate = computeVerdict('refine', [fail('planning-invest', defect('G5', 'low')), pass('planning-ac-quality'), pass('planning-dor')])
  assert.ok(gate.synthesis.problems.some((p) => p.includes('gate G5 is not part of the refine review')))
})

test('two G7 defects on one story reject it, even when each one is only high', () => {
  const dor = fail('planning-dor', defect('G7', 'high', { story: '42', location: 'item 2' }), defect('G7', 'high', { story: '42', location: 'item 3' }))
  const review = computeVerdict('refine', [dor, pass('planning-invest'), pass('planning-ac-quality')])
  assert.equal(review.verdict, 'REJECTED')
  assert.ok(review.synthesis.blocking_findings.some((f) => f.includes('G7 42')))
})

test('the strictest severity wins when two lenses rate the same place, and the dissent is recorded', () => {
  const review = computeVerdict('discuss', [
    fail('planning-dor', defect('G8', 'high', { story: 'S-3' })),
    fail('planning-ac-quality', defect('G8', 'blocker', { story: 'S-3' })),
    pass('planning-invest'), pass('planning-coherence'),
  ])
  assert.equal(review.verdict, 'REJECTED')
  assert.match(review.synthesis.dissent, /blocker applied/)
})

test('an unknown phase is refused', () => {
  assert.throws(() => computeVerdict('deliver', []), /unknown phase/)
})

test('the review file carries the verdict line and the JSON payload', () => {
  const review = computeVerdict('refine', allPass('refine'))
  const text = renderReview(review, { attempt: 2, reviewed: ['proposal.json'], date: '2026-10-09T10:00:00.000Z' })
  assert.match(text, /^<!-- markdownlint-disable-file -->\n# REFINE review — attempt 2\n\nverdict: APPROVED\n/)
  const payload = JSON.parse(text.split('```json\n')[1].split('\n```')[0])
  assert.equal(payload.phase, 'refine')
  assert.deepEqual(payload.artefacts_reviewed, ['proposal.json'])
})

test('arguments: a phase and at least one lens are required, and the attempt is a positive integer', () => {
  assert.throws(() => parseArgs(['--lens', 'a.json']), /--phase/)
  assert.throws(() => parseArgs(['--phase', 'refine']), /--lens/)
  assert.throws(() => parseArgs(['--phase', 'refine', '--lens', 'a', '--attempt', '0']), /positive/)
  assert.throws(() => parseArgs(['--phase', 'refine', '--lens']), /needs a value/)
  assert.throws(() => parseArgs(['--phase', 'refine', '--what']), /unknown argument/)
  assert.deepEqual(parseArgs(['--phase', 'refine', '--lens', 'a', '--reviewed', 'p', '--attempt', '3', '--out', 'o.md']),
    { lens: ['a'], reviewed: ['p'], phase: 'refine', attempt: 3, out: 'o.md' })
})

test('main maps the verdict to its exit code, writes the review and reports an unreadable lens as a problem', () => {
  const files = {
    'invest.json': JSON.stringify(pass('planning-invest')),
    'ac.json': JSON.stringify(pass('planning-ac-quality')),
    'dor.json': '{ not json',
  }
  const written = {}
  const lines = []
  const io = { read: (path) => files[path], write: (path, content) => { written[path] = content }, log: (line) => lines.push(line), error: () => {} }
  const code = main(['--phase', 'refine', '--lens', 'invest.json', '--lens', 'ac.json', '--lens', 'dor.json', '--out', 'r.md'], io)
  assert.equal(code, 3)
  assert.match(written['r.md'], /verdict: NEEDS_REWORK/)
  const summary = JSON.parse(lines[0])
  assert.equal(summary.verdict, 'NEEDS_REWORK')
  assert.ok(summary.problems.some((p) => p.includes('dor.json')))

  files['dor.json'] = JSON.stringify(pass('planning-dor'))
  assert.equal(main(['--phase', 'refine', '--lens', 'invest.json', '--lens', 'ac.json', '--lens', 'dor.json'], io), 0)
  files['dor.json'] = JSON.stringify(fail('planning-dor', defect('G7', 'blocker')))
  assert.equal(main(['--phase', 'refine', '--lens', 'invest.json', '--lens', 'ac.json', '--lens', 'dor.json'], io), 4)
  assert.equal(main(['--phase', 'nope', '--lens', 'x'], io), 1)
})
