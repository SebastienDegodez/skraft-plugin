import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readWorkflow } from '../../../plugins/skraft-framework/engine/domain/workflow/workflow.mjs'
import { questionSpec } from '../../../plugins/skraft-framework/engine/domain/decisions/questions.mjs'
import { panelFields, toFlow } from '../../../docs/website/src/components/WorkflowViewer/flow-model.mjs'

const WORKFLOWS = fileURLToPath(new URL('../../../plugins/skraft-framework/workflows/', import.meta.url))
const shipped = (file, how) => {
  const read = readWorkflow(readFileSync(join(WORKFLOWS, file), 'utf8'), how)
  assert.equal(read.ok, true, `${file} is read by the engine`)
  return read.workflow
}
const pipeline = shipped('pipeline.skraft.dot')
const review = shipped('review.skraft.dot', { called: true })
const answersOf = (question) => questionSpec(question).options
const SHIPPED = { pipeline, review }
const DIRECTIONS = ['LR', 'TB']

const drawn = (flow) => flow.nodes.filter((node) => node.type !== 'phase')
const byId = (flow, id) => flow.nodes.find((node) => node.id === id)

describe('the flow drawn from a shipped workflow', () => {
  for (const [name, workflow] of Object.entries(SHIPPED)) {
    test(`${name}: every engine node is drawn once, as its kind`, () => {
      const flow = toFlow(workflow, { direction: 'LR', answersOf })
      assert.deepEqual(drawn(flow).map(({ id, type }) => [id, type]), Object.values(workflow.nodes).map(({ id, kind }) => [id, kind]))
    })

    test(`${name}: every edge is drawn with its label and max_visits`, () => {
      const flow = toFlow(workflow, { direction: 'LR', answersOf })
      assert.deepEqual(
        flow.edges.map(({ source, target, data }) => [source, target, data.label, data.maxVisits]),
        workflow.edges.map(({ from, to, label, maxVisits }) => [from, to, label, maxVisits]),
      )
      assert.equal(new Set(flow.edges.map(({ id }) => id)).size, flow.edges.length, 'edge ids are unique')
    })

    for (const direction of DIRECTIONS) {
      test(`${name}, ${direction}: no two node boxes overlap and every edge has a route`, () => {
        const flow = toFlow(workflow, { direction, answersOf })
        const boxes = drawn(flow)
        for (const [index, a] of boxes.entries()) {
          for (const b of boxes.slice(index + 1)) assert.equal(overlap(a, b), false, `${a.id} and ${b.id} overlap`)
        }
        for (const edge of flow.edges) assert.ok(edge.data.points.length >= 2, `${edge.id} has a route`)
        for (const node of flow.nodes) assert.ok(inside(node, flow), `${node.id} lies inside the drawing`)
      })
    }
  }

  test('the DESIGN review is a group of its three lenses, labelled by its phase', () => {
    const node = byId(toFlow(pipeline, { direction: 'LR', answersOf }), 'design_review')
    assert.equal(node.data.title, 'DESIGN review')
    assert.deepEqual(node.data.branches.map(({ lens }) => lens), ['consistency', 'architecture-compliance', 'fitness'])
  })

  test('a lens keeps its when= and mandatory=', () => {
    const node = byId(toFlow(review, { direction: 'TB', answersOf }), 'verdict')
    assert.equal(node.data.title, 'review')
    assert.deepEqual(node.data.branches.map(({ lens, when, mandatory }) => [lens, when, mandatory]), [
      ['test-integrity', null, true],
      ['architecture-boundaries', null, true],
      ['cold-reader', null, null],
      ['mock-fidelity', 'mock', null],
      ['contract-fidelity', 'contract', null],
    ])
  })

  test('the gates and mutation nodes carry their lock, the mutation_gates node none', () => {
    const flow = toFlow(pipeline, { direction: 'LR', answersOf })
    assert.deepEqual(['gates', 'mutation', 'mutation_gates'].map((id) => byId(flow, id).data.node.locked), [true, true, false])
    assert.deepEqual(byId(flow, 'gates').data.node.gates, ['build', 'format', 'lint', 'test', 'architecture', 'coverage'])
  })

  test('the call node targets the review workflow', () => {
    const node = byId(toFlow(pipeline, { direction: 'LR', answersOf }), 'deliver_review')
    assert.equal(node.type, 'call')
    assert.equal(node.data.calls, 'review')
  })

  test('an ask node shows its question and the answers the engine offers', () => {
    const node = byId(toFlow(pipeline, { direction: 'LR', answersOf }), 'adr')
    assert.equal(node.data.node.question, 'adr-ratification')
    assert.deepEqual(node.data.answers, questionSpec('adr-ratification').options)
  })

  test('each phase is a lane holding exactly the nodes of that phase', () => {
    const flow = toFlow(pipeline, { direction: 'LR', answersOf })
    const lanes = flow.nodes.filter((node) => node.type === 'phase')
    assert.deepEqual(lanes.map(({ data }) => data.title), pipeline.phases)
    for (const lane of lanes) {
      for (const node of drawn(flow)) {
        const member = pipeline.nodes[node.id].phase === lane.data.title
        if (member) assert.ok(contains(lane, node), `${lane.data.title} holds ${node.id}`)
      }
    }
    assert.equal(lanes.length, 5)
  })

  test('a workflow without phases has no lane', () => {
    assert.deepEqual(toFlow(review, { direction: 'LR', answersOf }).nodes.filter((node) => node.type === 'phase'), [])
  })
})

describe('the side panel of a node', () => {
  test('lists every field the node sets, each linked to the reference', () => {
    const fields = panelFields(pipeline.nodes.gates)
    assert.deepEqual(fields.map(({ key, value }) => [key, value]), [
      ['id', 'gates'],
      ['kind', 'gate'],
      ['phase', 'DELIVER'],
      ['gates', 'build, format, lint, test, architecture, coverage'],
      ['goal', 'true'],
      ['locked', 'true'],
    ])
    const links = Object.fromEntries(fields.map(({ key, links }) => [key, links.map(({ to }) => to)]))
    assert.deepEqual(links.phase, ['reference/phases#deliver'])
    assert.deepEqual(links.locked, ['reference/workflow-dot#locked-nodes'])
    assert.equal(links.gates.length, 6)
    assert.ok(links.gates.every((to) => to === 'reference/gates#command-gates'))
  })

  test('shows an agent node with its agent, each= and proposal', () => {
    const fields = panelFields(pipeline.nodes.kill_proposal)
    assert.deepEqual(fields.map(({ key, value }) => [key, value]), [
      ['id', 'kill_proposal'],
      ['kind', 'agent'],
      ['phase', 'DELIVER'],
      ['agent', 'software-engineer'],
      ['each', 'survivor-file'],
      ['proposal', 'true'],
    ])
  })

  test('shows a review with its lenses, their when= and mandatory=', () => {
    const fields = panelFields(review.nodes.verdict)
    const branches = fields.find(({ key }) => key === 'branches')
    assert.equal(branches.value, 'test-integrity (mandatory), architecture-boundaries (mandatory), cold-reader, mock-fidelity (when=mock), contract-fidelity (when=contract)')
    assert.deepEqual(branches.links.map(({ to }) => to), ['reference/workflow-dot#reviews', 'reference/workflow-dot#conditional-lenses'])
    assert.equal(fields.find(({ key }) => key === 'mandatory').value, 'true')
    const refutedBy = fields.find(({ key }) => key === 'refutedBy')
    assert.equal(refutedBy.value, 'refuter (mandatory)')
    assert.deepEqual(refutedBy.links.map(({ to }) => to), ['reference/workflow-dot#reviews'])
  })

  test('shows a call with the workflow it runs', () => {
    const call = panelFields(pipeline.nodes.deliver_review).find(({ key }) => key === 'call')
    assert.equal(call.value, 'review')
    assert.deepEqual(call.links.map(({ to }) => to), ['reference/workflow-dot#call-node'])
  })
})

const overlap = (a, b) =>
  a.position.x < b.position.x + b.width && b.position.x < a.position.x + a.width &&
  a.position.y < b.position.y + b.height && b.position.y < a.position.y + a.height

const contains = (outer, inner) =>
  outer.position.x <= inner.position.x && outer.position.y <= inner.position.y &&
  inner.position.x + inner.width <= outer.position.x + outer.width &&
  inner.position.y + inner.height <= outer.position.y + outer.height

const inside = (node, flow) =>
  node.position.x >= 0 && node.position.y >= 0 &&
  node.position.x + node.width <= flow.width && node.position.y + node.height <= flow.height
