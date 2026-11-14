import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loop, startAgents } from '../agent-loop/simulated-conductor.mjs'
import { trackingDir } from '../copilot-workflow/simulated-host.mjs'
import { SLUG, pipelineRepository, scriptedLlm } from '../support/pipeline-repository.mjs'
import { skraft } from '../support/workspace.mjs'

const TODAY = new Date().toISOString().slice(0, 10)

/**
 * The loop run until the design step is dispatched: its attempt is then open, as it is for the
 * agent. `seen` keeps, for each dispatch before it, what a pre-check answered that producer.
 */
const designDispatched = async (cwd, llm, seen = []) => {
  let step = (await loop(cwd, ['next'])).step
  for (let turn = 0; turn < 6 && !step.dispatches.some(({ agent }) => agent.endsWith('solution-architect')); turn++) {
    seen.push({ agent: step.dispatches[0].agent, answer: JSON.parse((await skraft(cwd, ['precheck', '--json'])).stdout) })
    startAgents(step, llm)
    step = (await loop(cwd, ['record'])).step
  }
  return step
}

const receiptOf = (cwd) => JSON.parse(readFileSync(join(trackingDir(cwd, SLUG), 'details', TODAY, 'precheck-design.json'), 'utf8'))

/** The trail of a step's pre-checks, one call per line. @param {string} cwd @param {string} step */
const trailOf = (cwd, step) => readFileSync(join(trackingDir(cwd, SLUG), 'logs', `precheck-${step}.jsonl`), 'utf8')
  .split('\n').filter((line) => line !== '').map((line) => JSON.parse(line))

test('an agent pre-checks the design of its own open attempt from the command line, is told what fails, and the engine keeps what the check read', async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  const llm = scriptedLlm({ cwd })
  const before = []
  const step = await designDispatched(cwd, llm, before)
  assert.deepEqual(step.dispatches.map(({ agent }) => agent.endsWith('solution-architect')), [true], 'the design step is the one dispatched')
  assert.deepEqual(before.map(({ agent, answer }) => `${agent.split(':').pop()} ${answer.step} ${answer.status}`), ['solution-researcher research failed'],
    'the researcher is served by the same command, on its own step')
  assert.deepEqual([...new Set(before.flatMap(({ answer }) => answer.failures.map(({ code }) => code)))], ['missing-outputs', 'research-records'],
    'called before it filled its document, the pre-check answers the output the submission would miss, then the citations of the template it still holds')

  const empty = await skraft(cwd, ['precheck', '--json'])
  const failed = JSON.parse(empty.stdout)
  assert.deepEqual([empty.status, failed.status, failed.step, failed.attempt], [1, 'failed', 'design', 1])
  assert.ok(failed.failures.some(({ code, line }) => code === 'design-records' && line.startsWith('no consistency-matrix-<story>.md')), JSON.stringify(failed.failures))
  assert.deepEqual(receiptOf(cwd).failures, failed.failures, 'the receipt holds what that call found')

  const written = await skraft(cwd, ['precheck'])
  assert.match(written.stdout, /^fail {2}design-records {2}no consistency-matrix-<story>\.md/m)

  startAgents(step, llm)
  const corrected = await skraft(cwd, ['precheck'])
  assert.equal(corrected.status, 0)
  assert.match(corrected.stdout, /^skraft precheck: these checks pass on what this attempt has written; the engine runs them again at the submission$/m)

  const receipt = receiptOf(cwd)
  assert.deepEqual([receipt.step, receipt.attempt, receipt.failures], ['design', 1, []])
  const matrix = receipt.inputs.find(({ source, path }) => source === 'tracking' && path.endsWith(`consistency-matrix-${SLUG}.md`))
  assert.ok(matrix !== undefined && /^[0-9a-f]{64}$/.test(matrix.hash), 'the matrix it read is in the receipt, with the sha256 of its content')
  assert.ok(receipt.inputs.some(({ source, path }) => source === 'workspace' && path === 'docs/architecture/context-map.md'), 'a document the matrix named is in the receipt')

  mkdirSync(join(cwd, 'docs', 'architecture', 'diagrams'), { recursive: true })
  const named = join(trackingDir(cwd, SLUG), 'details', TODAY, `consistency-matrix-${SLUG}.md`)
  writeFileSync(named, '| ADR | Verdict |\n- docs-relied-on: docs/architecture/diagrams\n- consistency-gate: PASS\n')
  const folder = await skraft(cwd, ['precheck', '--json'])

  assert.deepEqual(JSON.parse(folder.stdout).failures, [{ code: 'design-records', line: 'docs-relied-on lists docs/architecture/diagrams, which is no file of the working copy (#410)' }])
  const trail = trailOf(cwd, 'design')
  assert.deepEqual(trail.map(({ status }) => status), ['failed', 'failed', 'passed', 'failed'], 'the trail holds one line per call of the attempt, in the order they ran')
  assert.deepEqual([...new Set(trail.map(({ step, visit, attempt }) => `${step} ${visit} ${attempt}`))], ['design 1 1'], 'each line names the step, its visit and its attempt')
  assert.ok(trail.every(({ status, failures, at, found }) => (failures > 0) === (status === 'failed') && found.length === failures && !Number.isNaN(Date.parse(at))), 'each line is dated and holds every anomaly it counted')
  assert.deepEqual(trail[0].found, failed.failures, 'the trail keeps the cause the command gave the agent, not only how many')
  assert.deepEqual(trailOf(cwd, 'research').map(({ step, status }) => `${step} ${status}`), ['research failed'], 'the researcher keeps its own trail, under its own step')
  assert.deepEqual(receiptOf(cwd).inputs.find(({ path }) => path === 'docs/architecture/diagrams'), { source: 'workspace', path: 'docs/architecture/diagrams', hash: null }, 'a path the working copy cannot read as a file is in the receipt, with no hash')
})

test('the command line refuses a pre-check outside an open records step, and tells why', async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])

  const refused = await skraft(cwd, ['precheck', '--json'])

  const outcome = JSON.parse(refused.stdout)
  assert.deepEqual([refused.status, outcome.status, outcome.code], [1, 'refused', 'precheck-unavailable'])
  assert.match(outcome.reason, /no attempt is open in this run/)
})
