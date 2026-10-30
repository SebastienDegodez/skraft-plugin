// DOM side of the flow figures: landing, scenario playback, travelling token.
// animate(root, flow) takes a <figure class="skraft-flow"> already holding render()'s
// markup and the flow (or its runtime subset: { scenarios }). Returns { play, destroy }.

import { captionHtml, escapeHtml, pick } from './render.mjs'

const SVG_NS = 'http://www.w3.org/2000/svg'
const SPEED = 0.36 // px per ms
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))

export function animate(root, flow) {
  const lang = root.dataset.lang || 'fr'
  const svg = root.querySelector('svg.sf-svg')
  const board = root.querySelector('.sf-board')
  const caption = root.querySelector('.sf-caption')
  const buttons = [...root.querySelectorAll('.sf-seg__btn')]
  const replay = root.querySelector('.sf-replay')
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const nodeEl = (id) => svg.querySelector(`.sf-node[data-node="${CSS.escape(id)}"]`)
  const edgeEl = (id) => svg.querySelector(`.sf-edge[data-edge="${CSS.escape(id)}"]`)
  const byId = new Map(flow.scenarios.map((s) => [s.id, s]))
  let current = flow.scenarios[0]?.id
  let run = 0
  let landed = false
  let observer = null

  const token = document.createElementNS(SVG_NS, 'g')
  token.setAttribute('class', 'sf-token-group')
  token.setAttribute('aria-hidden', 'true')
  token.innerHTML = '<circle class="sf-token-halo" r="13"/><circle class="sf-token" r="6"/>'
  token.style.display = 'none'
  svg.appendChild(token)
  const dot = token.querySelector('.sf-token')

  const setCaption = (scenario) => {
    caption.innerHTML = captionHtml(scenario, lang)
    caption.removeAttribute('aria-busy')
  }

  const press = (id) => {
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.scenario === id))
  }

  const reset = () => {
    root.classList.remove('is-focus')
    for (const el of svg.querySelectorAll('.is-on, .is-hit, .is-live, .is-done, .is-now')) {
      el.classList.remove('is-on', 'is-hit', 'is-live', 'is-done', 'is-now')
    }
    token.style.display = 'none'
  }

  const highlight = (scenario) => {
    root.classList.add('is-focus')
    for (const id of scenario.path) nodeEl(id)?.classList.add('is-on')
    for (const id of scenario.edges) edgeEl(id)?.classList.add('is-on')
  }

  const follow = (x) => {
    if (board.scrollWidth <= board.clientWidth + 1) return
    const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width
    const target = x * scale - board.clientWidth / 2
    board.scrollLeft += (target - board.scrollLeft) * 0.12
  }

  const hit = (id) => {
    const el = nodeEl(id)
    if (!el) return
    el.classList.add('is-hit')
    el.classList.remove('is-now')
    // restart the one-shot pulse
    void el.getBoundingClientRect()
    el.classList.add('is-now')
  }

  async function travel(edgeId, me) {
    const el = edgeEl(edgeId)
    const path = el?.querySelector('.sf-edge__path')
    if (!path) return
    const tone = [...el.classList].find((c) => c.startsWith('sf-tone--'))?.slice(9)
    dot.setAttribute('class', `sf-token${tone === 'fail' ? ' is-fail' : tone === 'amber' ? ' is-amber' : ''}`)
    el.classList.add('is-live')
    const length = path.getTotalLength()
    const duration = Math.min(1100, Math.max(380, length / SPEED))
    const start = performance.now()
    token.style.display = ''
    for (;;) {
      if (me !== run) return
      const t = Math.min(1, (performance.now() - start) / duration)
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
      const p = path.getPointAtLength(eased * length)
      token.setAttribute('transform', `translate(${p.x} ${p.y})`)
      follow(p.x)
      if (t >= 1) break
      await frame()
    }
    el.classList.remove('is-live')
    el.classList.add('is-done')
  }

  async function play(id = current) {
    const scenario = byId.get(id)
    if (!scenario) return
    current = id
    const me = ++run
    press(id)
    reset()
    highlight(scenario)
    if (reduced()) {
      for (const n of scenario.path) nodeEl(n)?.classList.add('is-hit')
      for (const e of scenario.edges) edgeEl(e)?.classList.add('is-done')
      setCaption(scenario)
      return
    }
    caption.setAttribute('aria-busy', 'true')
    caption.innerHTML = `<b>${escapeHtml(pick(scenario.label, lang))}</b> <span class="sf-caption__wait">…</span>`
    hit(scenario.path[0])
    await wait(260)
    for (let i = 0; i < scenario.edges.length; i++) {
      if (me !== run) return
      await travel(scenario.edges[i], me)
      if (me !== run) return
      hit(scenario.path[i + 1])
      await wait(140)
    }
    if (me !== run) return
    token.style.display = 'none'
    setCaption(scenario)
  }

  async function land() {
    landed = true
    const me = ++run
    const nodes = [...svg.querySelectorAll('.sf-node')]
    // steps first, in the order they are numbered, the way the canvas fills in live
    nodes.sort((a, b) => order(a) - order(b))
    for (const n of nodes) {
      if (me !== run) break
      n.classList.add('is-landed')
      await wait(140)
    }
    const edges = [...svg.querySelectorAll('.sf-edge')]
    for (const e of edges) {
      const path = e.querySelector('.sf-edge__path')
      const solid = e.classList.contains('sf-tone--flow')
      e.classList.add('is-landed')
      if (solid && me === run) {
        const length = path.getTotalLength()
        path.style.strokeDasharray = `${length}`
        path.style.strokeDashoffset = `${length}`
        path.getBoundingClientRect()
        path.style.transition = 'stroke-dashoffset 420ms ease'
        path.style.strokeDashoffset = '0'
        setTimeout(() => {
          path.style.strokeDasharray = ''
          path.style.strokeDashoffset = ''
          path.style.transition = ''
        }, 460)
      }
    }
    svg.querySelector('.sf-legend')?.classList.add('is-landed')
    await wait(520)
    root.classList.remove('is-pre')
    if (me === run) play(current)
  }

  const order = (el) => {
    const badge = el.querySelector('.sf-node__num')?.textContent ?? ''
    if (!badge) return el.dataset.io === 'in' ? 0 : 99
    const n = parseFloat(badge)
    return n + (badge.match(/[a-z]$/) ? (badge.charCodeAt(badge.length - 1) - 96) / 10 : 0)
  }

  const onClick = (event) => {
    const b = event.target.closest('.sf-seg__btn')
    if (b) play(b.dataset.scenario)
    else if (event.target.closest('.sf-replay')) play(current)
  }
  root.addEventListener('click', onClick)
  root.classList.add('is-ready')

  if (reduced() || typeof IntersectionObserver === 'undefined') {
    play(current)
  } else {
    root.classList.add('is-pre')
    observer = new IntersectionObserver(
      (entries) => {
        if (landed || !entries.some((e) => e.isIntersecting)) return
        observer.disconnect()
        land()
      },
      { threshold: 0.35 },
    )
    observer.observe(svg)
  }

  return {
    play,
    destroy() {
      run++
      observer?.disconnect()
      root.removeEventListener('click', onClick)
      token.remove()
    },
  }
}
