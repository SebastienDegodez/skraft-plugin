import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createObserve } from '../../../../plugins/skraft-framework/engine/application/pipeline/observe-usecase.mjs'
import { agent, pipelineHost, scripted } from '../support/pipeline-host.mjs'

/** A step of a drawing as a page shows it, its run state aside. */
const shape = ({ id, kind, phase, agent: runs, gates, question, publish, calls, lenses, refuter, mandatory, locked }) => ({ id, kind, phase, runs, gates, question, publish, calls, lenses, refuter, mandatory, locked })
const where = ({ id, state, visits }) => [id, state, visits]

test('the workflows a run of this working copy can follow are drawn before any run: the pipeline step by step, each detour right after the step it leaves, with its edges, then each workflow it calls, every step pending', async () => {
  const [pipeline, review, ...more] = await createObserve(pipelineHost().deps).workflows()

  assert.deepEqual(more, [])
  assert.deepEqual([pipeline.name, pipeline.file, pipeline.goal, review.name, review.file, review.goal], ['pipeline', null, 'Deliver the story', 'review', null, 'Review the changes'])
  assert.deepEqual(pipeline.steps.map(({ id }) => id), [
    'publish_consent', 'visuals_consent', 'research', 'design', 'design_review', 'adr', 'distill', 'distill_review', 'deliver', 'gates',
    'deliver_review', 'mutation', 'kill_proposal', 'mutation_plan', 'kill_mutants', 'mutation_review', 'mutation_gates', 'visuals', 'pr_writer', 'publish',
  ])
  const steps = Object.fromEntries(pipeline.steps.map((step) => [step.id, shape(step)]))
  assert.deepEqual(steps.design_review, {
    id: 'design_review', kind: 'review', phase: 'DESIGN', runs: null, gates: [], question: null, publish: null, calls: null, mandatory: true, locked: false,
    lenses: [{ lens: 'consistency', when: null }, { lens: 'architecture-compliance', when: null }, { lens: 'fitness', when: null }],
    refuter: { id: 'design_review_refuter', agent: 'finding-refuter', mandatory: true },
  })
  assert.deepEqual([steps.deliver_review.refuter, steps.mutation_review.refuter.id, steps.gates.refuter], [{ id: 'refuter', agent: 'finding-refuter', mandatory: true }, 'mutation_review_refuter', null])
  assert.deepEqual([steps.adr.question, steps.gates.gates, steps.gates.locked, steps.research.runs, steps.publish.publish, steps.deliver_review.calls], [
    'adr-ratification', ['build', 'format', 'lint', 'test', 'architecture', 'coverage'], true, 'solution-researcher', 'pull-request', 'review',
  ])
  assert.deepEqual(pipeline.edges.filter(({ from }) => from === 'adr'), [
    { from: 'adr', to: 'distill', label: 'RATIFIED', maxVisits: null, taken: 0 },
    { from: 'adr', to: 'design', label: 'REJECTED', maxVisits: 1, taken: 0 },
  ])
  assert.deepEqual(new Set(pipeline.steps.map(({ state }) => state)), new Set(['pending']))
  assert.deepEqual(review.steps.map(shape), [{
    id: 'verdict', kind: 'review', phase: null, runs: null, gates: [], question: null, publish: null, calls: null, mandatory: true, locked: false,
    refuter: { id: 'refuter', agent: 'finding-refuter', mandatory: true },
    lenses: [
      { lens: 'test-integrity', when: null }, { lens: 'architecture-boundaries', when: null }, { lens: 'cold-reader', when: null },
      { lens: 'mock-fidelity', when: 'mock' }, { lens: 'contract-fidelity', when: 'contract' },
    ],
  }])
})

test('an active slug with no journal draws its workflows with every step pending; a configuration that cannot be read draws none', async () => {
  const host = pipelineHost()
  await host.tracking.activate('checkout')

  const [pipeline] = await createObserve(host.deps).workflows()
  assert.deepEqual(new Set(pipeline.steps.map(({ state }) => state)), new Set(['pending']))

  await host.deps.workspace.write('skraft-config.json', 'not json')
  assert.deepEqual(await createObserve(host.deps).workflows(), [])
})

const REWORK = `digraph rework {
  start     [shape=Mdiamond]
  research  [shape=box, agent="solution-researcher", phase="RESEARCH"]
  lenses    [shape=component]
  fitness   [shape=note, lens="fitness"]
  refuter   [shape=octagon]
  check     [shape=tripleoctagon]
  pr_writer [shape=box, agent="pr-writer"]
  fix       [shape=box, agent="solution-architect"]
  exit      [shape=Msquare]
  start -> research -> lenses
  lenses -> fitness -> refuter -> check
  check -> pr_writer [label="APPROVED"]
  check -> fix [label="NEEDS_REWORK", max_visits=2]
  fix -> lenses
  pr_writer -> exit
}`

test('a rework a review sends to a step of its own is drawn right after the review, before the way on', async () => {
  const [pipeline] = await createObserve(pipelineHost({ workflow: REWORK }).deps).workflows()

  assert.deepEqual(pipeline.steps.map(({ id }) => id), ['research', 'check', 'fix', 'pr_writer'])
})

const WORKFLOW = `digraph consent {
  start    [shape=Mdiamond]
  research [shape=box, agent="solution-researcher", phase="RESEARCH"]
  consent  [shape=hexagon, question="publish-consent"]
  exit     [shape=Msquare]
  start -> research -> consent -> exit
}`

test('the pipeline a run follows is drawn with where the run stands: each step done, open or pending, and how often each edge was taken; a workflow the working copy ejected is named by its file', async () => {
  const host = scripted({ workflow: WORKFLOW, config: { publish: {} }, files: { '.skraft/pipeline.skraft.dot': WORKFLOW } }, (it) => [agent()(it)])
  assert.equal((await host.start()).status, 'waiting')

  const [pipeline, ...called] = await createObserve(host.deps).workflows()

  assert.deepEqual([pipeline.name, pipeline.file, called], ['pipeline', '.skraft/pipeline.skraft.dot', []])
  assert.deepEqual(pipeline.steps.map(where), [['research', 'done', 1], ['consent', 'open', 1]])
  assert.deepEqual(pipeline.edges, [
    { from: 'start', to: 'research', label: null, maxVisits: null, taken: 0 },
    { from: 'research', to: 'consent', label: null, maxVisits: null, taken: 1 },
    { from: 'consent', to: 'exit', label: null, maxVisits: null, taken: 0 },
  ])
})
