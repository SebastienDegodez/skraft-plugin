import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUILT_IN_WORKFLOW, ScriptedMachine } from '../support/in-memory-host.mjs'
import { agent, API, lenses, scripted, says, finding, SLUG, tddCycle, TRACKING } from '../support/pipeline-host.mjs'
import { waitingOnEnvironment } from '../support/decisions.mjs'
import { pitReport, strykerReport } from '../support/mutation-reports.mjs'

const REPORT = 'StrykerOutput/reports/mutation-report.json'
const STRYKER = '. $ dotnet stryker'
const upToDeliver = (it) => [agent()(it), agent()(it), agent()(it), agent({ work: tddCycle() })(it)]
const recorded = (host, step) => host.events().filter((event) => event.type === 'step.recorded' && event.step === step)
const killTest = (file) => ({ git }) => git.commit(`test(${SLUG}): kill the mutants of ${file}`, [`tests/${file}Tests.cs`])
const killer = (file) => (it) => agent({ work: killTest(file) })(it)
const CHECKOUT_12 = 'src/Checkout.cs:12 Equality (!=) survived'

/**
 * Each mutation run writes the next report and fails, until the reports run out: then it passes.
 * A null report fails the run without writing one.
 * @param {Array<string | null>} reports
 * @param {{ line?: string, path?: string }} [where] the machine line of the mutation command, and where its tool writes the report
 */
const mutationRounds = (host, reports, { line = STRYKER, path = REPORT } = {}) => {
  const left = [...reports]
  host.machine.meanwhile[line] = async () => {
    host.machine.exits[line] = left.length > 0 ? 1 : 0
    const report = left.shift()
    if (typeof report === 'string') await host.workspace.write(path, report)
  }
}

/** As Stryker.NET writes it: each file by its absolute path, the project root the folder of the mutated project. */
const twoFiles = strykerReport({
  '/work/src/Checkout.cs': [[12, 'Equality', '!=', 'Survived'], [20, 'Boolean', 'false', 'NoCoverage'], [31, 'String', null, 'Killed']],
  '/work/src/Refund.cs': [[7, 'Arithmetic', '-', 'Survived']],
}, { projectRoot: '/work/src' })
/** As StrykerJS writes it: each file relative to the folder the command ran in, that folder its project root. */
const checkoutOnly = strykerReport({ 'src/Checkout.cs': [[12, 'Equality', '!=', 'Survived'], [31, 'String', null, 'Timeout']] }, { projectRoot: '/work' })
/** A failed run whose mutants were all killed: it names no survivor. */
const noneAlive = strykerReport({ 'src/Checkout.cs': [[12, 'Equality', '!=', 'Killed']] })

test('surviving mutants send the run to one dispatch per file, then test-integrity, then the gates again until mutation passes', async () => {
  const host = scripted({ machine: new ScriptedMachine() }, (it) => [...upToDeliver(it), killer('Checkout')(it), killer('Refund')(it)])
  mutationRounds(host, [twoFiles])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  const kills = host.agentRunner.dispatches.slice(4)
  assert.deepEqual(kills.map(({ agent: name, label, model }) => [name, label, model]), [
    ['software-engineer', `skraft ${SLUG} · kill_mutants · group 1 of 2 · attempt 1`, 'sonnet'],
    ['software-engineer', `skraft ${SLUG} · kill_mutants · group 2 of 2 · attempt 1`, 'sonnet'],
  ])
  assert.ok(kills[0].prompt.includes([
    'Kill the surviving mutants of src/Checkout.cs (group 1 of 2):',
    `- ${CHECKOUT_12}`,
    '- src/Checkout.cs:20 Boolean (false) has no test covering it',
  ].join('\n')), kills[0].prompt)
  assert.ok(kills[0].prompt.includes([
    '- Kill each mutant with a `test(<story>): …` commit whose test passes on the code as it is.',
    '  Delete code that no behaviour asks for in a `refactor(<story>): …` commit. A bug a new test reveals takes that failing `test` commit, then `fix(<story>): …`.',
    '  A mutant no test can tell apart from the code: change nothing for it; name it in your result summary, `<file>:<line>` and why.',
  ].join('\n')), kills[0].prompt)
  assert.ok(!kills[0].prompt.includes('The gates failed'), kills[0].prompt)
  assert.ok(kills[1].prompt.includes('Kill the surviving mutants of src/Refund.cs (group 2 of 2):\n- src/Refund.cs:7 Arithmetic (-) survived'), kills[1].prompt)
  assert.ok(!kills[1].prompt.includes('src/Checkout.cs:12'), kills[1].prompt)
  assert.deepEqual(recorded(host, 'mutation').map(({ visit, outcome: result, failures, next, survivors }) => [visit, result, failures, next, survivors]), [
    [1, 'fail', [`api/mutation: exited 1, 3 mutants survive (evidence: ${TRACKING}/gates/api/mutation-1.log)`], 'kill_mutants', [
      { file: 'src/Checkout.cs', mutants: [CHECKOUT_12, 'src/Checkout.cs:20 Boolean (false) has no test covering it'] },
      { file: 'src/Refund.cs', mutants: ['src/Refund.cs:7 Arithmetic (-) survived'] },
    ]],
    [2, 'pass', [], 'deliver_review', []],
  ])
  assert.deepEqual(host.events().filter((event) => event.type === 'step.started' && event.step === 'kill_mutants').map(({ visit, group, attempt, result, groups }) => [visit, group, attempt, result, groups?.length]), [
    [1, 1, 1, 'results/kill_mutants-1-g1-1.json', 2],
    [1, 2, 1, 'results/kill_mutants-1-g2-1.json', undefined],
  ])
  assert.deepEqual(recorded(host, 'kill_mutants').map(({ visit, group, attempt, outcome: result, next }) => [visit, group, attempt, result, next]), [
    [1, 1, 1, 'done', null],
    [1, 2, 1, 'done', 'mutation_review'],
  ])
  assert.deepEqual(recorded(host, 'mutation_review').map(({ outcome: result, next }) => [result, next]), [['approved', 'gates']])
  assert.ok(host.agentRunner.reviewed().some((dispatch) => dispatch.agent === 'test-integrity-lens' && dispatch.label.includes('mutation_review')))
  assert.deepEqual(host.events().filter((event) => event.type === 'gate.ran' && event.gate === 'mutation').map(({ status, survivors }) => [status, survivors]), [['fail', 3], ['pass', null]])
  const killCommits = host.events().filter((event) => event.type === 'commits.checked' && event.step === 'kill_mutants').flatMap((event) => event.commits)
  assert.deepEqual(killCommits.map(({ subject, kind, verdict, replay }) => [subject, kind, verdict, replay]), [
    [`test(${SLUG}): kill the mutants of Checkout`, 'red', 'ok', null],
    [`test(${SLUG}): kill the mutants of Refund`, 'red', 'ok', null],
  ])
  assert.ok(!host.replay.replays.some(({ sha }) => killCommits.some((commit) => commit.sha === sha)), host.replay.lines().join('\n'))
})

test('two rounds that leave no fewer mutants alive stop the run, naming the mutants that remain', async () => {
  const host = scripted({ machine: new ScriptedMachine() }, (it) => [...upToDeliver(it), killer('Checkout')(it), killer('Checkout')(it)])
  mutationRounds(host, [checkoutOnly, checkoutOnly, checkoutOnly])

  const outcome = await host.start()

  const reason = `mutation left as many mutants alive for 2 rounds; 1 mutant survives: ${CHECKOUT_12}`
  assert.deepEqual(outcome, { status: 'blocked', slug: SLUG, phase: 'DELIVER', code: 'mutation-stalled', reason })
  assert.deepEqual(recorded(host, 'mutation').map(({ visit, outcome: result, code, next }) => [visit, result, code, next]), [
    [1, 'fail', null, 'kill_mutants'], [2, 'fail', null, 'kill_mutants'], [3, 'fail', 'mutation-stalled', null],
  ])
  assert.equal(host.agentRunner.dispatches.length, 6)
  assert.deepEqual(host.events().at(-1), { ...host.events().at(-1), type: 'run.finished', status: 'blocked', code: 'mutation-stalled', reason })
})

test('a round with fewer survivors is progress: the loop goes on until mutation passes', async () => {
  const fewer = strykerReport({ 'src/Refund.cs': [[7, 'Arithmetic', '-', 'Survived']] })
  const host = scripted({ machine: new ScriptedMachine() }, (it) => [...upToDeliver(it), killer('Checkout')(it), killer('Refund')(it), killer('Checkout')(it), killer('Refund')(it), killer('Refund')(it)])
  mutationRounds(host, [twoFiles, twoFiles, fewer])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(recorded(host, 'mutation').map(({ outcome: result, survivors }) => [result, survivors.length]), [['fail', 2], ['fail', 2], ['fail', 1], ['pass', 0]])
})

test('a failed round that names no survivor is no round of the loop: the rounds around it still count their progress', async () => {
  const host = scripted({ machine: new ScriptedMachine() }, (it) => [...upToDeliver(it), killer('Checkout')(it), killer('Refund')(it), killer('Checkout')(it), killer('Checkout')(it), killer('Checkout')(it)])
  mutationRounds(host, [twoFiles, noneAlive, checkoutOnly, checkoutOnly])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(recorded(host, 'mutation').map(({ outcome: result, survivors }) => [result, survivors.length]), [['fail', 2], ['fail', 0], ['fail', 1], ['fail', 1], ['pass', 0]])
  assert.equal(host.agentRunner.dispatches.at(-4).label, `skraft ${SLUG} · kill_mutants · pass 2 · attempt 1`)
})

test('a report the failed run did not write again is not read: the run waits for a human', async () => {
  const host = scripted({ machine: new ScriptedMachine() }, (it) => [...upToDeliver(it), killer('Checkout')(it), killer('Refund')(it)])
  mutationRounds(host, [twoFiles, null])

  const outcome = await host.start()

  assert.deepEqual([outcome.status, outcome.code], ['waiting', 'environment'])
  assert.ok(outcome.reason.includes(`api/mutation: exited 1; the mutation report ${REPORT} is missing;`), outcome.reason)
  assert.equal(await host.workspace.read(REPORT), '')
})

test('each stack reads the report its default mutation command writes', async () => {
  const expected = [
    ['dotnet', 'dotnet stryker', 'StrykerOutput/reports/mutation-report.json'],
    ['java', 'mvn -B -q org.pitest:pitest-maven:mutationCoverage', 'target/pit-reports/mutations.xml'],
    ['java', './gradlew pitest', 'build/reports/pitest/mutations.xml'],
    ['python', 'python -m mutmut run', 'mutation-report.json'],
    ['typescript', 'npx stryker run', 'reports/mutation/mutation.json'],
    ['javascript', 'npx stryker run', 'reports/mutation/mutation.json'],
    ['react', 'npx stryker run', 'reports/mutation/mutation.json'],
  ]
  for (const [stack, mutation, report] of expected) {
    const component = { ...API, stack, commands: { test: 'dotnet test', mutation } }
    const host = scripted({ components: [component], machine: new ScriptedMachine({ installed: ['git', 'dotnet', 'mvn', 'gradlew', 'python', 'npx'], exits: { [`. $ ${mutation}`]: 1 } }) }, (it) => upToDeliver(it))
    const outcome = await host.start()
    assert.ok(outcome.reason.includes(`the mutation report ${report} is missing;`), `${stack}: ${outcome.reason}`)
  }
})

test('the loop that reaches its max_visits stops the run, naming the mutants that remain', async () => {
  const workflow = BUILT_IN_WORKFLOW.replace('mutation -> kill_mutants [label="FAIL", max_visits=5]', 'mutation -> kill_mutants [label="FAIL", max_visits=1]')
  const fewer = strykerReport({ 'src/Checkout.cs': [[12, 'Equality', '!=', 'Survived']] })
  const host = scripted({ machine: new ScriptedMachine(), config: { workflow: 'skraft-workflow.dot' }, files: { 'skraft-workflow.dot': workflow } }, (it) => [...upToDeliver(it), killer('Checkout')(it), killer('Refund')(it)])
  mutationRounds(host, [twoFiles, fewer])

  const outcome = await host.start()

  assert.deepEqual(outcome, {
    status: 'blocked', slug: SLUG, phase: 'DELIVER', code: 'loop-ceiling',
    reason: `mutation -> kill_mutants was already taken 1 times, its max_visits; api/mutation: exited 1, 1 mutant survives (evidence: ${TRACKING}/gates/api/mutation-2.log); ${CHECKOUT_12}`,
  })
})

test('a failed mutation run without a readable report waits for a human, naming where the report was looked for', async () => {
  const host = scripted({ machine: new ScriptedMachine() }, (it) => [...upToDeliver(it)])
  mutationRounds(host, [null])

  const outcome = await host.start()

  assert.deepEqual(outcome, {
    status: 'waiting', slug: SLUG, phase: 'DELIVER', code: 'environment',
    reason: waitingOnEnvironment('mutation', `api/mutation: exited 1; the mutation report ${REPORT} is missing; have the command write it there, or name the file it writes with mutationReport on api in skraft-config.json (evidence: ${TRACKING}/gates/api/mutation-1.log)`),
  })

  for (const report of ['{ "files": [] }', JSON.stringify({ files: { 'src/Checkout.cs': { mutants: [{ id: '1', mutatorName: 'Equality', status: 'Survived' }] } } })]) {
    const garbled = scripted({ machine: new ScriptedMachine() }, (it) => [...upToDeliver(it)])
    mutationRounds(garbled, [report])
    assert.ok((await garbled.start()).reason.includes(`the mutation report ${REPORT} is not a mutation-testing-elements report;`), report)
  }
})

test('a component reads its mutants where mutationReport says, PIT\'s mutations.xml by the class\'s source file', async () => {
  const service = { name: 'orders', root: 'orders', stack: 'java', mocking: { strategy: 'inprocess' }, paths: { src: ['src/main'], tests: ['src/test'] }, commands: { test: 'mvn test', mutation: 'mvn pitest' }, mutationReport: 'target/pit/mutations.xml' }
  const orderCycle = ({ git }) => {
    git.commit(`test(${SLUG}): order`, ['orders/src/test/OrderTest.java'])
    git.commit(`feat(${SLUG}): order`, ['orders/src/main/Order.java'])
  }
  const host = scripted({ components: [service], machine: new ScriptedMachine(), files: { 'orders/src/main/java/com/acme/Order.java': 'class Order {}\n' } }, (it) => [
    agent()(it), agent()(it), agent()(it), agent({ work: orderCycle })(it),
    agent({ work: ({ git }) => git.commit(`test(${SLUG}): kill the order mutants`, ['orders/src/test/OrderTest.java']) })(it),
  ])
  mutationRounds(host, [pitReport([
    ['com.acme.Order$Line', 'Order.java', 42, 'ConditionalsBoundaryMutator', 'changed conditional boundary', 'SURVIVED'],
    ['com.acme.Order', 'Order.java', 9, 'NegateConditionalsMutator', 'negated conditional &amp; more', 'NO_COVERAGE'],
    ['com.acme.Order', 'Order.java', 50, 'MathMutator', 'Replaced integer addition', 'KILLED'],
  ])], { line: 'orders $ mvn pitest', path: 'orders/target/pit/mutations.xml' })

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(recorded(host, 'mutation')[0].survivors, [{
    file: 'orders/src/main/java/com/acme/Order.java',
    mutants: [
      'orders/src/main/java/com/acme/Order.java:9 NegateConditionalsMutator (negated conditional & more) has no test covering it',
      'orders/src/main/java/com/acme/Order.java:42 ConditionalsBoundaryMutator (changed conditional boundary) survived',
    ],
  }])
})

test('a run stopped in a group resumes there: the groups already done are not dispatched again', async () => {
  const host = scripted({ machine: new ScriptedMachine() }, (it) => [
    ...upToDeliver(it),
    killer('Checkout')(it),
    async (dispatch) => { await killer('Refund')(it)(dispatch); throw new Error('host interrupted') },
  ])
  mutationRounds(host, [twoFiles])

  await assert.rejects(host.start(), /host interrupted/)
  assert.equal((await host.run()).status, 'done')

  assert.deepEqual(host.agentRunner.dispatches.slice(4).map(({ label }) => label), [
    `skraft ${SLUG} · kill_mutants · group 1 of 2 · attempt 1`,
    `skraft ${SLUG} · kill_mutants · group 2 of 2 · attempt 1`,
  ])
  assert.deepEqual(recorded(host, 'kill_mutants').map(({ group, attempt, outcome: result, next }) => [group, attempt, result, next]), [
    [1, 1, 'done', null], [2, 1, 'done', 'mutation_review'],
  ])
})

test('a refused attempt of a group is tried again on the same group, its mutants still listed', async () => {
  const host = scripted({ machine: new ScriptedMachine() }, (it) => [
    ...upToDeliver(it),
    agent({ work: ({ git }) => git.commit('kill the card amount mutants', ['tests/CheckoutTests.cs']) })(it),
    agent({ work: ({ git }) => { git.reset('.', 'root-3'); killTest('Checkout')({ git }) } })(it),
    killer('Refund')(it),
  ])
  mutationRounds(host, [twoFiles])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  const kills = host.agentRunner.dispatches.slice(4)
  assert.deepEqual(kills.map(({ label }) => label), [
    `skraft ${SLUG} · kill_mutants · group 1 of 2 · attempt 1`,
    `skraft ${SLUG} · kill_mutants · group 1 of 2 · attempt 2`,
    `skraft ${SLUG} · kill_mutants · group 2 of 2 · attempt 1`,
  ])
  assert.ok(kills[1].prompt.includes(`Kill the surviving mutants of src/Checkout.cs (group 1 of 2):\n- ${CHECKOUT_12}`), kills[1].prompt)
  assert.ok(kills[1].prompt.includes('Refused in attempt 1 of 3:\n- commit root-4 "kill the card amount mutants" is not a conventional commit'), kills[1].prompt)
  assert.deepEqual(recorded(host, 'kill_mutants').map(({ group, attempt, outcome: result }) => [group, attempt, result]), [[1, 1, 'failed'], [1, 2, 'done'], [2, 1, 'done']])
})

test('test-integrity refusing the killing tests sends the work back once, with its findings and no groups', async () => {
  const host = scripted({ machine: new ScriptedMachine() }, (it) => [
    ...upToDeliver(it), killer('Checkout')(it), killer('Refund')(it),
    agent({ work: ({ git }) => git.commit(`refactor(${SLUG}): assert the refund amount`, ['tests/RefundTests.cs']) })(it),
  ])
  host.agentRunner.review = lenses({ 'test-integrity': [says('test-integrity', 'fail', [finding('TI1', 'high', 'RefundTests asserts nothing', { location: 'tests/RefundTests.cs:4' })])] })
  mutationRounds(host, [twoFiles])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  const rework = host.agentRunner.dispatches.at(-1)
  assert.equal(rework.label, `skraft ${SLUG} · kill_mutants · pass 2 · attempt 1`)
  assert.ok(rework.prompt.includes('RefundTests asserts nothing'), rework.prompt)
  assert.ok(!rework.prompt.includes('Kill the surviving mutants'), rework.prompt)
  assert.deepEqual(recorded(host, 'mutation_review').map(({ outcome: result, next }) => [result, next]), [['needs-rework', 'kill_mutants'], ['approved', 'gates']])
})

test('a component whose mutation passes leaves no survivors and needs no report', async () => {
  const host = scripted({ components: [API], machine: new ScriptedMachine() }, (it) => upToDeliver(it))

  assert.equal((await host.start()).status, 'done')
  assert.deepEqual(recorded(host, 'mutation').map(({ outcome: result, survivors, next }) => [result, survivors, next]), [['pass', [], 'deliver_review']])
})
