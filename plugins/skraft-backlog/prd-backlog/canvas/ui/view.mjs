// The canvas markup, as pure functions of the controller snapshot and of the panel's own state
// (filter, query, open lines, lit passage). Every value from a file is escaped; nothing here
// touches the DOM.
import { dictionary, explanation, lineLabel, response, ui } from './i18n.mjs'

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
})
const FILTER_LABELS = { all: 'filterAll', todo: 'filterTodo', refused: 'filterRefused', held: 'filterHeld', ready: 'filterReady', published: 'filterPublished' }

/**
 * The stories the plan shows: those the filter and the query keep, in build order.
 * @param {any} assessment @param {{ filter: string, query: string }} view
 */
export const visibleStories = (assessment, { filter, query }) => {
  const keep = FILTERS[filter] ?? FILTERS.all
  const words = query.trim().toLowerCase()
  return assessment.stories.filter((s) => keep(s) && (!words || `${s.id} ${s.title}`.toLowerCase().includes(words)))
}

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

/** @param {any} snapshot */
export const renderHeader = (snapshot) => {
  const a = snapshot.assessment
  const lang = a?.language ?? 'en'
  const backlogs = snapshot.backlogs.length > 1
    ? `<label class="backlog-pick"><span class="sr-only">${esc(ui(lang, 'title'))}</span><select data-action="open-backlog">${snapshot.backlogs.map((slug) => `<option value="${esc(slug)}"${slug === snapshot.slug ? ' selected' : ''}>${esc(slug)}</option>`).join('')}</select></label>`
    : `<span class="slug">${esc(snapshot.slug ?? '')}</span>`
  return `<div class="brand"><span class="brand-mark">skraft</span><span class="brand-sep">/</span>${backlogs}</div>
    ${a ? `<p class="coverage">${esc(ui(lang, 'coverage', a.coverage))}</p>
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
 * The flight plan: filters, search, and the stories grouped by milestone.
 * @param {any} snapshot @param {{ filter: string, query: string, focus: string | null }} view
 */
export const renderPlan = (snapshot, view) => {
  const a = snapshot.assessment
  const lang = a.language
  const shown = visibleStories(a, view)
  const filters = Object.keys(FILTERS).map((key) => {
    const count = a.stories.filter(FILTERS[key]).length
    return `<button type="button" class="filter" data-action="filter" data-filter="${key}" aria-pressed="${view.filter === key}">${esc(ui(lang, FILTER_LABELS[key]))}<span class="count">${count}</span></button>`
  }).join('')
  const groups = a.milestones.map((milestone) => {
    const rows = shown.filter((s) => s.milestone === milestone.id)
    if (!rows.length) return ''
    return `<li class="milestone"><h3><span>${esc(milestone.title)}</span>${milestone.dueOn ? `<time datetime="${esc(milestone.dueOn)}">${esc(milestone.dueOn)}</time>` : ''}</h3>
      <ol class="rows">${rows.map((s) => `<li><button type="button" class="row v-${esc(s.verdict)}" data-action="focus" data-story="${esc(s.id)}" aria-current="${s.id === view.focus ? 'true' : 'false'}">
        <span class="row-verdict">${icon(s.verdict, s.verdict)}</span>
        <span class="row-id">${esc(s.id)}</span>
        <span class="row-title">${esc(s.title)}</span>
        ${ticks(s)}
        ${marker(s, lang)}
      </button></li>`).join('')}</ol></li>`
  }).join('')
  return `<div class="plan-tools">
      <div class="filters" role="group" aria-label="${esc(ui(lang, 'plan'))}">${filters}</div>
      <label class="search"><span class="sr-only">${esc(ui(lang, 'search'))}</span><input type="search" data-action="search" value="${esc(view.query)}" placeholder="${esc(ui(lang, 'search'))}"></label>
    </div>
    <ol class="milestones">${groups || `<li class="none">—</li>`}</ol>`
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
const renderSheet = (story, lang, lit) => {
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
    section('questions', ui(lang, 'questions'), items('questions', f.openQuestions, null, plain)),
  ].join('')
}

/**
 * The closing line of the checklist: the human review, as the pre-flight sign-off.
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
        ? `<span>${esc(ui(lang, 'signed', { at: String(story.reviewedAt ?? '').slice(0, 10) }))}</span><button type="button" class="ghost small" data-action="review" data-story="${esc(story.id)}" data-reviewed="false">${esc(ui(lang, 'unmarkReviewed'))}</button>`
        : `${story.review === 'stale' ? `<span>${esc(words.reviews.stale)}</span>` : ''}<button type="button" class="primary small" data-action="review" data-story="${esc(story.id)}" data-reviewed="true">${icon('reviewed')}${esc(ui(lang, 'markReviewed'))}</button>`
  return `<section class="checklist signoff" aria-label="${esc(ui(lang, 'signoff'))}"><ol class="lines"><li class="line s-${status}">
    <div class="line-head"><span class="line-key">${icon(status === 'pass' ? 'reviewed' : status)}</span><span class="line-name">${esc(ui(lang, 'signoff'))}</span><span class="leader" aria-hidden="true">&#8203;</span>
    <span class="line-response signoff-answer">${answer}</span><span class="line-challenge">${esc(ui(lang, 'signoffChallenge'))}</span></div></li></ol></section>`
}

/**
 * The open story: title and identity, statement, state with the tick index, the two checklists
 * closed by the human sign-off, the lens findings and the story sheet.
 * @param {any} snapshot @param {{ focus: string | null, open: Set<string>, lit?: { story: string, target: string, item: string | null } | null }} view
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
  return `<header class="story-head" data-story="${esc(story.id)}">
      <h1 id="story-title">${esc(story.title)}</h1>
      <p class="story-meta"><code>${esc(story.id)}</code><span>${esc(story.epic)}</span><span>${esc(story.milestone)}</span><span>${esc(story.moscow)}</span><span>${esc(story.effort)} ${esc(ui(lang, 'effortUnit'))}</span>${story.tracer ? `<span>${esc(ui(lang, 'tracer'))}</span>` : ''}</p>
      ${statement}
      <div class="story-state">
        <p class="state v-${esc(story.verdict)}">${icon(story.verdict, story.verdict)}<span>${esc(words.states[story.state])}</span>${story.state === 'ready' ? `<span class="review r-${esc(story.review)}">· ${esc(words.reviews[story.review])}</span>` : ''}</p>
        <p class="tick-index"><span class="ticks">${index(INVEST, story.invest)}</span><b class="tick-gap"></b><span class="ticks">${index(DOR, story.dor)}</span></p>
      </div>
      ${story.state === 'held' && story.reasons.length ? `<ul class="reasons">${story.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
      ${story.antipatterns.length ? `<p class="antipatterns">${story.antipatterns.map((p) => `<button type="button" data-action="open-line" data-line="${esc(ANTIPATTERN_LINES[p] ?? '')}">${esc(words.antipatterns[p] ?? p)}</button>`).join('')}</p>` : ''}
    </header>
    <section class="checklist" aria-labelledby="h-invest"><h2 id="h-invest">${esc(ui(lang, 'invest'))}</h2>
      <ol class="lines">${INVEST.map((k) => renderLine(lang, k, story.invest[k], view.open.has(k))).join('')}</ol></section>
    <section class="checklist" aria-labelledby="h-dor"><h2 id="h-dor">${esc(ui(lang, 'dor'))}</h2>
      <ol class="lines">${DOR.map((k) => renderLine(lang, k, story.dor[k], view.open.has(k))).join('')}</ol></section>
    ${renderSignoff(story, lang)}
    <section class="lenses" aria-labelledby="h-lenses"><h2 id="h-lenses">${esc(ui(lang, 'lenses'))}</h2>
      ${story.findings.length ? `<ul class="findings">${story.findings.map((x) => `<li class="finding sev-${esc(x.severity)}${unplaced.has(findingKey(x)) ? ' unplaced' : ''}">
        <p class="evidence-source">${esc(x.lens)} · ${esc(x.gate)} · ${esc(words.severities[x.severity] ?? x.severity)}</p>
        <p class="evidence-why">${esc(x.description)}</p>${x.suggestion ? `<p class="evidence-fix"><span>${esc(ui(lang, 'fix'))}</span> ${esc(x.suggestion)}</p>` : ''}
        ${unplaced.has(findingKey(x)) ? `<p class="evidence-note">${esc(ui(lang, 'unplaced'))}</p>` : ''}</li>`).join('')}</ul>`
        : `<p class="muted">${esc(ui(lang, 'noFinding'))}</p>`}
    </section>
    <section class="sheet" aria-labelledby="h-sheet"><h2 id="h-sheet">${esc(ui(lang, 'sheet'))}</h2>${renderSheet(story, lang, lit)}</section>`
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
  const missing = preview?.selection?.missing?.length
    ? `<div class="missing"><h3>${esc(ui(lang, 'missingTitle'))}</h3><ul>${preview.selection.missing.map((m) => `<li><button type="button" class="link" data-action="focus" data-story="${esc(m.id)}">${esc(m.id)}</button> ${esc(words.missing[m.reason] ?? m.reason)}${m.via ? ` · ${esc(ui(lang, 'requiredBy', { via: m.via }))}` : ''}</li>`).join('')}</ul></div>`
    : ''
  const panel = preview
    ? `<div class="preview" role="region" aria-label="${esc(ui(lang, 'previewTitle'))}"><h2>${esc(ui(lang, 'previewTitle'))}<span class="muted"> · ${esc(preview.status === 'refused' ? preview.reason : ui(lang, 'dryRun'))}</span></h2>${missing}${preview.report ? renderOperations(preview, preview.ids ?? [], lang) : ''}</div>`
    : result ? `<div class="preview result" role="status"><h2>${esc(ui(lang, 'resultTitle'))}</h2>${renderOperations(result, result.selection.stories, lang)}</div>` : ''
  return `${panel}<div class="bar-inner">
      <p class="bar-count"><strong>${esc(ui(lang, 'reviewed', a.counts))}</strong>
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
