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
    strictEqual(result.subject.path, 'plugins/skraft-framework/agents/software-engineer.agent.md')
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
