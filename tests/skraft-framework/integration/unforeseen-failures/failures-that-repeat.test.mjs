import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { NOMINAL, acceptanceWith, pipelineRepository, writeResult } from '../support/pipeline-repository.mjs'
import { agentsOf, checkWith, elapsedMs, eventsOf, findsNothingToChange, inWorkingCopy, lastOf, recorded, runOn } from './support/injected-run.mjs'

test('a researcher that leaves its outputs missing with the same signature twice stops without a third dispatch or a human question', async (t) => {
  const { cwd } = pipelineRepository(t)
  const leavesOutputs = (brief) => writeResult(brief, { status: 'done', summary: 'research written' })

  const { mod, dialogs, outcome } = await runOn(cwd, { acts: { 'solution-researcher': [leavesOutputs, leavesOutputs, NOMINAL['solution-researcher']] } })

  const events = eventsOf(cwd)
  const attempts = recorded(events, 'research')
  assert.equal(attempts[0].incidents[0].signature, attempts[1].incidents[0].signature)
  assert.deepEqual(attempts.map(({ incidents }) => incidents.map(({ attempts: count }) => count)), [[1], [2]])
  assert.deepEqual([outcome.status, outcome.phase, outcome.code], ['blocked', 'RESEARCH', 'repeated-failure'])
  assert.match(outcome.reason, /^research stopped after 2 occurrences of failure signature /)
  assert.deepEqual(attempts.map(({ attempt, outcome: result, code }) => [attempt, result, code]), [[1, 'failed', 'missing-outputs'], [2, 'failed', 'repeated-failure']])
  assert.deepEqual(agentsOf(mod.spawns), ['solution-researcher', 'solution-researcher'])
  assert.deepEqual(dialogs, [])
  const stop = lastOf(events, 'run.finished')
  assert.equal(stop.status, 'blocked')
  t.diagnostic(`cost: 2 dispatches of the researcher, 1 of them the retry, none a third; ${elapsedMs(attempts[0], stop)} ms from the first refused attempt to the stop`)
})
