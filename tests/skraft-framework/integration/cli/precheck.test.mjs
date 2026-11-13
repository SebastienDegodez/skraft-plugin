import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loop, startAgents } from '../agent-loop/simulated-conductor.mjs'
import { trackingDir } from '../copilot-workflow/simulated-host.mjs'
import { SLUG, pipelineRepository, scriptedLlm } from '../support/pipeline-repository.mjs'
import { skraft } from '../support/workspace.mjs'

const TODAY = new Date().toISOString().slice(0, 10)

/** The loop run until the design step is dispatched: its attempt is then open, as it is for the agent. */
const designDispatched = async (cwd, llm) => {
  let step = (await loop(cwd, ['next'])).step
  for (let turn = 0; turn < 6 && !step.dispatches.some(({ agent }) => agent.endsWith('solution-architect')); turn++) {
    startAgents(step, llm)
    step = (await loop(cwd, ['record'])).step
  }
  return step
}

const receiptOf = (cwd) => JSON.parse(readFileSync(join(trackingDir(cwd, SLUG), 'details', TODAY, 'precheck-design.json'), 'utf8'))

test('an agent pre-checks the design of its own open attempt from the command line, is told what fails, and the engine keeps what the check read', async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  const llm = scriptedLlm({ cwd })
  const step = await designDispatched(cwd, llm)
  assert.deepEqual(step.dispatches.map(({ agent }) => agent.endsWith('solution-architect')), [true], 'the design step is the one dispatched')

  const empty = await skraft(cwd, ['precheck', '--json'])
  const failed = JSON.parse(empty.stdout)
  assert.deepEqual([empty.status, failed.status, failed.step, failed.attempt], [1, 'failed', 'design', 1])
  assert.ok(failed.failures.some((line) => line.startsWith('no consistency-matrix-<story>.md')), failed.failures.join('\n'))
  assert.deepEqual(receiptOf(cwd).failures, failed.failures, 'the receipt holds what that call found')

  const written = await skraft(cwd, ['precheck'])
  assert.match(written.stdout, /^fail {2}no consistency-matrix-<story>\.md/m)

  startAgents(step, llm)
  const corrected = await skraft(cwd, ['precheck'])
  assert.equal(corrected.status, 0)
  assert.match(corrected.stdout, /^skraft precheck: the design records pass this check; the engine checks them again at the submission$/m)

  const receipt = receiptOf(cwd)
  assert.deepEqual([receipt.step, receipt.attempt, receipt.check, receipt.failures], ['design', 1, 'design-records', []])
  const matrix = receipt.inputs.find(({ source, path }) => source === 'tracking' && path.endsWith(`consistency-matrix-${SLUG}.md`))
  assert.ok(matrix !== undefined && /^[0-9a-f]{64}$/.test(matrix.hash), 'the matrix it read is in the receipt, with the sha256 of its content')
  assert.ok(receipt.inputs.some(({ source, path }) => source === 'workspace' && path === 'docs/architecture/context-map.md'), 'a document the matrix named is in the receipt')

  mkdirSync(join(cwd, 'docs', 'architecture', 'diagrams'), { recursive: true })
  const named = join(trackingDir(cwd, SLUG), 'details', TODAY, `consistency-matrix-${SLUG}.md`)
  writeFileSync(named, '| ADR | Verdict |\n- docs-relied-on: docs/architecture/diagrams\n- consistency-gate: PASS\n')
  const folder = await skraft(cwd, ['precheck', '--json'])

  assert.deepEqual(JSON.parse(folder.stdout).failures, ['docs-relied-on lists docs/architecture/diagrams, which is no file of the working copy (#410)'])
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
