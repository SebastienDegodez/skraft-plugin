import { deepStrictEqual, match, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'

import { compareAgentArms, renderAgentComparison, toolSpans, trialProfile } from '../../eng/lib/agent-ab.mjs'

const at = (second) => new Date(Date.UTC(2026, 10, 19, 10, 0, second)).toISOString()

const bash = (id, command, start, end, output = 'ok') => [
  { type: 'tool_call', timestamp: at(start), data: { toolName: 'bash', toolCallId: id, arguments: { command } } },
  { type: 'tool_result', timestamp: at(end), data: { toolName: 'bash', toolCallId: id, result: { content: output } } },
]

const trial = ({ stimulus = 'story', score = 1, passed = true, durationMs = 60_000, tokens = 1000, events = [], cost }) => ({
  type: 'trial-result',
  stimulus,
  durationMs,
  gradeResult: { score, passed },
  trajectory: {
    events,
    metrics: {
      tokenUsage: { totalTokens: tokens, inputTokens: tokens - 100, outputTokens: 100, cacheReadTokens: 0, ...(cost != null && { cost: { amount: cost } }) },
      turnCount: 3,
      toolCallCount: events.filter(({ type }) => type === 'tool_call').length,
    },
  },
})

describe('A/B agent comparison', () => {
  it('pairs tool calls with their results and times them', () => {
    const spans = toolSpans([...bash('a', 'dotnet test X.slnx', 0, 12, 'Passed!'), ...bash('b', 'git status', 13, 14)])

    deepStrictEqual(spans, [
      { toolName: 'bash', command: 'dotnet test X.slnx', durationMs: 12_000, outputChars: 7 },
      { toolName: 'bash', command: 'git status', durationMs: 1_000, outputChars: 2 },
    ])
  })

  it('separates test time and model time in a trial', () => {
    const profile = trialProfile(trial({
      events: [
        ...bash('a', 'dotnet test X.slnx --filter Foo', 0, 10, 'x'.repeat(40)),
        ...bash('b', 'git commit -m "feat: x"', 11, 12),
        ...bash('c', 'npx vitest run', 20, 25, 'y'.repeat(10)),
      ],
      cost: 900,
    }))

    strictEqual(profile.testRuns, 2)
    strictEqual(profile.testMs, 15_000)
    strictEqual(profile.testOutputChars, 50)
    strictEqual(profile.toolMs, 16_000)
    strictEqual(profile.modelMs, 44_000)
    strictEqual(profile.costNanoAiu, 900)
  })

  it('reports an improvement when the candidate is cheaper and quality holds', () => {
    const comparison = compareAgentArms({
      control: [trial({ tokens: 2000, durationMs: 100_000 }), trial({ tokens: 2200, durationMs: 120_000 })],
      candidate: [trial({ tokens: 1000, durationMs: 50_000 }), trial({ tokens: 1100, durationMs: 60_000 })],
    })

    strictEqual(comparison.verdict, 'improved')
    strictEqual(comparison.overall.deltaPercent.totalTokens, -50)
    strictEqual(comparison.overall.deltaPercent.durationMs, -50)
    strictEqual(comparison.underpowered, true)
  })

  it('calls a faster candidate that loses score a quality regression', () => {
    const comparison = compareAgentArms({
      control: [trial({ score: 1, tokens: 2000 })],
      candidate: [trial({ score: 0.8, passed: false, tokens: 500 })],
    })

    strictEqual(comparison.verdict, 'quality-regression')
    strictEqual(comparison.stimuli[0].qualityHeld, false)
  })

  it('treats a stimulus missing from one arm as a regression', () => {
    const comparison = compareAgentArms({
      control: [trial({ stimulus: 'a' }), trial({ stimulus: 'b' })],
      candidate: [trial({ stimulus: 'a' })],
    })

    strictEqual(comparison.verdict, 'quality-regression')
  })

  it('reports no gain when cost and time do not move', () => {
    const comparison = compareAgentArms({ control: [trial({})], candidate: [trial({})] })

    strictEqual(comparison.verdict, 'no-gain')
  })

  it('renders both refs and the deltas in markdown', () => {
    const comparison = compareAgentArms({
      control: [trial({ tokens: 2000 })],
      candidate: [trial({ tokens: 1000 })],
    })

    const markdown = renderAgentComparison(comparison, { controlRef: 'main', candidateRef: 'perf' })

    match(markdown, /## A\/B agent — main → perf/)
    match(markdown, /\| Tokens \| 2000 \| 1000 \| -50 % \|/)
  })
})
