// The canvas markup, as pure functions of the controller snapshot and of the panel's own state
// (filter, query, open lines, lit passage). Every value from a file is escaped; nothing here
// touches the DOM.
import { dictionary, explanation, format, lineLabel, response, ui } from './i18n.mjs'

export const INVEST = ['I', 'N', 'V', 'E', 'S', 'T']
export const DOR = ['1', '2', '3', '4', '5', '6', '7', '8']

/** The checklist line each antipattern belongs to. */
export const ANTIPATTERN_LINES = Object.freeze({
  'Implement-X': '1', 'Giant Story': '6', 'No Examples': '3', 'Technical AC': '4',
  'Generic Data': '3', 'Tests After Code': 'T', 'Vague Persona': '2', 'Missing Dependencies': '8',
})

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
/** @param {unknown} value */
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c])

const ICONS = {
  pass: '<path d="M3.5 8.5l3 3 6-7"/>',
  warn: '<path d="M8 2.5l6 11H2z"/><path d="M8 7v3"/><path d="M8 12.2v.1"/>',
  fail: '<circle cx="8" cy="8" r="6"/><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4"/>',
  pending: '<circle cx="8" cy="8" r="6" stroke-dasharray="2.2 2.6"/>',
  reviewed: '<path d="M2.5 8.5l3 3 6-7"/><path d="M8.5 11.5l1 0 4.5-6"/>',
  issue: '<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="1.4"/>',
  chevron: '<path d="M6 4l4 4-4 4"/>',
  menu: '<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/>',
  repo: '<path d="M4 2.5h8.5v10H4.5a1.5 1.5 0 0 0 0 3H12.5"/><path d="M4 2.5v11.5"/>',
  link: '<path d="M6.5 9.5l3-3"/><path d="M7 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1"/><path d="M9 11.5l-1 1a2.5 2.5 0 0 1-3.5-3.5l1-1"/>',
  question: '<circle cx="8" cy="8" r="6"/><path d="M6.2 6.4a1.85 1.85 0 1 1 2.5 1.7c-.45.2-.7.55-.7 1.05v.35"/><path d="M8 11.3v.1"/>',
}
/** @param {keyof typeof ICONS} name @param {string} [label] */
export const icon = (name, label) => `<svg class="icon icon-${name}" viewBox="0 0 16 16" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'}>${ICONS[name]}</svg>`

export const FILTERS = Object.freeze({
  all: () => true,
  todo: (s) => s.state === 'ready' && s.review !== 'reviewed',
  refused: (s) => s.state === 'refused' || s.state === 'unwritten',
  held: (s) => s.state === 'held',
  ready: (s) => s.state === 'ready',
  published: (s) => s.state === 'published',
  questions: (s) => asked(s).open > 0,
})
const FILTER_LABELS = { all: 'filterAll', todo: 'filterTodo', refused: 'filterRefused', held: 'filterHeld', ready: 'filterReady', published: 'filterPublished', questions: 'filterQuestions' }

/** How many open questions of a story nobody answered, and how many wait as draft answers. @param {any} story */
export const asked = (story) => {
  const questions = Array.isArray(story?.questions) ? story.questions : []
  return { open: questions.filter((q) => q.status === 'open').length, draft: questions.filter((q) => q.status === 'draft').length }
}

/**
 * The button that opens a story on its open questions, in a progress row or in the story dock;
 * nothing when every question is settled.
 * @param {any} story @param {string} lang @param {'row' | 'dock'} place
 */
const askButton = (story, lang, place) => {
  const { open, draft } = asked(story)
  if (!open && !draft) return place === 'row' ? '<span class="row-ask-slot" aria-hidden="true"></span>' : ''
  const label = open ? ui(lang, 'openQuestionsOf', { count: open, story: story.id }) : ui(lang, 'draftAnswersOf', { count: draft, story: story.id })
  const tone = open ? 'q-open' : 'q-draft'
  return place === 'row'
    ? `<button type="button" class="row-ask ${tone}" data-action="to-questions" data-story="${esc(story.id)}" aria-label="${esc(label)}" title="${esc(label)}">${icon('question')}<span>${open || draft}</span></button>`
    : `<button type="button" class="ghost small dock-ask ${tone}" data-action="to-questions" data-story="${esc(story.id)}" title="${esc(label)}">${icon('question')}<span>${esc(ui(lang, open ? 'answer' : 'draftAnswers'))}</span><span class="count">${open || draft}</span></button>`
}

/**
 * The stories the plan shows: those the filter and the query keep, in the order of the plan —
 * milestone, then epic, then build order.
 * @param {any} assessment @param {{ filter: string, query: string }} view
 */
export const visibleStories = (assessment, { filter, query }) => {
  const keep = FILTERS[filter] ?? FILTERS.all
  const words = query.trim().toLowerCase()
  const rank = (ids) => new Map(ids.map((id, index) => [id, index]))
  const milestones = rank(assessment.milestones.map((m) => m.id))
  const epics = rank(assessment.epics.map((e) => e.id))
  const place = (s) => [milestones.get(s.milestone) ?? milestones.size, epics.get(s.epic) ?? epics.size]
  return assessment.stories
    .filter((s) => keep(s) && (!words || `${s.id} ${s.title}`.toLowerCase().includes(words)))
    .sort((x, y) => {
      const [mx, ex] = place(x)
      const [my, ey] = place(y)
      return mx - my || ex - ey
    })
}

const EPIC_VERDICTS = Object.freeze({ APPROVED: 'pass', NEEDS_REWORK: 'warn', REJECTED: 'fail' })
/** The status of an epic's last lens review: approved passes, rework warns, rejected fails. */
export const epicStatus = (epic) => EPIC_VERDICTS[epic?.verdict] ?? 'pending'
const VERDICTS = ['pass', 'warn', 'fail', 'pending']

/**
 * The stories the reviewed ones wait on, directly or not, that keep them from being created: not
 * published, and not both ready and reviewed.
 * @param {any} assessment @returns {string[]}
 */
export const waitingOf = (assessment) => {
  const byId = new Map(assessment.stories.map((s) => [s.id, s]))
  const clear = (s) => s.state === 'published' || (s.state === 'ready' && s.review === 'reviewed')
  const waiting = new Set()
  const seen = new Set()
  const walk = (id) => {
    if (seen.has(id)) return
    seen.add(id)
    const story = byId.get(id)
    if (!story) return
    if (!clear(story)) waiting.add(id)
    else for (const dependency of story.after) walk(dependency)
  }
  for (const story of assessment.stories.filter((s) => s.state === 'ready' && s.review === 'reviewed')) {
    seen.add(story.id)
    for (const dependency of story.after) walk(dependency)
  }
  return assessment.stories.map((s) => s.id).filter((id) => waiting.has(id))
}

/**
 * How many stories pass, warn, fail or wait to be written: the board of the whole backlog.
 * @param {any[]} stories @param {string} lang @param {string} [className]
 */
const tally = (stories, lang, className = 'tally') => {
  const words = dictionary(lang)
  const cells = VERDICTS.map((verdict) => {
    const count = stories.filter((s) => s.verdict === verdict).length
    const label = esc(format(words.verdicts[verdict], { count }, lang))
    return count ? `<span class="tally-item v-${verdict}" role="img" aria-label="${label}" title="${label}">${icon(verdict)}${count}</span>` : ''
  }).join('')
  return `<span class="${className}">${cells}</span>`
}

/** The two views of the panel: the progress of the whole backlog, and the review of one story. */
export const TABS = Object.freeze({ track: { label: 'tabTrack', controls: 'track' }, review: { label: 'tabReview', controls: 'plan story' } })

/** @param {any} snapshot @param {{ tab?: string | null }} [view] */
export const renderHeader = (snapshot, view = {}) => {
  const a = snapshot.assessment
  const lang = a?.language ?? 'en'
  const backlogs = snapshot.backlogs.length > 1
    ? `<label class="backlog-pick"><span class="sr-only">${esc(ui(lang, 'title'))}</span><select data-action="open-backlog">${snapshot.backlogs.map((slug) => `<option value="${esc(slug)}"${slug === snapshot.slug ? ' selected' : ''}>${esc(slug)}</option>`).join('')}</select></label>`
    : `<span class="slug">${esc(snapshot.slug ?? '')}</span>`
  const tabs = Object.entries(TABS).map(([key, tab]) => {
    const selected = view.tab === key
    return `<button type="button" role="tab" class="tab" id="tab-${key}" data-action="tab" data-tab="${key}" aria-selected="${selected}" aria-controls="${tab.controls}" tabindex="${selected ? 0 : -1}">${esc(ui(lang, tab.label))}</button>`
  }).join('')
  return `<div class="brand"><span class="brand-mark">skraft</span><span class="brand-sep">/</span>${backlogs}</div>
    ${a ? `<div class="tabs" role="tablist" aria-label="${esc(ui(lang, 'tabs'))}">${tabs}</div>
    <p class="coverage">${esc(ui(lang, 'coverage', a.coverage))}</p>
    <p class="board" role="group" aria-label="${esc(ui(lang, 'tally'))}">${tally(a.stories, lang)}</p>
    <p class="repo">${icon('repo')}<code>${esc(snapshot.repo ?? ui(lang, 'noRepo'))}</code></p>` : ''}`
}

/** @param {any} story */
const ticks = (story) => {
  const tick = (key, line) => `<i class="tick s-${line.status}"></i>`
  return `<span class="ticks" aria-hidden="true">${INVEST.map((k) => tick(k, story.invest[k])).join('')}<b class="tick-gap"></b>${DOR.map((k) => tick(k, story.dor[k])).join('')}</span>`
}

/** @param {any} story @param {string} lang */
const marker = (story, lang) => {
  const words = dictionary(lang)
  if (story.state === 'published') return `<span class="marker m-published">${icon('issue', words.states.published)}#${esc(story.published.number)}</span>`
  if (story.state === 'ready' && story.review === 'reviewed') return `<span class="marker m-reviewed">${icon('reviewed', words.reviews.reviewed)}</span>`
  if (story.state === 'ready' && story.review === 'stale') return `<span class="marker m-stale">${icon('warn', words.reviews.stale)}</span>`
  return `<span class="marker m-${esc(story.state)}">${esc(words.states[story.state])}</span>`
}

/**
 * The head of an epic in the plan: its review verdict and the strip of its stories, one cell per
 * story in the colour of its verdict.
 * @param {any} epic @param {any[]} stories @param {string} lang
 */
const epicHead = (epic, stories, lang, { folded, controls }) => {
  const words = dictionary(lang)
  const status = epicStatus(epic)
  const verdict = words.epicVerdicts[epic.verdict] ?? words.epicVerdicts.none
  const attempt = epic.attempt ? ` · ${ui(lang, 'attempt', { attempt: epic.attempt })}` : ''
  return `<button type="button" class="epic-head" data-action="fold" data-epic="${esc(epic.id)}" aria-expanded="${!folded}" aria-controls="${esc(controls)}" title="${esc(ui(lang, 'fold', { epic: epic.id }))}">
      ${icon('chevron')}
      <span class="epic-name"><span class="epic-id">${esc(epic.id)}</span><span class="epic-title">${esc(epic.title)}</span></span>
      <span class="epic-sub"><span class="epic-verdict v-${status}">${icon(status)}<span>${esc(verdict)}${esc(attempt)}</span></span>${tally(stories, lang, 'epic-tally')}</span>
      <span class="strip" aria-hidden="true">${stories.map((s) => `<i class="cell v-${esc(s.verdict)}"></i>`).join('')}</span>
    </button>`
}

/**
 * The filters and the search the plan and the progress view share.
 * @param {any} a @param {{ filter: string, query: string }} view @param {string} className
 */
const renderTools = (a, view, className) => {
  const lang = a.language
  const filters = Object.keys(FILTERS).map((key) => {
    const count = a.stories.filter(FILTERS[key]).length
    return `<button type="button" class="filter" data-action="filter" data-filter="${key}" aria-pressed="${view.filter === key}">${esc(ui(lang, FILTER_LABELS[key]))}<span class="count">${count}</span></button>`
  }).join('')
  return `<div class="${className}">
      <div class="filters" role="group" aria-label="${esc(ui(lang, 'plan'))}">${filters}</div>
      <label class="search"><span class="sr-only">${esc(ui(lang, 'search'))}</span><input type="search" data-action="search" value="${esc(view.query)}" placeholder="${esc(ui(lang, 'search'))}"></label>
    </div>`
}

/**
 * The flight plan: filters, search, and the stories by milestone, then by epic.
 * @param {any} snapshot @param {{ filter: string, query: string, focus: string | null, folded?: Set<string> }} view
 */
export const renderPlan = (snapshot, view) => {
  const a = snapshot.assessment
  const lang = a.language
  const shown = visibleStories(a, view)
  const searching = view.query.trim() !== ''
  const byId = new Map(a.stories.map((s) => [s.id, s]))
  const epics = new Map(a.epics.map((e) => [e.id, e]))
  const row = (s) => `<li><button type="button" class="row v-${esc(s.verdict)}" data-action="focus" data-story="${esc(s.id)}" aria-current="${s.id === view.focus ? 'true' : 'false'}">
        <span class="row-verdict">${icon(s.verdict, s.verdict)}</span>
        <span class="row-id">${esc(s.id)}</span>
        <span class="row-title">${esc(s.title)}</span>
        ${ticks(s)}
        ${marker(s, lang)}
      </button></li>`
  const groups = a.milestones.map((milestone) => {
    const rows = shown.filter((s) => s.milestone === milestone.id)
    if (!rows.length) return ''
    const inside = [...new Set(rows.map((s) => s.epic))].map((id) => {
      const epic = epics.get(id) ?? { id, title: '', verdict: null, attempt: null, stories: [] }
      const own = rows.filter((s) => s.epic === id)
      const all = epic.stories.map((sid) => byId.get(sid)).filter(Boolean)
      const folded = !searching && (view.folded?.has(id) ?? false)
      const controls = `rows-${milestone.id}-${id}`
      const current = own.some((s) => s.id === view.focus)
      return `<li class="epic e-${epicStatus(epic)}${current ? ' has-current' : ''}${folded ? ' folded' : ''}">
        ${epicHead(epic, all.length ? all : own, lang, { folded, controls })}
        <ol class="rows" id="${esc(controls)}"${folded ? ' hidden' : ''}>${own.map(row).join('')}</ol></li>`
    }).join('')
    return `<li class="milestone"><h3><span>${esc(milestone.title)}</span>${milestone.dueOn ? `<time datetime="${esc(milestone.dueOn)}">${esc(milestone.dueOn)}</time>` : ''}</h3>
      <ol class="epics">${inside}</ol></li>`
  }).join('')
  return `${renderTools(a, view, 'plan-tools')}
    <ol class="milestones">${groups || `<li class="none">—</li>`}</ol>`
}

/** The stages of a story on its way to GitHub, from the last to the first: a ready story is split by its human review. */
export const STAGES = Object.freeze(['published', 'reviewed', 'ready', 'written', 'held', 'refused', 'unwritten'])
/** @param {any} story */
export const stageOf = (story) => (story.state === 'ready' && story.review === 'reviewed' ? 'reviewed' : story.state)

/**
 * The key figures of the backlog in one strip. Ready, reviewed and published stories only exist once
 * the creation plan is out: before that, their figures are dimmed and say so.
 * @param {any} a @param {string} lang
 */
const renderFigures = (a, lang) => {
  const words = dictionary(lang)
  const c = a.counts
  const later = !a.hasPlan
  const figure = (key, value, count, { tone = '', late = false } = {}) => `<div class="figure${tone ? ` f-${tone}` : ''}${late ? ' later' : ''}" data-figure="${key}">
      <dt>${esc(format(words.figures[key], { count }, lang))}</dt><dd class="figure-value">${esc(value)}</dd>${late ? `<dd class="figure-note">${esc(ui(lang, 'afterPlan'))}</dd>` : ''}</div>`
  return `<section class="figures-band" aria-label="${esc(ui(lang, 'figures'))}"><dl class="figures">
      ${figure('epics', a.epics.length, a.epics.length)}
      ${figure('stories', c.stories, c.stories)}
      ${figure('written', `${c.written}/${c.stories}`, c.written)}
      ${figure('refused', c.refused, c.refused, { tone: c.refused ? 'fail' : '' })}
      ${figure('held', c.held, c.held, { tone: c.held ? 'warn' : '' })}
      ${figure('ready', c.ready, c.ready, { late: later })}
      ${figure('reviewed', `${c.reviewed}/${c.ready}`, c.reviewed, { late: later })}
      ${figure('published', c.published, c.published, { late: later })}
    </dl></section>`
}

/**
 * The stories of the backlog in one bar, a segment per stage, and its legend. The bar is drawn in
 * SVG units of one story, so no inline style sizes a segment.
 * @param {any} a @param {string} lang
 */
const renderProgress = (a, lang) => {
  const words = dictionary(lang)
  const parts = STAGES.map((stage) => ({ stage, count: a.stories.filter((s) => stageOf(s) === stage).length })).filter((p) => p.count)
  const say = (p) => format(words.stages[p.stage], { count: p.count }, lang)
  let x = 0
  const segments = parts.map((p) => {
    const segment = `<rect class="seg seg-${p.stage}" x="${x}" y="0" width="${p.count}" height="1"><title>${esc(say(p))}</title></rect>`
    x += p.count
    return segment
  }).join('')
  return `<figure class="progress">
      <div class="progress-track"><svg class="progress-bar" viewBox="0 0 ${Math.max(a.stories.length, 1)} 1" preserveAspectRatio="none" role="img" aria-label="${esc(ui(lang, 'progressLabel', { parts: parts.map(say).join(', ') }))}">${segments}</svg></div>
      <figcaption class="legend">${parts.map((p) => `<span class="legend-item" data-stage="${p.stage}"><i class="swatch seg-${p.stage}"></i>${esc(say(p))}</span>`).join('')}${a.hasPlan ? '' : `<span class="legend-note">${esc(ui(lang, 'noPlan'))}</span>`}</figcaption>
    </figure>`
}

const SEVERE = new Set(['medium', 'high', 'blocker'])

/**
 * One epic of the progress view, framed: its title and outcome, the verdict of its lens review with
 * the findings on the epic itself, and its stories as rows.
 * @param {any} epic @param {any[]} all every story of the epic @param {any[]} own the stories the filters keep
 * @param {{ focus: string | null, closed?: Set<string>, findings?: Set<string> }} view @param {boolean} searching @param {string} lang
 */
const renderCard = (epic, all, own, view, searching, lang) => {
  const words = dictionary(lang)
  const status = epicStatus(epic)
  const id = esc(epic.id)
  const folded = !searching && (view.closed?.has(epic.id) ?? false)
  const verdict = `${words.epicVerdicts[epic.verdict] ?? words.epicVerdicts.none}${epic.attempt ? ` · ${ui(lang, 'attempt', { attempt: epic.attempt })}` : ''}`
  const doneWhen = Array.isArray(epic.doneWhen) && epic.doneWhen.length
    ? `<dl class="epic-done"><dt>${esc(ui(lang, 'doneWhen'))}</dt>${epic.doneWhen.map((d) => `<dd>${esc(d)}</dd>`).join('')}</dl>` : ''
  const open = view.findings?.has(epic.id) ?? false
  const severe = epic.findings.some((x) => SEVERE.has(x.severity))
  const findings = !epic.verdict ? ''
    : epic.findings.length
      ? `<div class="card-findings"><button type="button" class="findings-toggle ${severe ? 'v-fail' : 'v-warn'}" data-action="toggle-findings" data-epic="${id}" aria-expanded="${open}" aria-controls="findings-${id}">${icon('chevron')}<span>${esc(ui(lang, 'epicFindings'))}</span><span class="count">${epic.findings.length}</span></button>
        <ul class="findings" id="findings-${id}"${open ? '' : ' hidden'}>${epic.findings.map((x) => renderFinding(x, lang)).join('')}</ul></div>`
      : `<p class="card-quiet muted">${esc(ui(lang, 'noEpicFinding'))}</p>`
  const row = (s) => {
    const sub = [(s.covers ?? []).join(', '), s.after?.length ? ui(lang, 'after', { stories: s.after }) : '', s.milestone].filter(Boolean)
    return `<li class="track-item"><button type="button" class="track-row v-${esc(s.verdict)}" data-action="focus" data-story="${esc(s.id)}" aria-current="${s.id === view.focus ? 'true' : 'false'}">
        <span class="row-verdict">${icon(s.verdict, s.verdict)}</span>
        <span class="row-id">${esc(s.id)}</span>
        <span class="track-title"><span class="row-title">${esc(s.title)}</span>${s.tracer ? `<span class="tracer">${esc(ui(lang, 'tracer'))}</span>` : ''}</span>
        <span class="track-sub">${sub.map((part) => `<span>${esc(part)}</span>`).join('')}</span>
        ${ticks(s)}
        ${marker(s, lang)}
        <span class="track-facts"><span>${esc(s.effort)} ${esc(ui(lang, 'effortUnit'))}</span><span class="moscow mo-${esc(s.moscow ?? 'none')}">${esc(s.moscow ?? '—')}</span></span>
      </button>${askButton(s, lang, 'row')}</li>`
  }
  const current = own.some((s) => s.id === view.focus)
  return `<li><section class="card e-${status}${folded ? ' folded' : ''}${current ? ' has-current' : ''}" id="track-${id}" tabindex="-1" aria-labelledby="card-${id}">
      <header class="card-head">
        <h2 class="card-title"><button type="button" class="card-fold" id="card-${id}" data-action="fold-card" data-epic="${id}" aria-expanded="${!folded}" aria-controls="card-body-${id}">${icon('chevron')}<span class="epic-id">${id}</span><span class="card-name">${esc(epic.title)}</span></button></h2>
        <p class="card-review" title="${esc(`${ui(lang, 'epicReview')} · ${ui(lang, 'epicChallenge')}`)}"><span class="epic-verdict v-${status}">${icon(status)}<span>${esc(verdict)}</span></span>${tally(all, lang, 'epic-tally')}</p>
        <span class="strip" aria-hidden="true">${all.map((s) => `<i class="cell v-${esc(s.verdict)}"></i>`).join('')}</span>
      </header>
      <div class="card-body" id="card-body-${id}"${folded ? ' hidden' : ''}>
        ${epic.outcome ? `<p class="epic-outcome">${esc(epic.outcome)}</p>` : ''}
        ${doneWhen}
        ${findings}
        <ol class="track-rows">${own.map(row).join('')}</ol>
      </div>
    </section></li>`
}

/**
 * The progress view, over the whole panel: the key figures, the bar of the stories by stage, the
 * shared filters, and each epic framed with its review and its stories.
 * @param {any} snapshot @param {{ filter: string, query: string, focus: string | null, closed?: Set<string>, findings?: Set<string> }} view
 */
export const renderTrack = (snapshot, view) => {
  const a = snapshot.assessment
  const lang = a.language
  const shown = visibleStories(a, view)
  const searching = view.query.trim() !== ''
  const byId = new Map(a.stories.map((s) => [s.id, s]))
  const known = new Map(a.epics.map((e) => [e.id, e]))
  const ids = [...new Set([...a.epics.map((e) => e.id), ...shown.map((s) => s.epic)])]
  const cards = ids.map((id) => {
    const own = shown.filter((s) => s.epic === id)
    if (!own.length) return ''
    const epic = known.get(id) ?? { id, title: '', outcome: '', doneWhen: [], verdict: null, attempt: null, findings: [], stories: [] }
    const all = epic.stories.map((sid) => byId.get(sid)).filter(Boolean)
    return renderCard(epic, all.length ? all : own, own, view, searching, lang)
  }).join('')
  return `<div class="track-inner">
      ${renderFigures(a, lang)}
      ${renderProgress(a, lang)}
      ${renderTools(a, view, 'track-tools')}
      <ol class="cards">${cards || `<li class="none muted">—</li>`}</ol>
    </div>`
}

/**
 * The item of the story sheet a piece of evidence accuses: a criterion, an example or a dependency.
 * @param {{ target: string, params?: Record<string, any>, message: string }} evidence
 * @returns {string | null}
 */
export const itemOf = (evidence) => {
  const params = evidence.params ?? {}
  if (typeof params.criterion === 'string' && evidence.target === 'criteria') return params.criterion
  if (typeof params.example === 'string' && evidence.target === 'examples') return params.example
  if (typeof params.story === 'string' && evidence.target === 'dependencies') return params.story
  return /\b(?:EX|AC)-\d+\b/.exec(evidence.message)?.[0] ?? null
}

/**
 * One checklist line: the challenge, a leader, the response, and its evidence when it does not hold.
 * @param {string} lang @param {string} key @param {any} line @param {boolean} open
 */
export const renderLine = (lang, key, line, open) => {
  const { name, challenge } = lineLabel(lang, key)
  const words = dictionary(lang)
  const expandable = line.evidence.length > 0
  const id = `line-${key}`
  const head = `<span class="line-key">${esc(key)}</span>
    <span class="line-name">${esc(name)}</span>
    <span class="leader" aria-hidden="true">&#8203;</span>
    <span class="line-response">${icon(line.status, line.status)}<span>${esc(response(lang, key, line))}</span></span>
    <span class="line-challenge">${esc(challenge)}</span>`
  if (!expandable) return `<li class="line s-${esc(line.status)}" data-key="${esc(key)}"><div class="line-head">${head}</div></li>`
  const evidence = line.evidence.map((e) => {
    const { why, fix } = explanation(lang, e)
    const source = e.source === 'lens' ? `${words.sources.lens} ${e.lens} · ${e.gate} · ${words.severities[e.severity] ?? e.severity}` : `${words.sources[e.source]} · ${e.rule}`
    const item = itemOf(e)
    return `<li class="evidence s-${esc(e.status)}">
      <p class="evidence-source">${esc(source)}</p>
      <p class="evidence-why">${esc(why)}</p>
      ${fix ? `<p class="evidence-fix"><span>${esc(ui(lang, 'fix'))}</span> ${esc(fix)}</p>` : ''}
      <button type="button" class="link" data-action="reveal" data-target="${esc(e.target)}"${item ? ` data-item="${esc(item)}"` : ''}>${esc(ui(lang, 'seeSheet'))}${item ? ` · ${esc(item)}` : ''}</button>
    </li>`
  }).join('')
  return `<li class="line s-${esc(line.status)}${open ? ' open' : ''}" data-key="${esc(key)}">
    <button type="button" class="line-head" data-action="toggle-line" data-line="${esc(key)}" aria-expanded="${open}" aria-controls="${id}">${head}${icon('chevron')}</button>
    <div class="line-body" id="${id}"><div><ul class="evidence-list">${evidence}</ul></div></div>
  </li>`
}

/**
 * The story sheet; the passage a "see in the sheet" lit carries the `lit` class until the next
 * line is opened or the next story focused.
 * @param {any} story @param {string} lang @param {{ target: string, item: string | null } | null} lit
 */
const renderSheet = (story, lang, lit, drafts) => {
  const f = story.file
  if (!f) return `<p class="muted">${esc(dictionary(lang).responses.pending)}</p>`
  const on = (target, item) => (lit && lit.target === target && (item === undefined ? !lit.item : lit.item === item) ? ' lit' : '')
  const items = (target, values, id, render) => (Array.isArray(values) && values.length
    ? `<ul>${values.map((value) => `<li${id ? ` data-item="${esc(id(value))}" class="sheet-item${on(target, id(value))}"` : ''}>${render(value)}</li>`).join('')}</ul>`
    : '<p class="muted">—</p>')
  const section = (target, heading, body) => `<section class="sheet-part${on(target)}" data-sheet="${target}" tabindex="-1"><h3>${esc(heading)}</h3>${body}</section>`
  const criteria = (Array.isArray(f.acceptanceCriteria) ? f.acceptanceCriteria : []).map((c) => `<li class="criterion sheet-item${on('criteria', c?.id)}" data-item="${esc(c?.id)}">
      <p class="criterion-title"><code>${esc(c?.id)}</code> ${esc(c?.title)} <span class="muted">· ${esc(c?.example)}${(c?.covers ?? []).length ? ` · ${esc(c.covers.join(', '))}` : ''}</span></p>
      <dl><dt>${esc(ui(lang, 'given'))}</dt><dd>${esc(c?.given)}</dd><dt>${esc(ui(lang, 'when'))}</dt><dd>${esc(c?.when)}</dd>
      <dt>${esc(ui(lang, 'then'))}</dt><dd>${(Array.isArray(c?.then) ? c.then : []).map(esc).join('<br>')}</dd></dl></li>`).join('')
  const plain = (value) => esc(value)
  return [
    section('statement', lineLabel(lang, '2').name, `<p><strong>${esc(f.persona)}</strong></p><p>${esc(f.description)}</p>`),
    section('examples', ui(lang, 'examples'), items('examples', f.examples, (e) => e?.id, (e) => `<code>${esc(e?.id)}</code> ${esc(e?.text)}`)),
    section('criteria', ui(lang, 'criteria'), criteria ? `<ol class="criteria">${criteria}</ol>` : '<p class="muted">—</p>'),
    section('tasks', ui(lang, 'tasks'), items('tasks', f.tasks, null, (t) => `${esc(t?.text)} <span class="muted">${esc((t?.acceptanceCriteria ?? []).join(', '))}</span>`)),
    section('notes', ui(lang, 'notes'), `${items('notes', f.devNotes?.context, null, plain)}${items('notes', f.devNotes?.references, null, (r) => `<code>${esc(r?.id)}</code> ${esc(r?.note)}`)}${items('notes', f.devNotes?.testing, null, plain)}${items('notes', f.technicalNotes, null, plain)}`),
    section('dependencies', ui(lang, 'dependencies'), items('dependencies', f.dependencies, (d) => d?.story, (d) => `<code>${esc(d?.story)}</code> ${esc(d?.reason)}`)),
    section('effort', lineLabel(lang, '6').name, `<p><strong>${esc(f.effort?.points)} ${esc(ui(lang, 'effortUnit'))}</strong> · ${esc(f.effort?.rationale)}</p>`),
    section('questions', ui(lang, 'questions'), renderQuestions(story, lang, drafts, on)),
  ].join('')
}

/**
 * The open questions of a story, each answerable in place: a proposed option in one click, or a
 * free answer saved as a draft the next correction session writes into the story file. A question
 * the file already settles reads as it is.
 * @param {any} story @param {string} lang @param {Map<string, string> | undefined} drafts what the reviewer is typing, by `story|question`
 * @param {(target: string, item?: string) => string} on
 */
const renderQuestions = (story, lang, drafts, on) => {
  const questions = Array.isArray(story.questions) ? story.questions : []
  if (!questions.length) return '<p class="muted">—</p>'
  const words = dictionary(lang)
  const one = (q) => {
    const ids = `data-story="${esc(story.id)}" data-question="${esc(q.id)}"`
    const head = `<p class="q-head"><code>${esc(q.id)}</code><span class="q-text">${esc(q.question)}</span><span class="q-status">${esc(words.questionStates[q.status])}</span></p>
      ${q.why ? `<p class="q-why">${esc(q.why)}</p>` : ''}
      ${q.answer ? `<p class="q-answer"><span>${esc(ui(lang, 'inSheet'))}</span> ${esc(q.answer)}</p>` : ''}`
    if (q.status === 'resolved') return `<li class="question q-resolved sheet-item${on('questions', q.id)}" data-item="${esc(q.id)}">${head}</li>`
    const typed = drafts?.get(`${story.id}|${q.id}`)
    const value = typed ?? q.draft ?? ''
    const options = Array.isArray(q.options) && q.options.length
      ? `<div class="q-options" role="group" aria-label="${esc(ui(lang, 'options'))}">${q.options.map((option, index) => `<button type="button" class="option" data-action="pick-option" ${ids} data-option="${index}" aria-pressed="${q.draft === option}">${q.draft === option ? icon('pass') : ''}<span>${esc(option)}</span></button>`).join('')}</div>`
      : ''
    return `<li class="question q-${esc(q.status)} sheet-item${on('questions', q.id)}" data-item="${esc(q.id)}">${head}${options}
      <label class="q-field"><span class="sr-only">${esc(ui(lang, 'yourAnswer'))} · ${esc(q.id)}</span><textarea data-action="answer-text" ${ids} rows="2" placeholder="${esc(ui(lang, 'yourAnswer'))}">${esc(value)}</textarea></label>
      <p class="q-actions"><button type="button" class="ghost small" data-action="save-answer" ${ids}>${esc(ui(lang, 'saveAnswer'))}</button>${q.draft ? `<button type="button" class="link" data-action="withdraw-answer" ${ids}>${esc(ui(lang, 'withdrawAnswer'))}</button>` : ''}<span class="q-hint">${esc(ui(lang, q.status === 'draft' ? 'draftNote' : 'answerHint'))}</span></p>
    </li>`
  }
  return `<ol class="questions">${questions.map(one).join('')}</ol>`
}

/**
 * The closing line of the checklist: the human review, as the pre-flight sign-off. It answers with
 * where the review stands; the button that signs lives in the story dock, always in sight.
 * @param {any} story @param {string} lang
 */
const renderSignoff = (story, lang) => {
  const words = dictionary(lang)
  const status = story.state === 'published' || story.review === 'reviewed' ? 'pass' : story.state === 'ready' ? (story.review === 'stale' ? 'warn' : 'pending') : 'fail'
  const answer = story.state === 'published'
    ? `<a class="issue-link" href="${esc(story.published.url ?? '#')}" target="_blank" rel="noreferrer">${icon('issue')}#${esc(story.published.number)}</a>`
    : story.state !== 'ready'
      ? `<span class="muted">${esc(ui(lang, 'nothingToReview'))}</span>`
      : story.review === 'reviewed'
        ? `<span>${esc(ui(lang, 'signed', { at: String(story.reviewedAt ?? '').slice(0, 10) }))}</span>`
        : `<span>${esc(words.reviews[story.review])}</span>`
  return `<section class="checklist signoff" aria-label="${esc(ui(lang, 'signoff'))}"><ol class="lines"><li class="line s-${status}">
    <div class="line-head"><span class="line-key">${icon(status === 'pass' ? 'reviewed' : status)}</span><span class="line-name">${esc(ui(lang, 'signoff'))}</span><span class="leader" aria-hidden="true">&#8203;</span>
    <span class="line-response signoff-answer">${answer}</span><span class="line-challenge">${esc(ui(lang, 'signoffChallenge'))}</span></div></li></ol></section>`
}

/** @param {any} x @param {string} lang @param {boolean} [unplaced] */
const renderFinding = (x, lang, unplaced = false) => `<li class="finding sev-${esc(x.severity)}${unplaced ? ' unplaced' : ''}">
        <p class="evidence-source">${esc(x.lens)} · ${esc(x.gate)} · ${esc(dictionary(lang).severities[x.severity] ?? x.severity)}</p>
        <p class="evidence-why">${esc(x.description)}</p>${x.suggestion ? `<p class="evidence-fix"><span>${esc(ui(lang, 'fix'))}</span> ${esc(x.suggestion)}</p>` : ''}
        ${unplaced ? `<p class="evidence-note">${esc(ui(lang, 'unplaced'))}</p>` : ''}</li>`

/**
 * The story dock: the state of the story, its tick index, and what the reviewer does about it
 * (answer its open questions, sign it off). It sticks to the top of the story column, so the review
 * button stays in sight however far the checklist or the sheet scrolls.
 * @param {any} story @param {string} lang @param {string} index the tick index
 */
const renderDock = (story, lang, index) => {
  const words = dictionary(lang)
  const sign = story.state === 'published'
    ? `<a class="issue-link" href="${esc(story.published.url ?? '#')}" target="_blank" rel="noreferrer">${icon('issue')}#${esc(story.published.number)}</a>`
    : story.state !== 'ready'
      ? `<button type="button" class="ghost small" disabled title="${esc(ui(lang, 'nothingToReview'))}">${icon('reviewed')}${esc(ui(lang, 'markReviewed'))}</button>`
      : story.review === 'reviewed'
        ? `<button type="button" class="ghost small" data-action="review" data-story="${esc(story.id)}" data-reviewed="false">${esc(ui(lang, 'unmarkReviewed'))}</button>`
        : `<button type="button" class="primary small" data-action="review" data-story="${esc(story.id)}" data-reviewed="true">${icon('reviewed')}${esc(ui(lang, 'markReviewed'))}</button>`
  return `<div class="story-dock" role="group" aria-label="${esc(ui(lang, 'dock'))}" data-story="${esc(story.id)}">
      <div class="dock-state">
        <p class="state v-${esc(story.verdict)}">${icon(story.verdict, story.verdict)}<code class="dock-id">${esc(story.id)}</code><span>${esc(words.states[story.state])}</span>${story.state === 'ready' ? `<span class="review r-${esc(story.review)}">· ${esc(words.reviews[story.review])}</span>` : ''}</p>
        ${index}
      </div>
      <div class="dock-actions">${askButton(story, lang, 'dock')}${sign}</div>
    </div>`
}

/**
 * The open story: title and identity, statement, the dock (state, tick index, answer and sign-off
 * buttons), the two checklists closed by the human sign-off, the lens findings and the story sheet.
 * The review of its epic lives in the progress view, where the story's epic link leads.
 * @param {any} snapshot @param {{ focus: string | null, open: Set<string>, lit?: { story: string, target: string, item: string | null } | null, drafts?: Map<string, string> }} view
 */
export const renderStory = (snapshot, view) => {
  const a = snapshot.assessment
  const lang = a.language
  const story = a.stories.find((s) => s.id === view.focus) ?? a.stories[0]
  if (!story) return `<p class="muted">—</p>`
  const words = dictionary(lang)
  const f = story.file
  const statement = f?.story
    ? `<dl class="statement">${['asA', 'iWant', 'soThat'].map((part) => `<dt>${esc(ui(lang, part))}</dt><dd>${esc(f.story[part])}</dd>`).join('')}</dl>`
    : `<p class="statement">${esc(story.description)}</p>`
  const index = (keys, lines) => keys.map((k) => `<button type="button" class="tick s-${esc(lines[k].status)}" data-action="open-line" data-line="${esc(k)}" aria-label="${esc(ui(lang, 'jump', { line: k }))} · ${esc(lineLabel(lang, k).name)}" title="${esc(k)} · ${esc(lineLabel(lang, k).name)}"></button>`).join('')
  const findingKey = (x) => `${x.lens}|${x.gate}|${x.description}`
  const unplaced = new Set(story.unplaced.map(findingKey))
  const lit = view.lit && view.lit.story === story.id ? view.lit : null
  const epic = a.epics.find((e) => e.id === story.epic)
  return `<header class="story-head" data-story="${esc(story.id)}">
      <h1 id="story-title">${esc(story.title)}</h1>
      <p class="story-meta"><code>${esc(story.id)}</code>${epic ? `<button type="button" class="link meta-epic v-${epicStatus(epic)}" data-action="to-epic" title="${esc(ui(lang, 'toEpic'))}">${icon(epicStatus(epic))}<span>${esc(story.epic)}</span></button>` : `<span>${esc(story.epic)}</span>`}<span>${esc(story.milestone)}</span><span>${esc(story.moscow)}</span><span>${esc(story.effort)} ${esc(ui(lang, 'effortUnit'))}</span>${story.tracer ? `<span>${esc(ui(lang, 'tracer'))}</span>` : ''}</p>
      ${statement}
    </header>
    ${renderDock(story, lang, `<p class="tick-index"><span class="ticks">${index(INVEST, story.invest)}</span><b class="tick-gap"></b><span class="ticks">${index(DOR, story.dor)}</span></p>`)}
    ${story.state === 'held' && story.reasons.length ? `<ul class="reasons">${story.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
    ${story.antipatterns.length ? `<p class="antipatterns">${story.antipatterns.map((p) => `<button type="button" data-action="open-line" data-line="${esc(ANTIPATTERN_LINES[p] ?? '')}">${esc(words.antipatterns[p] ?? p)}</button>`).join('')}</p>` : ''}
    <section class="checklist" aria-labelledby="h-invest"><h2 id="h-invest">${esc(ui(lang, 'invest'))}</h2>
      <ol class="lines">${INVEST.map((k) => renderLine(lang, k, story.invest[k], view.open.has(k))).join('')}</ol></section>
    <section class="checklist" aria-labelledby="h-dor"><h2 id="h-dor">${esc(ui(lang, 'dor'))}</h2>
      <ol class="lines">${DOR.map((k) => renderLine(lang, k, story.dor[k], view.open.has(k))).join('')}</ol></section>
    ${renderSignoff(story, lang)}
    <section class="lenses" aria-labelledby="h-lenses"><h2 id="h-lenses">${esc(ui(lang, 'lenses'))}</h2>
      ${story.findings.length ? `<ul class="findings">${story.findings.map((x) => renderFinding(x, lang, unplaced.has(findingKey(x)))).join('')}</ul>`
        : `<p class="muted">${esc(ui(lang, 'noFinding'))}</p>`}
    </section>
    <section class="sheet" aria-labelledby="h-sheet"><h2 id="h-sheet">${esc(ui(lang, 'sheet'))}</h2>${renderSheet(story, lang, lit, view.drafts)}</section>`
}

const OP_LABELS = { 'dry-run': 'opCreate', created: 'opCreated', existing: 'opExisting', linked: 'opLinked', skipped: 'opSkipped', failed: 'opFailed' }

/**
 * The plan of a dry run or of a creation, story by story under each epic: what is created, what
 * exists, the links, and the stories pulled in as dependencies.
 * @param {any} outcome @param {string[]} asked @param {string} lang
 */
export const renderOperations = (outcome, asked, lang) => {
  const status = new Map(outcome.report.operations.map((o) => [o.ref, o.status]))
  const say = (ref, link = false) => {
    const state = status.get(ref) ?? 'skipped'
    return `<span class="op-status op-${esc(state)}">${esc(ui(lang, state === 'dry-run' && link ? 'opLink' : OP_LABELS[state] ?? state))}</span>`
  }
  const linksOf = (id) => outcome.links.filter((l) => (l.type === 'sub-issue' ? l.to : l.from) === id)
  const epics = outcome.issues.filter((i) => i.kind === 'epic')
  return `<ul class="operations">${epics.map((epic) => `<li class="op-epic">
      <p class="op-line"><code>${esc(epic.id)}</code><span class="op-title">${esc(ui(lang, 'epic'))} · ${esc(epic.title)}</span>${say(epic.ref)}</p>
      <ul>${outcome.issues.filter((i) => i.kind === 'story' && i.parentId === epic.id).map((story) => `<li class="op-story">
        <p class="op-line"><code>${esc(story.id)}</code><span class="op-title">${esc(story.title)}${asked.includes(story.id) || outcome.selection.existing.includes(story.id) ? '' : ` <em>${esc(ui(lang, 'pulled'))}</em>`}</span>${say(story.ref)}</p>
        ${linksOf(story.id).map((link) => `<p class="op-link">${icon('link')}<span>${esc(link.type === 'sub-issue' ? ui(lang, 'subIssueOf', { epic: link.from }) : ui(lang, 'blockedBy', { story: link.to }))}</span>${say(link.ref, true)}</p>`).join('')}
      </li>`).join('')}</ul></li>`).join('')}</ul>`
}

/**
 * The launch bar, and the plan of the last dry run or creation above it.
 * @param {any} snapshot
 */
export const renderBar = (snapshot) => {
  const a = snapshot.assessment
  const lang = a.language
  const words = dictionary(lang)
  const preview = snapshot.preview
  const result = snapshot.result
  const busy = snapshot.busy !== null
  const ready = preview?.status === 'simulated'
  const count = ready ? preview.selection.stories.length + preview.selection.epics.length : 0
  const waiting = waitingOf(a)
  const questions = a.stories.reduce((sum, s) => { const n = asked(s); return { open: sum.open + n.open, draft: sum.draft + n.draft } }, { open: 0, draft: 0 })
  const asking = questions.open || questions.draft
    ? `<span class="asking">${questions.open ? `<button type="button" class="link q-open" data-action="filter" data-filter="questions">${icon('question')}${esc(ui(lang, 'openQuestions', { count: questions.open }))}</button>` : ''}${questions.draft ? `<span class="drafts" title="${esc(ui(lang, 'draftsHow'))}">${esc(ui(lang, 'draftsWaiting', { count: questions.draft }))}<span class="drafts-how">, ${esc(ui(lang, 'draftsFoldIn'))} <code>corrections: true</code></span></span>` : ''}</span>`
    : ''
  const missing = preview?.selection?.missing?.length
    ? `<div class="missing"><h3>${esc(ui(lang, 'missingTitle'))}</h3><ul>${preview.selection.missing.map((m) => `<li><button type="button" class="link" data-action="focus" data-story="${esc(m.id)}">${esc(m.id)}</button> ${esc(words.missing[m.reason] ?? m.reason)}${m.via ? ` · ${esc(ui(lang, 'requiredBy', { via: m.via }))}` : ''}</li>`).join('')}</ul></div>`
    : ''
  const panel = preview
    ? `<div class="preview" role="region" aria-label="${esc(ui(lang, 'previewTitle'))}"><h2>${esc(ui(lang, 'previewTitle'))}<span class="muted"> · ${esc(preview.status === 'refused' ? preview.reason : ui(lang, 'dryRun'))}</span></h2>${missing}${preview.report ? renderOperations(preview, preview.ids ?? [], lang) : ''}</div>`
    : result ? `<div class="preview result" role="status"><h2>${esc(ui(lang, 'resultTitle'))}</h2>${renderOperations(result, result.selection.stories, lang)}</div>` : ''
  return `${panel}<div class="bar-inner">
      <p class="bar-count"><strong>${esc(ui(lang, 'reviewed', a.counts))}</strong>
        ${asking}
        ${waiting.length ? `<span class="waiting">${icon('warn')}${esc(ui(lang, 'waiting', { count: waiting.length }))} ${waiting.map((id) => `<button type="button" class="link" data-action="focus" data-story="${esc(id)}">${esc(id)}</button>`).join(' ')}</span>` : ''}
        <span class="destination">${esc(ui(lang, 'destination'))} <code>${esc(snapshot.repo ?? ui(lang, 'noRepo'))}</code></span>
        ${snapshot.error ? `<span class="error">${esc(snapshot.error)}</span>` : ''}</p>
      <div class="bar-actions">
        <button type="button" class="ghost" data-action="preview"${busy || !a.counts.reviewed ? ' disabled' : ''}>${esc(ui(lang, 'preview'))}</button>
        <button type="button" class="primary" data-action="create"${busy || !ready ? ' disabled' : ''}>${esc(ready ? ui(lang, 'create', { count }) : ui(lang, 'createIdle'))}</button>
      </div>
    </div>`
}

/** @param {any} snapshot */
export const renderMapProblems = (snapshot) => {
  const a = snapshot.assessment
  if (!a?.mapCheck.problems.length) return ''
  return `<details class="map-problems"><summary>${esc(ui(a.language, 'mapProblems'))} (${a.mapCheck.problems.length})</summary><ul>${a.mapCheck.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></details>`
}

/** A run is at work while it says so and has not ended. @param {any} run */
export const isWorking = (run) => Boolean(run && run.status === 'running' && !run.endedAt)

/** A duration as a reader takes it in: "< 1 min", "12 min", "1 h 05". @param {number} ms */
const duration = (ms) => {
  const minutes = Math.max(0, Math.floor(ms / 60000))
  if (minutes < 1) return '< 1 min'
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
}

/** @param {string | undefined} iso @param {string} lang */
const when = (iso, lang) => {
  const at = Date.parse(iso ?? '')
  return Number.isNaN(at) ? '—' : new Date(at).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })
}

/**
 * The worker: while a run is at work, which agents run and for how long — shown as long as the
 * panel has nothing else to show, and above the stories while they come in.
 * @param {any} diagnostics @param {number} [now]
 */
export const renderWorker = (diagnostics, now = Date.now()) => {
  const run = diagnostics?.run
  if (!isWorking(run)) return ''
  const lang = diagnostics.language ?? 'en'
  const agents = Object.entries(run.agents ?? {})
  const since = (iso) => ui(lang, 'since', { time: duration(now - Date.parse(iso)) })
  const title = ui(lang, agents.length ? 'workerAgents' : 'workerRun', { phase: run.phase, count: agents.length })
  const list = agents.length
    ? `<ul class="worker-agents">${agents.map(([label, a]) => `<li><code>${esc(a?.agent)}</code><span>${esc(label)}</span><span class="muted">${esc(since(a?.since))}</span></li>`).join('')}</ul>` : ''
  return `<div class="worker" role="status"><span class="spinner" aria-hidden="true"></span><div class="worker-body">
      <p class="worker-title">${esc(title)} <span class="muted">${esc(since(run.startedAt))}</span></p>${list}
    </div></div>`
}

/**
 * The diagnostics: where the backlog stands when there is no story to show yet, or when the panel
 * cannot show them — the run, the inventory, the framing, the story map, and why it stopped.
 * @param {any} snapshot @param {{ error?: string, now?: number }} [options] error: what the panel tripped on
 */
export const renderDiagnostics = (snapshot, { error, now = Date.now() } = {}) => {
  const d = snapshot?.diagnostics
  const lang = d?.language ?? snapshot?.assessment?.language ?? 'en'
  if (!d) return `<p class="diag-empty">${esc(error ? ui(lang, 'renderFailed', { error }) : snapshot?.error ?? ui(lang, 'empty'))}</p>`
  const run = d.run
  const status = run ? dictionary(lang).runStatus?.[run.status] ?? run.status : null
  const steps = Object.entries(d.steps ?? {}).map(([step, count]) => `${step} ${count}`)
  const facts = [
    run ? `${ui(lang, 'runLine', { phase: run.phase, status })} · ${ui(lang, 'runStarted', { at: when(run.startedAt, lang) })}${run.endedAt ? ` · ${ui(lang, 'runEnded', { at: when(run.endedAt, lang) })}` : ''}` : ui(lang, 'noRun'),
    d.inventory ? ui(lang, 'inventoryLine', d.inventory) : null,
    d.framing ? ui(lang, 'framingLine', d.framing) : null,
    d.map.state === 'ready' ? ui(lang, 'mapReady', d.map) : ui(lang, d.map.state === 'missing' ? 'mapMissing' : 'mapUnreadable'),
    steps.length ? ui(lang, 'stepsLine', { steps }) : null,
  ].filter(Boolean)
  const stopped = run && !isWorking(run) && run.status !== 'done'
  const problems = Array.isArray(run?.problems) && run.problems.length
    ? `<h3>${esc(ui(lang, 'runProblems'))}</h3><ul class="diag-problems">${run.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''
  // a missing map is already said in the facts, in the reader's language
  const reason = error ? ui(lang, 'renderFailed', { error }) : !snapshot?.assessment && d.map.state !== 'missing' ? snapshot?.error : null
  return `<section class="diagnostics" aria-labelledby="diag-title">
      <h2 id="diag-title">${esc(ui(lang, 'diagnostics'))} <code>${esc(d.slug)}</code></h2>
      ${renderWorker(d, now)}
      ${isWorking(run) && !snapshot?.assessment ? `<p class="muted">${esc(ui(lang, 'workerWait'))}</p>` : ''}
      ${stopped && run.detail ? `<p class="diag-detail v-${run.status === 'paused' ? 'warn' : 'fail'}">${esc(run.detail)}</p>` : ''}
      ${reason ? `<p class="diag-reason">${esc(reason)}</p>` : ''}
      <ul class="diag-facts">${facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      ${problems}
    </section>`
}

/**
 * Above the stories: the worker while the run is at work, else the diagnostics of a run that
 * stopped on a problem, folded.
 * @param {any} snapshot @param {number} [now]
 */
export const renderRunNotice = (snapshot, now = Date.now()) => {
  const d = snapshot?.diagnostics
  const run = d?.run
  if (isWorking(run)) return renderWorker(d, now)
  if (!run || !['blocked', 'refused'].includes(run.status)) return ''
  return `<details class="map-problems run-notice"><summary>${esc(ui(d.language, 'diagnostics'))} — ${esc(dictionary(d.language).runStatus?.[run.status] ?? run.status)}${run.detail ? ` · ${esc(run.detail)}` : ''}</summary>${renderDiagnostics(snapshot, { now })}</details>`
}
