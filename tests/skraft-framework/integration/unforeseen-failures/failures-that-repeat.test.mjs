import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NOMINAL, acceptanceWith, pipelineRepository, writeResult } from '../support/pipeline-repository.mjs'
import { agentsOf, checkWith, elapsedMs, eventsOf, findsNothingToChange, inWorkingCopy, lastOf, recorded, runFile, runOn } from './support/injected-run.mjs'

/** The system's temporary folders, which the engine names `<tmp>` in a failure; a machine whose TMPDIR points elsewhere prints a path it keeps. */
const SYSTEM_TMP = /^(?:\/tmp|(?:\/private)?\/var\/folders\/.+\/T|[A-Za-z]:\\Users\\[^\\]+\\AppData\\Local\\Temp)$/

test('a researcher that leaves its outputs missing the same way twice is stopped by the breaker after attempt 2, never dispatched a third time', async (t) => {
  const { cwd } = pipelineRepository(t)
  const leavesOutputs = (brief) => writeResult(brief, { status: 'done', summary: 'research written' })

  const { mod, outcome } = await runOn(cwd, { acts: { 'solution-researcher': [leavesOutputs, leavesOutputs, NOMINAL['solution-researcher']] } })

  const events = eventsOf(cwd)
  const attempts = recorded(events, 'research')
  assert.deepEqual([outcome.status, outcome.phase, outcome.code], ['blocked', 'RESEARCH', 'missing-outputs'])
  assert.match(outcome.reason, /^solution-researcher failed the same way on attempts 1 and 2: /)
  assert.deepEqual(attempts.map(({ attempt, outcome: result, code }) => [attempt, result, code]), [[1, 'failed', 'missing-outputs'], [2, 'failed', 'missing-outputs']])
  assert.equal(attempts[1].signature, attempts[0].signature)
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

test('a gate that fails the same way three times, its output printing another time, duration and temporary path at each run, waits on the blocked question at the third failure, all three signatures equal', { skip: !SYSTEM_TMP.test(tmpdir()) && 'the temporary folder of this machine is not one of the system\'s, which the engine names <tmp>' }, async (t) => {
  const { cwd } = pipelineRepository(t)
  const failing = checkWith([
    `if (${inWorkingCopy(cwd)}) {`,
    '  const cache = path.join(os.tmpdir(), `vitest-${Math.random().toString(36).slice(2)}`)',
    '  console.log(`${new Date().toISOString()} RUN tests/unit/check.mjs (cache ${cache})`)',
    '  console.error(`${new Date().toISOString()} FAIL check > pay answers the amount paid (${10 + Math.floor(Math.random() * 990)} ms)`)',
    '  process.exit(1)',
    '}',
  ].join('\n'))

  const { mod, dialogs, outcome } = await runOn(cwd, { acts: { 'acceptance-designer': [acceptanceWith(failing)], 'software-engineer': [NOMINAL['software-engineer'], findsNothingToChange, findsNothingToChange] } })

  const events = eventsOf(cwd)
  const gates = recorded(events, 'gates')
  const asked = lastOf(events, 'question.asked')
  const logs = events.filter((event) => event.type === 'gate.ran').map(({ evidence }) => readFileSync(runFile(cwd, evidence), 'utf8'))
  assert.deepEqual([outcome.status, outcome.phase, outcome.code], ['waiting', 'DELIVER', 'blocked'])
  assert.deepEqual(gates.map(({ visit, outcome: result, code }) => [visit, result, code]), [[1, 'fail', null], [2, 'fail', null], [3, 'fail', 'repeated-failure']])
  assert.match(gates[0].signature, /^[0-9a-f]{8}$/)
  assert.deepEqual(gates.map(({ signature }) => signature), [gates[0].signature, gates[0].signature, gates[0].signature])
  assert.equal(logs.length, 3)
  assert.ok(logs.every((log) => log.includes('FAIL check > pay answers the amount paid (')), logs.join('\n---\n'))
  assert.equal(new Set(logs).size, 3)
  assert.deepEqual([asked.kind, asked.step], ['blocked', 'deliver'])
  assert.ok(asked.text.startsWith('deliver is blocked: gates failed the same way 3 times since it last passed, so it does not send the work back again.\n'), asked.text)
  assert.deepEqual(agentsOf(mod.spawns), ['solution-researcher', 'solution-architect', 'acceptance-designer', 'software-engineer', 'software-engineer', 'software-engineer'])
  assert.deepEqual([dialogs.at(-1).header, dialogs.at(-1).spawns], ['Blocked', mod.spawns.length])
  t.diagnostic(`cost: 2 dispatches of the engineer (passes 2 and 3), none after the third failure; ${elapsedMs(gates[0], asked)} ms from the first failure to the blocked question`)
})
