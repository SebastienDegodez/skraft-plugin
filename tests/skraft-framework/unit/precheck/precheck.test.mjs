import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, nominal, PASSING_MATRIX, scripted, SLUG } from '../support/pipeline-host.mjs'

const [MATRIX_PATH, PASSING_TEXT] = PASSING_MATRIX
const NO_GATE = '| ADR | Verdict |\n- docs-relied-on: docs/architecture/context-map.md\n- consistency-gate: FAIL\n'
const MISSING_SOURCE = '| ADR | Verdict |\n- docs-relied-on: docs/architecture/absent.md\n- consistency-gate: PASS\n'
const TWO_SOURCES = '| ADR | Verdict |\n- docs-relied-on: docs/architecture/zebra.md, docs/architecture/context-map.md\n- consistency-gate: PASS\n'

const RECEIPT = `details/2026-10-11/precheck-design.json`

/** What the engine kept of the last pre-check of the design step, null when it kept none. @param {any} host */
const receipt = (host) => {
  const written = host.tracking.files.get(`${SLUG}/${RECEIPT}`)
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
  assert.deepEqual(answers[0].failures, [`${MATRIX_PATH}: its consistency-gate line does not read PASS (G10)`])
  assert.deepEqual(answers[1].failures, ['docs-relied-on lists docs/architecture/absent.md, which is no file of the working copy (#410)'])
  assert.deepEqual(answers[2].failures, [], 'a corrected design has no anomaly left')
  assert.deepEqual(answers.map(({ reason }) => reason), [
    '1 record(s) of this design do not pass: correct them and pre-check again',
    '1 record(s) of this design do not pass: correct them and pre-check again',
    'the design records pass this check; the engine checks them again at the submission',
  ])
  assert.deepEqual(answers.map(({ step }) => step), ['design', 'design', 'design'])
  assert.equal(dispatches(), host.events().filter((event) => event.type === 'step.started').length, 'a pre-check starts no agent')
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
  assert.deepEqual({ step: kept.step, attempt: kept.attempt, check: kept.check }, { step: 'design', attempt: 1, check: 'design-records' })
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
})

test('a pre-check outside any pipeline is refused, and answers nothing of a run it never read', async () => {
  const host = scripted({}, (it) => nominal(it))

  const { reason, ...outcome } = await host.precheck()

  assert.deepEqual(outcome, { status: 'refused', slug: null, step: null, attempt: null, check: null, failures: [], code: 'no-active-pipeline' })
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

test('a pre-check is refused, without a receipt, on a step whose role keeps no records', async () => {
  const answers = []
  const host = scripted({}, (it) => [
    agent({ work: async (inner) => { answers.push(await inner.precheck()) } })(it),
    ...nominal(it).slice(1),
  ])

  assert.equal((await host.start()).status, 'done')

  assert.deepEqual(answers, [{
    status: 'refused', slug: SLUG, step: null, attempt: null, check: null, failures: [], code: 'precheck-unavailable',
    reason: 'research keeps no records a pre-check reads; only the design step has one',
  }])
  assert.equal(receipt(host), null, 'a refused pre-check records nothing')
})
