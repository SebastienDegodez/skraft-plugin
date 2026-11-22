import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryGit } from '../support/in-memory-host.mjs'
import { GATES } from '../support/delivery-trace.mjs'
import { agent, API, green, nominal, scripted, SLUG } from '../support/pipeline-host.mjs'

const unavailable = () => ({ ok: false, unavailable: true, text: '' })
const recorded = (host, step) => host.events().filter((event) => event.type === 'step.recorded' && event.step === step)

/** A run whose engineer delivers as the nominal one does, with the trace it leaves changed by `trace`. */
const delivering = ({ trace, work = green(SLUG, 'Checkout', '') } = {}) => scripted({}, (it) => [...nominal(it).slice(0, 3), agent({ work, trace })(it), unavailable])

const refusal = (host) => recorded(host, 'deliver')[0]

test('an engineer that traced no run is refused for each gate of the component, and the test gate asks for the commit line', async () => {
  const host = delivering({ trace: false })

  await host.start()

  const [refused] = recorded(host, 'deliver')
  assert.deepEqual([refused.outcome, refused.code], ['failed', 'evidence'])
  assert.equal(refused.failures.length, 6)
  assert.equal(refused.failures[0], "api/build: no run is traced under .: run it through skraft_repl with gate('build', <command>, { cwd: '.' }), or declare absent('build', 'api', <reason>) when the project's documents name no such gate")
  assert.equal(refused.failures[3], 'api/test: no run is traced under .: run the whole suite through skraft_repl with the commit line')
})

test('a gate whose last run failed is refused, however many passed before it', async () => {
  const host = delivering({ trace: { edit: (run) => (run.gate === 'lint' ? { ...run, exitCode: 1 } : run) } })

  await host.start()

  assert.deepEqual(refusal(host).failures, ['api/lint: the last run did not end with exit 0 (log logs/runs/deliver-1-1/3.log)'])
})

test('a gate that ran on an earlier commit than the one the attempt ends on is refused with both commits named', async () => {
  const host = delivering({ trace: { edit: (run) => (run.gate === 'build' ? { ...run, headAfter: 'root-0' } : run) } })

  await host.start()

  const [line] = refusal(host).failures
  assert.match(line, /^api\/build: the last run ended on root-0, not on the final commit root-\d+: run it again on the final commit$/)
})

test('a gate other than the commit line that started on a tree with uncommitted files is refused; the commit line, which starts on one, is not', async () => {
  const host = delivering({ trace: { edit: (run) => (run.gate === 'format' || run.gate === 'test' ? { ...run, clean: false } : run) } })

  await host.start()

  assert.deepEqual(refusal(host).failures, ['api/format: the last run started on a tree with uncommitted files: commit them, then run it again'])
})

test('a test run that is not the commit line must start clean', async () => {
  const host = delivering({ trace: { edit: (run) => (run.gate === 'test' ? { ...run, clean: false, label: 'unit' } : run) } })

  await host.start()

  assert.deepEqual(refusal(host).failures, ['api/test: the last run started on a tree with uncommitted files: commit them, then run it again'])
})

test('a gate declared absent needs no run; the test gate cannot be declared absent', async () => {
  const host = delivering({ trace: { omit: ['api/test'], absent: ['api/architecture', 'api/coverage', 'api/test'] } })

  await host.start()

  assert.deepEqual(refusal(host).failures.map((line) => line.slice(0, 9)), ['api/test:'])
})

test('a trace edited afterwards, or left unsigned, is refused whole with the line at fault', async () => {
  const edited = delivering({ trace: { unsigned: true } })

  await edited.start()

  assert.deepEqual(refusal(edited).failures, ['runs.jsonl line 1 is not signed'])
})

test('a run of the REPL still open at the submission is refused: it is to be awaited or killed', async () => {
  const host = delivering({ trace: { open: true } })

  await host.start()

  assert.deepEqual(refusal(host).failures, ['run 7 of skraft_repl is still open: await it or kill it'])
})

test('the evidence the attempt stands on is journaled by run and hash, never by output', async () => {
  const host = delivering({})

  await host.start()

  const [checked] = host.events().filter((event) => event.type === 'evidence.checked')
  assert.deepEqual([checked.step, checked.visit, checked.attempt, checked.runs.length], ['deliver', 1, 1, 6])
  assert.deepEqual(Object.keys(checked.runs[0]), ['run', 'gate', 'sha256'])
})

test('only the components the story changed answer for their gates: another repository left as it was needs no run', async () => {
  const WEB = { name: 'web', root: '../web', stack: 'react', bdd: false, mocking: { strategy: 'inprocess' }, paths: { src: ['src'], tests: ['src'] }, commands: {} }
  const git = new InMemoryGit({ repositories: { '.': { mergeBases: { main: 'root-0' } }, '../web': { mergeBases: { main: 'up-web-0' } } } })
  const without = GATES.map((gate) => `web/${gate}`)
  const host = scripted({ components: [API, WEB], git }, (it) => [...nominal(it).slice(0, 3), agent({ work: green(SLUG, 'Checkout', ''), trace: { omit: without } })(it), unavailable])

  await host.start()

  assert.deepEqual(recorded(host, 'deliver').map((event) => event.outcome), ['done'])
})
