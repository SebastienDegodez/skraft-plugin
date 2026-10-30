// DOM side of the flow figures: landing, detail panels, scenario playback with tokens.
// animate(root, flow) takes a <figure class="skraft-flow"> holding renderFigure()'s markup and
// the flow (or its runtime subset { scenarios }). Returns { play, open, close, destroy }.

import { captionHtml, escapeHtml, pick } from './render.mjs'

const SVG_NS = 'http://www.w3.org/2000/svg'
const SPEED = 0.34 // px per ms
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

export function animate(root, flow) {
  const lang = root.dataset.lang || 'fr'
  const main = root.querySelector('svg.sf-svg')
  const stage = root.querySelector('.sf-stage')
  const caption = root.querySelector('.sf-caption')
  const buttons = [...root.querySelectorAll('.sf-seg__btn')]
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const narrow = () => window.matchMedia?.('(max-width: 640px)').matches
  const byId = new Map(flow.scenarios.map((s) => [s.id, s]))
  const sel = (id) => CSS.escape(id)
  let current = flow.scenarios[0]?.id
  let run = 0
  let landed = false
  let observer = null
  let follow = false
  let openId = null

  const card = (id) => main.querySelector(`.sf-node[data-node="${sel(id)}"]`)
  const panelOf = (id) => root.querySelector(`.sf-panel[data-panel="${sel(id)}"]`)
  const svgOf = (fig) => (fig === 'main' ? main : panelOf(fig)?.querySelector('svg.sf-subsvg'))
  const nodeIn = (svg, id) => svg?.querySelector(`[data-node="${sel(id)}"]`)
  const edgeIn = (svg, id) => svg?.querySelector(`[data-edge="${sel(id)}"]`)

  // ---------------------------------------------------------------- panels

  // beside the step, on the right, else on the left; with no room on either side, under it
  function place(panel, id) {
    panel.classList.remove('is-under')
    if (narrow()) {
      panel.style.left = panel.style.top = ''
      return
    }
    const box = card(id).querySelector('.sf-node__box').getBoundingClientRect()
    const s = stage.getBoundingClientRect()
    const w = panel.offsetWidth
    let left = box.right - s.left + 14
    let top = box.top - s.top
    if (left + w > s.width - 4) {
      left = box.left - s.left - 14 - w
      if (left < 4) {
        panel.classList.add('is-under')
        const wide = panel.offsetWidth
        left = Math.max(4, Math.min(box.left - s.left + (box.width - wide) / 2, s.width - wide - 4))
        top = box.bottom - s.top + 8
      }
    }
    top = Math.max(0, Math.min(top, s.height - panel.offsetHeight - 4))
    panel.style.left = `${Math.round(left)}px`
    panel.style.top = `${Math.round(top)}px`
  }
  const under = () => openId && panelOf(openId).classList.contains('is-under')
  const below = (id, than) => card(id)?.getBoundingClientRect().top > card(than)?.getBoundingClientRect().top

  function open(id, { focus = false } = {}) {
    const panel = panelOf(id)
    if (!panel) return null
    if (openId && openId !== id) close({ restore: false })
    panel.hidden = false
    openId = id
    card(id)?.setAttribute('aria-expanded', 'true')
    root.classList.add('has-panel')
    place(panel, id)
    if (focus) panel.querySelector('.sf-panel__close')?.focus()
    return panel
  }

  function close({ restore = true } = {}) {
    if (!openId) return
    const id = openId
    panelOf(id).hidden = true
    card(id)?.setAttribute('aria-expanded', 'false')
    root.classList.remove('has-panel')
    openId = null
    if (restore) card(id)?.focus()
  }

  const toggle = (id) => (openId === id ? close() : open(id, { focus: true }))

  // ---------------------------------------------------------------- tokens

  function token(svg, tone) {
    const g = document.createElementNS(SVG_NS, 'g')
    g.setAttribute('class', `sf-token-group${tone ? ` is-${tone}` : ''}`)
    g.setAttribute('aria-hidden', 'true')
    g.innerHTML = '<circle class="sf-token-halo" r="12"/><circle class="sf-token" r="5.5"/>'
    svg.appendChild(g)
    return g
  }

  function keepInView(g) {
    if (!follow) return
    const r = g.getBoundingClientRect()
    const margin = 90
    if (r.bottom > innerHeight - margin) window.scrollBy(0, Math.min(18, r.bottom - innerHeight + margin))
    else if (r.top < margin) window.scrollBy(0, -Math.min(18, margin - r.top))
    const board = root.querySelector('.sf-board')
    if (board.scrollWidth > board.clientWidth + 1 && main.contains(g)) {
      const b = board.getBoundingClientRect()
      if (r.left < b.left + 40 || r.right > b.right - 40) board.scrollLeft += (r.left + r.width / 2 - (b.left + b.width / 2)) * 0.1
    }
  }

  async function travel(svg, edgeId, me, { delay = 0, tone } = {}) {
    const path = edgeIn(svg, edgeId)
    if (!path) return
    if (delay) await wait(delay)
    const label = path.dataset.label
    const g = token(svg, tone ?? (label === 'FAIL' ? 'fail' : /REWORK|REJECTED/.test(label ?? '') ? 'back' : null))
    path.classList.add('is-live')
    const length = path.getTotalLength()
    const duration = Math.min(1300, Math.max(360, length / SPEED))
    const start = performance.now()
    for (;;) {
      if (me !== run) break
      const t = Math.min(1, (performance.now() - start) / duration)
      const p = path.getPointAtLength(ease(t) * length)
      g.setAttribute('transform', `translate(${p.x} ${p.y})`)
      keepInView(g)
      if (t >= 1) break
      await frame()
    }
    g.remove()
    path.classList.remove('is-live')
    path.classList.add('is-done')
  }

  /** Several runs of one step (each= survivor-file): staggered tokens on the same edge. */
  const multi = (svg, id) => edgeIn(svg, id)?.classList.contains('is-multi')

  function hit(svg, id) {
    const el = nodeIn(svg, id)
    if (!el) return
    el.classList.add('is-hit', 'is-on')
    el.classList.remove('is-now')
    void el.getBoundingClientRect()
    el.classList.add('is-now')
  }

  function gateBar(svg, edgeId) {
    const path = edgeIn(svg, edgeId)
    const from = path && nodeIn(svg, edgeId.split('->')[0])
    if (!from) return
    if (path.dataset.label === 'FAIL') from.classList.add('is-fail')
    else if (path.dataset.label === 'PASS') from.classList.add('is-pass')
  }

  // ---------------------------------------------------------------- playback

  const press = (id) => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scenario === id)))

  function reset() {
    close({ restore: false })
    for (const el of root.querySelectorAll('.is-on, .is-hit, .is-live, .is-done, .is-now, .is-pass, .is-fail, .is-chosen')) {
      el.classList.remove('is-on', 'is-hit', 'is-live', 'is-done', 'is-now', 'is-pass', 'is-fail', 'is-chosen')
    }
    root.querySelectorAll('.sf-token-group').forEach((g) => g.remove())
    main.classList.remove('is-focus')
  }

  function mark(svg, step) {
    for (const id of step.nodes) {
      if (step.mark === 'pass') nodeIn(svg, id)?.classList.add('is-pass')
      if (step.mark === 'fail') nodeIn(svg, id)?.classList.add('is-fail')
    }
    if (step.chip) {
      const owner = nodeIn(svg, step.chip.node)
      const chip = owner?.querySelector(`[data-chip="${sel(step.chip.text)}"]`) ?? svg.querySelector(`[data-owner="${sel(step.chip.node)}"][data-chip="${sel(step.chip.text)}"]`)
      chip?.classList.add('is-chosen')
      owner?.classList.add(step.chip.text === 'refuted' ? 'is-refuted' : 'is-on')
    }
  }

  function settle(scenario) {
    // reduced motion: the whole path at once, the last panel the scenario enters open
    let last = null
    for (const step of scenario.steps) {
      if (step.fig !== 'main') last = step.fig
    }
    if (last) open(last)
    for (const step of scenario.steps) {
      const svg = svgOf(step.fig)
      if (step.fig === 'main') main.classList.add('is-focus')
      step.nodes.forEach((n) => nodeIn(svg, n)?.classList.add('is-hit', 'is-on'))
      step.edges.forEach((e) => {
        edgeIn(svg, e)?.classList.add('is-done', 'is-on')
        if (step.fig === 'main') gateBar(svg, e)
      })
      mark(svg, step)
    }
    caption.innerHTML = captionHtml(scenario, lang)
  }

  async function play(id = current, { user = false } = {}) {
    const scenario = byId.get(id)
    if (!scenario) return
    current = id
    const me = ++run
    follow = user
    press(id)
    reset()
    if (reduced()) return settle(scenario)
    caption.setAttribute('aria-busy', 'true')
    caption.innerHTML = `<b>${escapeHtml(pick(scenario.label, lang))}</b> <span class="sf-caption__wait">…</span>`
    main.classList.add('is-focus')
    for (const step of scenario.steps) if (step.fig === 'main') step.nodes.forEach((n) => card(n)?.classList.add('is-on'))
    for (const step of scenario.steps) {
      if (me !== run) return
      // a panel dropped under its step hides the steps below: it closes when the run leaves it
      if (step.fig === 'main' && step.edges.length && under() && below(step.nodes[0], openId)) {
        close({ restore: false })
        await wait(160)
      }
      if (step.fig !== 'main' && openId !== step.fig) {
        open(step.fig)
        card(step.fig)?.classList.add('is-on')
        await wait(320)
      }
      const svg = svgOf(step.fig)
      step.edges.forEach((e) => edgeIn(svg, e)?.classList.add('is-on'))
      await Promise.all(
        step.edges.flatMap((e, i) => {
          const runs = multi(svg, e) ? [0, 170, 340] : [i * 60]
          if (step.fig === 'main') gateBar(svg, e)
          return runs.map((delay) => travel(svg, e, me, { delay }))
        }),
      )
      if (me !== run) return
      step.nodes.forEach((n) => hit(svg, n))
      mark(svg, step)
      await wait(step.mark === 'fail' ? 900 : step.mark ? 220 : step.chip ? 520 : 120)
    }
    if (me !== run) return
    caption.innerHTML = captionHtml(scenario, lang)
    caption.removeAttribute('aria-busy')
  }

  // ---------------------------------------------------------------- landing

  async function land() {
    landed = true
    const me = ++run
    for (const n of main.querySelectorAll('.sf-node')) {
      if (me !== run) break
      n.classList.add('is-landed')
      await wait(140)
    }
    root.classList.add('is-drawn')
    await wait(600)
    root.classList.remove('is-pre')
    if (me === run) play(current)
  }

  // ---------------------------------------------------------------- events

  const onClick = (event) => {
    const b = event.target.closest('.sf-seg__btn')
    if (b) return play(b.dataset.scenario, { user: true })
    if (event.target.closest('.sf-replay')) return play(current, { user: true })
    if (event.target.closest('.sf-panel__close')) return close()
    const c = event.target.closest('.sf-node[role="button"]')
    if (c) toggle(c.dataset.node)
  }
  const onKey = (event) => {
    if (event.key === 'Escape' && openId) {
      event.preventDefault()
      return close()
    }
    const c = event.target.closest?.('.sf-node[role="button"]')
    if (c && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      toggle(c.dataset.node)
    }
  }
  const onResize = () => openId && place(panelOf(openId), openId)
  root.addEventListener('click', onClick)
  root.addEventListener('keydown', onKey)
  window.addEventListener('resize', onResize)
  root.classList.add('is-ready')

  if (reduced() || typeof IntersectionObserver === 'undefined') play(current)
  else {
    root.classList.add('is-pre')
    observer = new IntersectionObserver(
      (entries) => {
        if (landed || !entries.some((e) => e.isIntersecting)) return
        observer.disconnect()
        land()
      },
      { threshold: 0.15 },
    )
    observer.observe(main)
  }

  return {
    play,
    open,
    close,
    destroy() {
      run++
      observer?.disconnect()
      root.removeEventListener('click', onClick)
      root.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    },
  }
}
