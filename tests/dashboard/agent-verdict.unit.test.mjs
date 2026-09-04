import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'

import { agentByStimulus, agentSuiteVerdicts } from '../../eng/lib/agent-verdict.mjs'
import { verdictState } from '../../eng/lib/verdict.mjs'

const spec = `name: software-engineer-agent
type: capability
defaults:
  executor: skraft-agent-runner
scoring:
  threshold: 1
stimuli:
  - name: Missing DISTILL artifacts block implementation
    prompt: |
      Implement the requested behavior.
    tags:
      agent: software-engineer
      scenario: missing-preconditions
    graders:
      - type: completed
      - type: run-command
        config:
          name: RED checkpoint reported before implementation
  - name: Approved discount reaches GREEN
    tags:
      agent: reviewer
    graders:
      - type: completed
`

const trial = (overrides = {}) => ({
  type: 'trial-result',
  stimulus: 'Missing DISTILL artifacts block implementation',
  status: 'success',
  gradeResult: { passed: true, score: 1 },
  ...overrides,
})

describe('agentByStimulus', () => {
  it('maps each stimulus to the agent its tags name', () => {
    deepStrictEqual(
      [...agentByStimulus(spec).entries()],
      [
        ['Missing DISTILL artifacts block implementation', 'software-engineer'],
        ['Approved discount reaches GREEN', 'reviewer'],
      ],
    )
  })

  it('ignores nested list entries that are not stimuli', () => {
    strictEqual(agentByStimulus(spec).size, 2)
  })

  it('yields nothing for a spec with no stimuli block', () => {
    strictEqual(agentByStimulus('name: nothing\n').size, 0)
  })
})

describe('agentSuiteVerdicts', () => {
  const agents = agentByStimulus(spec)

  it('passes when every trial conforms', () => {
    const [result] = agentSuiteVerdicts([trial(), trial()], { agents })

    strictEqual(verdictState(result), 'pass')
    strictEqual(result.subject.kind, 'agent')
    strictEqual(result.subject.name, 'software-engineer')
    strictEqual(result.subject.path, 'plugins/skraft-framework/com.anthropic.claude-code/agents/software-engineer.md')
    strictEqual(result.trialCount, 2)
    strictEqual(result.netWin, 1)
  })

  it('reports a regression when a trial scored below the threshold', () => {
    const failing = trial({ gradeResult: { passed: false, score: 0.5 } })
    const [result] = agentSuiteVerdicts([trial(), failing], { agents })

    strictEqual(verdictState(result), 'regression')
    strictEqual(result.conformance.breaking, 1)
    strictEqual(result.netWin, 0)
  })

  it('is inconclusive when a trial errored, because it proves nothing', () => {
    const errored = trial({ status: 'error', gradeResult: null })
    const [result] = agentSuiteVerdicts([trial(), errored], { agents })

    strictEqual(verdictState(result), 'inconclusive')
    strictEqual(result.erroredCount, 1)
  })

  it('never reports an agent verdict as underpowered', () => {
    const [result] = agentSuiteVerdicts([trial()], { agents })

    strictEqual(result.underpowered, false)
    strictEqual(verdictState(result), 'pass')
  })

  it('emits one verdict per agent the suite exercised', () => {
    const other = trial({ stimulus: 'Approved discount reaches GREEN' })
    const names = agentSuiteVerdicts([trial(), other], { agents }).map((result) => result.subject.name)

    deepStrictEqual(names, ['reviewer', 'software-engineer'])
  })

  it('drops trials whose stimulus names no agent, rather than mis-attributing them', () => {
    const orphan = trial({ stimulus: 'Untagged scenario' })

    deepStrictEqual(agentSuiteVerdicts([orphan], { agents }), [])
  })

  it('ignores records that are not trial results', () => {
    const [result] = agentSuiteVerdicts([{ type: 'run-summary', passed: true }, trial()], { agents })

    strictEqual(result.trialCount, 1)
  })
})

describe('agent verdict diagnostics', () => {
  const agents = agentByStimulus(spec)
  const graded = (details, overrides = {}) =>
    trial({ gradeResult: { passed: false, score: 0.5, details }, ...overrides })

  it('names which grader gave way, and on how many trials', () => {
    const held = { name: 'completed', passed: true }
    const gaveWay = { name: 'The verdict is written where the pipeline reads it', passed: false, evidence: 'exit code 1' }
    const [result] = agentSuiteVerdicts([graded([held, gaveWay]), graded([held, { ...gaveWay, passed: true }])], { agents })

    deepStrictEqual(result.graders, [
      { name: 'completed', passed: 2, total: 2, evidence: null },
      { name: 'The verdict is written where the pipeline reads it', passed: 1, total: 2, evidence: 'exit code 1' },
    ])
  })

  it('counts only top-level graders, never a grader\'s own sub-checks', () => {
    const nested = { name: 'completed', passed: true, details: [{ name: 'has-output', passed: true }] }
    const [result] = agentSuiteVerdicts([graded([nested])], { agents })

    deepStrictEqual(result.graders.map((grader) => grader.name), ['completed'])
  })

  it('localises the break to the scenario that produced it', () => {
    const broke = trial({ gradeResult: { passed: false, score: 0 } })
    const [result] = agentSuiteVerdicts([trial(), broke, trial()], { agents, threshold: 1 })
    const [scenario] = result.scenarios

    strictEqual(scenario.conforming, 2)
    strictEqual(scenario.trialCount, 3)
  })

  it('prices a run from the median of the trials that ran', () => {
    const priced = (totalTokens, durationMs) =>
      trial({ durationMs, trajectory: { metrics: { tokenUsage: { totalTokens }, turnCount: 4, toolCallCount: 9 } } })
    const [result] = agentSuiteVerdicts([priced(1000, 10), priced(3000, 30), priced(2000, 20)], { agents })

    strictEqual(result.efficiency.tokens, 2000)
    strictEqual(result.efficiency.durationMs, 20)
    strictEqual(result.efficiency.turns, 4)
    strictEqual(result.efficiency.toolCalls, 9)
  })

  it('leaves an errored trial out of the price, since it did not do the work', () => {
    const ran = trial({ durationMs: 100, trajectory: { metrics: { tokenUsage: { totalTokens: 5000 } } } })
    const died = trial({ status: 'error', durationMs: 1, gradeResult: null, trajectory: { metrics: { tokenUsage: { totalTokens: 10 } } } })
    const [result] = agentSuiteVerdicts([ran, died], { agents })

    strictEqual(result.efficiency.tokens, 5000)
  })

  it('reports no price at all when every trial errored', () => {
    const died = trial({ status: 'error', gradeResult: null })

    strictEqual(agentSuiteVerdicts([died], { agents })[0].efficiency, null)
  })

  it('records which descriptor revision the run measured', () => {
    const dispatched = (sha256) => trial({ trajectory: { metadata: { agent: { sha256 } } } })
    const [result] = agentSuiteVerdicts([dispatched('abc123'), dispatched('abc123')], { agents })

    strictEqual(result.descriptorSha, 'abc123')
  })

  it('names no revision when the trials measured two different ones', () => {
    const dispatched = (sha256) => trial({ trajectory: { metadata: { agent: { sha256 } } } })
    const [result] = agentSuiteVerdicts([dispatched('abc123'), dispatched('def456')], { agents })

    strictEqual(result.descriptorSha, null)
  })

  it('names no revision when the run recorded none', () => {
    strictEqual(agentSuiteVerdicts([trial()], { agents })[0].descriptorSha, null)
  })
})
