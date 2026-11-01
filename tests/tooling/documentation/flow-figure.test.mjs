// The handbook's animated flow figures: read from the workflow by the engine's own reader, drawn
// with the canvas's own arrow routing. The figure fixes what the engine fixes and follows the
// .dot for everything else.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildFlow, outputsFor, layoutPaths, workflowTexts, readFlowWorkflow, invariantsOf, missingInvariants } from '../../../eng/docs/flow-from-dot.mjs'
import { render, renderFigure, renderSub, inline } from '../../../eng/docs/flow/core/render.mjs'
import { renderArrows } from '../../../plugins/skraft-framework/engine/drivers/copilot-workflow/canvas-ui/view.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const layout = () => JSON.parse(readFileSync(join(ROOT, 'docs/flows/deliver.layout.json'), 'utf8'))
const texts = () => workflowTexts(layout())
const sub = (flow, id) => flow.subs[id]

test("every committed flow is what the generator makes from today's workflow", async () => {
  for (const layoutPath of layoutPaths()) {
    for (const [path, content] of await outputsFor(layoutPath)) {
      assert.equal(readFileSync(path, 'utf8'), content, `${path} is stale: run node eng/docs/flow-from-dot.mjs`)
    }
  }
})

test('the DELIVER column, its folds and its sub-tasks come from the workflow the engine reads', async () => {
  const flow = await buildFlow(layout(), texts())
  assert.deepEqual(flow.order, ['distill_review', 'deliver', 'gates', 'deliver_review', 'mutation', 'visuals', 'pr_writer', 'publish', 'exit'])
  assert.deepEqual(sub(flow, 'gates').all, ['build', 'format', 'lint', 'test', 'architecture', 'coverage'])
  assert.deepEqual(sub(flow, 'mutation').all, ['kill_proposal', 'mutation_plan', 'kill_mutants', 'mutation_review', 'mutation_gates'])
  assert.deepEqual(sub(flow, 'deliver_review').all, ['test_integrity', 'architecture_boundaries', 'cold_reader', 'mock_fidelity', 'contract_fidelity'])
  const loop = flow.edges.find((e) => e.id === 'mutation->mutation')
  assert.deepEqual([loop.label, loop.maxVisits, loop.via], ['FAIL', 5, 'kill_proposal'])
  const lenses = sub(flow, 'deliver_review').nodes
  assert.equal(lenses.find((n) => n.id === 'mock_fidelity').when, 'mock')
  assert.equal(lenses.find((n) => n.id === 'cold_reader').optional, true)
  assert.equal(lenses.find((n) => n.id === 'test_integrity').seal, 'mandatory')
  assert.equal(sub(flow, 'mutation').nodes.find((n) => n.id === 'kill_proposal').each, 'survivor-file')
  assert.ok(sub(flow, 'mutation').edges.find((e) => e.id === 'kill_proposal->mutation_plan').multi)
  assert.deepEqual(flow.nodes.map((n) => n.kind), ['terminal', 'agent', 'gate', 'review', 'gate', 'code', 'agent', 'code', 'terminal'])
})

test('the refuter is read from the node of review.skraft.dot its lenses join, sealed by its mandatory=, between them and the verdict', async () => {
  const flow = await buildFlow(layout(), texts())
  const review = sub(flow, 'deliver_review')
  const refuter = review.nodes.find((n) => n.refuter)
  assert.deepEqual([refuter.id, refuter.mono, refuter.seal], ['refuter', 'finding-refuter', 'mandatory'])
  assert.deepEqual(refuter.severities, ['blocker', 'high', 'medium'])
  const t = texts()
  t.review = t.review.replaceAll('refuter', 'challenger').replace('challenger [shape=octagon, mandatory=true]', 'challenger [shape=octagon]')
  const renamed = sub(await buildFlow({ ...layout(), texts: { ...layout().texts, challenger: layout().texts.refuter, refuter: undefined } }, t), 'deliver_review').nodes.find((n) => n.refuter)
  assert.deepEqual([renamed.id, renamed.seal, renamed.optional], ['challenger', undefined, true])
  assert.ok(review.edges.some((e) => e.id === 'verdict#in->refuter'))
  assert.ok(review.edges.some((e) => e.id === 'refuter->verdict'))
  const steps = flow.scenarios.find((s) => s.id === 'refuted').steps
  assert.deepEqual(steps.filter((s) => s.chip).map((s) => s.chip.text), ['refuted', 'APPROVED'])
})

test('a lens added to or removed from the review, a command dropped from a gate, a max_visits changed: the figure follows, the layout does not move', async () => {
  const before = JSON.stringify(layout())
  const t = texts()
  t.review = t.review
    .replace('  verdict [shape=tripleoctagon', '  security [shape=note, lens="security", when="contract"]\n  verdict [shape=tripleoctagon')
    .replace('  verdict -> exit', '  lenses -> security -> refuter\n  verdict -> exit')
    .replace(/\s+cold_reader\s+\[shape=note, lens="cold-reader"\]/, '')
    .replace('  lenses -> cold_reader -> refuter\n', '')
  t.pipeline = t.pipeline
    .replace('gates    [shape=parallelogram, gate="build,format,lint,test,architecture,coverage"', 'gates    [shape=parallelogram, gate="build,lint,test,architecture,coverage"')
    .replace('gates -> deliver [label="FAIL", max_visits=3]', 'gates -> deliver [label="FAIL", max_visits=4]')
  const flow = await buildFlow(layout(), t)
  assert.deepEqual(sub(flow, 'deliver_review').all, ['test_integrity', 'architecture_boundaries', 'mock_fidelity', 'contract_fidelity', 'security'])
  assert.equal(sub(flow, 'gates').count, 5)
  assert.equal(flow.edges.find((e) => e.id === 'gates->deliver').maxVisits, 4)
  assert.equal(JSON.stringify(layout()), before)
  assert.match(renderSub(flow, 'deliver_review', 'fr'), /data-node="security"/)
})

test('a figure that loses an invariant is refused', async () => {
  const workflow = await readFlowWorkflow(texts())
  const invariants = invariantsOf(workflow, layout())
  for (const expected of [{ node: 'gates' }, { node: 'mutation_plan' }, { lens: 'test_integrity', of: 'deliver_review' }, { refuter: 'deliver_review' }, { edge: 'deliver_review->deliver', label: 'NEEDS_REWORK' }]) {
    assert.ok(invariants.some((i) => JSON.stringify(i) === JSON.stringify(expected)), JSON.stringify(expected))
  }
  const flow = await buildFlow(layout(), texts())
  assert.deepEqual(missingInvariants(flow, invariants), [])
  const tampered = structuredClone(flow)
  tampered.subs.mutation.nodes = tampered.subs.mutation.nodes.filter((n) => n.id !== 'mutation_plan')
  tampered.edges = tampered.edges.filter((e) => e.id !== 'gates->deliver')
  tampered.subs.deliver_review.nodes = tampered.subs.deliver_review.nodes.filter((n) => !n.refuter)
  assert.deepEqual(missingInvariants(tampered, invariants), [{ node: 'mutation_plan' }, { refuter: 'deliver_review' }, { edge: 'gates->deliver', label: 'FAIL' }])
})

test('the figure names only nodes the workflow has, and a scenario walks only edges it has', async () => {
  const unknown = { ...layout(), texts: { ...layout().texts, ghost: { role: 'x' } } }
  await assert.rejects(buildFlow(unknown, texts()), /layout text for ghost/)
  const wrong = { ...layout(), scenarios: [{ id: 'bad', label: 'B', caption: 'c', path: ['deliver', 'mutation'] }] }
  await assert.rejects(buildFlow(wrong, texts()), /scenario bad: no edge deliver->mutation/)
  const verdict = { ...layout(), scenarios: [{ id: 'v', label: 'V', caption: 'c', path: ['deliver_review', { inside: 'deliver_review', refuter: 'confirmed', verdict: 'MAYBE' }] }] }
  await assert.rejects(buildFlow(verdict, texts()), /the verdict cannot be MAYBE/)
})

test('a gate scenario names a failing command; one the .dot no longer runs fails the last instead', async () => {
  const t = texts()
  t.pipeline = t.pipeline.replace('gate="build,format,lint,test,architecture,coverage", goal_gate=true, locked=true, phase="DELIVER"', 'gate="build,lint", goal_gate=true, locked=true, phase="DELIVER"')
  const flow = await buildFlow(layout(), t)
  const marks = flow.scenarios.find((s) => s.id === 'gate-red').steps.filter((s) => s.mark).map((s) => `${s.nodes[0]}:${s.mark}`)
  assert.deepEqual(marks, ['build:pass', 'lint:fail'])
})

test("the column's arrows are the canvas's own: same routes, same lanes, same labels", async () => {
  const flow = await buildFlow(layout(), texts())
  const boxes = Object.fromEntries(flow.nodes.map((n) => [n.id, { left: n.x, right: n.x + n.w, top: n.y, bottom: n.y + n.h }]))
  const canvas = renderArrows({ order: flow.order, edges: flow.edges.map((e) => ({ ...e, taken: 0 })), boxes, wide: true, lang: 'fr' })
  const figure = render(flow, { lang: 'fr' })
  for (const d of [...canvas.matchAll(/class="edge [^"]*" d="([^"]+)"/g)].map((m) => m[1])) assert.ok(figure.includes(`d="${d}"`), d)
  assert.match(figure, /data-edge="gates-&gt;deliver" data-label="FAIL"[^>]*marker-end="url\(#head-fail\)"/)
})

test('cards are buttons that open a labelled panel; each actor and seal has a name; the text version names who acts', async () => {
  const flow = await buildFlow(layout(), texts())
  const html = renderFigure(flow, { lang: 'fr' })
  assert.match(html, /<g class="sf-node sf-node--review"[^>]*role="button" tabindex="0" aria-expanded="false" aria-controls="sf-deliver-fr-panel-deliver_review"/)
  assert.match(html, /<section class="sf-panel" id="sf-deliver-fr-panel-deliver_review"[^>]*role="region"[^>]*hidden>/)
  assert.match(html, /<title>Humain<\/title>/)
  assert.match(html, /<title>verrouillé<\/title>/)
  assert.match(html, /<span class="sf-alt__actor">Humain ·<\/span> <code>mutation_plan<\/code>/)
  assert.match(html, /<p class="sf-caption" aria-live="polite"><b>Nominal<\/b>/)
  assert.match(renderFigure(flow, { lang: 'en' }), /<title>Human<\/title>/)
})

test('every scenario has its label and its sentence in French and in English, none empty', async () => {
  const flow = await buildFlow(layout(), texts())
  assert.ok(flow.scenarios.length > 0)
  for (const s of flow.scenarios) {
    for (const lang of ['fr', 'en']) {
      assert.ok(s.label?.[lang]?.trim(), `${s.id}: no ${lang} label`)
      assert.ok(s.caption?.[lang]?.trim(), `${s.id}: no ${lang} sentence`)
    }
  }
})

test('captions escape their text and turn backticks into code', () => {
  assert.equal(inline('a `<b>` & c'), 'a <code>&lt;b&gt;</code> &amp; c')
})
