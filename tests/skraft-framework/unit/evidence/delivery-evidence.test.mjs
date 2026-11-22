import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, green, nominal, scripted, SLUG } from '../support/pipeline-host.mjs'

const unavailable = () => ({ ok: false, unavailable: true, text: '' })
const recorded = (host, step) => host.events().filter((event) => event.type === 'step.recorded' && event.step === step)

/** A run whose engineer delivers as the nominal one does, with the trace it leaves changed by `trace`. */
const delivering = ({ trace, work = green(SLUG, 'Checkout', '') } = {}) => scripted({}, (it) => [...nominal(it).slice(0, 3), agent({ work, trace })(it), unavailable])

test('a delivery is not refused for its quality evidence: an engineer that traced no run, a failed gate or a run left open still closes DELIVER, and the review judges them', async () => {
  for (const trace of [false, { edit: (run) => (run.gate === 'lint' ? { ...run, exitCode: 1 } : run) }, { open: true }]) {
    const host = delivering({ trace })

    await host.start()

    assert.deepEqual(recorded(host, 'deliver').map(({ outcome, code }) => [outcome, code]), [['done', null]], JSON.stringify(trace))
  }
})

test('a trace edited afterwards, or left unsigned, is journaled invalid with its reason, and the quality-gates lens is told so in place of reading it', async () => {
  for (const [trace, code] of [[{ unsigned: true }, 'unsigned-line'], [{ edited: true }, 'wrong-signature']]) {
    const host = delivering({ trace })

    await host.start()

    assert.deepEqual(recorded(host, 'deliver').map(({ outcome }) => outcome), ['done'])
    const checked = host.events().filter((event) => event.type === 'evidence.checked' && event.red !== true)
    assert.deepEqual(checked.map(({ step, visit, attempt, runs, invalid }) => ({ step, visit, attempt, runs, invalid })), [{ step: 'deliver', visit: 1, attempt: 1, runs: [], invalid: code }], code)
    const lens = host.agentRunner.batches.at(-1).find(({ agent: id }) => id === 'quality-gates-lens').prompt
    assert.ok(lens.includes(`  - Trace of each delivering step (its runs.jsonl verified or invalid, with the reason code): ${host.tracking.location(SLUG, 'reviews/deliver_review-1/trace.json')}`), lens)
    assert.ok(!lens.includes('deliver-1-1/runs.jsonl'), lens)
    assert.deepEqual(JSON.parse(await host.tracking.read(SLUG, 'reviews/deliver_review-1/trace.json')), [{ step: 'deliver', trace: 'logs/runs/deliver-1-1/runs.jsonl', status: 'invalid', code }])
  }
})

test('every run the delivery attempt traced is journaled by run and hash, never by output', async () => {
  const host = delivering({})

  await host.start()

  const [checked] = host.events().filter((event) => event.type === 'evidence.checked' && event.red !== true)
  assert.deepEqual([checked.step, checked.visit, checked.attempt, checked.runs.length], ['deliver', 1, 1, 6])
  assert.deepEqual(Object.keys(checked.runs[0]), ['run', 'gate', 'cwd', 'log', 'sha256'])
})

test('the designer\'s traced run of the acceptance tests, labelled red, is journaled for the review by its run and its log', async () => {
  const host = scripted({}, (it) => nominal(it))

  await host.start()

  const [red] = host.events().filter((event) => event.type === 'evidence.checked' && event.red === true)
  assert.deepEqual([red.step, red.visit, red.attempt], ['distill', 1, 1])
  assert.deepEqual(red.runs.map(({ run, gate, log }) => [run, gate, log]), [[1, 'test', 'logs/runs/distill-1-1/1.log']])
})

test('a designer that traced no red run is told so to the person who reads the scenarios, and the run still asks', async () => {
  const host = scripted({}, (it) => [...nominal(it).slice(0, 2), agent({ trace: false, work: ({ git }) => git.commit('test(checkout): acceptance of the card payment', ['tests/Acceptance/CheckoutAcceptanceTests.cs'], '') })(it), ...nominal(it).slice(3)])

  await host.start()

  const [asked] = host.human.questions.filter(({ kind }) => kind === 'scenario-review')
  assert.match(asked.text, /skraft does not run them: check that each fails on its own assertion; the designer traced no run of them through skraft_repl: ask for it\. APPROVED delivers/)
  assert.equal(host.events().filter((event) => event.red === true).length, 0)
})
