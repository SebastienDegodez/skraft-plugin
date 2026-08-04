import { deepStrictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildEvaluationMetrics } from '../../eng/lib/vally-metrics.mjs'

const trial = ({
  variant,
  stimulus,
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
    })
  })
})