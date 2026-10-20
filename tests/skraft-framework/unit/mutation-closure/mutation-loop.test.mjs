import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ScriptedMachine } from '../support/in-memory-host.mjs'
import { agent, API, scripted, SLUG, tddCycle } from '../support/pipeline-host.mjs'
import { strykerReport } from '../support/mutation-reports.mjs'

/** The api component, mutated by Stryker.NET. */
const MUTATED = { ...API, commands: { ...API.commands, mutation: 'dotnet stryker' } }
const REPORT = 'StrykerOutput/reports/mutation-report.json'
const STRYKER = '. $ dotnet stryker'
const upToDeliver = (it) => [agent()(it), agent()(it), agent()(it), agent({ work: tddCycle() })(it)]
const recorded = (host, step) => host.events().filter((event) => event.type === 'step.recorded' && event.step === step)
const killTest = (file) => ({ git }) => git.commit(`test(${SLUG}): kill the mutants of ${file}`, [`tests/${file}Tests.cs`])

/**
 * A mutation run that fails the first time, leaving the report it writes, then passes.
 * @param {Record<string, Array<[number, string, string | null, string]>>} survivors
 */
const mutationFailingOnce = (host, survivors) => {
  host.machine.exits[STRYKER] = 1
  host.machine.meanwhile[STRYKER] = async () => {
    await host.workspace.write(REPORT, strykerReport(survivors))
    host.machine.meanwhile[STRYKER] = () => { host.machine.exits[STRYKER] = 0 }
  }
}

test('surviving mutants send the run to one dispatch per file, then test-integrity, then the gates again until mutation passes', async () => {
  const host = scripted({ components: [MUTATED], machine: new ScriptedMachine() }, (it) => [...upToDeliver(it), agent({ work: killTest('Checkout') })(it), agent({ work: killTest('Refund') })(it)])
  mutationFailingOnce(host, {
    'src/Checkout.cs': [[12, 'Equality', '!=', 'Survived'], [20, 'Boolean', 'false', 'NoCoverage'], [31, 'String', null, 'Killed']],
    'src/Refund.cs': [[7, 'Arithmetic', '-', 'Survived']],
  })

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  const kills = host.agentRunner.dispatches.slice(4)
  assert.deepEqual(kills.map(({ agent: name, label }) => [name, label]), [
    ['software-engineer', `skraft ${SLUG} · kill_mutants · group 1 of 2 · attempt 1`],
    ['software-engineer', `skraft ${SLUG} · kill_mutants · group 2 of 2 · attempt 1`],
  ])
  assert.ok(kills[0].prompt.includes([
    'Kill the surviving mutants of src/Checkout.cs (group 1 of 2):',
    '- src/Checkout.cs:12 Equality (!=) survived',
    '- src/Checkout.cs:20 Boolean (false) has no test covering it',
  ].join('\n')), kills[0].prompt)
  assert.ok(kills[1].prompt.includes('Kill the surviving mutants of src/Refund.cs (group 2 of 2):\n- src/Refund.cs:7 Arithmetic (-) survived'), kills[1].prompt)
  assert.ok(!kills[1].prompt.includes('src/Checkout.cs:12'), kills[1].prompt)
  assert.deepEqual(recorded(host, 'mutation').map(({ visit, outcome: result, next, survivors }) => [visit, result, next, survivors]), [
    [1, 'fail', 'kill_mutants', [
      { file: 'src/Checkout.cs', mutants: ['src/Checkout.cs:12 Equality (!=) survived', 'src/Checkout.cs:20 Boolean (false) has no test covering it'] },
      { file: 'src/Refund.cs', mutants: ['src/Refund.cs:7 Arithmetic (-) survived'] },
    ]],
    [2, 'pass', 'deliver_review', []],
  ])
  assert.deepEqual(recorded(host, 'kill_mutants').map(({ visit, group, attempt, outcome: result, next }) => [visit, group, attempt, result, next]), [
    [1, 1, 1, 'done', null],
    [1, 2, 1, 'done', 'mutation_review'],
  ])
  assert.deepEqual(recorded(host, 'mutation_review').map(({ outcome: result, next }) => [result, next]), [['approved', 'gates']])
  assert.ok(host.agentRunner.reviewed().some((dispatch) => dispatch.agent === 'test-integrity-lens' && dispatch.label.includes('mutation_review')))
  assert.deepEqual(host.events().filter((event) => event.type === 'gate.ran' && event.gate === 'mutation').map(({ status, survivors }) => [status, survivors]), [['fail', 3], ['pass', null]])
})
