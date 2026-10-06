// Skraft pipeline canvas page. Draws the view the local server streams (/api/events) and
// sends the human's answer (/api/decide). Every value comes from repository files the
// agents wrote: it is set as text, never as HTML.

const params = new URLSearchParams(location.search)
const token = params.get('token') ?? ''
const headers = { 'x-skraft-token': token, 'Content-Type': 'application/json' }
const $ = (id) => document.getElementById(id)

const PHASE_LABEL = { RESEARCH: 'Research', DESIGN: 'Design', DISTILL: 'Distill', DELIVER: 'Deliver', REPORT: 'Report publication' }
const STATUS_LABEL = {
  done: 'Done',
  active: 'Running',
  awaiting: 'Waiting for you',
  blocked: 'Stopped',
  open: 'Open, no run in progress',
  pending: 'Not reached',
}
const STEP_MARK = { done: '✓', failed: '✕', waiting: '!', running: '…', pending: '', skipped: '–' }
const STEP_LABEL = { done: 'done', failed: 'failed', waiting: 'waiting for you', running: 'under way', pending: 'not reached', skipped: 'skipped' }
const VERDICT_LABEL = { APPROVED: 'approved', NEEDS_REWORK: 'needs rework', REJECTED: 'rejected', CHANGES_REQUESTED: 'changes requested' }
const GATE_STATUS = { pass: 'done', fail: 'failed', not_applicable: 'skipped' }

// "Skraft - Software Engineer" reads "Software Engineer" here: every agent is Skraft's.
const short = (text) => String(text ?? '').replace(/Skraft - /g, '')

const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined) continue
    if (key === 'text') node.textContent = value
    else if (key === 'data') Object.assign(node.dataset, value)
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value)
    else node.setAttribute(key, value)
  }
  for (const child of [].concat(children)) if (child !== null && child !== undefined && child !== false) node.append(child)
  return node
}

// ── Formatting ───────────────────────────────────────────────────────────────
const duration = (ms) => {
  if (ms === null || ms === undefined) return null
  const minutes = Math.round(ms / 60000)
  if (minutes < 1) return 'under a minute'
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
}
const clock = (iso) => {
  const date = new Date(iso)
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}
const ago = (iso) => {
  const seconds = Math.round((Date.now() - Date.parse(iso)) / 1000)
  if (!Number.isFinite(seconds)) return ''
  if (seconds < 60) return `${seconds} s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`
  return `${Math.round(seconds / 86400)} d ago`
}
const number = (value, digits = 0) => new Intl.NumberFormat(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)
const tokens = (value) => (value >= 1e6 ? `${number(value / 1e6, 1)} M` : value >= 1e3 ? `${number(value / 1e3, 1)} k` : number(value))
const euros = (value) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: value < 1 ? 3 : 2 }).format(value)
const dollars = (value) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: value < 1 ? 3 : 2 }).format(value)
// The headline amount: euros when a rate is set, else dollars; credits beside when Copilot reported them.
const money = (amount) => {
  const parts = []
  if (amount.eur !== null && amount.eur !== undefined) parts.push(euros(amount.eur))
  else if (amount.usd !== null && amount.usd !== undefined) parts.push(dollars(amount.usd))
  if (amount.credits !== null && amount.credits !== undefined) parts.push(`${number(amount.credits, 2)} credits`)
  return parts.join(' — ') || 'not reported'
}
// The same, the headline amount on its own and the credits below it.
const moneyNode = (amount) => {
  const headline = amount.eur !== null && amount.eur !== undefined ? euros(amount.eur)
    : amount.usd !== null && amount.usd !== undefined ? dollars(amount.usd) : null
  const credits = amount.credits !== null && amount.credits !== undefined ? `${number(amount.credits, 2)} AI credits` : null
  if (!headline) return credits ?? 'not reported'
  return el('span', { class: 'amount' }, [headline, credits ? el('small', { text: credits }) : null])
}

let view = null

// ── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = ['overview', 'phases', 'tests', 'cost', 'reports', 'journal']
const remembered = () => {
  try { return localStorage.getItem('skraft-tab') } catch { return null }
}
const selectTab = (name, { focus = false } = {}) => {
  const chosen = TABS.includes(name) ? name : 'overview'
  for (const tab of TABS) {
    const button = $(`tab-${tab}`)
    const selected = tab === chosen
    button.setAttribute('aria-selected', String(selected))
    button.tabIndex = selected ? 0 : -1
    $(`panel-${tab}`).hidden = !selected
    if (selected && focus) button.focus()
  }
  try { localStorage.setItem('skraft-tab', chosen) } catch { /* private window: forget it */ }
}
document.querySelector('.tabs').addEventListener('click', (event) => {
  const tab = event.target.closest('[role="tab"]')
  if (tab) selectTab(tab.dataset.tab)
})
document.querySelector('.tabs').addEventListener('keydown', (event) => {
  const index = TABS.indexOf(document.activeElement?.dataset?.tab)
  if (index < 0) return
  const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: TABS.length - 1 }[event.key]
  if (next === undefined) return
  event.preventDefault()
  selectTab(TABS[(next + TABS.length) % TABS.length], { focus: true })
})
const badge = (id, text, tone) => {
  const node = $(id)
  node.textContent = text ?? ''
  if (tone) node.dataset.tone = tone
  else delete node.dataset.tone
}

// ── Files ────────────────────────────────────────────────────────────────────
const openFile = async (path) => {
  const response = await fetch(`/api/file?path=${encodeURIComponent(path)}`, { headers })
  $('viewer-title').textContent = path
  $('viewer-text').textContent = response.ok ? await response.text() : 'This file is not available any more.'
  $('viewer').showModal()
}
const fileButton = (path) => el('button', { type: 'button', text: path, title: `Open ${path}`, onclick: () => openFile(path) })
const fileList = (paths, verdicts = {}) => (paths.length === 0
  ? el('p', { class: 'empty', text: 'None yet.' })
  : el('ul', { class: 'files' }, paths.map((path) => el('li', {}, [
    fileButton(path),
    verdicts[path] ? el('span', { class: 'verdict', data: { verdict: verdicts[path] }, text: VERDICT_LABEL[verdicts[path]] ?? verdicts[path] }) : null,
  ]))))

// ── Check marks ──────────────────────────────────────────────────────────────
const mark = (status) => el('span', { class: 'mark', data: { status }, 'aria-hidden': 'true', text: STEP_MARK[status] ?? '' })
const stepList = (steps) => el('ul', { class: 'steps' }, steps.map((step) => el('li', { data: { status: step.status } }, [
  mark(step.status),
  el('span', { class: 'step-text' }, [
    el('span', { text: short(step.label) }),
    el('small', { text: [step.status === 'done' ? null : STEP_LABEL[step.status], step.detail].filter(Boolean).join(', ') }),
  ]),
])))

// ── Header and track ─────────────────────────────────────────────────────────
const summaryOf = (v) => {
  if (!v.started) return ['Not started. Run the skraft-pipeline workflow for this slug.', 'idle']
  if (v.done) return ['Done. Every phase is approved.', 'done']
  const phase = PHASE_LABEL[v.currentPhase] ?? v.currentPhase
  const status = v.run?.status
  if (status === 'awaiting-human' && v.checkpoint?.answered) return [`Answered. Resume the run to continue ${phase}.`, 'waiting']
  if (status === 'awaiting-human') return [`Waiting for you in ${phase}.`, 'waiting']
  if (status === 'blocked' || status === 'error') return [`Stopped in ${phase}: ${v.run.reason}`, 'blocked']
  if (status === 'running') return [`Running ${phase}.`, 'active']
  return [`${phase} is open. Resume the run to continue.`, 'idle']
}

const showPhase = (phase) => {
  selectTab('phases')
  const details = $(`phase-${phase}`)
  if (!details) return
  details.open = true
  details.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
}

const drawTrack = (v) => {
  $('track').replaceChildren(...v.phases.map((phase) => el('li', { class: 'stage', data: { status: phase.status } }, [
    el('button', { type: 'button', 'aria-label': `${PHASE_LABEL[phase.name]}: ${STATUS_LABEL[phase.status]}`, onclick: () => showPhase(phase.name) }, [
      el('span', { class: 'rail' }),
      el('span', { class: 'stage-name', text: PHASE_LABEL[phase.name] ?? phase.name }),
      el('span', { class: 'pips', 'aria-hidden': 'true' }, Array.from({ length: phase.maxAttempts }, (_, i) => el('span', {
        class: 'pip',
        data: { used: String(phase.status !== 'pending' && i < (phase.status === 'done' ? phase.retries + 1 : phase.attempt)) },
      }))),
      el('span', { class: 'stage-meta', text: phase.status === 'pending' ? '' : (duration(phase.durationMs) ?? STATUS_LABEL[phase.status]) }),
    ]),
  ])))
}

// ── Overview ─────────────────────────────────────────────────────────────────
const drawQuestion = (v) => {
  const checkpoint = v.checkpoint
  $('question').hidden = !checkpoint
  if (!checkpoint) return
  const answered = checkpoint.answered
  $('question-text').textContent = checkpoint.question
  $('question-key').replaceChildren('Checkpoint ', el('code', { text: checkpoint.key }))
  $('question-title').textContent = answered ? 'Answer recorded' : 'The pipeline is waiting for you'
  $('question-options').replaceChildren(...(checkpoint.options ?? []).map((option) => {
    const button = el('button', { type: 'button', text: option, onclick: () => decide(checkpoint.key, option) })
    button.disabled = answered
    return button
  }))
  $('question-form').hidden = answered
  const note = $('question-note')
  note.hidden = !answered
  note.textContent = answered ? 'Resume the run to let the pipeline read it.' : ''
}

const testsTone = (tests) => (tests.verdict === 'pass' ? 'done' : tests.verdict ? 'failed' : null)

const drawGlance = (v) => {
  const steps = v.phases.flatMap((phase) => phase.steps)
  const done = steps.filter((step) => step.status === 'done').length
  const failed = steps.some((step) => step.status === 'failed')
  const waiting = steps.some((step) => step.status === 'waiting')
  const tests = v.tests
  const items = [
    ['Steps', `${done} of ${steps.length} done`, failed ? 'failed' : waiting ? 'waiting' : done === steps.length ? 'done' : null],
    ['Tests', tests.tests ? `${number(tests.tests.passed)} of ${number(tests.tests.total)} passed` : tests.evidenceLog ? 'Evidence logged' : 'Not run yet', testsTone(tests)],
    ['Checked by the code', tests.verdict ?? 'not yet', testsTone(tests)],
    ['Cost so far', moneyNode(v.cost.total), null],
  ]
  $('glance').replaceChildren(...items.map(([term, value, tone]) => el('div', { data: tone ? { tone } : {} }, [el('dt', { text: term }), el('dd', {}, value)])))
}

const drawOverviewSteps = (v) => {
  $('overview-steps').replaceChildren(...v.phases.map((phase) => el('div', {}, [
    el('h3', { text: PHASE_LABEL[phase.name] }),
    stepList(phase.steps),
  ])))
}

// ── Phases ───────────────────────────────────────────────────────────────────
const drawPhases = (v) => {
  const open = new Set([...document.querySelectorAll('details.phase[open]')].map((d) => d.dataset.phase))
  $('phases').replaceChildren(...v.phases.map((phase) => {
    const verdicts = Object.fromEntries(phase.reviews.map((r) => [r.path, r.verdict]))
    const cost = v.cost.byPhase.find((entry) => entry.phase === phase.name)
    const facts = [
      ['Specialist', short(phase.specialist)],
      ['Reviewer', phase.reviewer ? short(phase.reviewer) : 'none, the phase closes after its specialist'],
      ['Attempt', phase.status === 'pending' ? null : `${phase.attempt} of ${phase.maxAttempts}`],
      ['Verdict', phase.verdict ? (VERDICT_LABEL[phase.verdict] ?? phase.verdict) : null],
      ['Manual reworks', phase.reworks ? `${phase.reworks} (${phase.findingsResolved} findings fixed)` : null],
      ['Started', phase.startedAt ? new Date(phase.startedAt).toLocaleString() : null],
      ['Time spent', duration(phase.durationMs)],
      ['Cost', cost && cost.reported > 0 ? money(cost) : null],
      ['Base commit', phase.baseSha ? phase.baseSha.slice(0, 12) : null],
    ].filter(([, value]) => value)
    const details = el('details', { class: 'phase', id: `phase-${phase.name}`, data: { phase: phase.name } }, [
      el('summary', {}, [
        el('strong', { text: PHASE_LABEL[phase.name] ?? phase.name }),
        el('span', { class: 'state', data: { status: phase.status }, text: STATUS_LABEL[phase.status] }),
      ]),
      el('div', { class: 'phase-body' }, [
        stepList(phase.steps),
        el('dl', { class: 'facts' }, facts.flatMap(([term, value]) => [el('dt', { text: term }), el('dd', { text: value })])),
        el('h3', { class: 'empty', text: 'Reviews' }),
        fileList(phase.reviews.map((r) => r.path), verdicts),
        el('h3', { class: 'empty', text: 'Artefacts' }),
        fileList(phase.artifacts.filter((path) => /\.(md|json)$/.test(path))),
      ]),
    ])
    if (open.has(phase.name) || (open.size === 0 && ['active', 'awaiting', 'blocked', 'open'].includes(phase.status))) details.open = true
    return details
  }))
}

// ── Tests ────────────────────────────────────────────────────────────────────
const drawTests = (v) => {
  const tests = v.tests
  if (!tests.evidenceLog) {
    $('tests').replaceChildren(el('p', { class: 'empty', text: 'No test evidence yet. The engineer records it in Deliver, after its last commit; the pipeline then checks it before any review.' }))
    return
  }
  const verdictStatus = tests.verdict === 'pass' ? 'done' : tests.verdict ? 'failed' : 'pending'
  const verdictText = {
    pass: 'The tests ran and passed: the code checked the evidence against the files and git history.',
    fail: 'The evidence shows a failure: a gate failed or the log contradicts git.',
    inconclusive: 'The evidence cannot be believed as it is: something it claims could not be checked.',
    error: 'The check could not run.',
  }[tests.verdict] ?? 'The evidence is logged; the code has not checked it yet.'
  const parts = [
    el('p', { class: 'verdict-line' }, [mark(verdictStatus), el('span', { text: verdictText })]),
    el('p', { class: 'counts', text: [
      tests.tests ? `${number(tests.tests.passed)} of ${number(tests.tests.total)} tests passed, ${number(tests.tests.failed)} failed.` : null,
      tests.cycles !== null ? `${tests.cycles} RED to GREEN cycle${tests.cycles === 1 ? '' : 's'} recorded.` : null,
      tests.producedAt ? `Evidence produced ${new Date(tests.producedAt).toLocaleString()}.` : null,
      tests.verifiedAt ? `Checked by the code ${new Date(tests.verifiedAt).toLocaleString()}.` : null,
    ].filter(Boolean).join(' ') }),
    el('h2', { text: 'Quality gates' }),
    el('table', {}, [
      el('thead', {}, el('tr', {}, [el('th', { text: '' }), el('th', { text: 'Gate' }), el('th', { text: 'What it checks' }), el('th', { class: 'num', text: 'Tests' })])),
      el('tbody', {}, tests.gates.map((gate) => el('tr', {}, [
        el('td', {}, mark(GATE_STATUS[gate.status] ?? 'pending')),
        el('td', { text: gate.id }),
        el('td', { text: gate.rationale ? `${gate.label} (not applicable: ${gate.rationale})` : gate.label }),
        el('td', { class: 'num', text: gate.total === null ? '' : `${number(gate.passed ?? 0)} / ${number(gate.total)}` }),
      ]))),
    ]),
  ]
  if (tests.findings.length > 0) {
    parts.push(el('h2', { text: 'What the check found' }), el('ul', { class: 'steps' }, tests.findings.map((finding) => el('li', {}, [
      mark(finding.severity === 'fail' ? 'failed' : 'waiting'),
      el('span', { class: 'step-text' }, [el('span', { text: finding.detail }), el('small', { text: [finding.gate, finding.code].filter(Boolean).join(' · ') })]),
    ]))))
  }
  parts.push(el('h2', { text: 'Evidence log' }), fileList([tests.evidenceLog]))
  $('tests').replaceChildren(...parts)
}

// ── Cost ─────────────────────────────────────────────────────────────────────
// Width through the CSSOM: the page's CSP forbids inline style attributes.
const bar = (percent) => {
  const node = el('span', { class: 'bar' })
  node.style.width = `${percent}%`
  return node
}
const drawCost = (v) => {
  const cost = v.cost
  if (cost.total.dispatches === 0) {
    $('cost').replaceChildren(el('p', { class: 'empty', text: 'No agent has run yet.' }))
    return
  }
  const amount = (entry) => (entry.eur ?? entry.usd ?? entry.credits ?? 0)
  const max = Math.max(...cost.byPhase.map(amount), 0)
  const note = [
    cost.eurPerUsd ? `Euros at ${cost.eurPerUsd} € per US dollar (SKRAFT_EUR_PER_USD).` : 'Set SKRAFT_EUR_PER_USD to see euros.',
    'GitHub Copilot reports AI credits (1 credit = 0.01 US dollar); Claude Code reports dollars.',
    cost.total.reported < cost.total.dispatches ? `${cost.total.dispatches - cost.total.reported} dispatch(es) reported no usage (a resumed run replays finished agents for free).` : null,
  ].filter(Boolean).join(' ')
  $('cost').replaceChildren(
    el('dl', { class: 'glance' }, [
      ['Total', moneyNode(cost.total)],
      ['Agents run', number(cost.total.dispatches)],
      ['Tokens in / out', `${tokens(cost.total.inputTokens)} / ${tokens(cost.total.outputTokens)}`],
      ['Agent time', duration(cost.total.durationMs) ?? '—'],
    ].map(([term, value]) => el('div', {}, [el('dt', { text: term }), el('dd', {}, value)]))),
    el('h2', { text: 'By phase' }),
    el('table', {}, [
      el('thead', {}, el('tr', {}, ['Phase', 'Cost', '', 'Agents', 'Tokens'].map((h, i) => el('th', { class: i >= 3 ? 'num' : null, text: h })))),
      el('tbody', {}, cost.byPhase.filter((entry) => entry.dispatches > 0).map((entry) => el('tr', {}, [
        el('td', { text: PHASE_LABEL[entry.phase] ?? entry.phase }),
        el('td', { text: money(entry) }),
        el('td', { class: 'bar-cell' }, bar(max > 0 ? Math.round((amount(entry) / max) * 100) : 0)),
        el('td', { class: 'num', text: number(entry.dispatches) }),
        el('td', { class: 'num', text: tokens(entry.inputTokens + entry.outputTokens) }),
      ]))),
    ]),
    el('h2', { text: 'Each agent' }),
    el('table', {}, [
      el('thead', {}, el('tr', {}, ['When', 'Phase', 'Agent', 'Time', 'Cost'].map((h) => el('th', { text: h })))),
      el('tbody', {}, [...cost.dispatches].reverse().map((d) => el('tr', {}, [
        el('td', { text: clock(d.at) }),
        el('td', { text: PHASE_LABEL[d.phase] ?? d.phase ?? '' }),
        el('td', { text: `${d.agent ? short(d.agent) : 'Report transport'}${d.role && d.role !== 'transport' ? ` (${d.role})` : ''}${d.ok ? '' : ', no answer'}` }),
        el('td', { text: duration(d.durationMs) ?? '' }),
        el('td', { text: d.usd === null && d.credits === null ? 'not reported' : money(d) }),
      ]))),
    ]),
    el('p', { class: 'note', text: note }),
  )
}

// ── Reports and journal ──────────────────────────────────────────────────────
const drawReports = (v) => {
  const { reports, publications, pending, destinations } = v.reporting
  const parts = []
  if (!destinations) parts.push(el('p', { class: 'empty', text: 'No destination confirmed: reports stay in the repository.' }))
  parts.push(reports.length === 0
    ? el('p', { class: 'empty', text: 'The forecast comes after Distill, the outcome after Deliver.' })
    : fileList(reports.map((r) => r.path)))
  if (publications.length > 0) {
    parts.push(el('table', {}, [
      el('thead', {}, el('tr', {}, ['', 'Report', 'Where', 'Status'].map((h) => el('th', { text: h })))),
      el('tbody', {}, publications.map((p) => el('tr', {}, [
        el('td', {}, mark(p.status === 'published' ? 'done' : 'waiting')),
        el('td', { text: p.kind }),
        el('td', {}, p.url ? el('a', { href: p.url, target: '_blank', rel: 'noopener noreferrer', text: `${p.destination} #${p.number ?? ''}` }) : `${p.destination} #${p.number ?? ''}`),
        el('td', { text: p.status }),
      ]))),
    ]))
  }
  if (pending) parts.push(el('p', { class: 'note', text: `The ${pending.kind} report for the ${pending.destination} is not published yet${pending.reason ? `: ${pending.reason}` : ''}. The next run tries again.` }))
  $('reports').replaceChildren(...parts)
}

const drawJournal = (v) => {
  $('decisions').replaceChildren(v.decisions.length === 0
    ? el('p', { class: 'empty', text: 'No answer recorded yet.' })
    : el('table', {}, [
      el('thead', {}, el('tr', {}, ['Checkpoint', 'Answer', 'When'].map((h) => el('th', { text: h })))),
      el('tbody', {}, v.decisions.map((d) => el('tr', {}, [
        el('td', {}, el('code', { class: 'path', text: d.key })),
        el('td', { text: d.answer }),
        el('td', { text: d.at ? new Date(d.at).toLocaleString() : '' }),
      ]))),
    ]))
  const lines = v.run?.log ?? []
  $('log').replaceChildren(...(lines.length === 0
    ? [el('li', { class: 'empty' }, el('span', { text: 'Nothing yet.' }))]
    : [...lines].reverse().map((line) => el('li', {}, [el('time', { datetime: line.at, text: clock(line.at) }), el('span', { text: line.message })]))))
}

// ── All of it ────────────────────────────────────────────────────────────────
// ── No pipeline chosen: the list to pick from ────────────────────────────────
const CHOOSER_WHY = {
  none: (branch) => `No pipeline yet${branch ? ` (branch ${branch})` : ''}.`,
  ambiguous: (branch) => (branch
    ? `None of these pipelines is on branch ${branch}, and none is active. Pick the one to follow.`
    : 'Several pipelines and none active. Pick the one to follow.'),
}
const choose = async (slug, button) => {
  button.disabled = true
  const response = await fetch('/api/select', { method: 'POST', headers, body: JSON.stringify({ slug }) })
  if (response.ok) return
  const note = $('chooser-note')
  note.hidden = false
  note.textContent = `Could not open ${slug}: ${(await response.json().catch(() => ({}))).error ?? response.status}`
  button.disabled = false
}
const pipelineState = (pipeline) => {
  if (pipeline.done) return ['done', 'done']
  const phase = pipeline.currentPhase ? PHASE_LABEL[pipeline.currentPhase] ?? pipeline.currentPhase : 'not started'
  const run = { running: 'running', 'awaiting-human': 'waiting for you', blocked: 'stopped', error: 'stopped' }[pipeline.runStatus]
  return [run ? `${phase} · ${run}` : phase, pipeline.runStatus === 'awaiting-human' ? 'waiting' : pipeline.runStatus === 'running' ? 'running' : 'pending']
}
const drawChooser = (next) => {
  $('slug').textContent = 'Skraft pipelines'
  $('story').textContent = next.branch ? `Branch ${next.branch}` : ''
  $('summary').textContent = next.pipelines.length ? `${next.pipelines.length} pipelines in this repository` : 'No pipeline yet'
  $('summary').dataset.tone = 'pending'
  $('chooser-why').textContent = (CHOOSER_WHY[next.reason] ?? CHOOSER_WHY.ambiguous)(next.branch)
  $('chooser-empty').hidden = next.pipelines.length > 0
  $('chooser-list').replaceChildren(...next.pipelines.map((pipeline) => {
    const [state, tone] = pipelineState(pipeline)
    const story = pipeline.story ? [pipeline.story.issue ? `#${pipeline.story.issue}` : null, pipeline.story.title].filter(Boolean).join(' ') : ''
    const facts = [pipeline.branch ?? pipeline.reportingBranch, pipeline.updatedAt ? ago(pipeline.updatedAt) : null].filter(Boolean).join(' · ')
    return el('li', {}, [el('button', { type: 'button', class: 'pipeline-choice', onclick: (event) => choose(pipeline.slug, event.currentTarget) }, [
      el('span', { class: 'choice-slug', text: pipeline.slug }),
      el('span', { class: 'choice-state', data: { tone }, text: state }),
      story ? el('span', { class: 'choice-story', text: story }) : null,
      facts ? el('span', { class: 'choice-facts', text: facts }) : null,
    ].filter(Boolean))])
  }))
}

const draw = (next) => {
  view = next
  $('chooser').hidden = !next.chooser
  $('pipeline').hidden = Boolean(next.chooser)
  if (next.chooser) {
    drawChooser(next)
    $('freshness').textContent = ''
    return
  }
  $('slug').textContent = `Skraft · ${next.slug}`
  const story = next.story
  $('story').textContent = story ? [story.issue ? `#${story.issue}` : null, story.title].filter(Boolean).join(' ') : ''
  const [text, tone] = summaryOf(next)
  $('summary').textContent = text
  $('summary').dataset.tone = tone
  drawTrack(next)
  $('ask-resume').hidden = next.done
  drawQuestion(next)
  drawGlance(next)
  drawOverviewSteps(next)
  drawPhases(next)
  drawTests(next)
  drawCost(next)
  drawReports(next)
  drawJournal(next)
  badge('badge-overview', next.checkpoint && !next.checkpoint.answered ? '1' : '', 'waiting')
  badge('badge-tests', next.tests.verdict ? (next.tests.verdict === 'pass' ? '✓' : '✕') : '', testsTone(next.tests))
  badge('badge-cost', next.cost.total.reported > 0 ? money({ ...next.cost.total, credits: next.cost.total.eur !== null || next.cost.total.usd !== null ? null : next.cost.total.credits }) : '', null)
  tick()
}

const tick = () => {
  if (view?.chooser) return
  $('freshness').textContent = view?.run?.updatedAt ? `Last activity ${ago(view.run.updatedAt)}` : ''
}

// ── Acting ───────────────────────────────────────────────────────────────────
const decide = async (key, answer) => {
  const note = $('question-note')
  note.hidden = false
  note.textContent = 'Recording…'
  const response = await fetch('/api/decide', { method: 'POST', headers, body: JSON.stringify({ key, answer }) })
  const body = await response.json().catch(() => ({}))
  note.textContent = response.ok ? `Recorded "${answer}". Resume the run to let the pipeline read it.` : `Not recorded: ${body.error ?? response.status}`
}

const ask = async (intent, button) => {
  const note = $('ask-note')
  button.disabled = true
  const response = await fetch('/api/ask', { method: 'POST', headers, body: JSON.stringify({ intent }) })
  note.hidden = false
  note.textContent = response.ok ? 'Sent to the chat.' : 'The chat did not take the request; ask Copilot directly.'
  button.disabled = false
}

$('question-form').addEventListener('submit', (event) => {
  event.preventDefault()
  const answer = $('question-free').value.trim()
  if (answer && view?.checkpoint) decide(view.checkpoint.key, answer)
})
$('ask-resume').addEventListener('click', (event) => ask('resume', event.currentTarget))
$('ask-explain').addEventListener('click', (event) => ask('explain', event.currentTarget))
$('viewer-close').addEventListener('click', () => $('viewer').close())

// ── Live ─────────────────────────────────────────────────────────────────────
selectTab(location.hash.slice(1) || remembered() || 'overview')
const events = new EventSource(`/api/events?token=${encodeURIComponent(token)}`)
events.addEventListener('view', (event) => draw(JSON.parse(event.data)))
events.addEventListener('focus', (event) => showPhase(JSON.parse(event.data).phase))
events.onerror = () => { $('freshness').textContent = 'Connection lost, retrying…' }
setInterval(tick, 5000)
