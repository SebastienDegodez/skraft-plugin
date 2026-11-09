import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { NOMINAL, acceptanceWith, pipelineRepository, writeResult } from '../support/pipeline-repository.mjs'
import { agentsOf, checkWith, elapsedMs, eventsOf, findsNothingToChange, inWorkingCopy, lastOf, recorded, runOn } from './support/injected-run.mjs'

test('a researcher that leaves its outputs missing the same way twice is stopped by the breaker after attempt 2, never dispatched a third time', async (t) => {
  const { cwd } = pipelineRepository(t)
  const leavesOutputs = (brief) => writeResult(brief, { status: 'done', summary: 'research written' })

  const { mod, outcome } = await runOn(cwd, { acts: { 'solution-researcher': [leavesOutputs, leavesOutputs, NOMINAL['solution-researcher']] } })

  const events = eventsOf(cwd)
  const attempts = recorded(events, 'research')
  assert.deepEqual([outcome.status, outcome.phase, outcome.code], ['blocked', 'RESEARCH', 'missing-outputs'])
  assert.match(outcome.reason, /^solution-researcher failed the same way on attempts 1 and 2: /)
  assert.deepEqual(attempts.map(({ attempt, outcome: result, code }) => [attempt, result, code]), [[1, 'failed', 'missing-outputs'], [2, 'failed', 'missing-outputs']])
  assert.deepEqual(agentsOf(mod.spawns), ['solution-researcher', 'solution-researcher'])
  const stop = lastOf(events, 'run.finished')
  assert.equal(stop.status, 'blocked')
  t.diagnostic(`cost: 2 dispatches of the researcher, 1 of them the retry, none a third; ${elapsedMs(attempts[0], stop)} ms from the first refused attempt to the stop`)
})

test('a gate that fails once then passes sends the work back once, and the run completes', async (t) => {
  const { cwd } = pipelineRepository(t)
  const ran = join(cwd, '..', 'gate-ran-once')
  const flaky = checkWith([
    `if (${inWorkingCopy(cwd)} && !fs.existsSync(${JSON.stringify(ran)})) {`,
    `  fs.writeFileSync(${JSON.stringify(ran)}, 'ran')`,
    "  console.error('Error: read ECONNRESET')",
    '  process.exit(1)',
    '}',
  ].join('\n'))

  const { mod, outcome } = await runOn(cwd, { acts: { 'acceptance-designer': [acceptanceWith(flaky)], 'software-engineer': [NOMINAL['software-engineer'], findsNothingToChange] } })

  const events = eventsOf(cwd)
  const gates = recorded(events, 'gates')
  assert.deepEqual(outcome, { status: 'done', slug: 'checkout', phase: 'PUBLISH', code: null, reason: 'PUBLISH closed' })
  assert.deepEqual(gates.map(({ visit, outcome: result, code, next }) => [visit, result, code, next]), [[1, 'fail', null, 'deliver'], [2, 'pass', null, 'deliver_review']])
  assert.deepEqual(events.filter((event) => event.type === 'gate.ran').map(({ gate, status }) => `${gate} ${status}`), ['test fail', 'test pass', 'mutation pass'])
  assert.deepEqual(agentsOf(mod.spawns), ['solution-researcher', 'solution-architect', 'acceptance-designer', 'software-engineer', 'software-engineer', 'pr-writer'])
  t.diagnostic(`cost: 1 dispatch of the engineer (pass 2); ${elapsedMs(gates[0], gates[1])} ms from the flaky failure to the gates passing, no stop`)
})
