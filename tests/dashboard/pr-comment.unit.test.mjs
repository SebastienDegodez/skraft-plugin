import { ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildPrComment, hasRegression } from '../../eng/lib/pr-comment.mjs'

const verdict = (overrides = {}) => ({
  subject: { kind: 'skill', name: 'outside-in-tdd', path: 'plugins/skraft-framework/skills/outside-in-tdd' },
  conclusive: true,
  underpowered: false,
  passed: true,
  regressed: false,
  reason: 'credibly better (8W/1T/0L, sign test p=0.004)',
  signTest: { wins: 8, ties: 1, losses: 0, pValue: 0.004 },
  meanScore: 0.82,
  confidenceInterval: { low: 0.7, high: 0.9 },
  metrics: {
    quality: { baseline: 0.5, skilled: 0.82, delta: 0.32 },
    efficiency: { tokenDeltaPercent: -12.3, durationDeltaPercent: 5.1 },
  },
  ...overrides,
})

const results = (...verdicts) => [{ runner: 'vally', model: 'gpt-5.6-luna', verdicts }]

describe('hasRegression', () => {
  it('is false when every verdict passed', () => {
    strictEqual(hasRegression(results(verdict())), false)
  })

  it('is true when a verdict regressed', () => {
    strictEqual(hasRegression(results(verdict({ passed: false, regressed: true }))), true)
  })

  it('is false for inconclusive/underpowered verdicts', () => {
    strictEqual(hasRegression(results(verdict({ passed: false, underpowered: true, conclusive: false }))), false)
  })

  it('is false when there is no verdict at all', () => {
    strictEqual(hasRegression([]), false)
  })

  it('ignores agent verdicts, only skills block a PR', () => {
    const agentVerdict = verdict({ subject: { kind: 'agent', name: 'some-agent' }, passed: false, regressed: true })
    strictEqual(hasRegression(results(agentVerdict)), false)
  })
})

describe('buildPrComment', () => {
  it('renders one row per changed skill with both tests and the grader deltas', () => {
    const comment = buildPrComment(results(verdict()))
    ok(comment.includes('outside-in-tdd'))
    ok(comment.includes('8W/1T/0L'))
    ok(comment.includes('+0.320'))
  })

  it('shows the grader means and the rank test when the tally came from the graders', () => {
    const comment = buildPrComment(
      results(
        verdict({
          signTest: { wins: 2, ties: 1, losses: 1, pValue: 1, source: 'graders' },
          wilcoxon: { available: true, pValue: 0.5 },
          graderScores: { baselineMean: 0.531, skilledMean: 0.836, medianDelta: 0.313 },
        }),
      ),
    )
    ok(comment.includes('0.531 → 0.836'))
    ok(comment.includes('+0.305'))
    ok(comment.includes('p=0.500'))
  })

  it('leaves the rank test empty on a judge-only comparison, which carries no magnitude', () => {
    const comment = buildPrComment(results(verdict({ wilcoxon: { available: false, pValue: null } })))
    ok(comment.includes('| — |'))
  })

  it('flags an excluded pair and a partial activation rate below the table', () => {
    const comment = buildPrComment(
      results(
        verdict({
          inactivatedCount: 1,
          signTest: { wins: 2, ties: 1, losses: 1, pValue: 1, source: 'graders' },
          judgeTally: { wins: 2, ties: 1, losses: 2 },
          metrics: {
            quality: { baseline: 0.5, skilled: 0.82, delta: 0.32 },
            efficiency: { tokenDeltaPercent: 5.3, durationDeltaPercent: -19.1 },
            activation: { rate: 0.8 },
          },
        }),
      ),
    )
    ok(comment.includes('the skill never loaded'))
    ok(comment.includes('80%'))
    ok(comment.includes('2W/1T/2L'))
  })

  it('names the stimuli the skill never loaded on, so the gap is actionable', () => {
    const comment = buildPrComment(
      results(
        verdict({
          inactivatedCount: 3,
          graderPairs: [
            { stimulus: 'Apply Mandate 1', outcome: 'inactivated' },
            { stimulus: 'Apply Mandate 1', outcome: 'inactivated' },
            { stimulus: 'Apply Mandate 4', outcome: 'win' },
            { stimulus: 'Apply Mandate 4', outcome: 'tie' },
            { stimulus: 'Build a matrix', outcome: 'inactivated' },
          ],
        }),
      ),
    )

    ok(comment.includes('Apply Mandate 1 (0/2)'))
    ok(comment.includes('Build a matrix (0/1)'))
    // Loaded at least once, so it is a reliability question, not a wording gap.
    ok(!comment.includes('Apply Mandate 4 (0/'))
  })

  it('says where the ties landed rather than leaving them a bare count', () => {
    const comment = buildPrComment(results(verdict({ tieBreakdown: { ceiling: 2, middle: 3, floor: 0 } })))

    ok(comment.includes('2 at the ceiling'))
    ok(comment.includes('3 in the same grader bucket'))
    ok(!comment.includes('at the floor'))
  })

  it('shows a dash instead of crashing on a null score', () => {
    const comment = buildPrComment(results(verdict({ meanScore: null, confidenceInterval: null, metrics: null })))
    ok(comment.includes('—'))
  })

  it('says so when no verdict was produced at all', () => {
    ok(buildPrComment([]).toLowerCase().includes('no verdict'))
  })

  it('renders agent conformance in its own section, with no sign test', () => {
    const agentVerdict = {
      subject: { kind: 'agent', name: 'software-engineer', path: 'plugins/skraft-framework/agents/software-engineer.agent.md' },
      conclusive: true,
      underpowered: false,
      passed: true,
      regressed: false,
      conformance: { threshold: 1, conforming: 2, breaking: 0, trialCount: 2 },
      trialCount: 2,
      meanScore: 1,
      reason: 'conforms on every trial (2/2 at or above 1)',
    }
    const comment = buildPrComment(results(agentVerdict))

    ok(comment.includes('Agent conformance'))
    ok(comment.includes('software-engineer'))
    ok(comment.includes('2/2'))
    ok(!comment.includes('Sign test'))
  })

  it('renders both sections when a PR changed a skill and an agent suite', () => {
    const agentVerdict = {
      subject: { kind: 'agent', name: 'software-engineer' },
      conclusive: true,
      passed: true,
      conformance: { threshold: 1, conforming: 1, breaking: 0, trialCount: 1 },
      trialCount: 1,
      reason: 'conforms on every trial (1/1 at or above 1)',
    }
    const comment = buildPrComment(results(verdict(), agentVerdict))

    ok(comment.includes('Skill evaluation'))
    ok(comment.includes('Agent conformance'))
  })
})
