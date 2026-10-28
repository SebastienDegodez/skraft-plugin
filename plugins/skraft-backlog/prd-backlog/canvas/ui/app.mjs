// The panel: renders the controller snapshot it receives over server-sent events and sends the
// user's actions back. The panel keeps only view state (tab, filter, query, open lines, plan drawer,
// the answers being typed).
import { ui } from './i18n.mjs'
import { createReconnect } from './reconnect.mjs'
import { TABS, esc, icon, isWorking, renderBar, renderDiagnostics, renderHeader, renderMapProblems, renderPlan, renderRunNotice, renderStory, renderTrack, visibleStories } from './view.mjs'

const token = document.querySelector('meta[name="canvas-token"]')?.getAttribute('content') ?? ''
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id))
const app = /** @type {HTMLElement} */ (document.querySelector('.app'))

const view = {
  tab: /** @type {'track' | 'review' | null} */ (null),
  filter: 'all',
  query: '',
  focus: /** @type {string | null} */ (null),
  open: new Set(),
  /** Epics folded in the plan, and epics folded in the progress view. */
  folded: /** @type {Set<string>} */ (new Set()),
  closed: /** @type {Set<string>} */ (new Set()),
  /** Epics whose own findings are shown in the progress view. */
  findings: /** @type {Set<string>} */ (new Set()),
  planOpen: false,
  lit: /** @type {{ story: string, target: string, item: string | null } | null} */ (null),
  /** What the reviewer is typing to an open question, by `story|question`, kept across renders until saved. */
  drafts: /** @type {Map<string, string>} */ (new Map()),
}
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

/**
 * What identifies a control across renders: its action, the story, line, filter, epic or tab it acts
 * on, and the question and option of an answer.
 */
const keyOf = (el) => [el.getAttribute('data-action'), el.getAttribute('data-story') ?? el.getAttribute('data-line') ?? el.getAttribute('data-filter') ?? el.getAttribute('data-epic') ?? el.getAttribute('data-tab') ?? '',
  el.getAttribute('data-question') ?? '', el.getAttribute('data-option') ?? ''].join('|')

/** Replaces a region's markup, keeping its scroll position, the focused control and the caret in a field. */
const patch = (node, html) => {
  if (node.dataset.html === html) return
  const scroll = node.scrollTop
  const active = /** @type {any} */ (document.activeElement)
  const key = active && node.contains(active) ? keyOf(active) : null
  const caret = key && /INPUT|TEXTAREA/.test(active.tagName) ? [active.selectionStart, active.selectionEnd] : null
  node.innerHTML = html
  node.dataset.html = html
  node.scrollTop = scroll
  if (key) {
    const again = /** @type {any} */ ([...node.querySelectorAll('[data-action]')].find((el) => keyOf(el) === key))
    if (again instanceof HTMLElement) again.focus({ preventScroll: true })
    if (caret && caret[0] !== null && again?.setSelectionRange) try { again.setSelectionRange(caret[0], caret[1]) } catch { /* a field type without a caret */ }
  }
}

/** Without stories to show, or when drawing them fails: the diagnostics, never a blank panel. @param {string} [error] */
const renderEmpty = (error) => {
  app.dataset.state = 'empty'
  document.documentElement.lang = snapshot?.diagnostics?.language ?? 'en'
  $('empty').hidden = false
  patch($('empty'), renderDiagnostics(snapshot, { error }))
  try { patch($('top'), snapshot ? renderHeader({ ...snapshot, assessment: null }, view) : '') } catch { patch($('top'), '') }
  for (const id of ['plan', 'story', 'track', 'bar', 'map-problems']) patch($(id), '')
}

const render = () => {
  if (!snapshot?.assessment) return renderEmpty()
  try {
    renderReady()
  } catch (error) {
    console.error(error)
    renderEmpty(/** @type {Error} */ (error)?.message ?? String(error))
  }
}

const renderReady = () => {
  const a = snapshot.assessment
  app.dataset.state = 'ready'
  document.documentElement.lang = a.language ?? 'en'
  $('empty').hidden = true
  view.tab ??= snapshot.focus ? 'review' : 'track'
  app.dataset.tab = view.tab
  if (!view.focus || !a.stories.some((s) => s.id === view.focus)) view.focus = snapshot.focus ?? (a.stories.find((s) => s.verdict === 'fail') ?? a.stories[0])?.id ?? null
  const toggle = $('plan').previousElementSibling
  const current = a.stories.find((s) => s.id === view.focus)
  const shown = visibleStories(a, view)
  const at = shown.findIndex((s) => s.id === view.focus)
  toggle.innerHTML = `${icon('menu')}<span>${ui(a.language, 'menu')}</span>${at >= 0 ? `<span class="toggle-pos">${esc(ui(a.language, 'position', { at: at + 1, count: shown.length }))}</span>` : ''}${current ? `<span class="toggle-story v-${esc(current.verdict)}">${icon(current.verdict)}<span>${esc(current.epic)}</span><code>${esc(current.id)}</code></span>` : ''}`
  toggle.setAttribute('aria-expanded', String(view.planOpen))
  app.classList.toggle('plan-open', view.planOpen)
  patch($('top'), renderHeader(snapshot, view))
  patch($('map-problems'), renderRunNotice(snapshot) + renderMapProblems(snapshot))
  // only the regions of the open tab are drawn: one set of filters, and half the work on each update
  const reviewing = view.tab === 'review'
  patch($('track'), reviewing ? '' : renderTrack(snapshot, view))
  patch($('plan'), reviewing ? renderPlan(snapshot, view) : '')
  patch($('story'), reviewing ? renderStory(snapshot, view) : '')
  patch($('bar'), renderBar(snapshot))
}

/** The scroll of each region of a tab, kept while the other tab shows: an emptied region loses it. */
const scrolls = /** @type {Record<string, number>} */ ({})
const REGIONS = { track: ['track'], review: ['plan', 'story'] }

/** Shows a tab, with the scroll its regions had when it was left. */
const showTab = (tab) => {
  if (!(tab in TABS) || tab === view.tab) return false
  for (const id of REGIONS[view.tab ?? 'track']) scrolls[id] = $(id).scrollTop
  view.tab = tab
  view.planOpen = false
  render()
  for (const id of REGIONS[tab]) $(id).scrollTop = scrolls[id] ?? 0
  return true
}

const focusStory = (id, { scroll = true } = {}) => {
  const moved = id !== view.focus
  const switched = showTab('review')
  if (!moved && !switched) return
  view.focus = id
  if (moved) {
    view.open = new Set()
    view.lit = null
  }
  view.planOpen = false
  const epic = snapshot?.assessment?.stories.find((s) => s.id === id)?.epic
  if (epic) view.folded.delete(epic)
  render()
  if (scroll && moved) $('story').scrollTo({ top: 0 })
  if (switched) $('story').focus({ preventScroll: true })
  $('plan').querySelector(`[data-story="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' })
}

/** Opens the progress view on the epic of the open story: its card, unfolded, scrolled to and focused. */
const toEpic = () => {
  const a = snapshot?.assessment
  const epic = a?.stories.find((s) => s.id === view.focus)?.epic
  if (!epic) return
  if (!visibleStories(a, view).some((s) => s.epic === epic)) {
    view.filter = 'all'
    view.query = ''
  }
  view.closed.delete(epic)
  if (!showTab('track')) render()
  const card = document.getElementById(`track-${epic}`)
  if (!card) return
  card.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  card.focus({ preventScroll: true })
}

/** Folds or unfolds a key of a set of the view state, then renders. */
const toggle = (set, key) => {
  if (set.has(key)) set.delete(key)
  else set.add(key)
  render()
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

/**
 * Opens a story on its open questions: the first one nobody answered (else the first draft) is lit,
 * centred past the ones the file already settles, and its field is ready for typing.
 */
const toQuestions = (id) => {
  const questions = snapshot?.assessment?.stories.find((s) => s.id === id)?.questions ?? []
  const first = questions.find((q) => q.status === 'open') ?? questions.find((q) => q.status === 'draft')
  focusStory(id, { scroll: false })
  reveal('questions', first?.id)
  const field = first && /** @type {HTMLElement | null} */ ($('story').querySelector(`.question[data-item="${CSS.escape(first.id)}"] textarea`))
  field?.focus({ preventScroll: true })
}

/**
 * Saves the answer to one open question as a draft (an empty text withdraws it); the next correction
 * session of the workflow writes it into the story file.
 */
const answer = (story, question, text, lang) => {
  const key = `${story}|${question}`
  const current = snapshot?.assessment?.stories.find((s) => s.id === story)?.questions?.find((q) => q.id === question)
  if (!text.trim() && !current?.draft) return toast(ui(lang, 'answerEmpty'), 'error')
  return void act('answer_question', { story, question, text }, () => {
    view.drafts.delete(key)
    return ui(lang, text.trim() ? 'answerSaved' : 'answerWithdrawn')
  })
}

/** The text typed for a question: the field itself when it is drawn, else the kept draft. */
const typedFor = (story, question) => {
  const field = /** @type {HTMLTextAreaElement | null} */ ($('story').querySelector(`textarea[data-story="${CSS.escape(story)}"][data-question="${CSS.escape(question)}"]`))
  return field?.value ?? view.drafts.get(`${story}|${question}`) ?? ''
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
  if (!el || /SELECT|INPUT|TEXTAREA/.test(el.tagName)) return
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
    case 'tab': return void showTab(/** @type {string} */ (el.dataset.tab))
    case 'fold': return toggle(view.folded, /** @type {string} */ (el.dataset.epic))
    case 'fold-card': return toggle(view.closed, /** @type {string} */ (el.dataset.epic))
    case 'toggle-findings': return toggle(view.findings, /** @type {string} */ (el.dataset.epic))
    case 'to-epic': return toEpic()
    case 'reconnect': return reconnect.start()
    case 'review': return void act('mark_reviewed', { ids: [el.dataset.story], reviewed: el.dataset.reviewed === 'true' })
    case 'to-questions': return toQuestions(/** @type {string} */ (el.dataset.story))
    case 'save-answer': {
      const { story, question } = /** @type {{ story: string, question: string }} */ (el.dataset)
      return answer(story, question, typedFor(story, question), lang)
    }
    case 'withdraw-answer': return answer(/** @type {string} */ (el.dataset.story), /** @type {string} */ (el.dataset.question), '', lang)
    case 'pick-option': {
      const { story, question, option } = /** @type {{ story: string, question: string, option: string }} */ (el.dataset)
      const text = snapshot?.assessment?.stories.find((s) => s.id === story)?.questions?.find((q) => q.id === question)?.options?.[Number(option)]
      return typeof text === 'string' ? answer(story, question, text, lang) : undefined
    }
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
  } else if (el.dataset.action === 'answer-text') view.drafts.set(`${el.dataset.story}|${el.dataset.question}`, el.value)
})

document.addEventListener('change', (event) => {
  const el = /** @type {HTMLSelectElement} */ (event.target)
  if (el.dataset.action === 'open-backlog') void act('open_backlog', { slug: el.value })
})

const TAB_KEYS = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity }

document.addEventListener('keydown', (event) => {
  const target = /** @type {HTMLElement} */ (event.target)
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && target.dataset.action === 'answer-text') {
    event.preventDefault()
    const { story, question } = /** @type {{ story: string, question: string }} */ (target.dataset)
    return answer(story, question, /** @type {HTMLTextAreaElement} */ (target).value, snapshot?.assessment?.language ?? 'en')
  }
  if (!snapshot?.assessment || event.metaKey || event.ctrlKey || event.altKey || /INPUT|SELECT|TEXTAREA/.test(target.tagName)) return
  if (target.getAttribute('role') === 'tab' && event.key in TAB_KEYS) {
    const keys = Object.keys(TABS)
    const step = TAB_KEYS[/** @type {keyof typeof TAB_KEYS} */ (event.key)]
    const next = keys[Math.min(keys.length - 1, Math.max(0, keys.indexOf(/** @type {string} */ (view.tab)) + step))]
    showTab(next)
    document.getElementById(`tab-${next}`)?.focus()
    event.preventDefault()
    return
  }
  if (view.tab !== 'review') return
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

/** Says, or stops saying, that the server can no longer be reached, with a button to try again. @param {boolean} shown */
const showOffline = (shown) => {
  const node = $('offline')
  node.hidden = !shown
  if (!shown) return
  const lang = snapshot?.assessment?.language ?? snapshot?.diagnostics?.language ?? 'en'
  patch(node, `<p>${esc(ui(lang, 'offline'))}</p><button type="button" data-action="reconnect">${esc(ui(lang, 'reconnect'))}</button>`)
}

/** @param {{ opened: () => void, failed: () => void }} events */
const connect = ({ opened, failed }) => {
  showOffline(false)
  const source = new EventSource(`/events?token=${encodeURIComponent(token)}`)
  source.onopen = opened
  source.onmessage = (event) => {
    const next = JSON.parse(event.data)
    let returned = false
    if (next.focus && next.focus !== snapshot?.focus) {
      view.focus = next.focus
      view.open = new Set()
      view.lit = null
      if (view.tab === 'track') {
        scrolls.track = $('track').scrollTop
        view.tab = 'review'
        returned = true
      }
      const epic = next.assessment?.stories.find((s) => s.id === next.focus)?.epic
      if (epic) view.folded.delete(epic)
    }
    snapshot = next
    render()
    if (returned) {
      $('plan').scrollTop = scrolls.plan ?? 0
      $('story').scrollTop = 0
      $('plan').querySelector(`[data-story="${CSS.escape(next.focus)}"]`)?.scrollIntoView({ block: 'nearest' })
    }
  }
  source.onerror = () => {
    source.close()
    failed()
  }
}
const reconnect = createReconnect({ open: connect, schedule: (attempt, ms) => setTimeout(attempt, ms), giveUp: () => showOffline(true) })
reconnect.start()

// the worker counts the minutes: redrawn while a run is at work, a no-op when nothing changed
setInterval(() => { if (isWorking(snapshot?.diagnostics?.run)) render() }, 15000)
