// The panel: renders the controller snapshot it receives over server-sent events and sends the
// user's actions back. The panel keeps only view state (filter, query, open lines, plan drawer).
import { ui } from './i18n.mjs'
import { icon, renderBar, renderHeader, renderMapProblems, renderPlan, renderStory, visibleStories } from './view.mjs'

const token = document.querySelector('meta[name="canvas-token"]')?.getAttribute('content') ?? ''
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id))
const app = /** @type {HTMLElement} */ (document.querySelector('.app'))

const view = { filter: 'all', query: '', focus: /** @type {string | null} */ (null), open: new Set(), planOpen: false, lit: /** @type {{ story: string, target: string, item: string | null } | null} */ (null) }
/** @type {any} */
let snapshot = null

const call = async (name, input = {}) => {
  const answer = await fetch(`/api/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Canvas-Token': token }, body: JSON.stringify(input) })
  const body = await answer.json().catch(() => ({}))
  if (!answer.ok) throw new Error(body.error ?? `${answer.status}`)
  return body.result
}

const toast = (text, kind = 'info') => {
  const node = $('toast')
  node.textContent = text
  node.dataset.kind = kind
  node.classList.remove('show')
  void node.offsetWidth
  node.classList.add('show')
}

/** Replaces a region's markup, keeping its scroll position and the focused control. */
const patch = (node, html) => {
  if (node.dataset.html === html) return
  const scroll = node.scrollTop
  const active = document.activeElement
  const key = active && node.contains(active) ? active.getAttribute('data-action') + (active.getAttribute('data-story') ?? active.getAttribute('data-line') ?? active.getAttribute('data-filter') ?? '') : null
  node.innerHTML = html
  node.dataset.html = html
  node.scrollTop = scroll
  if (key) {
    const again = [...node.querySelectorAll('[data-action]')].find((el) => el.getAttribute('data-action') + (el.getAttribute('data-story') ?? el.getAttribute('data-line') ?? el.getAttribute('data-filter') ?? '') === key)
    if (again instanceof HTMLElement) again.focus({ preventScroll: true })
  }
}

const render = () => {
  const a = snapshot?.assessment
  app.dataset.state = a ? 'ready' : 'empty'
  document.documentElement.lang = a?.language ?? 'en'
  if (!a) {
    $('empty').hidden = false
    $('empty').textContent = snapshot?.error ?? ui('en', 'empty')
    patch($('top'), snapshot ? renderHeader(snapshot) : '')
    for (const id of ['plan', 'story', 'bar', 'map-problems']) patch($(id), '')
    return
  }
  $('empty').hidden = true
  if (!view.focus || !a.stories.some((s) => s.id === view.focus)) view.focus = snapshot.focus ?? (a.stories.find((s) => s.verdict === 'fail') ?? a.stories[0])?.id ?? null
  const toggle = $('plan').previousElementSibling
  toggle.innerHTML = `${icon('menu')}<span>${ui(a.language, 'menu')}</span><code>${view.focus ?? ''}</code>`
  toggle.setAttribute('aria-expanded', String(view.planOpen))
  app.classList.toggle('plan-open', view.planOpen)
  patch($('top'), renderHeader(snapshot))
  patch($('map-problems'), renderMapProblems(snapshot))
  patch($('plan'), renderPlan(snapshot, view))
  patch($('story'), renderStory(snapshot, view))
  patch($('bar'), renderBar(snapshot))
}

const focusStory = (id, { scroll = true } = {}) => {
  if (id === view.focus) return
  view.focus = id
  view.open = new Set()
  view.lit = null
  view.planOpen = false
  render()
  if (scroll) $('story').scrollTo({ top: 0 })
  $('plan').querySelector(`[data-story="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' })
}

/**
 * The signature interaction: the sheet scrolls to the passage a failing line accuses (the criterion,
 * the example or the dependency when the evidence names one) and keeps it lit until the next line
 * is opened or the next story focused.
 */
const reveal = (target, item) => {
  view.lit = { story: /** @type {string} */ (view.focus), target, item: item ?? null }
  render()
  const lit = /** @type {HTMLElement | null} */ ($('story').querySelector('.lit'))
  if (!lit) return
  lit.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
  const section = /** @type {HTMLElement} */ (lit.closest('.sheet-part') ?? lit)
  section.focus({ preventScroll: true })
}

/** Opens a checklist line (from the tick index or an antipattern) and brings it into view. */
const openLine = (key) => {
  if (!key) return
  view.open.add(key)
  view.lit = null
  render()
  $('story').querySelector(`.line[data-key="${CSS.escape(key)}"]`)?.scrollIntoView({ behavior: 'auto', block: 'center' })
}

const act = async (name, input, done) => {
  try {
    const result = await call(name, input)
    if (done) toast(done(result))
  } catch (error) {
    toast(/** @type {Error} */ (error).message, 'error')
  }
}

document.addEventListener('click', (event) => {
  const el = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-action]'))
  if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return
  const lang = snapshot?.assessment?.language ?? 'en'
  switch (el.dataset.action) {
    case 'focus': return focusStory(/** @type {string} */ (el.dataset.story))
    case 'filter': view.filter = /** @type {string} */ (el.dataset.filter); return render()
    case 'toggle-line': {
      const line = /** @type {string} */ (el.dataset.line)
      if (view.open.has(line)) view.open.delete(line)
      else view.open.add(line)
      view.lit = null
      return render()
    }
    case 'reveal': return reveal(/** @type {string} */ (el.dataset.target), el.dataset.item)
    case 'open-line': return openLine(/** @type {string} */ (el.dataset.line))
    case 'toggle-plan': view.planOpen = !view.planOpen; return render()
    case 'review': return void act('mark_reviewed', { ids: [el.dataset.story], reviewed: el.dataset.reviewed === 'true' })
    case 'preview': return void act('preview_creation', {}, (r) => (r.status === 'simulated' ? ui(lang, 'dryRun') : r.reason))
    case 'create': return void act('create_issues', {}, (r) => `${ui(lang, 'created')}: ${Object.keys(r.published ?? {}).length}`)
    default: return undefined
  }
})

document.addEventListener('input', (event) => {
  const el = /** @type {HTMLInputElement} */ (event.target)
  if (el.dataset.action === 'search') {
    view.query = el.value
    render()
  }
})

document.addEventListener('change', (event) => {
  const el = /** @type {HTMLSelectElement} */ (event.target)
  if (el.dataset.action === 'open-backlog') void act('open_backlog', { slug: el.value })
})

document.addEventListener('keydown', (event) => {
  const target = /** @type {HTMLElement} */ (event.target)
  if (!snapshot?.assessment || event.metaKey || event.ctrlKey || event.altKey || /INPUT|SELECT|TEXTAREA/.test(target.tagName)) return
  const stories = visibleStories(snapshot.assessment, view)
  const index = stories.findIndex((s) => s.id === view.focus)
  if (event.key === 'j' || event.key === 'k') {
    const next = stories[Math.min(stories.length - 1, Math.max(0, index + (event.key === 'j' ? 1 : -1)))]
    if (next) focusStory(next.id)
    event.preventDefault()
  } else if (event.key === 'r') {
    const story = snapshot.assessment.stories.find((s) => s.id === view.focus)
    if (story?.state === 'ready') void act('mark_reviewed', { ids: [story.id], reviewed: story.review !== 'reviewed' })
  }
})

const connect = () => {
  const source = new EventSource(`/events?token=${encodeURIComponent(token)}`)
  source.onmessage = (event) => {
    const next = JSON.parse(event.data)
    if (next.focus && next.focus !== snapshot?.focus) {
      view.focus = next.focus
      view.open = new Set()
    }
    snapshot = next
    render()
  }
  source.onerror = () => {
    source.close()
    setTimeout(connect, 1500)
  }
}
connect()
