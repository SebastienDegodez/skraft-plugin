#!/usr/bin/env node
// eng/docs/flow-from-dot.mjs
//
// Builds a handbook flow figure from the workflow the engine runs, read the way the Copilot
// canvas's Workflow tab reads it, so neither can drift from the other or from the .dot:
//   engine/application/workflow/load-workflow.mjs  readWorkflows (with withCalls for review)
//   engine/domain/workflow/workflow.mjs            readWorkflow(text, { called, calls })
// The figure's arrows are drawn by the canvas's own routeEdges / renderArrows (canvas-ui/view.js),
// imported by the core renderer.
//
// Input: a sidecar (docs/flows/<id>.layout.json: where the figure starts, geometry, texts FR/EN,
// scenarios). Output: docs/flows/<id>.json, the data the core renders (Docusaurus, the artifact).
//
// What is drawn comes from the workflow as read at build time, never listed by hand:
//   - the column: from the sidecar's `start`, each step's onward edge (no FAIL, NEEDS_REWORK or
//     REJECTED) to the exit; the step before `start` is the input;
//   - a fold: the steps a column step leaves for and that lead back to it (the mutants loop);
//   - a review's lenses (its branches, those of the workflow a call node calls), each with its
//     when= and mandatory=; a gate's commands; max_visits; each= (one run per file).
// Sub-tasks are placed automatically: a lens or a command added to the .dot appears with no
// change to the sidecar. What the figure fixes is only what the engine fixes: steps marked
// mandatory, locked or goal_gate, human questions, their FAIL / NEEDS_REWORK edges, and the
// refuter, which is no node of the .dot but a step the engine runs inside every review.
//
// Usage:
//   node eng/docs/flow-from-dot.mjs            regenerate every docs/flows/*.layout.json
//   node eng/docs/flow-from-dot.mjs --check    exit 1 when a generated file is stale

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readWorkflows } from '../../plugins/skraft-framework/engine/application/workflow/load-workflow.mjs'
import { REFUTER } from '../../plugins/skraft-framework/engine/domain/review/lenses.mjs'
import { BLOCKING } from '../../plugins/skraft-framework/engine/domain/review/verdict.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const FLOWS_DIR = join(ROOT, 'docs', 'flows')

/**
 * The refuter is no node of any .skraft.dot: the engine runs it inside every review step,
 * between the lenses and the verdict.
 *  - engine/application/README.md l.4-5: review-runs.mjs runs "its lenses through
 *    AgentRunner.runMany, the refuter on blocker, high and medium findings, then the domain verdict";
 *  - engine/domain/review/lenses.mjs: REFUTER, the agent that checks each finding before it counts;
 *  - engine/domain/review/verdict.mjs: BLOCKING, the severities it checks;
 *  - engine/application/config/agent-models.mjs: it runs a tier above the strongest lens, unless
 *    the review names a refuter= family.
 */
export const ENGINE_REFUTER = Object.freeze({ id: 'refuter', agent: REFUTER, severities: BLOCKING, outcomes: ['confirmed', 'refuted'] })

/** The labels that send a run back: the canvas's DETOURS (domain/reporting/workflow-drawing.mjs). */
const DETOURS = ['FAIL', 'NEEDS_REWORK', 'REJECTED']
const isDetour = (edge) => DETOURS.includes(edge.label)

const KIND = { agent: 'agent', gate: 'gate', publish: 'code', ask: 'question', review: 'review', call: 'review', start: 'terminal', exit: 'terminal' }

/** Invariant: what the engine forbids a copy to drop, bypass or weaken. */
export const sealOf = (node) => {
  if (node.locked) return 'locked'
  if (node.mandatory === true || node.goal || node.kind === 'ask') return 'mandatory'
  return undefined
}

const monoOf = (node) => {
  if (node.kind === 'agent') return node.agent
  if (node.kind === 'gate') return node.gates.length > 1 ? `${node.gates[0]} … ${node.gates.at(-1)}` : `gate ${node.gates[0]}`
  if (node.kind === 'call') return `workflow ${node.call.workflow}`
  if (node.kind === 'review') return node.lenses.join(', ')
  if (node.kind === 'ask') return node.question
  if (node.kind === 'publish') return node.publish
  return ''
}

const verdictsOf = (edges, id) =>
  [...new Set(edges.filter((e) => e.from === id && e.label).map((e) => e.label))].sort((a, b) => Number(DETOURS.includes(a)) - Number(DETOURS.includes(b)))

/** The engine's reading of a workflow and the ones it calls, from texts held in memory. */
export async function readFlowWorkflow(texts) {
  const deps = {
    workspace: { read: async () => null },
    workflowSource: { builtIn: async () => texts.pipeline, called: async (name) => texts[name] ?? null },
  }
  const { read } = await readWorkflows(deps)
  if (!read.ok) throw new Error(`the workflow does not read: ${read.errors.join('; ')}`)
  return read.workflow
}

// ---------------------------------------------------------------- the column and its folds

function columnOf(workflow, start) {
  if (!workflow.nodes[start]) throw new Error(`start ${start} is not in the workflow`)
  const into = workflow.edges.filter((e) => e.to === start && !isDetour(e))
  if (into.length !== 1) throw new Error(`${start}: ${into.length} onward edges into it`)
  const column = [into[0].from, start]
  for (let cur = start; workflow.nodes[cur].kind !== 'exit'; ) {
    const next = workflow.edges.filter((e) => e.from === cur && !isDetour(e))
    if (next.length !== 1) throw new Error(`${cur}: ${next.length} onward edges, the column needs one`)
    cur = next[0].to
    if (column.includes(cur)) throw new Error(`the column loops at ${cur}`)
    column.push(cur)
  }
  return column
}

function foldOf(workflow, parent, column) {
  const off = workflow.edges.filter((e) => e.from === parent && !column.includes(e.to))
  if (off.length === 0) return null
  if (off.length > 1) throw new Error(`${parent}: leaves the column by ${off.length} edges`)
  const members = []
  for (let cur = off[0].to; cur !== parent; ) {
    if (members.includes(cur) || column.includes(cur)) throw new Error(`${parent}: ${cur} does not lead back to it`)
    members.push(cur)
    const next = workflow.edges.filter((e) => e.from === cur && !isDetour(e))
    if (next.length !== 1) throw new Error(`${cur}: ${next.length} onward edges inside the loop of ${parent}`)
    cur = next[0].to
  }
  return { entry: off[0], members }
}

const edgeOf = (e) => ({ id: `${e.from}->${e.to}`, from: e.from, to: e.to, label: e.label, maxVisits: e.maxVisits })

// ---------------------------------------------------------------- sub-tasks

function commandsSub(node) {
  return { kind: 'commands', count: node.gates.length, all: [...node.gates], nodes: node.gates.map((id) => ({ id, kind: 'gate', command: true })), edges: [] }
}

function lensesSub(node, parentVerdicts) {
  const fan = node.fanOut
  const fanIn = node.call?.fanIn ?? node.id
  const lenses = node.branches.map((b) => {
    const lens = { id: b.id, kind: 'lens', mono: b.lens }
    if (b.when) lens.when = b.when
    if (b.mandatory === true) lens.seal = 'mandatory'
    else lens.optional = true
    return lens
  })
  const refuter = {
    id: ENGINE_REFUTER.id,
    kind: 'agent',
    refuter: true,
    mono: node.refuter ? `${ENGINE_REFUTER.agent} @${node.refuter}` : ENGINE_REFUTER.agent,
    severities: [...ENGINE_REFUTER.severities],
    out: [...ENGINE_REFUTER.outcomes],
    seal: 'engine',
  }
  const verdict = { id: fanIn, kind: 'verdict', mono: 'verdict', out: parentVerdicts }
  if (node.call ? node.call.mandatory === true : node.mandatory === true) verdict.seal = 'mandatory'
  return {
    kind: 'lenses',
    count: lenses.length,
    all: lenses.map((l) => l.id),
    fanOut: fan,
    fanIn,
    nodes: [{ id: fan, kind: 'fanout' }, ...lenses, { id: `${fanIn}#in`, kind: 'fanin' }, refuter, verdict],
    edges: [
      ...lenses.map((l) => ({ id: `${fan}->${l.id}`, from: fan, to: l.id, label: null })),
      ...lenses.map((l) => ({ id: `${l.id}->${fanIn}#in`, from: l.id, to: `${fanIn}#in`, label: null })),
      { id: `${fanIn}#in->${refuter.id}`, from: `${fanIn}#in`, to: refuter.id, label: null },
      { id: `${refuter.id}->${fanIn}`, from: refuter.id, to: fanIn, label: null },
    ],
  }
}

function loopSub(workflow, parent, fold, badge) {
  const order = [parent, ...fold.members]
  const nodes = order.map((id, i) => {
    const n = workflow.nodes[id]
    const node = { id, kind: KIND[n.kind], mono: monoOf(n), seal: sealOf(n) }
    if (i === 0) node.entry = true
    else node.badge = `${badge}${String.fromCharCode(96 + i)}`
    if (n.each) node.each = n.each
    if (n.kind === 'review') node.lenses = n.branches.length
    return node
  })
  const set = new Set(order)
  const edges = workflow.edges
    .filter((e) => set.has(e.from) && set.has(e.to) && !(e.from === parent && e.to !== fold.entry.to))
    .map((e) => {
      const edge = edgeOf(e)
      if (workflow.nodes[e.from].each || workflow.nodes[e.to].each) edge.multi = true
      return edge
    })
  for (const node of nodes) {
    const out = verdictsOf(edges, node.id)
    if (!node.entry && out.length) node.out = out
  }
  return { kind: 'loop', count: fold.members.length, all: fold.members, order, nodes, edges }
}

// ---------------------------------------------------------------- the figure

/** Pure but for the engine's reading: sidecar + workflow texts → flow JSON. Throws on any mismatch. */
export async function buildFlow(layout, texts) {
  const workflow = await readFlowWorkflow(texts)
  const column = columnOf(workflow, layout.start)
  const [input, output] = [column[0], column.at(-1)]
  for (const id of Object.keys(layout.texts ?? {})) {
    if (!workflow.nodes[id] && id !== ENGINE_REFUTER.id) throw new Error(`layout text for ${id}, a node the workflow does not have`)
  }
  const text = (id) => layout.texts?.[id] ?? {}

  const folds = new Map()
  for (const id of column.slice(1, -1)) {
    const fold = foldOf(workflow, id, column)
    if (fold) folds.set(id, fold)
  }
  // the column's edges as the canvas draws them; a fold is the step's own loop
  const edges = []
  for (const e of workflow.edges) {
    if (!column.includes(e.from)) continue
    // the input belongs to the phase before: only its way into the figure is drawn
    if (e.from === input && e.to !== layout.start) continue
    if (folds.get(e.from)?.entry === e) {
      edges.push({ ...edgeOf(e), id: `${e.from}->${e.from}`, to: e.from, via: e.to })
      continue
    }
    if (!column.includes(e.to)) throw new Error(`${e.from}->${e.to} leaves the column and does not come back`)
    edges.push(edgeOf(e))
  }

  const geo = layout.geometry
  let y = geo.top
  const nodes = column.map((id, index) => {
    const n = workflow.nodes[id]
    const io = id === input ? 'in' : id === output ? 'out' : null
    const [w, h] = io ? geo.io : geo.card
    const box = { x: geo.columnX, y, w, h }
    y += h + geo.gap
    const t = text(id)
    if (io) return { id, kind: 'terminal', io, chips: t.chips ?? [], ...box }
    const node = { id, kind: KIND[n.kind], badge: String(index), mono: monoOf(n), seal: sealOf(n), ...box }
    if (n.when) node.when = n.when
    if (n.each) node.each = n.each
    if (t.role) node.role = t.role
    if (t.in) node.in = t.in
    const out = t.out ?? verdictsOf(edges, id)
    if (out.length) node.out = out
    return node
  })

  const subs = {}
  for (const node of nodes) {
    if (node.io) continue
    const n = workflow.nodes[node.id]
    const verdicts = verdictsOf(workflow.edges, node.id)
    if (folds.has(node.id)) subs[node.id] = loopSub(workflow, node.id, folds.get(node.id), node.badge)
    else if ((n.kind === 'call' || n.kind === 'review') && n.branches.length) subs[node.id] = lensesSub(n, verdicts)
    else if (n.kind === 'gate' && n.gates.length > 1) subs[node.id] = commandsSub(n)
    if (subs[node.id]) node.children = subs[node.id].kind
  }
  for (const sub of Object.values(subs)) {
    for (const n of sub.nodes) {
      const t = text(n.id.replace(/#in$/, ''))
      if (t.role && !n.entry && !n.id.endsWith('#in')) n.role = t.role
      if (t.in && !n.entry) n.in = t.in
    }
  }

  const scenarios = layout.scenarios.map((s) => compileScenario(s, { edges, subs, column }))
  const flow = {
    $comment: `GENERATED by eng/docs/flow-from-dot.mjs from ${layout.workflow} and docs/flows/${layout.id}.layout.json — do not edit.`,
    id: layout.id,
    source: layout.workflow,
    viewBox: [geo.width, Math.ceil(y - geo.gap + geo.top)],
    panelWidth: geo.panel,
    title: layout.title,
    figcaption: layout.figcaption,
    order: column,
    nodes,
    edges,
    subs,
    scenarios,
  }
  const missing = missingInvariants(flow, invariantsOf(workflow, layout))
  if (missing.length) throw new Error(`the figure misses invariants: ${JSON.stringify(missing)}`)
  return flow
}

// ---------------------------------------------------------------- invariants

/**
 * What the figure must show whatever the copy of the workflow says: the steps of the column and
 * of its folds marked locked, mandatory or goal_gate, human questions, the mandatory lenses of
 * a review, the FAIL / NEEDS_REWORK / REJECTED edges leaving those steps, and the refuter of
 * every review. Lenses without mandatory=, commands, max_visits and labels move with the .dot.
 */
export function invariantsOf(workflow, layout) {
  const column = columnOf(workflow, layout.start)
  const steps = column.slice(1, -1)
  const inFigure = [...steps]
  for (const id of steps) inFigure.push(...(foldOf(workflow, id, column)?.members ?? []))
  const fixed = inFigure.filter((id) => sealOf(workflow.nodes[id]))
  const out = []
  for (const id of fixed) out.push({ node: id })
  for (const id of inFigure) {
    const n = workflow.nodes[id]
    for (const b of n.branches) if (b.mandatory === true && n.kind === 'call') out.push({ lens: b.id, of: id })
    if ((n.kind === 'call' || n.kind === 'review') && n.branches.length && steps.includes(id)) out.push({ refuter: id })
  }
  for (const e of workflow.edges) if (fixed.includes(e.from) && isDetour(e)) out.push({ edge: `${e.from}->${e.to}`, label: e.label })
  return out
}

const allNodes = (flow) => [...flow.nodes, ...Object.values(flow.subs).flatMap((s) => s.nodes)]
const allEdges = (flow) => [...flow.edges, ...Object.values(flow.subs).flatMap((s) => s.edges)]

/** The invariants a flow does not show. */
export function missingInvariants(flow, invariants) {
  const nodes = allNodes(flow)
  const edges = allEdges(flow)
  return invariants.filter((inv) => {
    if (inv.node) return !nodes.some((n) => n.id === inv.node && n.seal)
    if (inv.lens) return !flow.subs[inv.of]?.nodes.some((n) => n.id === inv.lens && n.seal === 'mandatory')
    if (inv.refuter) return !flow.subs[inv.refuter]?.nodes.some((n) => n.refuter && n.seal === 'engine')
    const [from, to] = inv.edge.split('->')
    return !edges.some((e) => e.from === from && (e.to === to || e.via === to) && e.label === inv.label)
  })
}

// ---------------------------------------------------------------- scenarios

const onward = (edges, from) => {
  const next = edges.filter((e) => e.from === from && e.from !== e.to && !isDetour(e))
  return next.length === 1 ? next[0] : null
}

function compileScenario(s, { edges, subs, column }) {
  const steps = []
  const trail = []
  let prev = null
  const walk = (to) => {
    const edge = prev && edges.find((e) => e.id === `${prev}->${to}`)
    if (prev && !edge) throw new Error(`scenario ${s.id}: no edge ${prev}->${to} in the workflow`)
    steps.push({ fig: 'main', edges: edge ? [edge.id] : [], nodes: [to] })
    trail.push({ fig: 'main', nodes: [to], via: edge?.label ?? null })
    prev = to
  }
  for (let i = 0; i < s.path.length; i++) {
    const entry = s.path[i]
    if (entry === '...') {
      const target = s.path[++i]
      if (!column.includes(target)) throw new Error(`scenario ${s.id}: "..." must lead to a step of the column`)
      while (prev !== target) {
        const next = onward(edges, prev)
        if (!next) throw new Error(`scenario ${s.id}: no onward edge from ${prev}`)
        walk(next.to)
      }
    } else if (typeof entry === 'string') {
      if (!column.includes(entry)) throw new Error(`scenario ${s.id}: ${entry} is not a step of the column`)
      walk(entry)
    } else inside(s, entry, prev, subs, steps, trail)
  }
  return { id: s.id, label: s.label, caption: s.caption, steps, trail }
}

function inside(s, entry, prev, subs, steps, trail) {
  const parent = entry.inside
  const sub = subs[parent]
  if (!sub) throw new Error(`scenario ${s.id}: ${parent} folds no sub-task`)
  if (parent !== prev) throw new Error(`scenario ${s.id}: enters ${parent} from ${prev}`)
  const push = (step, t) => {
    steps.push({ fig: parent, edges: [], nodes: [], ...step })
    if (t) trail.push({ fig: parent, ...t })
  }
  if (sub.kind === 'commands') {
    // one after the other, the first that fails stops the gate. Commands move with the .dot:
    // a failing command it no longer has fails the last one instead.
    const failing = entry.fail ? (sub.all.includes(entry.fail) ? entry.fail : sub.all.at(-1)) : null
    for (const command of sub.all) {
      const fails = command === failing
      push({ nodes: [command], mark: fails ? 'fail' : 'pass' }, { nodes: [command], via: fails ? 'FAIL' : 'PASS' })
      if (fails) break
    }
    return
  }
  if (sub.kind === 'lenses') {
    if (!ENGINE_REFUTER.outcomes.includes(entry.refuter)) throw new Error(`scenario ${s.id}: the refuter answers ${ENGINE_REFUTER.outcomes.join(' or ')}`)
    const verdict = sub.nodes.find((n) => n.kind === 'verdict')
    if (!verdict.out.includes(entry.verdict)) throw new Error(`scenario ${s.id}: the verdict cannot be ${entry.verdict}`)
    push({ nodes: [sub.fanOut] })
    push({ edges: sub.all.map((l) => `${sub.fanOut}->${l}`), nodes: sub.all }, { nodes: sub.all })
    push({ edges: sub.all.map((l) => `${l}->${sub.fanIn}#in`), nodes: [`${sub.fanIn}#in`] })
    push({ edges: [`${sub.fanIn}#in->${ENGINE_REFUTER.id}`], nodes: [ENGINE_REFUTER.id] })
    push({ mark: entry.refuter, chip: { node: ENGINE_REFUTER.id, text: entry.refuter } }, { nodes: [ENGINE_REFUTER.id], via: entry.refuter })
    push({ edges: [`${ENGINE_REFUTER.id}->${sub.fanIn}`], nodes: [sub.fanIn] })
    push({ chip: { node: sub.fanIn, text: entry.verdict } }, { nodes: [sub.fanIn], via: entry.verdict })
    return
  }
  push({ nodes: [parent] })
  let cur = parent
  do {
    const next = cur === parent ? sub.edges.find((e) => e.from === parent) : onward(sub.edges, cur)
    if (!next) throw new Error(`scenario ${s.id}: no onward edge from ${cur} inside ${parent}`)
    push({ edges: [next.id], nodes: [next.to] }, { nodes: [next.to], via: next.label })
    cur = next.to
  } while (cur !== parent)
}

// ---------------------------------------------------------------- files

const workflowsDir = (layout) => dirname(join(ROOT, layout.workflow))

/** The texts the engine reads: the pipeline and each workflow next to it. */
export function workflowTexts(layout) {
  const dir = workflowsDir(layout)
  const texts = { pipeline: readFileSync(join(ROOT, layout.workflow), 'utf8') }
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.skraft.dot'))) texts[f.replace(/\.skraft\.dot$/, '')] = readFileSync(join(dir, f), 'utf8')
  return texts
}

/** Everything one sidecar produces: path → content. */
export async function outputsFor(layoutPath) {
  const layout = JSON.parse(readFileSync(layoutPath, 'utf8'))
  const flow = await buildFlow(layout, workflowTexts(layout))
  return new Map([[join(FLOWS_DIR, `${flow.id}.json`), `${JSON.stringify(flow, null, 2)}\n`]])
}

export const layoutPaths = (dir = FLOWS_DIR) => readdirSync(dir).filter((f) => f.endsWith('.layout.json')).map((f) => join(dir, f))

async function main(argv) {
  const check = argv.includes('--check')
  const stale = []
  for (const layoutPath of layoutPaths()) {
    for (const [path, content] of await outputsFor(layoutPath)) {
      if (existsSync(path) && readFileSync(path, 'utf8') === content) continue
      if (check) stale.push(path)
      else {
        writeFileSync(path, content)
        console.log(`wrote ${path.slice(ROOT.length + 1)}`)
      }
    }
  }
  if (stale.length) {
    console.error(`stale flow figures (run node eng/docs/flow-from-dot.mjs):\n  ${stale.join('\n  ')}`)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2))
