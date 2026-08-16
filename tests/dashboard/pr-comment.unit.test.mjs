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
  it('renders one row per changed skill with score, sign test and deltas', () => {
    const comment = buildPrComment(results(verdict()))
    ok(comment.includes('outside-in-tdd'))
    ok(comment.includes('0.82'))
    ok(comment.includes('8W/1T/0L'))
    ok(comment.includes('+0.320'))
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
