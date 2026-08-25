import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildEvaluationMetrics } from '../../eng/lib/vally-metrics.mjs'

const trial = ({
  variant,
  stimulus,
  trialIndex = 0,
  score,
  durationMs,
  tokens,
  turns,
  toolCalls,
  activated = false,
  nonActivation = false,
}) => ({
  type: 'trial-result',
  variant,
  stimulus,
  trialIndex,
  durationMs,
  gradeResult: { score },
  trajectory: {
    stimulus: { name: stimulus, tags: nonActivation ? { intent: 'non-activation' } : {} },
    metrics: {
      tokenUsage: { totalTokens: tokens },
      turnCount: turns,
      toolCallCount: toolCalls,
      skillActivationBreakdown: activated ? { 'outside-in-tdd': 1 } : {},
    },
  },
})

describe('Vally dashboard metrics', () => {
  it('shows quality lift, activation discipline and efficiency deltas', () => {
    const baseline = [
      trial({ variant: 'baseline', stimulus: 'read only', score: 1, durationMs: 100, tokens: 100, turns: 1, toolCalls: 0, nonActivation: true }),
      trial({ variant: 'baseline', stimulus: 'boundary', score: 0.5, durationMs: 200, tokens: 200, turns: 3, toolCalls: 2 }),
      trial({ variant: 'baseline', stimulus: 'rule', score: 0.5, durationMs: 300, tokens: 300, turns: 5, toolCalls: 4 }),
    ]
    const skilled = [
      trial({ variant: 'skilled', stimulus: 'read only', score: 1, durationMs: 80, tokens: 110, turns: 1, toolCalls: 0, nonActivation: true }),
      trial({ variant: 'skilled', stimulus: 'boundary', score: 1, durationMs: 120, tokens: 140, turns: 2, toolCalls: 1, activated: true }),
      trial({ variant: 'skilled', stimulus: 'rule', score: 1, durationMs: 360, tokens: 600, turns: 6, toolCalls: 8, activated: true }),
    ]

    deepStrictEqual(buildEvaluationMetrics(baseline, skilled, 'outside-in-tdd'), {
      quality: { baseline: 0.667, skilled: 1, delta: 0.333 },
      activation: { expected: 2, actual: 2, unexpected: 0, rate: 1 },
      efficiency: {
        baseline: { durationMs: 200, tokens: 200, turns: 3, toolCalls: 2 },
        skilled: { durationMs: 120, tokens: 140, turns: 2, toolCalls: 1 },
        durationDeltaPercent: -40,
        tokenDeltaPercent: -30,
      },
      // Same runs on both sides, guard stimulus dropped: the unconditional block
      // reads -30% tokens because its two medians land on different scenarios.
      efficiencyPaired: {
        pairCount: 2,
        baseline: { durationMs: 250, tokens: 250, turns: 4, toolCalls: 3 },
        skilled: { durationMs: 240, tokens: 370, turns: 4, toolCalls: 4.5 },
        durationDeltaPercent: -4,
        tokenDeltaPercent: 48,
      },
    })
  })

  it('prices the skill only on the runs that actually loaded it', () => {
    const baseline = [
      trial({ variant: 'baseline', stimulus: 'boundary', score: 0.5, durationMs: 200, tokens: 200, turns: 3, toolCalls: 2 }),
      trial({ variant: 'baseline', stimulus: 'rule', score: 0.5, durationMs: 1000, tokens: 1000, turns: 9, toolCalls: 9 }),
    ]
    const skilled = [
      trial({ variant: 'skilled', stimulus: 'boundary', score: 1, durationMs: 300, tokens: 400, turns: 5, toolCalls: 6, activated: true }),
      // The skill never loaded here, so this pair is a baseline against a
      // baseline — and a cheap one, which is exactly what drags the
      // unconditional median down.
      trial({ variant: 'skilled', stimulus: 'rule', score: 0.5, durationMs: 100, tokens: 100, turns: 1, toolCalls: 1 }),
    ]

    const metrics = buildEvaluationMetrics(baseline, skilled, 'outside-in-tdd')

    strictEqual(metrics.efficiency.tokenDeltaPercent, -58.3)
    deepStrictEqual(metrics.efficiencyPaired, {
      pairCount: 1,
      baseline: { durationMs: 200, tokens: 200, turns: 3, toolCalls: 2 },
      skilled: { durationMs: 300, tokens: 400, turns: 5, toolCalls: 6 },
      durationDeltaPercent: 50,
      tokenDeltaPercent: 100,
    })
  })

  it('ignores a run with no counterpart on the other arm', () => {
    const baseline = [
      trial({ variant: 'baseline', stimulus: 'boundary', score: 0.5, durationMs: 200, tokens: 200, turns: 3, toolCalls: 2 }),
    ]
    const skilled = [
      trial({ variant: 'skilled', stimulus: 'boundary', score: 1, durationMs: 300, tokens: 400, turns: 5, toolCalls: 6, activated: true }),
      // No baseline replayed this stimulus: there is nothing to compare it to.
      trial({ variant: 'skilled', stimulus: 'rule', score: 1, durationMs: 9000, tokens: 9000, turns: 90, toolCalls: 90, activated: true }),
    ]

    const metrics = buildEvaluationMetrics(baseline, skilled, 'outside-in-tdd')

    strictEqual(metrics.efficiencyPaired.pairCount, 1)
    deepStrictEqual(metrics.efficiencyPaired.skilled, { durationMs: 300, tokens: 400, turns: 5, toolCalls: 6 })
    strictEqual(metrics.efficiencyPaired.tokenDeltaPercent, 100)
  })

  it('publishes no paired figure rather than a fabricated zero when nothing qualifies', () => {
    const baseline = [
      trial({ variant: 'baseline', stimulus: 'boundary', score: 0.5, durationMs: 200, tokens: 200, turns: 3, toolCalls: 2 }),
    ]
    const skilled = [
      trial({ variant: 'skilled', stimulus: 'boundary', score: 0.5, durationMs: 210, tokens: 220, turns: 3, toolCalls: 2 }),
    ]

    const metrics = buildEvaluationMetrics(baseline, skilled, 'outside-in-tdd')

    strictEqual(metrics.efficiencyPaired, null)
  })
})