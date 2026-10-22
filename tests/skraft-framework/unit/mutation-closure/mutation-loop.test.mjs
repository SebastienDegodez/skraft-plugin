import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUILT_IN_WORKFLOW, ScriptedMachine } from '../support/in-memory-host.mjs'
import { agent, API, lenses, scripted, says, finding, SLUG, TRACKING } from '../support/pipeline-host.mjs'
import { waitingOnEnvironment } from '../support/decisions.mjs'
import { ALL_KILLED, mutants, pitReport, strykerReport } from '../support/mutation-reports.mjs'

const REPORT = 'StrykerOutput/reports/mutation-report.json'
const STRYKER = '. $ dotnet stryker'
/** The story's TDD cycle: its test, then the source files it changes. */
const changing = (files) => ({ git }) => {
  git.commit(`test(${SLUG}): checkout pays by card`, ['tests/CheckoutTests.cs'])
  git.commit(`feat(${SLUG}): checkout pays by card`, files)
}
const upToDeliver = (it, files = ['src/Checkout.cs', 'src/Refund.cs']) => [agent()(it), agent()(it), agent()(it), agent({ work: changing(files) })(it)]
const recorded = (host, step) => host.events().filter((event) => event.type === 'step.recorded' && event.step === step)
const killTest = (file) => ({ git }) => git.commit(`test(${SLUG}): kill the mutants of ${file}`, [`tests/${file}Tests.cs`])
const killer = (file) => (it) => agent({ work: killTest(file) })(it)
const CHECKOUT_12 = 'src/Checkout.cs:12 Equality (!=) survived'

/** In the rounds of mutationRounds, a run that passes. */
const PASS = 'pass'

/**
 * Each mutation run writes the next report and exits `exit`, until the reports run out: then it
 * writes `passing` and exits 0. A null report exits `exit` without writing one; PASS passes.
 * @param {Array<string | null>} reports
 * @param {{ line?: string, path?: string, passing?: string, exit?: number }} [where] the machine line of the mutation command, where its tool writes the report, the report of a passing run, the exit code of the others
 */
const mutationRounds = (host, reports, { line = STRYKER, path = REPORT, passing = ALL_KILLED, exit = 1 } = {}) => {
  const left = [...reports]
  host.machine.meanwhile[line] = async () => {
    const report = left.shift()
    const passes = report === undefined || report === PASS
    host.machine.exits[line] = passes ? 0 : exit
    if (report !== null) await host.workspace.write(path, passes ? passing : report)
  }
}

/** As Stryker.NET writes it: each file by its absolute path, the project root the folder of the mutated project. */
const twoFiles = strykerReport({
  '/work/src/Checkout.cs': [[12, 'Equality', '!=', 'Survived'], [20, 'Boolean', 'false', 'NoCoverage'], [31, 'String', null, 'Killed']],
  '/work/src/Refund.cs': [[7, 'Arithmetic', '-', 'Survived']],
  '/work/src/Ledger.cs': [[3, 'Arithmetic', '+', 'Survived']],
}, { projectRoot: '/work/src' })
/** As StrykerJS writes it: each file relative to the folder the command ran in, that folder its project root. */
const checkoutOnly = strykerReport({ 'src/Checkout.cs': [[12, 'Equality', '!=', 'Survived'], [31, 'String', null, 'Timeout']] }, { projectRoot: '/work' })

test('surviving mutants of the files the story changed send the run to one dispatch per file, then test-integrity, then the gates again until mutation passes', async () => {
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
  assert.ok(!kills[1].prompt.includes('The gates failed') && !kills[1].prompt.includes('Missing outputs'), kills[1].prompt)
  assert.deepEqual(recorded(host, 'mutation').map(({ visit, outcome: result, failures, next, survivors }) => [visit, result, failures, next, survivors]), [
    [1, 'fail', [`api/mutation: exited 1, boundary 25% < 80%, 3 mutants survive (evidence: ${TRACKING}/gates/api/mutation-1.log)`], 'kill_mutants', [
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

test('the core and the boundary are judged apart: only the scope that misses its bar hands its survivors out', async () => {
  const core = {
    'src/Checkout.Domain/Order.cs': [[10, 'Equality', '!=', 'Survived'], [11, 'Equality', '==', 'Killed'], [12, 'Boolean', 'true', 'Timeout'], [13, 'String', null, 'CompileError']],
    'src/checkout-domain/Fee.java': [[5, 'Arithmetic', '-', 'Survived'], [6, 'Arithmetic', '+', 'RuntimeError']],
    'src/checkout/domain/tax.py': [[3, 'Arithmetic', '+', 'Survived'], [4, 'Arithmetic', '-', 'Ignored']],
    'src/features/cart/application/useCart.ts': [[8, 'Boolean', 'false', 'Survived'], [9, 'Boolean', 'true', 'Pending']],
    'src/Orders_APPLICATION/Pay.cs': [[4, 'Block', '{}', 'NoCoverage']],
  }
  const boundary = {
    'src/Checkout.Api/Endpoints.cs': [...mutants(8, 'Killed'), [9, 'Equality', '!=', 'Survived']],
    'src/Domain.Events/Paid.cs': [[2, 'String', null, 'Survived']],
    'src/subdomain/Map.cs': mutants(1, 'Killed'),
    'src/domainish/Thing.cs': mutants(1, 'Killed'),
  }
  const untouched = { 'src/Legacy.Domain/Old.cs': [[1, 'Equality', '!=', 'Survived']] }
  const changed = [...Object.keys(core), ...Object.keys(boundary)]
  const host = scripted({ machine: new ScriptedMachine() }, (it) => [...upToDeliver(it, changed), ...Object.keys(core).map((file) => killer(file)(it))])
  mutationRounds(host, [strykerReport({ ...core, ...boundary, ...untouched })])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  const [first] = recorded(host, 'mutation')
  assert.deepEqual(first.failures, [`api/mutation: exited 1, core 28% < 100%, 5 mutants survive (evidence: ${TRACKING}/gates/api/mutation-1.log)`])
  assert.deepEqual(first.survivors, [
    { file: 'src/Checkout.Domain/Order.cs', mutants: ['src/Checkout.Domain/Order.cs:10 Equality (!=) survived'] },
    { file: 'src/Orders_APPLICATION/Pay.cs', mutants: ['src/Orders_APPLICATION/Pay.cs:4 Block ({}) has no test covering it'] },
    { file: 'src/checkout-domain/Fee.java', mutants: ['src/checkout-domain/Fee.java:5 Arithmetic (-) survived'] },
    { file: 'src/checkout/domain/tax.py', mutants: ['src/checkout/domain/tax.py:3 Arithmetic (+) survived'] },
    { file: 'src/features/cart/application/useCart.ts', mutants: ['src/features/cart/application/useCart.ts:8 Boolean (false) survived'] },
  ])
})

test('the core needs every mutant detected and the boundary 80 %, also from a run that exits 0', async () => {
  const host = scripted({ machine: new ScriptedMachine() }, (it) => [...upToDeliver(it, ['src/Checkout.Domain/Order.cs', 'src/Checkout.cs']), killer('Order')(it), killer('Checkout')(it)])
  mutationRounds(host, [
    strykerReport({ 'src/Checkout.Domain/Order.cs': [...mutants(100, 'Killed'), [101, 'Equality', '!=', 'Survived']] }),
    strykerReport({ 'src/Checkout.Domain/Order.cs': mutants(3, 'Killed'), 'src/Checkout.cs': [...mutants(19, 'Killed'), ...mutants(5, 'Survived', 20)] }),
    strykerReport({ 'src/Checkout.Domain/Order.cs': mutants(3, 'Killed'), 'src/Checkout.cs': [...mutants(4, 'Killed'), [5, 'Equality', '!=', 'Survived']] }),
  ], { exit: 0 })

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(recorded(host, 'mutation').map(({ outcome: result, failures, survivors }) => [result, failures, survivors.map(({ file, mutants: alive }) => `${file} ${alive.length}`)]), [
    ['fail', [`api/mutation: exited 0, core 99% < 100%, 1 mutant survives (evidence: ${TRACKING}/gates/api/mutation-1.log)`], ['src/Checkout.Domain/Order.cs 1']],
    ['fail', [`api/mutation: exited 0, boundary 79% < 80%, 5 mutants survive (evidence: ${TRACKING}/gates/api/mutation-2.log)`], ['src/Checkout.cs 5']],
    ['pass', [], []],
  ])
  assert.deepEqual(host.events().filter((event) => event.type === 'gate.ran' && event.gate === 'mutation').map(({ status, survivors }) => [status, survivors]), [['fail', 1], ['fail', 5], ['pass', null]])
})

test('with no change Git can list since the base, every file of the report is judged', async () => {
  const host = scripted({ machine: new ScriptedMachine() }, (it) => [
    ...upToDeliver(it, ['src/Checkout.cs']),
    agent({ work: (repos) => { delete repos.git.changedFiles; killTest('Ledger')(repos) } })(it),
  ])
  let builds = 0
  host.machine.meanwhile['. $ dotnet build'] = () => {
    builds += 1
    if (builds === 1) host.git.changedFiles = async () => null
  }
  mutationRounds(host, [strykerReport({ 'src/Checkout.cs': mutants(1, 'Killed'), 'src/Ledger.cs': [[3, 'Arithmetic', '+', 'Survived']] })])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(recorded(host, 'mutation')[0].survivors, [{ file: 'src/Ledger.cs', mutants: ['src/Ledger.cs:3 Arithmetic (+) survived'] }])
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

test('a failed round that hands out no survivor is no round of the loop: the rounds around it still count their progress', async () => {
  const workflow = BUILT_IN_WORKFLOW.replace('mutation [shape=parallelogram, gate="mutation"', 'mutation [shape=parallelogram, gate="test,mutation"')
  const host = scripted({ machine: new ScriptedMachine(), config: { workflow: 'skraft-workflow.dot' }, files: { 'skraft-workflow.dot': workflow } }, (it) => [
    ...upToDeliver(it), killer('Checkout')(it), killer('Refund')(it), killer('Checkout')(it), killer('Checkout')(it), killer('Checkout')(it),
  ])
  let tests = 0
  host.machine.meanwhile['. $ dotnet test'] = () => { tests += 1; host.machine.exits['. $ dotnet test'] = tests === 4 ? 1 : 0 }
  mutationRounds(host, [twoFiles, checkoutOnly, checkoutOnly])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(recorded(host, 'mutation').map(({ outcome: result, survivors }) => [result, survivors.length]), [['fail', 2], ['fail', 0], ['fail', 1], ['fail', 1], ['pass', 0]])
  assert.equal(host.agentRunner.dispatches.at(-3).label, `skraft ${SLUG} · kill_mutants · pass 2 · attempt 1`)
})

test('rounds count their progress from the last time mutation passed: a loop the review reopens starts afresh', async () => {
  const host = scripted({ machine: new ScriptedMachine() }, (it) => [
    ...upToDeliver(it), killer('Checkout')(it),
    agent({ work: ({ git }) => git.commit(`refactor(${SLUG}): name the card payment`, ['src/Checkout.cs']) })(it),
    killer('Checkout')(it), killer('Checkout')(it),
  ])
  host.agentRunner.review = lenses({ 'cold-reader': [says('cold-reader', 'fail', [finding('CR1', 'high', 'Checkout reads as a payment')])] })
  mutationRounds(host, [checkoutOnly, PASS, checkoutOnly, checkoutOnly])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(recorded(host, 'mutation').map(({ outcome: result, next }) => [result, next]), [
    ['fail', 'kill_mutants'], ['pass', 'deliver_review'], ['fail', 'kill_mutants'], ['fail', 'kill_mutants'], ['pass', 'deliver_review'],
  ])
})

test('a mutationReport outside the component root, or an each that is not survivor-file, stops the run before any step', async () => {
  const refusal = async (host) => {
    const started = await host.init()
    return started.ok ? (await host.run()).reason : started.reason
  }
  const outside = scripted({ components: [{ ...API, mutationReport: '../report.json' }] }, () => [])
  assert.match(await refusal(outside), /component api: mutationReport must be a file inside the component root/)

  const workflow = BUILT_IN_WORKFLOW.replace('agent="software-engineer", each="survivor-file"', 'agent="software-engineer", each="file"')
  const every = scripted({ config: { workflow: 'skraft-workflow.dot' }, files: { 'skraft-workflow.dot': workflow } }, () => [])
  assert.match(await refusal(every), /node kill_mutants: each="file" must be survivor-file/)
  assert.deepEqual([outside, every].map((host) => host.agentRunner.dispatches.length), [0, 0])
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
    const writesNone = { [`. $ ${mutation}`]: () => {} }
    const host = scripted({ components: [component], machine: new ScriptedMachine({ installed: ['git', 'dotnet', 'mvn', 'gradlew', 'python', 'npx'], meanwhile: writesNone }) }, (it) => upToDeliver(it))
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
    reason: `mutation -> kill_mutants was already taken 1 times, its max_visits; api/mutation: exited 1, boundary 0% < 80%, 1 mutant survives (evidence: ${TRACKING}/gates/api/mutation-2.log); ${CHECKOUT_12}`,
  })
})

test('a mutation run without a readable report waits for a human, naming where the report was looked for, whatever its exit code', async () => {
  const lookedFor = (exit) => `api/mutation: exited ${exit}; the mutation report ${REPORT} is missing; have the command write it there, or name the file it writes with mutationReport on api in skraft-config.json (evidence: ${TRACKING}/gates/api/mutation-1.log)`
  for (const exit of [1, 0]) {
    const host = scripted({ machine: new ScriptedMachine() }, (it) => [...upToDeliver(it)])
    mutationRounds(host, [null], { exit })

    const outcome = await host.start()

    assert.deepEqual(outcome, { status: 'waiting', slug: SLUG, phase: 'DELIVER', code: 'environment', reason: waitingOnEnvironment('mutation', lookedFor(exit)) })
  }

  for (const report of ['not JSON at all', '{ "files": [] }', JSON.stringify({ files: { 'src/Checkout.cs': { mutants: [{ id: '1', mutatorName: 'Equality', status: 'Survived' }] } } })]) {
    const garbled = scripted({ machine: new ScriptedMachine() }, (it) => [...upToDeliver(it)])
    mutationRounds(garbled, [report], { exit: 0 })
    assert.ok((await garbled.start()).reason.includes(`api/mutation: exited 0; the mutation report ${REPORT} is not a mutation-testing-elements report;`), report)
  }
})

test('a mutation run that fails although its report meets each bar is a failure of the tool: the run waits for a human', async () => {
  const host = scripted({ machine: new ScriptedMachine() }, (it) => [...upToDeliver(it)])
  mutationRounds(host, [strykerReport({ 'src/Checkout.cs': [...mutants(4, 'Killed'), [5, 'Equality', '!=', 'Survived']] })])

  const outcome = await host.start()

  assert.deepEqual(outcome, {
    status: 'waiting', slug: SLUG, phase: 'DELIVER', code: 'environment',
    reason: waitingOnEnvironment('mutation', `api/mutation: exited 1, yet the mutation report ${REPORT} meets each bar; the mutation tool failed: its log says why (evidence: ${TRACKING}/gates/api/mutation-1.log)`),
  })
  assert.deepEqual(host.events().filter((event) => event.type === 'gate.ran' && event.gate === 'mutation').map(({ status, failure, survivors }) => [status, failure, survivors]), [['fail', 'environment', null]])
})

test('a component reads its mutants where mutationReport says, PIT\'s mutations.xml by the class\'s source file in its source folders', async () => {
  const service = { name: 'orders', root: 'orders', stack: 'java', mocking: { strategy: 'inprocess' }, paths: { src: ['src/main'], tests: ['src/test'] }, commands: { test: 'mvn test', mutation: 'mvn pitest' }, mutationReport: 'target/pit/mutations.xml' }
  const sources = {
    'orders/src/main/java/com/acme/Order.java': 'class Order {}\n', 'orders/src/main/kotlin/com/acme/Fee.kt': 'class Fee\n', 'orders/src/main/com/acme/Tax.java': 'class Tax {}\n',
    'orders/src/main/java/com/acme/domain/Price.java': 'class Price {}\n',
  }
  const orderCycle = ({ git }) => {
    git.commit(`test(${SLUG}): order`, ['orders/src/test/OrderTest.java'])
    git.commit(`feat(${SLUG}): order`, Object.keys(sources))
  }
  const killsOrders = (it) => agent({ work: ({ git }) => git.commit(`test(${SLUG}): kill the order mutants`, ['orders/src/test/OrderTest.java']) })(it)
  const host = scripted({ components: [service], machine: new ScriptedMachine(), files: sources }, (it) => [
    agent()(it), agent()(it), agent()(it), agent({ work: orderCycle })(it), killsOrders(it), killsOrders(it), killsOrders(it), killsOrders(it),
  ])
  const report = pitReport([
    ['com.acme.Order$Line', 'Order.java', 42, 'ConditionalsBoundaryMutator', 'changed conditional boundary', 'SURVIVED'],
    ['com.acme.Order', 'Order.java', 9, 'NegateConditionalsMutator', 'changed &lt;= to &lt; &quot;x&quot; &apos;y&apos; &gt; &amp; more', 'NO_COVERAGE'],
    ['com.acme.Order', 'Order.java', 50, 'MathMutator', 'Replaced integer addition', 'KILLED'],
    ['com.acme.Fee', 'Fee.kt', 5, 'MathMutator', 'Replaced integer subtraction', 'SURVIVED'],
    ['com.acme.Tax', 'Tax.java', 8, 'VoidMethodCallMutator', 'removed call', 'SURVIVED'],
    ['com.acme.Gone', 'Gone.java', 3, 'RemoveCallsMutator', null, 'SURVIVED'],
    ['com.acme.domain.Price', 'Price.java', 4, 'MathMutator', 'Replaced integer addition', 'SURVIVED'],
    ['com.acme.domain.Price', 'Price.java', 5, 'MathMutator', null, 'KILLED'],
    ['com.acme.domain.Price', 'Price.java', 6, 'MathMutator', null, 'TIMED_OUT'],
    ['com.acme.domain.Price', 'Price.java', 7, 'MathMutator', null, 'MEMORY_ERROR'],
    ['com.acme.domain.Price', 'Price.java', 8, 'MathMutator', null, 'RUN_ERROR'],
    ['com.acme.domain.Price', 'Price.java', 9, 'MathMutator', null, 'NON_VIABLE'],
  ]).replace('</mutations>', "<mutation detected='false'><sourceFile>Odd.java</sourceFile><lineNumber>1</lineNumber></mutation>\n</mutations>")
  mutationRounds(host, [report], { line: 'orders $ mvn pitest', path: 'orders/target/pit/mutations.xml', passing: pitReport([]) })

  const outcome = await host.start()

  assert.equal(outcome.status, 'done', outcome.reason)
  const [first] = recorded(host, 'mutation')
  assert.deepEqual(first.failures, [`orders/mutation: exited 1, core 75% < 100%, boundary 20% < 80%, 5 mutants survive (evidence: ${TRACKING}/gates/orders/mutation-1.log)`])
  assert.deepEqual(first.survivors, [
    { file: 'orders/src/main/com/acme/Tax.java', mutants: ['orders/src/main/com/acme/Tax.java:8 VoidMethodCallMutator (removed call) survived'] },
    {
      file: 'orders/src/main/java/com/acme/Order.java',
      mutants: [
        'orders/src/main/java/com/acme/Order.java:9 NegateConditionalsMutator (changed <= to < "x" \'y\' > & more) has no test covering it',
        'orders/src/main/java/com/acme/Order.java:42 ConditionalsBoundaryMutator (changed conditional boundary) survived',
      ],
    },
    { file: 'orders/src/main/java/com/acme/domain/Price.java', mutants: ['orders/src/main/java/com/acme/domain/Price.java:4 MathMutator (Replaced integer addition) survived'] },
    { file: 'orders/src/main/kotlin/com/acme/Fee.kt', mutants: ['orders/src/main/kotlin/com/acme/Fee.kt:5 MathMutator (Replaced integer subtraction) survived'] },
  ])

  const notPit = scripted({ components: [service], machine: new ScriptedMachine() }, (it) => [agent()(it), agent()(it), agent()(it), agent({ work: orderCycle })(it)])
  mutationRounds(notPit, ['<html><body>PIT report</body></html>'], { line: 'orders $ mvn pitest', path: 'orders/target/pit/mutations.xml' })
  assert.ok((await notPit.start()).reason.includes('the mutation report orders/target/pit/mutations.xml is not a PIT mutations.xml report;'))
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
    agent({ work: ({ git }) => { git.reset('.', 'root-2'); killTest('Checkout')({ git }) } })(it),
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
  assert.ok(kills[1].prompt.includes('Refused in attempt 1 of 3:\n- commit root-3 "kill the card amount mutants" is not a conventional commit'), kills[1].prompt)
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

test('a mutation run passes on a report that meets each bar, the survivors of a scope at its bar kept', async () => {
  const host = scripted({ components: [API], machine: new ScriptedMachine() }, (it) => upToDeliver(it))
  mutationRounds(host, [], { passing: strykerReport({ 'src/Checkout.cs': [...mutants(4, 'Killed'), [5, 'Equality', '!=', 'Survived']] }) })

  assert.equal((await host.start()).status, 'done')
  assert.deepEqual(recorded(host, 'mutation').map(({ outcome: result, survivors, next }) => [result, survivors, next]), [['pass', [], 'deliver_review']])
  assert.deepEqual(host.events().filter((event) => event.type === 'gate.ran' && event.gate === 'mutation').map(({ status, survivors }) => [status, survivors]), [['pass', null]])
})
