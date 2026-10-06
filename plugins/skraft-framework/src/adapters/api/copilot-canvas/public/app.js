// Skraft pipeline canvas page. Draws the view the local server streams (/api/events) and
// sends the human's answer (/api/decide). Every value comes from repository files the
// agents wrote: it is set as text, never as HTML.

const params = new URLSearchParams(location.search)
const token = params.get('token') ?? ''
const headers = { 'x-skraft-token': token, 'Content-Type': 'application/json' }
const $ = (id) => document.getElementById(id)

const PHASE_LABEL = { RESEARCH: 'Research', DESIGN: 'Design', DISTILL: 'Distill', DELIVER: 'Deliver' }
const STATUS_LABEL = {
  done: 'Done',
  active: 'Running',
  awaiting: 'Waiting for you',
  blocked: 'Stopped',
  open: 'Open, no run in progress',
  pending: 'Not reached',
}
const VERDICT_LABEL = { APPROVED: 'approved', NEEDS_REWORK: 'needs rework', REJECTED: 'rejected', CHANGES_REQUESTED: 'changes requested' }

const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (key === 'text') node.textContent = value
    else if (key === 'data') Object.assign(node.dataset, value)
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value)
    else node.setAttribute(key, value)
  }
  for (const child of [].concat(children)) if (child) node.append(child)
  return node
}

const duration = (ms) => {
  if (ms === null || ms === undefined) return null
  const minutes = Math.round(ms / 60000)
  if (minutes < 1) return 'under a minute'
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
}
const clock = (iso) => {
  const date = new Date(iso)
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
const ago = (iso) => {
  const seconds = Math.round((Date.now() - Date.parse(iso)) / 1000)
  if (!Number.isFinite(seconds)) return ''
  if (seconds < 60) return `${seconds} s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`
  return `${Math.round(seconds / 3600)} h ago`
}

let view = null

// ── Reading files ─────────────────────────────────────────────────────────────
const openFile = async (path) => {
  const response = await fetch(`/api/file?path=${encodeURIComponent(path)}`, { headers })
  $('viewer-title').textContent = path
  $('viewer-text').textContent = response.ok ? await response.text() : 'This file is not available any more.'
  $('viewer').showModal()
}
const fileList = (paths, verdicts = {}) => (paths.length === 0
  ? el('p', { class: 'empty', text: 'None yet.' })
  : el('ul', { class: 'files' }, paths.map((path) => el('li', {}, [
    el('button', { type: 'button', text: path, title: `Open ${path}`, onclick: () => openFile(path) }),
    verdicts[path] ? el('span', { class: 'verdict', data: { verdict: verdicts[path] }, text: VERDICT_LABEL[verdicts[path]] ?? verdicts[path] }) : null,
  ]))))

// ── Drawing ──────────────────────────────────────────────────────────────────
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

const drawTrack = (v) => {
  $('track').replaceChildren(...v.phases.map((phase) => el('li', { class: 'stage', data: { status: phase.status } }, [
    el('button', {
      type: 'button',
      'aria-label': `${PHASE_LABEL[phase.name]}: ${STATUS_LABEL[phase.status]}`,
      onclick: () => showPhase(phase.name),
    }, [
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

const drawQuestion = (v) => {
  const question = $('question')
  const checkpoint = v.checkpoint
  question.hidden = !checkpoint
  if (!checkpoint) return
  $('question-text').textContent = checkpoint.question
  $('question-key').replaceChildren('Checkpoint ', el('code', { text: checkpoint.key }))
  const answered = checkpoint.answered
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

const drawPhases = (v) => {
  const open = new Set([...document.querySelectorAll('details.phase[open]')].map((d) => d.dataset.phase))
  $('phases').replaceChildren(...v.phases.map((phase) => {
    const verdicts = Object.fromEntries(phase.reviews.map((r) => [r.path, r.verdict]))
    const facts = [
      ['Specialist', phase.specialist],
      ['Reviewer', phase.reviewer ?? 'none — the phase closes after its specialist'],
      ['Attempt', phase.status === 'pending' ? null : `${phase.attempt} of ${phase.maxAttempts}`],
      ['Verdict', phase.verdict ? (VERDICT_LABEL[phase.verdict] ?? phase.verdict) : null],
      ['Manual reworks', phase.reworks ? `${phase.reworks} (${phase.findingsResolved} findings fixed)` : null],
      ['Started', phase.startedAt ? new Date(phase.startedAt).toLocaleString() : null],
      ['Time spent', duration(phase.durationMs)],
      ['Base commit', phase.baseSha ? phase.baseSha.slice(0, 12) : null],
    ].filter(([, value]) => value)
    const details = el('details', { class: 'phase', id: `phase-${phase.name}`, data: { phase: phase.name } }, [
      el('summary', {}, [
        el('strong', { text: PHASE_LABEL[phase.name] ?? phase.name }),
        el('span', { class: 'state', data: { status: phase.status }, text: STATUS_LABEL[phase.status] }),
      ]),
      el('dl', { class: 'facts' }, facts.flatMap(([term, value]) => [el('dt', { text: term }), el('dd', { text: value })])),
      el('h3', { class: 'empty', text: 'Reviews' }),
      fileList(phase.reviews.map((r) => r.path), verdicts),
      el('h3', { class: 'empty', text: 'Artefacts' }),
      fileList(phase.artifacts.filter((path) => /\.(md|json)$/.test(path)), {}),
    ])
    if (open.has(phase.name) || (open.size === 0 && ['active', 'awaiting', 'blocked', 'open'].includes(phase.status))) details.open = true
    return details
  }))
}

const drawReports = (v) => {
  const { reports, publications, pending, destinations } = v.reporting
  const parts = []
  if (!destinations) parts.push(el('p', { class: 'empty', text: 'No destination confirmed: reports stay in the repository.' }))
  parts.push(reports.length === 0
    ? el('p', { class: 'empty', text: 'The forecast comes after Distill, the outcome after Deliver.' })
    : fileList(reports.map((r) => r.path)))
  if (publications.length > 0) {
    parts.push(el('table', {}, [
      el('thead', {}, el('tr', {}, ['Report', 'Where', 'Status'].map((h) => el('th', { text: h })))),
      el('tbody', {}, publications.map((p) => el('tr', {}, [
        el('td', { text: p.kind }),
        el('td', {}, p.url ? el('a', { href: p.url, target: '_blank', rel: 'noopener noreferrer', text: `${p.destination} #${p.number ?? ''}` }) : `${p.destination} #${p.number ?? ''}`),
        el('td', { text: p.status }),
      ]))),
    ]))
  }
  if (pending) parts.push(el('p', { class: 'note', text: `The ${pending.kind} report for the ${pending.destination} is not published yet${pending.reason ? `: ${pending.reason}` : ''}. The next run tries again.` }))
  $('reports').replaceChildren(...parts)
}

const drawDecisions = (v) => {
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
}

const drawLog = (v) => {
  const lines = v.run?.log ?? []
  $('log').replaceChildren(...(lines.length === 0
    ? [el('li', { class: 'empty' }, el('span', { text: 'Nothing yet.' }))]
    : [...lines].reverse().map((line) => el('li', {}, [el('time', { datetime: line.at, text: clock(line.at) }), el('span', { text: line.message })]))))
}

const draw = (next) => {
  view = next
  $('slug').textContent = `Skraft · ${next.slug}`
  const story = next.story
  $('story').textContent = story ? [story.issue ? `#${story.issue}` : null, story.title].filter(Boolean).join(' ') : ''
  const [text, tone] = summaryOf(next)
  $('summary').textContent = text
  $('summary').dataset.tone = tone
  drawTrack(next)
  drawQuestion(next)
  drawPhases(next)
  drawReports(next)
  drawDecisions(next)
  drawLog(next)
  tick()
}

const tick = () => {
  $('freshness').textContent = view?.run?.updatedAt ? `Last activity ${ago(view.run.updatedAt)}` : ''
}

const showPhase = (phase) => {
  const details = $(`phase-${phase}`)
  if (!details) return
  details.open = true
  details.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
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
const connect = () => {
  const events = new EventSource(`/api/events?token=${encodeURIComponent(token)}`)
  events.addEventListener('view', (event) => draw(JSON.parse(event.data)))
  events.addEventListener('focus', (event) => showPhase(JSON.parse(event.data).phase))
  events.onerror = () => {
    $('freshness').textContent = 'Connection lost — retrying…'
  }
}
connect()
setInterval(tick, 5000)
