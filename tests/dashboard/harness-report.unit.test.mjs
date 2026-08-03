import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'

import { harnessModel, tallyHarnessReport, verdictFromHarnessReport } from '../../eng/lib/harness-report.mjs'

const agent = { kind: 'agent', name: 'skraft-orchestrator', path: 'plugins/agents/skraft-orchestrator.agent.md' }
const scenario = (winner, extra = {}) => ({ name: `scenario ${winner}`, winner, ...extra })

describe('harness tally', () => {
  it('reads a win for the agent, a loss for the baseline, and a tie as neither', () => {
    const tally = tallyHarnessReport({ scenarios: [scenario('WithSkill'), scenario('Baseline'), scenario('Tie')] })

    deepStrictEqual(tally, { wins: 1, ties: 1, losses: 1, unrecognised: 0, trialCount: 3 })
  })

  it('is not confused by the casing the harness happens to emit', () => {
    const tally = tallyHarnessReport({ scenarios: [scenario('withskill'), scenario('BASELINE')] })

    strictEqual(tally.wins, 1)
    strictEqual(tally.losses, 1)
  })

  it('counts an unknown winner as unrecognised rather than as a tie', () => {
    const tally = tallyHarnessReport({ scenarios: [scenario('WithSkill'), scenario('Inconclusive')] })

    strictEqual(tally.unrecognised, 1)
    strictEqual(tally.ties, 0)
  })

  it('tallies an empty report to nothing', () => {
    deepStrictEqual(tallyHarnessReport({}), { wins: 0, ties: 0, losses: 0, unrecognised: 0, trialCount: 0 })
  })
})

describe('harness verdict', () => {
  it('passes an agent that credibly beat the baseline', () => {
    const scenarios = [...Array(8)].map(() => scenario('WithSkill'))
    const verdict = verdictFromHarnessReport({ skill: 'skraft-orchestrator', scenarios }, agent)

    strictEqual(verdict.passed, true)
    strictEqual(verdict.subject.kind, 'agent')
    strictEqual(verdict.subject.name, 'skraft-orchestrator')
    strictEqual(verdict.trialCount, 8)
  })

  it('refuses to conclude when a scenario winner could not be read', () => {
    const scenarios = [...Array(7)].map(() => scenario('WithSkill'))
    scenarios.push(scenario('???'))
    const verdict = verdictFromHarnessReport({ scenarios }, agent)

    strictEqual(verdict.conclusive, false)
    strictEqual(verdict.passed, false)
  })

  it('refuses to call a three-scenario sweep credible', () => {
    const scenarios = [...Array(3)].map(() => scenario('WithSkill'))
    const verdict = verdictFromHarnessReport({ scenarios }, agent)

    strictEqual(verdict.underpowered, true)
    strictEqual(verdict.passed, false)
  })

  it('names every scenario it judged so the verdict can be read back', () => {
    const verdict = verdictFromHarnessReport({ scenarios: [scenario('WithSkill'), scenario('Baseline')] }, agent)

    deepStrictEqual(
      verdict.scenarios.map((entry) => entry.scenarioName),
      ['scenario WithSkill', 'scenario Baseline'],
    )
  })
})

describe('harness model', () => {
  it('reports the model the harness recorded', () => {
    strictEqual(harnessModel({ scenarios: [scenario('WithSkill', { model: 'claude-sonnet-5' })] }), 'claude-sonnet-5')
  })

  it('says the model is unknown rather than guessing one', () => {
    strictEqual(harnessModel({ scenarios: [scenario('WithSkill')] }), 'unknown')
  })
})
