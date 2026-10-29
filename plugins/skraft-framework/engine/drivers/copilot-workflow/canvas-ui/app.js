// The skraft canvas page: draws the content its loopback server streams, in three tabs. Run shows
// where the run stands and takes no answer: Copilot puts each question to the person in the chat.
// Configuration keeps the person's draft of the configuration and sends it once they save; the
// engine checks it and writes the files. Workflow draws each workflow a run can follow. The page
// keeps only view state (tab, workflow shown, draft). The panel's token is in the address the host
// opened, never in the page.
import { languageOf, ui } from './i18n.js'
import { createReconnect } from './reconnect.js'
import { TABS, esc, renderArrows, renderConfiguration, renderHeader, renderRun, renderSaveBar, renderWorkflows, shownWorkflow } from './view.js'

const params = new URLSearchParams(location.search)
const token = params.get('t') ?? ''
const lang = languageOf(navigator.languages ?? [navigator.language])
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id))
const app = /** @type {HTMLElement} */ (document.querySelector('.app'))
document.documentElement.lang = lang

const view = {
  tab: TABS.includes(params.get('tab') ?? '') ? /** @type {string} */ (params.get('tab')) : 'run',
  workflow: /** @type {string | null} */ (null),
  /** The configuration as the person edits it; what was last read, while they edit nothing. */
  draft: /** @type {any} */ (null),
  read: /** @type {string | null} */ (null),
  dirty: false,
  stale: false,
  saving: false,
  error: /** @type {string | null} */ (null),
}
/** @type {any} */
let content = null

const clone = (value) => JSON.parse(JSON.stringify(value ?? {}))

/** What the person may change of the configuration, as the fields hold it. */
const editable = (configuration) => ({
  components: clone(configuration.components),
  consents: Object.fromEntries(configuration.consents.map(({ key, value }) => [key, value])),
  assign: clone(configuration.models.assign),
  models: clone(configuration.models.models),
})

const toast = (text, kind = 'info') => {
  const node = $('toast')
  node.textContent = text
  node.dataset.kind = kind
  node.classList.remove('show')
  void node.offsetWidth
  node.classList.add('show')
}

/** What identifies a control across renders. */
const keyOf = (el) => [el.getAttribute('data-action'), el.getAttribute('data-field'), el.getAttribute('data-tab'), el.getAttribute('data-consent'), el.getAttribute('data-value'), el.getAttribute('data-workflow')].join('|')

/** Replaces a region's markup, keeping its scroll position, the focused control and the caret in a field. */
const patch = (node, html) => {
  if (node.dataset.html === html) return
  const scroll = node.scrollTop
  const active = /** @type {any} */ (document.activeElement)
  const key = active && node.contains(active) ? keyOf(active) : null
  const caret = key && active.tagName === 'INPUT' && active.type === 'text' ? [active.selectionStart, active.selectionEnd] : null
  node.innerHTML = html
  node.dataset.html = html
  node.scrollTop = scroll
  if (key === null) return
  const again = /** @type {any} */ ([...node.querySelectorAll('[data-action], [data-field]')].find((el) => keyOf(el) === key))
  again?.focus({ preventScroll: true })
  if (caret && again?.setSelectionRange) again.setSelectionRange(caret[0], caret[1])
}

const renderPanel = () => {
  if (view.tab === 'configuration') return renderConfiguration(content.configuration, view.draft, lang)
  if (view.tab === 'workflow') return renderWorkflows(content.workflows, view.workflow, lang)
  return renderRun(content, lang)
}

const render = () => {
  app.dataset.tab = view.tab
  patch($('top'), renderHeader(content, view, lang))
  if (content === null) return
  app.dataset.state = 'ready'
  patch($('panel'), renderPanel())
  patch($('bar'), view.tab === 'configuration' && content.configuration.status === 'ok' ? renderSaveBar(view, lang) : '')
  if (view.tab === 'workflow') drawArrows()
}

/** The side lanes and their labels need room beside the column: below this width, only the arrows down the column are drawn. */
const WIDE = 900

/** The arrows of the workflow shown, over its cards as the page laid them out. */
const drawArrows = () => {
  const area = /** @type {HTMLElement | null} */ ($('panel').querySelector('.flow-area'))
  const layer = area?.querySelector('.arrows')
  const shown = content && shownWorkflow(content.workflows, view.workflow)
  if (!area || !layer || !shown) return
  const wide = area.clientWidth >= WIDE
  area.classList.toggle('wide', wide)
  const origin = area.getBoundingClientRect()
  const boxes = Object.fromEntries([...area.querySelectorAll('[data-node]')].map((el) => [el.getAttribute('data-node'), boxOf(el.getBoundingClientRect(), origin)]))
  layer.setAttribute('width', String(area.clientWidth))
  layer.setAttribute('height', String(area.clientHeight))
  layer.innerHTML = renderArrows({ order: ['start', ...shown.steps.map(({ id }) => id), 'exit'], edges: shown.edges, boxes, wide, lang })
}

const boxOf = (rect, origin) => ({ top: rect.top - origin.top, bottom: rect.bottom - origin.top, left: rect.left - origin.left, right: rect.right - origin.left })

/** A new content: the draft follows it while the person edits nothing, and says when it moved under them. */
const received = (next) => {
  content = next
  if (next.configuration.status !== 'ok') return render()
  const read = JSON.stringify(editable(next.configuration))
  if (!view.dirty) {
    view.draft = editable(next.configuration)
    view.read = read
    view.stale = false
  } else if (read !== view.read) view.stale = true
  // a field being typed in is not drawn again: only the top and the bar say what changed
  if (!view.dirty || view.tab !== 'configuration') return render()
  patch($('top'), renderHeader(content, view, lang))
  patch($('bar'), renderSaveBar(view, lang))
  return undefined
}

const showTab = (tab) => {
  if (!TABS.includes(tab) || tab === view.tab) return
  view.tab = tab
  render()
  $('panel').scrollTop = 0
  if (tab === 'workflow') toCurrentStep()
}

/** The step the run is on, brought into view in the Workflow tab. */
const toCurrentStep = () => $('panel').querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })

// ── the draft ────────────────────────────────────────────────────────────

/** Sets the value at a dotted path of the draft; an empty value removes the key. */
const setAt = (root, path, value) => {
  const keys = path.split('.')
  const last = /** @type {string} */ (keys.pop())
  let node = root
  for (const key of keys) node = node[key] ??= {}
  if (value === undefined) delete node[last]
  else node[last] = value
}

/** Drops the objects an edit emptied, so that an emptied rule leaves no trace in the file. */
const pruned = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  const kept = Object.entries(value).map(([key, inner]) => [key, pruned(inner)]).filter(([, inner]) => !(inner && typeof inner === 'object' && !Array.isArray(inner) && Object.keys(inner).length === 0))
  return Object.fromEntries(kept)
}

/** What a field gives the draft. */
const valueOf = (el, path) => {
  if (el.type === 'checkbox') return el.checked
  if (path.startsWith('components.')) return el.value
  if (path.endsWith('.model')) {
    const names = el.value.split(',').map((name) => name.trim()).filter((name) => name !== '')
    return names.length === 0 ? undefined : names
  }
  return el.value === '' ? undefined : el.value
}

/** An agent rule kept as an object keeps its efforts: only its family changes. */
const ruleValue = (path, value) => {
  const rule = path.split('.').reduce((node, key) => node?.[key], view.draft)
  if (rule === null || typeof rule !== 'object' || value === undefined) return value
  return { ...rule, family: value }
}

const edited = (el) => {
  const path = /** @type {string} */ (el.dataset.field)
  const value = valueOf(el, path)
  setAt(view.draft, path, path.startsWith('assign.') ? ruleValue(path, value) : value)
  view.draft.assign = pruned(view.draft.assign)
  view.draft.models = pruned(view.draft.models)
  view.dirty = JSON.stringify(view.draft) !== view.read
  view.error = null
  patch($('bar'), renderSaveBar(view, lang))
}

const discard = () => {
  view.dirty = false
  view.stale = false
  view.error = null
  view.draft = editable(content.configuration)
  view.read = JSON.stringify(view.draft)
  render()
}

/** The draft as the engine takes an edit: each component, the consents, the person's own models. */
const editOf = (draft) => ({
  components: draft.components.map(({ name, root, stack, commands, mocking, contractTesting }) => ({ name, root, stack, commands, mocking, contractTesting })),
  consents: draft.consents,
  assign: draft.assign,
  models: draft.models,
})

const save = async () => {
  view.saving = true
  patch($('bar'), renderSaveBar(view, lang))
  try {
    const answer = await fetch('/configuration', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Skraft-Token': token }, body: JSON.stringify(editOf(view.draft)) })
    const body = await answer.json().catch(() => ({}))
    saved(body.ok === true, body.reason ?? body.error ?? String(answer.status))
  } catch {
    saved(false, ui(lang, 'offline'))
  }
}

const saved = (ok, reason) => {
  view.saving = false
  view.error = ok ? null : reason
  if (ok) {
    view.dirty = false
    view.stale = false
  }
  toast(reason, ok ? 'info' : 'error')
  render()
}

// ── events ───────────────────────────────────────────────────────────────

document.addEventListener('click', (event) => {
  const el = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-action]'))
  if (!el) return undefined
  switch (el.dataset.action) {
    case 'tab': return showTab(/** @type {string} */ (el.dataset.tab))
    case 'workflow': view.workflow = el.dataset.workflow ?? null; return render()
    case 'consent': {
      view.draft.consents[/** @type {string} */ (el.dataset.consent)] = { ask: null, yes: true, no: false }[/** @type {'ask'} */ (el.dataset.value)]
      view.dirty = JSON.stringify(view.draft) !== view.read
      return render()
    }
    case 'save': return void save()
    case 'discard': return discard()
    case 'reconnect': return location.reload()
    default: return undefined
  }
})

document.addEventListener('input', (event) => {
  const el = /** @type {HTMLInputElement} */ (event.target)
  if (el.dataset.field && view.draft) edited(el)
})

document.addEventListener('change', (event) => {
  const el = /** @type {HTMLInputElement} */ (event.target)
  if (el.dataset.field && view.draft && (el.tagName === 'SELECT' || el.type === 'checkbox')) edited(el)
})

const TAB_KEYS = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity }

document.addEventListener('keydown', (event) => {
  const target = /** @type {HTMLElement} */ (event.target)
  if ((event.metaKey || event.ctrlKey) && event.key === 's' && view.tab === 'configuration' && view.dirty) {
    event.preventDefault()
    return void save()
  }
  if (target.getAttribute('role') !== 'tab' || !(event.key in TAB_KEYS)) return undefined
  const next = TABS[Math.min(TABS.length - 1, Math.max(0, TABS.indexOf(view.tab) + TAB_KEYS[/** @type {keyof typeof TAB_KEYS} */ (event.key)]))]
  showTab(next)
  document.getElementById(`tab-${next}`)?.focus()
  event.preventDefault()
  return undefined
})

/** Says, or stops saying, that the server can no longer be reached, with a button to try again. @param {boolean} shown */
const showOffline = (shown) => {
  const node = $('offline')
  node.hidden = !shown
  if (shown) patch(node, `<p>${esc(ui(lang, 'offline'))}</p><button type="button" data-action="reconnect">${esc(ui(lang, 'reconnect'))}</button>`)
}

/** @param {{ opened: () => void, failed: () => void }} events */
const connect = ({ opened, failed }) => {
  showOffline(false)
  const source = new EventSource(`/events?token=${encodeURIComponent(token)}`)
  source.onopen = opened
  source.onmessage = (message) => {
    const first = content === null
    received(JSON.parse(message.data))
    if (first && view.tab === 'workflow') toCurrentStep()
  }
  source.onerror = () => {
    source.close()
    failed()
  }
}

$('loading').textContent = ui(lang, 'loading')
new ResizeObserver(() => { if (view.tab === 'workflow') drawArrows() }).observe($('panel'))
render()
createReconnect({ open: connect, schedule: (attempt, ms) => setTimeout(attempt, ms), giveUp: () => showOffline(true) }).start()
