// Pure renderer for scenario-driven flow figures: flow JSON in, markup out. No DOM, no
// dependency but the Copilot canvas's own arrow routing, so the figure and the canvas's
// Workflow tab draw the same arrows from the same reading of the workflow. Runs in node
// (tests, the static build of a site) and in the browser (<skraft-flow>, the React adapter).
//
// The flow JSON comes from eng/docs/flow-from-dot.mjs. Colours are CSS variables only
// (flow-figure.css maps them to the site theme's Infima variables).

import { renderArrows, routeEdges } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/canvas-ui/view.js'

const UI = {
  fr: {
    scenario: 'Scénario', replay: 'Rejouer', hint: 'Faites défiler le schéma horizontalement', alt: 'Version texte',
    steps: 'Étapes', who: 'Qui agit', step: 'Étape', close: 'Fermer', subtasks: 'Sous-tâches', open: 'Ouvrir le détail',
    inputs: 'Entrées', outputs: 'Sorties', lenses: (n) => `${n} lentilles`, gates: (n) => `${n} gates`, loop: () => 'boucle mutants',
    each: '× fichier', when: (w) => `si ${{ mock: 'mock', contract: 'contrat', frontend: 'front' }[w] ?? w}`, optional: 'optionnelle',
    severities: (s) => `si ${s.join('·')}`, tier: 'palier ↑', fanout: 'fan-out', fanin: 'fan-in',
    mandatory: 'obligatoire', locked: 'verrouillé',
    edgesTitle: 'Arêtes', next: 'étape suivante', rework: 'reprise', fail: 'échec de gate', fold: 'boucle repliée',
    marks: 'Marques', dashed: 'optionnelle',
    actors: { human: 'Humain', agent: 'Agent IA', lens: 'Lentille', review: 'Revue', gate: 'Gate', code: 'Code', verdict: 'Verdict' },
  },
  en: {
    scenario: 'Scenario', replay: 'Replay', hint: 'Scroll the diagram sideways', alt: 'Text version',
    steps: 'Steps', who: 'Who acts', step: 'Step', close: 'Close', subtasks: 'Sub-tasks', open: 'Open the details',
    inputs: 'Inputs', outputs: 'Outputs', lenses: (n) => `${n} lenses`, gates: (n) => `${n} gates`, loop: () => 'mutant loop',
    each: '× file', when: (w) => `if ${{ mock: 'mock', contract: 'contract', frontend: 'front end' }[w] ?? w}`, optional: 'optional',
    severities: (s) => `if ${s.join('·')}`, tier: 'tier ↑', fanout: 'fan-out', fanin: 'fan-in',
    mandatory: 'mandatory', locked: 'locked',
    edgesTitle: 'Edges', next: 'next step', rework: 'rework', fail: 'gate failure', fold: 'folded loop',
    marks: 'Marks', dashed: 'optional',
    actors: { human: 'Human', agent: 'AI agent', lens: 'Lens', review: 'Review', gate: 'Gate', code: 'Code', verdict: 'Verdict' },
  },
}
export const ui = (lang) => UI[lang] ?? UI.fr

// ---------------------------------------------------------------- text helpers

export const MONO_ADVANCE = 0.6
export const CHIP_FONT = 12
export const chipWidth = (text) => Math.round(String(text).length * CHIP_FONT * MONO_ADVANCE + 14)

export const pick = (value, lang) =>
  value == null ? '' : typeof value === 'string' ? value : value[lang] ?? value.fr ?? value.en ?? ''

export const escapeHtml = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Escape, then turn `code` spans into <code>. */
export const inline = (text) => escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`)

const attrs = (map) =>
  Object.entries(map)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => (v === true ? k : `${k}="${escapeHtml(v)}"`))
    .join(' ')

// ---------------------------------------------------------------- actors and icons

// Who acts on a step follows from its kind, read from the workflow: a human answers a question,
// an AI agent writes, a lens inspects, a gate lets the run pass or sends it back, code is a
// command the engine runs with no verdict.
const ACTOR_OF_KIND = { question: 'human', agent: 'agent', lens: 'lens', review: 'review', gate: 'gate', code: 'code', verdict: 'verdict' }
export const actorOf = (kind) => ACTOR_OF_KIND[kind] ?? null
export const actorLabel = (actor, lang) => ui(lang).actors[actor] ?? ''

const ICONS = {
  human: '<circle cx="8" cy="5" r="2.75"/><path d="M2.75 14.25c0-2.9 2.35-4.75 5.25-4.75s5.25 1.85 5.25 4.75"/>',
  agent: '<rect x="2.5" y="5" width="11" height="8.5" rx="2.5"/><path d="M8 2.25V5M5.75 9.25h.01M10.25 9.25h.01"/>',
  lens: '<circle cx="6.75" cy="6.75" r="4.25"/><path d="M10 10l4 4"/>',
  review: '<circle cx="6.75" cy="6.75" r="4.25"/><path d="M10 10l4 4"/><path d="M4.75 6.75h4M6.75 4.75v4"/>',
  // posts and a bar: the bar rises on PASS, drops on FAIL
  gate: '<path d="M1 14.25h14M2.75 14.25V5M13.25 14.25V9"/><path class="sf-gatebar" d="M2.75 7.25H14.5"/>',
  code: '<path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5M9.25 3l-2.5 10"/>',
  verdict: '<path d="M8 2.5v11M4.5 13.5h7M3 5h10M3 5 1.25 9.25h3.5zM13 5l-1.75 4.25h3.5z"/>',
  refute: '<circle cx="12.25" cy="12.25" r="3.25"/><path d="m11 11 2.5 2.5M13.5 11 11 13.5"/>',
  locked: '<rect x="3.5" y="7" width="9" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
  mandatory: '<circle cx="8" cy="6.5" r="4.25"/><path d="M5.75 10.25 4.75 14.5 8 13l3.25 1.5-1-4.25M6.25 6.5l1.25 1.25 2.25-2.25"/>',
  fan: '<path d="M1 6c5 0 5-5 10-5s5 5 10 5M1 6h20M1 6c5 0 5 5 10 5s5-5 10-5"/>',
  chevron: '<path d="m6 3.5 4.5 4.5L6 12.5"/>',
}

export function icon(name, x, y, { title, cls = '', size = 16 } = {}) {
  if (!ICONS[name]) return ''
  const scale = size / 16
  return (
    `<g class="sf-icon sf-icon--${name} ${cls}" transform="translate(${x} ${y})${scale === 1 ? '' : ` scale(${scale})`}">` +
    (title ? `<title>${escapeHtml(title)}</title>` : '') +
    `<rect class="sf-icon__hit" width="16" height="16"/>${ICONS[name]}</g>`
  )
}

const actorIcon = (kind, lang, x, y) => {
  const actor = actorOf(kind)
  return actor ? icon(actor, x, y, { title: actorLabel(actor, lang), cls: `sf-actor sf-actor--${actor}` }) : ''
}

const sealIcon = (seal, lang, x, y) => (seal ? icon(seal, x, y, { title: ui(lang)[seal], cls: `sf-seal sf-seal--${seal}` }) : '')

// ---------------------------------------------------------------- chips

function chip(text, x, y, cls = '') {
  const w = chipWidth(text)
  return {
    w,
    markup: `<g class="sf-chip ${cls}" data-chip="${escapeHtml(text)}"><rect x="${x}" y="${y}" width="${w}" height="20" rx="10"/><text x="${x + w / 2}" y="${y + 14}">${escapeHtml(text)}</text></g>`,
  }
}

/** in / out chips on one line, wrapping when needed; returns the markup and the next free y. */
function ioRows(node, x0, y0, width, lang) {
  const out = []
  let x = x0
  let y = y0
  for (const [label, list] of [['in', node.in], ['out', node.out]]) {
    if (!list?.length) continue
    if (x > x0) x += 8
    if (x + 24 + chipWidth(pick(list[0], lang)) > width - 10) {
      x = x0
      y += 24
    }
    out.push(`<text class="sf-node__io" x="${x}" y="${y + 14}">${label}</text>`)
    x += 24
    for (const item of list) {
      const t = pick(item, lang)
      const w = chipWidth(t)
      if (x + w > width - 10) {
        x = x0 + 24
        y += 24
      }
      const c = chip(t, x, y)
      out.push(c.markup)
      x += c.w + 4
    }
  }
  return { markup: out.join(''), next: y + 24 }
}

// ---------------------------------------------------------------- the column

const counterText = (node, flow, lang) => {
  const sub = flow.subs?.[node.id]
  if (!sub) return null
  const t = ui(lang)
  return sub.kind === 'lenses' ? t.lenses(sub.count) : sub.kind === 'commands' ? t.gates(sub.count) : t.loop(sub.count)
}

function cardMarkup(node, flow, lang, panelId) {
  const t = ui(lang)
  const parts = [`<rect class="sf-node__box" width="${node.w}" height="${node.h}" rx="8"/>`]
  if (node.io) {
    parts.push(`<text class="sf-node__iotitle" x="12" y="19">${escapeHtml(node.io === 'in' ? t.inputs : t.outputs)}</text>`)
    let x = 12
    for (const c of node.chips) {
      const m = chip(pick(c, lang), x, 25)
      parts.push(m.markup)
      x += m.w + 4
    }
  } else {
    parts.push(`<circle class="sf-node__badge" cx="17" cy="18" r="10"/><text class="sf-node__num" x="17" y="22">${escapeHtml(node.badge)}</text>`)
    parts.push(actorIcon(node.kind, lang, 32, 10))
    parts.push(`<text class="sf-node__title" x="55" y="23">${escapeHtml(node.id)}</text>`)
    let right = node.w - 10
    if (node.seal) {
      right -= 16
      parts.push(sealIcon(node.seal, lang, right, 9))
      right -= 6
    }
    if (node.when) {
      const text = t.when(node.when)
      const w = chipWidth(text)
      right -= w
      parts.push(chip(text, right, 7, 'sf-chip--when').markup)
    }
    parts.push(`<text class="sf-node__mono" x="12" y="44">${escapeHtml(node.mono)}</text>`)
    const counter = counterText(node, flow, lang)
    if (counter) {
      const label = `${counter}`
      const glyph = flow.subs[node.id].kind === 'lenses' ? 26 : 0
      const w = chipWidth(label) + glyph + 12
      const x = node.w - 10 - w
      parts.push(
        `<g class="sf-counter"><rect x="${x}" y="29" width="${w}" height="22" rx="11"/>` +
          (glyph ? icon('fan', x + 7, 32, { cls: 'sf-fan' }) : '') +
          `<text x="${x + glyph + 8}" y="44">${escapeHtml(label)}</text>${icon('chevron', x + w - 17, 32, { size: 14 })}</g>`,
      )
    } else parts.push(icon('chevron', node.w - 24, 32, { cls: 'sf-more' }))
    parts.push(ioRows(node, 12, 55, node.w, lang).markup)
  }
  const cls = ['sf-node', `sf-node--${node.kind}`]
  if (node.when) cls.push('is-optional')
  const label = node.io ? (node.io === 'in' ? t.inputs : t.outputs) : `${node.id} — ${actorLabel(actorOf(node.kind), lang)}${node.seal ? ` — ${t[node.seal]}` : ''}`
  return (
    `<g ${attrs({
      class: cls.join(' '),
      'data-node': node.id,
      'data-io': node.io,
      transform: `translate(${node.x} ${node.y})`,
      role: node.io ? undefined : 'button',
      tabindex: node.io ? undefined : '0',
      'aria-expanded': node.io ? undefined : 'false',
      'aria-controls': node.io ? undefined : panelId,
      'aria-label': label,
    })}><g class="sf-node__body">${parts.join('')}</g></g>`
  )
}

/** The canvas's arrows, each tagged with its edge so a token can run along it. */
function arrows(flow, lang) {
  const boxes = Object.fromEntries(flow.nodes.map((n) => [n.id, { left: n.x, right: n.x + n.w, top: n.y, bottom: n.y + n.h }]))
  const edges = flow.edges.map((e) => ({ ...e, taken: 0 }))
  const markup = renderArrows({ order: flow.order, edges, boxes, wide: true, lang })
  const routes = routeEdges(flow.order, edges)
  let i = 0
  const tagged = markup.replace(/<path class="edge /g, () => {
    const e = routes[i++].edge
    return `<path ${attrs({ 'data-edge': e.id, 'data-label': e.label ?? '', 'data-loop': e.from === e.to ? 'true' : undefined })} class="edge `
  })
  // a gate's failure in the theme's danger colour: its own arrowhead and label class
  const failHead = '<marker id="head-fail" class="head head-fail" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker>'
  return tagged
    .replace('</defs>', `${failHead}</defs>`)
    .replace(/<path data-edge="[^"]*" data-label="FAIL"[^>]*>/g, (tag) => tag.replace(/#head-\w+/, '#head-fail'))
    .replace(/<text class="edge-label l-\w+"([^>]*)>FAIL/g, '<text class="edge-label l-fail"$1>FAIL')
}

function legend(flow, lang) {
  const t = ui(lang)
  const x = flow.nodes[0].x + flow.nodes[0].w + 30
  const y0 = flow.nodes.find((n) => n.id === flow.order[5])?.y ?? 600
  const rows = []
  let y = y0
  const head = (text) => {
    rows.push(`<text class="sf-legend__head" x="${x}" y="${y + 4}">${escapeHtml(text)}</text>`)
    y += 22
  }
  head(t.who)
  for (const actor of ['human', 'agent', 'lens', 'gate', 'code']) {
    rows.push(icon(actor, x, y - 8, { cls: `sf-actor sf-actor--${actor}` }), `<text x="${x + 24}" y="${y + 4.5}">${escapeHtml(t.actors[actor])}</text>`)
    y += 22
  }
  rows.push(icon('fan', x - 2, y - 8, { cls: 'sf-fan' }), `<text x="${x + 24}" y="${y + 4.5}">${t.fanout} / ${t.fanin}</text>`)
  y += 30
  head(t.marks)
  rows.push(icon('mandatory', x, y - 8, { cls: 'sf-seal' }), `<text x="${x + 24}" y="${y + 4.5}">${t.mandatory}</text>`)
  y += 22
  rows.push(icon('locked', x, y - 8, { cls: 'sf-seal' }), `<text x="${x + 24}" y="${y + 4.5}">${t.locked}</text>`)
  y += 22
  rows.push(`<rect class="sf-legend__dashed" x="${x}" y="${y - 7}" width="16" height="13" rx="3"/><text x="${x + 24}" y="${y + 4.5}">${t.dashed}</text>`)
  y += 30
  head(t.edgesTitle)
  for (const [cls, text] of [['e-down', t.next], ['e-back', t.rework], ['e-fail', t.fail]]) {
    rows.push(`<path class="sf-legend__line ${cls}" d="M${x} ${y} h18"/><text x="${x + 24}" y="${y + 4.5}">${text}</text>`)
    y += 22
  }
  return `<g class="sf-legend" aria-hidden="true">${rows.join('')}</g>`
}

export const panelId = (flow, lang, id) => `sf-${flow.id}-${lang}-panel-${id}`

/** The figure's main SVG, as a string. */
export function render(flow, { lang = 'fr' } = {}) {
  const [w, h] = flow.viewBox
  const id = `sf-${flow.id}-${lang}`
  return (
    `<svg class="sf-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="group" aria-labelledby="${id}-t">` +
    `<title id="${id}-t">${escapeHtml(pick(flow.title, lang))}</title>` +
    `<g class="sf-arrows">${arrows(flow, lang)}</g>` +
    `<g class="sf-nodes">${flow.nodes.map((n) => cardMarkup(n, flow, lang, panelId(flow, lang, n.id))).join('')}</g>` +
    legend(flow, lang) +
    `</svg>`
  )
}

// ---------------------------------------------------------------- sub-figures (panels)

const subCard = (node, box, lang, inner) => {
  const cls = ['sf-sub', `sf-node--${node.kind}`]
  if (node.optional || node.when) cls.push('is-optional')
  if (node.entry) cls.push('is-entry')
  return `<g ${attrs({ class: cls.join(' '), 'data-node': node.id, transform: `translate(${box.x} ${box.y})` })}><rect class="sf-node__box" width="${box.w}" height="${box.h}" rx="7"/>${inner}</g>`
}

function commandsFigure(sub, lang) {
  const w = 124
  const h = 40
  const cells = sub.nodes.map((n, i) => {
    const box = { x: 2 + (i % 2) * (w + 8), y: 2 + Math.floor(i / 2) * (h + 8), w, h }
    const fit = n.id.length * 7.8 > w - 38 ? ` textLength="${w - 38}" lengthAdjust="spacingAndGlyphs"` : ''
    return subCard(n, box, lang, `${icon('gate', 9, 12, { title: ui(lang).actors.gate, cls: 'sf-actor sf-actor--gate' })}<text class="sf-sub__mono" x="30" y="25"${fit}>${escapeHtml(n.id)}</text>`)
  })
  const rows = Math.ceil(sub.nodes.length / 2)
  return { vb: [w * 2 + 12, rows * (h + 8) - 4], body: cells.join('') }
}

function lensesFigure(sub, lang) {
  const t = ui(lang)
  const left = 34
  const w = 268
  const fan = { x: 12, y: 10 }
  const out = []
  const edges = []
  let y = 26
  const lenses = sub.nodes.filter((n) => n.kind === 'lens')
  for (const lens of lenses) {
    const box = { x: left, y, w, h: 34 }
    const extra = lens.when ? t.when(lens.when) : lens.optional ? t.optional : null
    let inner = `${icon('lens', 8, 9, { title: t.actors.lens, cls: 'sf-actor sf-actor--lens' })}<text class="sf-sub__mono" x="30" y="22">${escapeHtml(lens.mono)}</text>`
    if (lens.seal) inner += sealIcon(lens.seal, lang, w - 22, 9)
    if (extra) {
      const cw = chipWidth(extra)
      inner += chip(extra, w - cw - 6, 7, 'sf-chip--when').markup
    }
    out.push(subCard(lens, box, lang, inner))
    const ly = y + 17
    edges.push(`<path ${attrs({ class: 'sf-subedge', 'data-edge': `${sub.fanOut}->${lens.id}`, d: `M${fan.x} ${fan.y + 5} C${fan.x} ${ly} ${fan.x + 6} ${ly} ${left - 1} ${ly}` })}/>`)
    y += 42
  }
  const join = { x: left + w + 18, y: y + 2 }
  for (const lens of lenses) {
    const ly = 26 + lenses.indexOf(lens) * 42 + 17
    edges.push(`<path ${attrs({ class: 'sf-subedge', 'data-edge': `${lens.id}->${sub.fanIn}#in`, d: `M${left + w} ${ly} C${join.x - 6} ${ly} ${join.x} ${ly} ${join.x} ${join.y - 6}` })}/>`)
  }
  const refuter = sub.nodes.find((n) => n.refuter)
  const rBox = { x: left, y: join.y + 16, w, h: 78 }
  const ry = rBox.y + 20
  edges.push(`<path ${attrs({ class: 'sf-subedge', 'data-edge': `${sub.fanIn}#in->${refuter.id}`, d: `M${join.x} ${join.y + 6} C${join.x} ${ry} ${join.x} ${ry} ${left + w + 1} ${ry}` })}/>`)
  const tier = chipWidth(t.tier)
  let rInner = `${icon('agent', 8, 10, { title: t.actors.agent, cls: 'sf-actor sf-actor--agent' })}${icon('refute', 8, 10, { cls: 'sf-refute' })}<text class="sf-sub__title" x="30" y="23">${escapeHtml(refuter.id)}</text>${sealIcon(refuter.seal, lang, w - 22, 9)}`
  rInner += chip(t.tier, w - 28 - tier, 7, 'sf-chip--note').markup
  rInner += `<text class="sf-sub__mono" x="10" y="42">${escapeHtml(refuter.mono)}</text>`
  rInner += chip(t.severities(refuter.severities), 10, 50, 'sf-chip--note').markup
  out.push(subCard(refuter, rBox, lang, rInner))
  // the refuter's answer, marked during a scenario
  let ox = left + 8
  const answers = refuter.out.map((a) => {
    const c = chip(a, ox, rBox.y + rBox.h + 6, 'sf-chip--answer')
    ox += c.w + 4
    return c.markup.replace('class="sf-chip', `data-owner="${refuter.id}" class="sf-chip`)
  })
  const verdict = sub.nodes.find((n) => n.kind === 'verdict')
  const vBox = { x: left, y: rBox.y + rBox.h + 34, w, h: 60 }
  edges.push(`<path ${attrs({ class: 'sf-subedge', 'data-edge': `${refuter.id}->${sub.fanIn}`, d: `M${left + w / 2 + 60} ${rBox.y + rBox.h} L${left + w / 2 + 60} ${vBox.y - 1}` })}/>`)
  let vInner = `${icon('verdict', 8, 10, { title: t.actors.verdict, cls: 'sf-actor sf-actor--verdict' })}<text class="sf-sub__title" x="30" y="23">${escapeHtml(verdict.id)}</text>${sealIcon(verdict.seal, lang, w - 22, 9)}`
  let vx = 10
  for (const v of verdict.out) {
    const c = chip(v, vx, 32, v === 'APPROVED' ? 'sf-chip--ok' : 'sf-chip--ko')
    vInner += c.markup
    vx += c.w + 4
  }
  out.push(subCard(verdict, vBox, lang, vInner))
  const dots =
    `<g class="sf-sub sf-fanpoint" data-node="${escapeHtml(sub.fanOut)}"><title>${t.fanout}</title><circle cx="${fan.x}" cy="${fan.y}" r="5"/></g>` +
    `<g class="sf-sub sf-fanpoint" data-node="${escapeHtml(sub.fanIn)}#in"><title>${t.fanin}</title><circle cx="${join.x}" cy="${join.y}" r="5"/></g>`
  return { vb: [join.x + 10, vBox.y + vBox.h + 2], body: `<g class="sf-subedges">${edges.join('')}</g>${out.join('')}${answers.join('')}${dots}` }
}

function loopFigure(sub, lang) {
  const t = ui(lang)
  const left = 84
  const w = 240
  const boxes = {}
  const cards = []
  let y = 2
  for (const node of sub.nodes) {
    const h = node.entry ? 32 : 60
    boxes[node.id] = { x: left, y, w, h }
    let inner
    if (node.entry) inner = `${icon('gate', 8, 8, { cls: 'sf-actor sf-actor--gate' })}<text class="sf-sub__title" x="30" y="21">${escapeHtml(node.id)}</text>`
    else {
      inner =
        `<circle class="sf-node__badge" cx="15" cy="16" r="9"/><text class="sf-node__num sf-node__num--small" x="15" y="20">${escapeHtml(node.badge)}</text>` +
        actorIcon(node.kind, lang, 28, 8) +
        `<text class="sf-sub__title" x="50" y="21">${escapeHtml(node.id)}</text>` +
        sealIcon(node.seal, lang, w - 22, 8) +
        `<text class="sf-sub__mono" x="10" y="40">${escapeHtml(node.mono)}</text>`
      if (node.each) inner += chip(t.each, w - chipWidth(t.each) - 8, 28, 'sf-chip--each').markup
    }
    cards.push(subCard(node, boxes[node.id], lang, inner))
    y += h + 24
  }
  // the lanes the canvas would give these edges, compact labels on them
  const order = sub.order
  const routes = routeEdges(order, sub.edges)
  const ports = {}
  for (const r of routes.filter((r) => r.side !== 'down')) {
    for (const end of ['from', 'to']) (ports[`${r.edge[end]}`] ??= []).push(r)
  }
  const portY = (id, r) => {
    const list = ports[id]
    const b = boxes[id]
    return b.y + ((list.indexOf(r) + 1) * b.h) / (list.length + 1)
  }
  const paths = []
  const chips = []
  for (const r of routes) {
    const e = r.edge
    const a = boxes[e.from]
    const b = boxes[e.to]
    const kind = e.label === 'FAIL' ? 'e-fail' : /REWORK|REJECTED/.test(e.label ?? '') ? 'e-back' : r.side === 'down' ? 'e-down' : 'e-loop'
    let d
    if (r.side === 'down') {
      const x = a.x + a.w / 2
      d = `M${x} ${a.y + a.h + 1} L${x} ${b.y - 2}`
      if (e.label === 'FAIL') chips.push(chip(`FAIL · max ${e.maxVisits}`, x + 8, a.y + a.h + 2, 'sf-chip--fail').markup)
    } else {
      const lane = left - 24 * (r.lane + 1)
      const y1 = portY(e.from, r)
      const y2 = portY(e.to, r)
      d = `M${a.x} ${y1} L${lane + 6} ${y1} Q${lane} ${y1} ${lane} ${y1 - 6} L${lane} ${y2 + 6} Q${lane} ${y2} ${lane + 6} ${y2} L${b.x - 2} ${y2}`
      if (e.maxVisits) chips.push(`<text class="sf-lanelabel ${kind}" x="${lane + 3}" y="${(y1 + y2) / 2}" transform="rotate(-90 ${lane + 3} ${(y1 + y2) / 2})" text-anchor="middle">${escapeHtml(`${e.label} · max ${e.maxVisits}`)}</text>`)
    }
    paths.push(`<path ${attrs({ class: `sf-subedge ${kind}${e.multi ? ' is-multi' : ''}`, 'data-edge': e.id, 'data-label': e.label ?? '', d })}/>`)
  }
  return { vb: [left + w + 4, y - 22], body: `<g class="sf-subedges">${paths.join('')}</g>${cards.join('')}${chips.join('')}` }
}

export function renderSub(flow, parentId, lang = 'fr') {
  const sub = flow.subs[parentId]
  const fig = sub.kind === 'commands' ? commandsFigure(sub, lang) : sub.kind === 'lenses' ? lensesFigure(sub, lang) : loopFigure(sub, lang)
  const label = `${ui(lang).subtasks} — ${parentId}`
  // never drawn larger than its own size: the panel may be wider, the text stays at its size
  return `<svg class="sf-subsvg" data-sub="${escapeHtml(parentId)}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fig.vb[0]} ${fig.vb[1]}" style="max-width:${Math.ceil(fig.vb[0])}px" role="img" aria-label="${escapeHtml(label)}">${fig.body}</svg>`
}

// ---------------------------------------------------------------- panels

const chipsHtml = (list, lang, cls = '') => (list ?? []).map((c) => `<span class="sf-pchip ${cls}">${escapeHtml(pick(c, lang))}</span>`).join('')

const iconSvg = (name, title) => `<svg class="sf-picon sf-icon--${name}" viewBox="0 0 16 16" aria-hidden="${title ? 'false' : 'true'}" role="img">${title ? `<title>${escapeHtml(title)}</title>` : ''}${ICONS[name]}</svg>`

function panel(flow, node, lang) {
  const t = ui(lang)
  const id = panelId(flow, lang, node.id)
  const actor = actorOf(node.kind)
  const rows = []
  rows.push(
    `<header class="sf-panel__head"><h3 id="${id}-h"><span>${t.step}</span> <code>${escapeHtml(node.id)}</code></h3>` +
      `<button type="button" class="sf-panel__close" aria-label="${t.close}">×</button></header>`,
  )
  rows.push(
    `<p class="sf-panel__who sf-actor--${actor}">${iconSvg(actor)}<span>${escapeHtml(actorLabel(actor, lang))}</span>` +
      (node.seal ? `<span class="sf-panel__seal">${iconSvg(node.seal)}${t[node.seal]}</span>` : '') +
      (node.when ? `<span class="sf-pchip sf-chip--when">${escapeHtml(t.when(node.when))}</span>` : '') +
      `</p>`,
  )
  rows.push(`<p class="sf-panel__mono"><code>${escapeHtml(node.mono)}</code></p>`)
  if (node.role) rows.push(`<p class="sf-panel__role">${inline(pick(node.role, lang))}</p>`)
  const io = [['in', node.in], ['out', node.out]].filter(([, l]) => l?.length)
  if (io.length) rows.push(`<dl class="sf-panel__io">${io.map(([k, l]) => `<dt>${k}</dt><dd>${chipsHtml(l, lang)}</dd>`).join('')}</dl>`)
  if (flow.subs?.[node.id]) {
    rows.push(`<h4 class="sf-panel__sub">${t.subtasks} · ${escapeHtml(counterText(node, flow, lang))}</h4>`)
    rows.push(renderSub(flow, node.id, lang))
  }
  return `<section class="sf-panel" id="${id}" data-panel="${escapeHtml(node.id)}" role="region" aria-labelledby="${id}-h" hidden>${rows.join('')}</section>`
}

// ---------------------------------------------------------------- the figure

/** What the animation needs at runtime, embedded next to a pre-rendered figure. */
export const runtimeData = (flow) => ({ id: flow.id, scenarios: flow.scenarios })

export const captionHtml = (scenario, lang) =>
  `<b>${escapeHtml(pick(scenario.label, lang))}</b> — ${inline(pick(scenario.caption, lang))}`

const kindOfStep = (flow, fig, id) =>
  fig === 'main' ? flow.nodes.find((n) => n.id === id)?.kind : flow.subs[fig]?.nodes.find((n) => n.id === id)?.kind

function altText(flow, lang) {
  const t = ui(lang)
  const scenarios = flow.scenarios
    .map((s) => {
      const steps = s.trail.map((step) => {
        const kind = kindOfStep(flow, step.fig, step.nodes[0])
        const actor = actorOf(kind)
        const who = actor ? `<span class="sf-alt__actor">${escapeHtml(actorLabel(actor, lang))} ·</span> ` : ''
        const where = step.fig === 'main' ? '' : `<span class="sf-alt__in">${escapeHtml(step.fig)} ›</span> `
        const ids = step.nodes.map((n) => `<code>${escapeHtml(n)}</code>`).join(' ∥ ')
        const via = step.via ? ` <span class="sf-alt__verdict">(${escapeHtml(step.via)})</span>` : ''
        return `<li>${where}${who}${ids}${via}</li>`
      })
      return `<li><p>${captionHtml(s, lang)}</p><ol class="sf-alt__steps" aria-label="${t.steps}">${steps.join('')}</ol></li>`
    })
    .join('')
  const subs = Object.entries(flow.subs ?? {})
    .map(([parent, sub]) => `<li><code>${escapeHtml(parent)}</code> : ${sub.nodes.filter((n) => !n.entry && !/#in$/.test(n.id) && n.kind !== 'fanout').map((n) => `${escapeHtml(actorLabel(actorOf(n.kind), lang))} <code>${escapeHtml(n.id)}</code>`).join(', ')}</li>`)
    .join('')
  return `<details class="sf-alt"><summary>${t.alt}</summary><ul>${scenarios}</ul><h4>${t.subtasks}</h4><ul class="sf-alt__subs">${subs}</ul></details>`
}

/** The whole <figure>: scenario bar, board with the SVG and the panels, caption, text version. */
export function renderFigure(flow, { lang = 'fr', embedData = true } = {}) {
  const t = ui(lang)
  const first = flow.scenarios[0]
  const buttons = flow.scenarios
    .map((s, i) => `<button type="button" class="sf-seg__btn" data-scenario="${escapeHtml(s.id)}" aria-pressed="${i === 0}">${escapeHtml(pick(s.label, lang))}</button>`)
    .join('')
  const panels = flow.nodes.filter((n) => !n.io).map((n) => panel(flow, n, lang)).join('')
  const data = embedData ? `<script type="application/json" class="sf-data">${JSON.stringify(runtimeData(flow)).replace(/</g, '\\u003c')}</script>` : ''
  return [
    `<figure class="skraft-flow" data-flow="${escapeHtml(flow.id)}" data-lang="${lang}" style="--sf-panel-w:${flow.panelWidth}px">`,
    `<div class="sf-bar" role="group" aria-label="${t.scenario}">`,
    `<span class="sf-bar__label" aria-hidden="true">${t.scenario}</span>`,
    `<div class="sf-seg">${buttons}</div>`,
    `<button type="button" class="sf-replay" aria-label="${t.replay}" title="${t.replay}"><span aria-hidden="true">↻</span></button>`,
    `</div>`,
    `<div class="sf-stage">`,
    `<div class="sf-board">${render(flow, { lang })}</div>`,
    `<div class="sf-panels">${panels}</div>`,
    `</div>`,
    `<p class="sf-hint" aria-hidden="true">${t.hint} →</p>`,
    `<p class="sf-caption" aria-live="polite">${captionHtml(first, lang)}</p>`,
    `<figcaption class="sf-figcaption">${inline(pick(flow.figcaption, lang))}</figcaption>`,
    altText(flow, lang),
    data,
    `</figure>`,
  ].join('\n')
}

export const chipLabelWidth = (text) => String(text).length * 7 + 4
