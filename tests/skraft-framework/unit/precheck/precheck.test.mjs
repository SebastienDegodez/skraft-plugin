import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, nominal, PASSING_MATRIX, scripted, SLUG } from '../support/pipeline-host.mjs'
import { ADR_1, adrText, indexFor, INDEX } from '../support/decisions.mjs'

const [MATRIX_PATH, PASSING_TEXT] = PASSING_MATRIX
const NO_GATE = '| ADR | Verdict |\n- docs-relied-on: docs/architecture/context-map.md\n- consistency-gate: FAIL\n'
const MISSING_SOURCE = '| ADR | Verdict |\n- docs-relied-on: docs/architecture/absent.md\n- consistency-gate: PASS\n'
const TWO_SOURCES = '| ADR | Verdict |\n- docs-relied-on: docs/architecture/zebra.md, docs/architecture/context-map.md\n- consistency-gate: PASS\n'

const RESEARCH = 'research/2026-10-11/checkout-research.md'

/** What the engine kept of the last pre-check of a step, null when it kept none. @param {any} host @param {string} [step] */
const receipt = (host, step = 'design') => {
  const written = host.tracking.files.get(`${SLUG}/logs/precheck-${step}-inputs.json`)
  return written === undefined ? null : JSON.parse(written)
}

/**
 * An architect that pre-checks its design during its attempt, as the tool lets it: it writes what
 * `drafts` holds, pre-checks, and keeps each answer.
 * @param {string[]} drafts the matrix text of each draft, in order @param {object[]} answers
 */
const precheckingArchitect = (drafts, answers, inventories = []) => agent({
  records: false,
  work: async (host) => {
    for (const text of drafts) {
      await host.tracking.write(SLUG, MATRIX_PATH, text)
      const listed = await host.tracking.list(SLUG, '')
      answers.push(await host.precheck())
      inventories.push(await host.deps.hasher.sha256(listed.join('\n')))
    }
  },
})

test('the architect pre-checks its design during its attempt, is told what fails and what reads no file, and gets a success once it corrects it', async () => {
  const answers = []
  const host = scripted({}, (it) => [
    agent()(it),
    precheckingArchitect([NO_GATE, MISSING_SOURCE, PASSING_TEXT], answers)(it),
    ...nominal(it).slice(2),
  ])
  const dispatches = () => host.events().filter((event) => event.type === 'step.started').length

  assert.equal((await host.start()).status, 'done')

  assert.deepEqual(answers.map(({ status }) => status), ['failed', 'failed', 'passed'])
  assert.deepEqual(answers[0].failures, [{ code: 'design-records', line: `${MATRIX_PATH}: its consistency-gate line does not read PASS (G10)` }])
  assert.deepEqual(answers[1].failures, [{ code: 'design-records', line: 'docs-relied-on lists docs/architecture/absent.md, which is no file of the working copy (#410)' }])
  assert.deepEqual(answers[2].failures, [], 'a corrected design has no anomaly left')
  assert.deepEqual(answers.map(({ reason }) => reason), [
    '1 anomaly(ies) of this attempt do not pass: correct them and pre-check again',
    '1 anomaly(ies) of this attempt do not pass: correct them and pre-check again',
    'these checks pass on what this attempt has written; the engine runs them again at the submission',
  ])
  assert.deepEqual(answers.map(({ step }) => step), ['design', 'design', 'design'])
  assert.equal(dispatches(), host.events().filter((event) => event.type === 'step.started').length, 'a pre-check starts no agent')
  const recorded = host.events().findLast((event) => event.type === 'step.recorded' && event.step === 'design')
  const calls = recorded.prechecks ?? []
  assert.deepEqual(calls.map(({ status, failures, found }) => ({ status, failures, found })), [
    { status: 'failed', failures: 1, found: answers[0].failures },
    { status: 'failed', failures: 1, found: answers[1].failures },
    { status: 'passed', failures: 0, found: [] },
  ], 'the step keeps every pre-check of its attempt, in the order they ran, with what each answered and the cause it gave')
  assert.ok(calls.every(({ at }) => !Number.isNaN(Date.parse(at))), 'each call is dated')
  const written = host.tracking.files.get(`${SLUG}/run-report.md`)
  assert.match(written, /## Pre-checks/, 'the report a human reads has a section for them')
  assert.deepEqual(written.split('\n').filter((line) => line.startsWith('| design | 2026-')).map((line) => line.split(' | ').slice(2).join(' | ')), [
    `failed | 1 | design-records: ${answers[0].failures[0].line} |`,
    `failed | 1 | design-records: ${answers[1].failures[0].line} |`,
    'passed | 0 | - |',
  ], 'one row per call: its status, how many anomalies it answered and each one under the check that found it')
})

test('the receipt names the attempt it read and the paths it read with the hash of their content, the absent ones included, and each call rewrites it', async () => {
  const answers = []
  const inventories = []
  const host = scripted({ files: { 'docs/architecture/zebra.md': '# Zebra\n' } }, (it) => [
    agent()(it),
    precheckingArchitect([MISSING_SOURCE, TWO_SOURCES], answers, inventories)(it),
    ...nominal(it).slice(2),
  ])

  assert.equal((await host.start()).status, 'done')

  const kept = receipt(host)
  assert.deepEqual({ step: kept.step, attempt: kept.attempt }, { step: 'design', attempt: 1 })
  assert.deepEqual(kept.failures, [], 'the receipt is the last call, which passed')
  const absent = answers[0].failures.length
  assert.equal(absent, 1, 'the first call did fail, so the receipt was rewritten')
  const matrix = kept.inputs.find(({ source, path }) => source === 'tracking' && path === MATRIX_PATH)
  assert.ok(matrix !== undefined && matrix.hash !== null, 'the matrix it read is in the receipt, with the hash of its content')
  assert.deepEqual(kept.inputs.map(({ source, path }) => `${source} ${path}`), [
    'tracking-list ',
    `tracking ${MATRIX_PATH}`,
    'workspace docs/architecture/context-map.md',
    'workspace docs/architecture/zebra.md',
  ], 'every read, each once, in one order of its own: the matrix named zebra first, the receipt sorts it last')
  assert.equal(kept.inputs[0].hash, inventories[1], 'the inventory is the hash of every file of the run folder, in the order the port lists them')
  assert.deepEqual(kept.inputs.find(({ path }) => path === 'docs/architecture/absent.md'), undefined, 'the corrected design names no absent file')
  const recorded = host.events().findLast((event) => event.type === 'step.recorded' && event.step === 'design')
  assert.ok(recorded.documents.includes(MATRIX_PATH), 'the design the architect wrote is a document of its step')
  assert.deepEqual(recorded.documents.filter((path) => path.includes('precheck-')), [], 'the receipt is the engine\'s record of a call, not a document the step wrote: the review never serves it to a lens')
})

test('a pre-check outside any pipeline is refused, and answers nothing of a run it never read', async () => {
  const host = scripted({}, (it) => nominal(it))

  const { reason, ...outcome } = await host.precheck()

  assert.deepEqual(outcome, { status: 'refused', slug: null, step: null, attempt: null, failures: [], code: 'no-active-pipeline' })
  assert.match(reason, /^no active pipeline in this working copy/)
})

test('a pre-check blocks, without a receipt, when the workflow the working copy ejected cannot be read', async () => {
  const answers = []
  const host = scripted({}, (it) => [
    agent()(it),
    agent({ records: false, work: async (inner) => {
      await inner.workspace.write('.skraft/pipeline.skraft.dot', 'digraph pipeline {\n  research [shape=box, agent="solution-researcher"]\n  design [shape=box, agent="solution-architect"]\n  research -> design\n}\n')
      answers.push(await inner.precheck())
    } })(it),
    ...nominal(it).slice(2),
  ])

  await host.start()

  assert.deepEqual(answers.map(({ status, code }) => ({ status, code })), [{ status: 'blocked', code: 'workflow-refused' }])
  assert.equal(answers[0].reason, 'node design: agent node needs exactly one outgoing edge, has 0; the workflow needs exactly one start node (shape=Mdiamond), has 0; the workflow needs at least one exit node (shape=Msquare)', 'every reason the workflow gives, in one line')
  assert.equal(receipt(host), null, 'a blocked pre-check records nothing')
})

/**
 * The plugin's own pipeline as the working copy ejects it, with the step the attempt runs on
 * renamed: a valid workflow the run's own step is no node of.
 * @param {any} host
 */
const renamed = (host) => host.deps.workflowSource.text.replace(/\bdesign\b(?!_)/g, 'blueprint')

test('a pre-check refuses what the working copy changed under the open attempt: a configuration the engine will not read blocks it, a workflow that renamed its step is refused', async () => {
  const answers = []
  const host = scripted({}, (it) => [
    agent()(it),
    agent({ records: false, work: async (inner) => {
      const configured = await inner.workspace.read('skraft-config.json')
      await inner.workspace.write('skraft-config.json', '{ "components": [')
      answers.push(await inner.precheck())
      await inner.workspace.write('skraft-config.json', configured)
      await inner.workspace.write('.skraft/pipeline.skraft.dot', renamed(inner))
      answers.push(await inner.precheck())
      inner.workspace.files.delete('.skraft/pipeline.skraft.dot')
    } })(it),
    ...nominal(it).slice(2),
  ])

  await host.start()

  assert.deepEqual(answers.map(({ status, code, step, attempt, failures }) => ({ status, code, step, attempt, failures })), [
    { status: 'blocked', code: 'environment', step: 'design', attempt: 1, failures: [] },
    { status: 'refused', code: 'precheck-unavailable', step: null, attempt: null, failures: [] },
  ], 'a pre-check that read no check of the attempt answers no anomaly of it, and the refusal names no attempt it never opened')
  assert.equal(answers[1].reason, 'design is no agent step: a pre-check reads what an agent writes',
    'the workflow the working copy now holds runs no agent under the step the attempt is open on')
  assert.match(answers[0].reason, /skraft-config\.json/)
  assert.equal(receipt(host), null, 'none of them records a receipt')
})

test('a pre-check blocks, without a receipt, when git can no longer read a decision the attempt changed, or tell what the story changed at all', async () => {
  const answers = []
  const host = scripted({}, (it) => [
    agent()(it),
    agent({ records: false, work: async (inner) => {
      inner.workspace.files.set(ADR_1, adrText({}))
      inner.git.published.add(ADR_1)
      inner.git.change(ADR_1)
      answers.push(await inner.precheck())
      inner.git.locate('.').repo.history.length = 0
      answers.push(await inner.precheck())
    } })(it),
    ...nominal(it).slice(2),
  ])

  await host.start()

  assert.deepEqual(answers.map(({ status, code, step }) => ({ status, code, step })),
    [{ status: 'blocked', code: 'environment', step: 'design' }, { status: 'blocked', code: 'environment', step: 'design' }],
    'a pre-check that cannot read what it checks against blocks on the machine, and answers no anomaly of the attempt')
  assert.equal(answers[0].reason, `Git cannot read ${ADR_1} at root-0`, 'the decision is on the base, and its text there is what the check needs')
  assert.match(answers[1].reason, /^Git cannot list what changed in /)
  assert.deepEqual(answers.map(({ failures }) => failures), [[], []])
  assert.equal(receipt(host), null, 'a blocked pre-check records nothing')
})

test('the researcher pre-checks the citations of its own document during its attempt, is told which path no file holds, and gets a success once it corrects it', async () => {
  const answers = []
  const document = (/** @type {string} */ path) => ['# Research: filled in', '', '## Research executed', '### File analysis', `- #file:${path}`, ''].join('\n')
  const host = scripted({}, (it) => [
    agent({ fill: false, work: async (inner) => {
      await inner.tracking.write(SLUG, RESEARCH, document('src/Absent.cs'))
      answers.push(await inner.precheck())
      await inner.tracking.write(SLUG, RESEARCH, document('docs/architecture/context-map.md'))
      answers.push(await inner.precheck())
    } })(it),
    ...nominal(it).slice(1),
  ])

  assert.equal((await host.start()).status, 'done', 'what the pre-check passed, the engine accepts at the submission')

  assert.deepEqual(answers.map(({ status, step }) => ({ status, step })), [
    { status: 'failed', step: 'research' },
    { status: 'passed', step: 'research' },
  ])
  assert.deepEqual(answers[0].failures, [{ code: 'research-records', line: `${RESEARCH} cites #file:src/Absent.cs, which is no file of the working copy (#517)` }])
  assert.deepEqual(answers[1].failures, [])
  const kept = receipt(host, 'research')
  assert.deepEqual({ step: kept.step, attempt: kept.attempt, failures: kept.failures }, { step: 'research', attempt: 1, failures: [] })
  assert.ok(kept.inputs.some(({ source, path }) => source === 'tracking' && path === RESEARCH), 'the document it read is in the receipt')
  assert.ok(kept.inputs.some(({ source, path }) => source === 'workspace' && path === 'docs/architecture/context-map.md'), 'and the file that document cites')
})

test('a step that keeps no DESIGN records is pre-checked too, on the checks of its own submission; between steps a pre-check is refused', async () => {
  const answers = []
  const host = scripted({}, (it) => [
    ...nominal(it).slice(0, 2),
    agent({ work: async (inner) => {
      answers.push(await inner.precheck())
      inner.git.commit('test(checkout): acceptance of the card payment', ['tests/Acceptance/CheckoutAcceptanceTests.cs'])
    } })(it),
    ...nominal(it).slice(3),
  ])

  assert.equal((await host.start()).status, 'done')

  assert.deepEqual(answers.map(({ status, step, failures }) => ({ status, step, failures })), [{ status: 'passed', step: 'distill', failures: [] }],
    'DISTILL keeps none of the DESIGN records, and the checks its own submission runs are pre-checked all the same')
  assert.ok(receipt(host, 'distill') !== null, 'a pre-check that ran keeps its receipt')
  const between = await host.precheck()
  assert.deepEqual([between.status, between.code, between.reason], ['refused', 'precheck-unavailable', 'no attempt is open in this run: nothing to pre-check'],
    'the run is done, no attempt is open, so there is nothing to pre-check')
})

test('the pre-check answers the lifecycle of the decisions the attempt wrote, the check the submission refuses it on', async () => {
  const answers = []
  const host = scripted({ answers: [{ answer: 'RATIFIED' }] }, (it) => [
    agent()(it),
    agent({
      records: false,
      work: async (host) => {
        await host.tracking.write(SLUG, MATRIX_PATH, PASSING_TEXT)
        host.workspace.files.set(INDEX, indexFor(1))
        host.workspace.files.set(ADR_1, adrText({ decision: null }))
        host.git.change(INDEX, ADR_1)
        answers.push(await host.precheck())
        host.workspace.files.set(ADR_1, adrText({}))
        answers.push(await host.precheck())
      },
    })(it),
    ...nominal(it).slice(2),
  ])

  assert.equal((await host.start()).status, 'done')

  assert.deepEqual(answers[0].failures, [{ code: 'adr-lifecycle', line: `${ADR_1} has no \`decision:\` key in its YAML header: add \`decision: <the verdict in one sentence>\` between the --- lines that open the file` }],
    'a pre-check answers every mechanical check of the submission, not only the records of the role')
  assert.deepEqual(answers.map(({ status }) => status), ['failed', 'passed'])
  assert.deepEqual(answers[1].failures, [])
  assert.deepEqual(receipt(host).inputs.find(({ source }) => source === 'workspace-list'),
    { source: 'workspace-list', path: 'docs/adr', hash: await host.deps.hasher.sha256('.gitkeep\ndecisions-index.md\nadr-001-card-payment.md') },
    'the folder the decisions check walked is in the receipt too, with the hash of the names the working copy answered, in their order')
})

/** The two scenarios of a story delivered one at a time, which makes DISTILL run twice. */
const TWO = [['Customer pays by card'], ['Customer is refused an expired card', 'api', '@error-case']]
const S2 = 'tests/Acceptance/S2AcceptanceTests.cs'

/** A commit of scenario k, as the designer and the engineer each make theirs. @param {number} index */
const red = (index) => ({ git }) => git.commit(`test(${SLUG}): scenario ${index}`, [`tests/Acceptance/S${index}AcceptanceTests.cs`])
const greenOf = (index) => ({ git }) => git.commit(`feat(${SLUG}): scenario ${index}`, [`src/Scenario${index}.cs`, `tests/Unit/Scenario${index}Tests.cs`])

const TRAIL = `${SLUG}/logs/precheck-distill.jsonl`

/** A trail a crash left half-written: the line it was appending stops mid-string. @param {any} host */
const halfWritten = (host) => host.tracking.files.set(TRAIL, `${host.tracking.files.get(TRAIL)}{"at":"2026-10-11T00:00:00.000Z","step":"dist\n`)

/** The pre-checks of a step, as the journal kept them per attempt. @param {any} host @param {string} step */
const recordedCalls = (host, step) => host.events().filter((event) => event.type === 'step.recorded' && event.step === step)

test('the trail keeps the calls of each attempt apart: the attempt sent back, the one that replaced it and the next scenario each journal their own, and none of them reads a commit', async () => {
  const answers = []
  const asked = async (/** @type {any} */ host) => answers.push(await host.precheck())
  const host = scripted({}, (it) => [
    agent()(it),
    agent()(it),
    agent({ plan: TWO, work: async (inner) => { await asked(inner); await asked(inner) } })(it),
    agent({ plan: TWO, work: async (inner) => { await asked(inner); inner.git.commit(`test(${SLUG}): walking skeleton`, ['tests/Integration/WalkingSkeletonTests.cs']) } })(it),
    agent({ work: greenOf(1) })(it),
    agent({ work: async (inner) => {
      await asked(inner)
      halfWritten(inner)
      inner.git.change(S2)
      await asked(inner)
      red(2)(inner)
      await asked(inner)
    } })(it),
    agent({ work: greenOf(2) })(it),
  ])

  assert.equal((await host.start()).status, 'done')

  assert.deepEqual(recordedCalls(host, 'distill').map(({ visit, attempt, outcome, code }) => [visit, attempt, outcome, code]), [
    [1, 1, 'failed', 'tdd'], [1, 2, 'done', null], [2, 1, 'done', null], [3, 1, 'done', null],
  ], 'the attempt that committed no red is refused on a check no pre-check runs: a pre-check reads no commit')
  assert.deepEqual(recordedCalls(host, 'distill').map(({ prechecks = [] }) => prechecks.map(({ status }) => status)), [
    ['passed', 'passed'], ['passed'], [], ['passed', 'failed', 'passed'],
  ], 'each attempt journals the calls of its own visit and attempt, and no call of another')
  assert.deepEqual(answers.map(({ status, step }) => `${step} ${status}`),
    ['distill passed', 'distill passed', 'distill passed', 'distill passed', 'distill failed', 'distill passed'],
    'the agents were told what the journal kept, in the order they asked')
  assert.deepEqual(host.events().filter((event) => event.type === 'step.recorded' && 'prechecks' in event).map(({ step }) => step),
    ['distill', 'distill', 'distill'], 'a step whose attempt asked nothing journals no pre-checks at all')
  assert.deepEqual(recordedCalls(host, 'distill')[3].prechecks[1].found,
    [{ code: 'uncommitted', line: `left uncommitted: ${S2}; commit it or undo the change` }],
    'the call that failed holds the anomaly it answered, and the next scenario\'s commit clears it')
  assert.deepEqual(host.tracking.files.get(TRAIL).split('\n').filter((line) => line !== '').length, 7,
    'one trail holds the six calls of the step and the half-written line: the journal kept the calls it could read, each under its own attempt, and dropped that line')
})
