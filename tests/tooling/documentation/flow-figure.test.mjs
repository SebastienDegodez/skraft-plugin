// The handbook's animated flow figures: data generated from the workflow the engine runs,
// so a figure cannot show an edge, a verdict or a scenario the .dot does not have.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildFlow, outputsFor, layoutPaths } from '../../../eng/docs/flow-from-dot.mjs'
import { render, renderFigure, inline } from '../../../docs/site/assets/js/flow-figure/render.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const read = (path) => readFileSync(join(ROOT, path), 'utf8')
const deliverLayout = () => JSON.parse(read('docs/flows/deliver.layout.json'))
const pipeline = () => read('plugins/skraft-framework/workflows/pipeline.skraft.dot')

const DOT = `digraph t {
  a [shape=box, agent="software-engineer"]
  g [shape=parallelogram, gate="test"]
  q [shape=hexagon, question="plan"]
  a -> g
  g -> a [label="FAIL", max_visits=3]
  g -> q [label="PASS"]
}`
const layout = (over = {}) => ({
  id: 't',
  workflow: 'x.dot',
  grid: { pad: 10, top: 50, card: [100, 80], gap: [20, 40] },
  nodes: { a: { at: [0, 0], badge: '1' }, g: { at: [1, 0], badge: '2' }, q: { at: [2, 0], badge: '3' } },
  edges: { 'a->g': {}, 'g->a': { from: ['top', 0], to: ['top', 0], bend: [30, 30], chip: 'FAIL' }, 'g->q': {} },
  scenarios: [{ id: 's', label: { fr: 'S', en: 'S' }, path: ['a', 'g', 'a'], caption: { fr: 'c', en: 'c' } }],
  ...over,
})

test('every committed figure is what the generator makes from today\'s workflow', () => {
  for (const layoutPath of layoutPaths()) {
    for (const [path, content] of outputsFor(layoutPath)) {
      assert.equal(readFileSync(path, 'utf8'), content, `${path} is stale: run node eng/docs/flow-from-dot.mjs`)
    }
  }
})

test('nodes, verdicts, max_visits and kinds come from the .dot', () => {
  const flow = buildFlow(layout(), DOT)
  const g = flow.nodes.find((n) => n.id === 'g')
  assert.equal(g.kind, 'gate')
  assert.equal(g.mono, 'gate test')
  assert.deepEqual(g.out, ['PASS', 'FAIL'])
  assert.equal(flow.nodes.find((n) => n.id === 'q').kind, 'question')
  assert.equal(flow.nodes.find((n) => n.id === 'q').tone, 'amber')
  const back = flow.edges.find((e) => e.id === 'g->a')
  assert.equal(back.kind, 'fail')
  assert.equal(back.maxVisits, 3)
  assert.equal(back.chip.text, 'FAIL · max_visits 3')
  assert.match(back.d, /^M[\d.]+ [\d.]+ C/)
  assert.deepEqual(flow.scenarios[0].edges, ['a->g', 'g->a'])
})

test('a layout edge the workflow does not have is refused', () => {
  const l = layout()
  l.edges['q->a'] = {}
  assert.throws(() => buildFlow(l, DOT), /layout edge q->a is not in the workflow/)
})

test('a workflow edge the layout forgets is refused', () => {
  const l = layout()
  delete l.edges['g->q']
  assert.throws(() => buildFlow(l, DOT), /workflow edge g->q has no place in the layout/)
})

test('a scenario cannot walk an edge that does not exist', () => {
  const l = layout({ scenarios: [{ id: 'bad', label: 'B', caption: 'c', path: ['a', 'q'] }] })
  assert.throws(() => buildFlow(l, DOT), /scenario bad: no edge a->q/)
})

test('a layout node the workflow does not have is refused', () => {
  const l = layout()
  l.nodes.z = { at: [3, 0] }
  assert.throws(() => buildFlow(l, DOT), /layout node z is not in the workflow/)
})

test('the DELIVER figure follows pipeline.skraft.dot, lenses folded into their review', () => {
  const flow = buildFlow(deliverLayout(), pipeline())
  const ids = flow.edges.map((e) => e.id)
  for (const id of ['gates->deliver', 'deliver_review->deliver', 'mutation->kill_proposal', 'mutation_gates->mutation', 'mutation_review->kill_mutants']) {
    assert.ok(ids.includes(id), id)
  }
  assert.equal(flow.edges.find((e) => e.id === 'mutation->kill_proposal').maxVisits, 5)
  assert.ok(!flow.nodes.some((n) => n.id === 'mutation_review_lenses'))
  assert.equal(flow.nodes.find((n) => n.id === 'mutation_review').mono, 'lens test-integrity')
  assert.deepEqual(flow.scenarios.map((s) => s.id), ['nominal', 'gate-red', 'rework', 'survivors'])
  assert.deepEqual(flow.scenarios.find((s) => s.id === 'survivors').edges.slice(-1), ['mutation_gates->mutation'])
})

test('the svg is named for screen readers and the figure carries a text version of each scenario', () => {
  const flow = buildFlow(deliverLayout(), pipeline())
  const svg = render(flow, { lang: 'en' })
  assert.match(svg, /role="img" aria-labelledby="sf-deliver-en-t sf-deliver-en-d"/)
  assert.match(svg, /<title id="sf-deliver-en-t">The DELIVER loop/)
  const html = renderFigure(flow, { lang: 'fr' })
  assert.match(html, /<p class="sf-caption" aria-live="polite"><b>Nominal<\/b>/)
  assert.equal((html.match(/<ol class="sf-alt__steps"/g) ?? []).length, flow.scenarios.length)
  assert.match(html, /<button type="button" class="sf-seg__btn" data-scenario="survivors" aria-pressed="false">Mutants survivants<\/button>/)
  // no blank line: kramdown must keep the pre-rendered block as one HTML block
  assert.ok(!/\n\s*\n/.test(html))
})

test('captions escape their text and turn backticks into code', () => {
  assert.equal(inline('a `<b>` & c'), 'a <code>&lt;b&gt;</code> &amp; c')
})
