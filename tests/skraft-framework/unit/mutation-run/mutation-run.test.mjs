import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, pipelineHost, SLUG } from '../support/pipeline-host.mjs'
import { mutants, strykerReport } from '../support/mutation-reports.mjs'
import { BUILT_IN_MUTATION, BUILT_IN_WORKFLOW } from '../support/in-memory-host.mjs'

/** A mutation run: the plugin's mutation workflow, apart from any story's pipeline. */
const mutationRun = (options = {}) => pipelineHost({ follows: 'mutation', ...options })

test('a mutation run follows the plugin\'s mutation workflow: each component\'s mutation command runs, and a run whose scopes reach the bar ends there', async () => {
  const host = mutationRun()

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(host.machine.lines(), ['. $ dotnet stryker'])
  assert.deepEqual(host.events().filter((event) => event.type === 'step.recorded').map(({ step, outcome: result, next }) => [step, result, next]), [['mutation', 'pass', 'exit']])
  assert.deepEqual(host.agentRunner.dispatches, [])
  assert.equal(host.slug, SLUG)
})

test('a mutation run follows .skraft/mutation.skraft.dot when the working copy ejected it, never its ejected pipeline', async () => {
  const pipeline = BUILT_IN_WORKFLOW.replace('graph [', 'graph [skraft_version="2.0.0", ')
  const ejected = BUILT_IN_MUTATION.replace('mutation      [shape=parallelogram, gate="mutation", goal_gate=true, locked=true, phase="DELIVER"]', 'mutation      [shape=parallelogram, gate="mutation", goal_gate=true, locked=true, unlock="the team runs mutation in its own CI", phase="DELIVER"]')
  const host = mutationRun({ files: { '.skraft/pipeline.skraft.dot': pipeline, '.skraft/mutation.skraft.dot': ejected } })

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(host.machine.lines(), [])
  assert.deepEqual(host.events()[0].unlocked, [{ node: 'mutation', reason: 'the team runs mutation in its own CI' }])
})

const STRYKER = '. $ dotnet stryker'
const RESULT = 'gates/api/mutation-1.result.json'

/** The mutation command writes `result` where SKRAFT_MUTATION_RESULT says, and leaves a native report whose every mutant survives. */
const writesResult = (host, result) => {
  host.machine.meanwhile[STRYKER] = async () => {
    assert.equal(host.machine.envs.at(-1).SKRAFT_MUTATION_RESULT, host.tracking.location(SLUG, RESULT))
    await host.tracking.write(SLUG, RESULT, typeof result === 'string' ? result : JSON.stringify(result))
    await host.workspace.write('StrykerOutput/reports/mutation-report.json', strykerReport({ 'src/Checkout.cs': mutants(4, 'Survived') }))
  }
}

test('the result the command writes to the file SKRAFT_MUTATION_RESULT names is what is judged, its own report aside: each scope reaches 80', async () => {
  const host = mutationRun()
  writesResult(host, { scopes: [{ name: 'core', score: 80 }, { name: 'boundary', score: 92.5 }] })

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  const [ran] = host.events().filter((event) => event.type === 'gate.ran')
  assert.deepEqual([ran.status, ran.survivors, ran.scores], ['pass', null, [
    { scope: 'core', bar: 80, score: 80, counted: null, survivors: [] },
    { scope: 'boundary', bar: 80, score: 92.5, counted: null, survivors: [] },
  ]])
})

test('a scope of the result below 80 fails the gate; its survivors, told file:line detail, go to one proposal per file', async () => {
  const host = mutationRun({ answers: [{ answer: 'STOP' }] })
  host.agentRunner.behaviours.push(agent()(host), agent()(host))
  writesResult(host, { scopes: [{ name: 'global', score: 75, survivors: ['src/Refund.cs:7 ArithmeticOperator', 'src/Checkout.cs:12 EqualityOperator', 'src/Checkout.cs:3'] }] })

  const outcome = await host.start()

  assert.equal(outcome.code, 'stopped', outcome.reason)
  const [ran] = host.events().filter((event) => event.type === 'gate.ran')
  assert.deepEqual([ran.status, ran.survivors, ran.scores[0].score, ran.scores[0].survivors], ['fail', 3, 75, [
    'src/Refund.cs:7 ArithmeticOperator survived', 'src/Checkout.cs:12 EqualityOperator survived', 'src/Checkout.cs:3 mutant survived',
  ]])
  const proposals = host.agentRunner.dispatches.map(({ label, prompt }) => [label, prompt.split('\n').filter((line) => line.startsWith('- src/') || line.startsWith('Propose'))])
  assert.deepEqual(proposals, [
    [`skraft ${SLUG} · kill_proposal · group 1 of 2 · attempt 1`, ['Propose how to treat the surviving mutants of src/Checkout.cs (group 1 of 2):', '- src/Checkout.cs:3 mutant survived', '- src/Checkout.cs:12 EqualityOperator survived']],
    [`skraft ${SLUG} · kill_proposal · group 2 of 2 · attempt 1`, ['Propose how to treat the surviving mutants of src/Refund.cs (group 2 of 2):', '- src/Refund.cs:7 ArithmeticOperator survived']],
  ])
  assert.ok(ran.evidence && (await host.tracking.read(SLUG, ran.evidence)).includes('result: fail (deterministic): exited 0, global 75% < 80%, 3 mutants survive'))
})

test('a result that cannot be read leaves the run to a human, whatever the report says', async () => {
  for (const [written, why] of [
    ['{ not json', 'is not JSON'],
    [{ scopes: [] }, 'names no scope'],
    [{ scopes: [{ name: 'domain', score: 90 }] }, 'names a scope domain: core, boundary or global'],
    [{ scopes: [{ name: 'core', score: 120 }] }, 'gives core a score that is not a percent'],
    [{ scopes: [{ name: 'global', score: 90 }, { name: 'core', score: 90 }] }, 'names global with another scope'],
    [{ scopes: [{ name: 'core', score: 70, survivors: ['src/Checkout.cs'] }] }, 'tells a survivor of core as src/Checkout.cs, not <file>:<line> <detail>'],
  ]) {
    const host = mutationRun()
    writesResult(host, written)

    const outcome = await host.start()

    assert.equal(outcome.code, 'environment', why)
    const [ran] = host.events().filter((event) => event.type === 'gate.ran')
    assert.deepEqual([ran.failure, ran.scores], ['environment', null], why)
    assert.ok(outcome.reason.includes(`the mutation result ${host.tracking.location(SLUG, RESULT)} ${why}`), `${why}\n${outcome.reason}`)
  }
})
