#!/usr/bin/env node
// eng/docs/flow-from-dot.mjs
//
// Builds a handbook flow figure from the workflow the engine actually runs, so the
// figure cannot drift from it. Input: a layout sidecar (docs/flows/<id>.layout.json:
// positions, texts FR/EN, scenarios) and the .skraft.dot it names. Output:
//   - docs/flows/<id>.json                      the flow data (neutral: Jekyll, Docusaurus)
//   - docs/site/_includes/flows/<id>.<lang>.html the figure pre-rendered for Jekyll
//
// Every node and edge comes from the .dot, parsed by the engine's own parser. The build
// fails when the sidecar places a node or an edge the .dot does not have, when the .dot
// has an edge between figured nodes that the sidecar does not place, or when a scenario
// walks an edge that does not exist.
//
// Usage:
//   node eng/docs/flow-from-dot.mjs            regenerate every docs/flows/*.layout.json
//   node eng/docs/flow-from-dot.mjs --check    exit 1 when a generated file is stale

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseDot } from '../../plugins/skraft-framework/engine/domain/workflow/dot.mjs'
import { renderFigure, chipWidth } from '../../docs/site/assets/js/flow-figure/render.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const FLOWS_DIR = join(ROOT, 'docs', 'flows')
export const INCLUDES_DIR = join(ROOT, 'docs', 'site', '_includes', 'flows')
export const LANGS = ['fr', 'en']

const SIDES = {
  top: [0, -1],
  bottom: [0, 1],
  left: [-1, 0],
  right: [1, 0],
}

const kindOfEdge = (label) =>
  label === 'FAIL' ? 'fail' : label === 'NEEDS_REWORK' || label === 'REJECTED' ? 'back' : 'flow'

function kindOfNode(attributes, io) {
  if (io) return 'terminal'
  if (attributes.agent) return 'agent'
  if (attributes.shape === 'hexagon') return 'question'
  if (attributes.shape === 'parallelogram') return 'gate'
  if (['house', 'tripleoctagon', 'component', 'note'].includes(attributes.shape)) return 'review'
  return 'terminal'
}

function monoOf(attributes, members) {
  if (attributes.agent) return attributes.agent
  if (attributes.workflow) return `workflow ${attributes.workflow}`
  if (attributes.question) return attributes.question
  if (attributes.publish) return attributes.publish
  if (attributes.gate) return `gate ${attributes.gate}`
  const lenses = members.map((m) => m.attributes.lens).filter(Boolean)
  if (lenses.length) return `lens ${lenses.join(', ')}`
  return ''
}

const round = (n) => Math.round(n * 10) / 10

function anchor(box, [side, offset = 0]) {
  const [nx, ny] = SIDES[side]
  if (!SIDES[side]) throw new Error(`unknown side ${side}`)
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const x = nx === 0 ? cx + offset : cx + (nx * box.w) / 2
  const y = ny === 0 ? cy + offset : cy + (ny * box.h) / 2
  return { x, y, nx, ny }
}

function defaultSides(a, b) {
  const dx = b.x + b.w / 2 - (a.x + a.w / 2)
  const dy = b.y + b.h / 2 - (a.y + a.h / 2)
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? [['right'], ['left']] : [['left'], ['right']]
  return dy >= 0 ? [['bottom'], ['top']] : [['top'], ['bottom']]
}

const bezier = (p0, p1, p2, p3, t) => {
  const u = 1 - t
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
}

/** Pure: sidecar + .dot text → flow JSON. Throws on any mismatch. */
export function buildFlow(layout, dotText) {
  const parsed = parseDot(dotText)
  if (!parsed.ok) throw new Error(`cannot parse ${layout.workflow}: ${JSON.stringify(parsed.error ?? parsed)}`)
  const dotNodes = new Map(parsed.graph.nodes.map((n) => [n.id, n]))
  const groupOf = new Map()
  for (const [group, members] of Object.entries(layout.groups ?? {})) {
    for (const m of members) {
      if (!dotNodes.has(m)) throw new Error(`group ${group}: node ${m} is not in the workflow`)
      groupOf.set(m, group)
    }
  }
  const canonical = (id) => groupOf.get(id) ?? id
  const selected = new Set(Object.keys(layout.nodes))

  // ---- nodes
  const { pad, top, card, gap } = layout.grid
  const nodes = []
  const boxes = new Map()
  for (const [id, spec] of Object.entries(layout.nodes)) {
    const members = layout.groups?.[id]?.map((m) => dotNodes.get(m)) ?? []
    const dot = dotNodes.get(id)
    if (!dot) throw new Error(`layout node ${id} is not in the workflow`)
    const [col, row] = spec.at
    const [w, h] = spec.size ?? card
    const box = {
      x: pad + col * (card[0] + gap[0]),
      y: top + row * (card[1] + gap[1]) + (spec.dy ?? 0),
      w,
      h,
    }
    boxes.set(id, box)
    const kind = kindOfNode(dot.attributes, spec.io)
    const node = { id, kind, ...box }
    if (spec.io) Object.assign(node, { io: spec.io, title: spec.title, chips: spec.chips ?? [] })
    else {
      node.badge = spec.badge
      node.mono = spec.mono ?? monoOf(dot.attributes, members)
      if (kind === 'question') node.tone = 'amber'
      if (spec.in) node.in = spec.in
    }
    nodes.push(node)
  }

  // ---- edges: every dot edge between figured nodes, and nothing else
  const dotEdges = new Map()
  for (const e of parsed.graph.edges) {
    const from = canonical(e.from)
    const to = canonical(e.to)
    if (from === to || !selected.has(from) || !selected.has(to)) continue
    const id = `${from}->${to}`
    if (dotEdges.has(id)) throw new Error(`two workflow edges ${id}: name them apart in the layout`)
    dotEdges.set(id, { from, to, attributes: e.attributes })
  }
  for (const id of Object.keys(layout.edges)) {
    if (!dotEdges.has(id)) throw new Error(`layout edge ${id} is not in the workflow`)
  }
  for (const id of dotEdges.keys()) {
    if (!(id in layout.edges)) throw new Error(`workflow edge ${id} has no place in the layout`)
  }

  const edges = []
  for (const [id, spec] of Object.entries(layout.edges)) {
    const { from, to, attributes } = dotEdges.get(id)
    const a = boxes.get(from)
    const b = boxes.get(to)
    const [dfrom, dto] = defaultSides(a, b)
    const p = anchor(a, spec.from ?? dfrom)
    const q = anchor(b, spec.to ?? dto)
    const [k1, k2] = spec.bend ?? [0, 0]
    const c1 = { x: p.x + p.nx * k1, y: p.y + p.ny * k1 }
    // the arrowhead sits on the target border: stop the line 1px short of it
    const end = { x: q.x + q.nx * 1, y: q.y + q.ny * 1 }
    const c2 = { x: q.x + q.nx * k2, y: q.y + q.ny * k2 }
    const d =
      k1 === 0 && k2 === 0
        ? `M${round(p.x)} ${round(p.y)} L${round(end.x)} ${round(end.y)}`
        : `M${round(p.x)} ${round(p.y)} C${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(end.x)} ${round(end.y)}`
    const label = attributes.label ?? null
    const maxVisits = attributes.max_visits ? Number(attributes.max_visits) : null
    const edge = { id, from, to, label, kind: spec.kind ?? kindOfEdge(label), d }
    if (spec.tone) edge.tone = spec.tone
    if (maxVisits) edge.maxVisits = maxVisits
    if (spec.chip) {
      const t = spec.chipAt ?? 0.5
      const text = maxVisits ? `${spec.chip} · max_visits ${maxVisits}` : spec.chip
      edge.chip = {
        text,
        x: round(bezier(p.x, c1.x, c2.x, end.x, t)),
        y: round(bezier(p.y, c1.y, c2.y, end.y, t)),
      }
    }
    edges.push(edge)
  }

  // ---- out chips: the verdicts the workflow gives, unless the layout names an artifact
  for (const node of nodes) {
    if (node.io) continue
    const spec = layout.nodes[node.id]
    // positive verdict first, the loop-back ones after
    const verdicts = [...new Set(edges.filter((e) => e.from === node.id && e.label).map((e) => e.label))].sort(
      (a, b) => Number(kindOfEdge(a) !== 'flow') - Number(kindOfEdge(b) !== 'flow'),
    )
    const out = spec.out ?? verdicts
    if (out.length) node.out = out
  }

  // ---- scenarios: each consecutive pair must be an edge of the figure
  const scenarios = layout.scenarios.map((s) => {
    const walked = []
    for (let i = 1; i < s.path.length; i++) {
      const id = `${s.path[i - 1]}->${s.path[i]}`
      if (!edges.some((e) => e.id === id)) throw new Error(`scenario ${s.id}: no edge ${id} in the workflow`)
      walked.push(id)
    }
    return { id: s.id, label: s.label, caption: s.caption, path: s.path, edges: walked }
  })

  // ---- legend and canvas size
  const legend = layout.legend
    ? {
        x: pad + layout.legend.at[0] * (card[0] + gap[0]) + 4,
        y: top + layout.legend.at[1] * (card[1] + gap[1]) + 8,
        items: layout.legend.items,
      }
    : undefined
  let maxX = 0
  let maxY = 0
  for (const n of nodes) {
    maxX = Math.max(maxX, n.x + n.w)
    maxY = Math.max(maxY, n.y + n.h)
  }
  for (const e of edges) {
    for (const [, x, y] of e.d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)) {
      maxX = Math.max(maxX, Number(x))
      maxY = Math.max(maxY, Number(y))
    }
    if (e.chip) {
      maxX = Math.max(maxX, e.chip.x + chipWidth(e.chip.text) / 2)
      maxY = Math.max(maxY, e.chip.y + 10)
    }
  }

  return {
    $comment: `GENERATED by eng/docs/flow-from-dot.mjs from ${layout.workflow} and docs/flows/${layout.id}.layout.json — do not edit.`,
    id: layout.id,
    source: layout.workflow,
    viewBox: [Math.ceil(maxX + pad), Math.ceil(maxY + pad)],
    title: layout.title,
    figcaption: layout.figcaption,
    nodes,
    edges,
    legend,
    scenarios,
  }
}

/** Everything one sidecar produces: path → content. */
export function outputsFor(layoutPath) {
  const layout = JSON.parse(readFileSync(layoutPath, 'utf8'))
  const dotText = readFileSync(join(ROOT, layout.workflow), 'utf8')
  const flow = buildFlow(layout, dotText)
  const files = new Map()
  files.set(join(FLOWS_DIR, `${flow.id}.json`), `${JSON.stringify(flow, null, 2)}\n`)
  for (const lang of LANGS) {
    const html = renderFigure(flow, { lang })
    files.set(
      join(INCLUDES_DIR, `${flow.id}.${lang}.html`),
      `<!-- GENERATED by eng/docs/flow-from-dot.mjs from ${flow.source} — do not edit. -->\n${html}\n`,
    )
  }
  return files
}

export function layoutPaths(dir = FLOWS_DIR) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.layout.json'))
    .map((f) => join(dir, f))
}

function main(argv) {
  const check = argv.includes('--check')
  const stale = []
  for (const layoutPath of layoutPaths()) {
    for (const [path, content] of outputsFor(layoutPath)) {
      const current = existsSync(path) ? readFileSync(path, 'utf8') : null
      if (current === content) continue
      if (check) stale.push(path)
      else {
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, content)
        console.log(`wrote ${path.slice(ROOT.length + 1)}`)
      }
    }
  }
  if (check && stale.length) {
    console.error(`stale flow figures (run node eng/docs/flow-from-dot.mjs):\n  ${stale.join('\n  ')}`)
    process.exit(1)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2))
