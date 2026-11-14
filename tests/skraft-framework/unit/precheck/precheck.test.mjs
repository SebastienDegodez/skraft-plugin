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
  const written = host.tracking.files.get(`${SLUG}/details/2026-10-11/precheck-${step}.json`)
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

test('a pre-check blocks, without a receipt, when git can no longer tell what the story changed', async () => {
  const answers = []
  const host = scripted({}, (it) => [
    agent()(it),
    agent({ records: false, work: async (inner) => {
      inner.git.locate('.').repo.history.length = 0
      answers.push(await inner.precheck())
    } })(it),
    ...nominal(it).slice(2),
  ])

  await host.start()

  assert.deepEqual(answers.map(({ status, code, step }) => ({ status, code, step })), [{ status: 'blocked', code: 'environment', step: 'design' }])
  assert.match(answers[0].reason, /^Git cannot list what changed in /)
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

  assert.deepEqual(answers[0].failures, [{ code: 'adr-lifecycle', line: `${ADR_1} has no decision in its header: state it in one sentence` }],
    'a pre-check answers every mechanical check of the submission, not only the records of the role')
  assert.deepEqual(answers.map(({ status }) => status), ['failed', 'passed'])
  assert.deepEqual(answers[1].failures, [])
})
