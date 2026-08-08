// SKRAFT quality dashboard.
//
// Two data sources, deliberately decoupled:
//   • data/dashboard.json — the catalogue, derived from the plugin sources when
//     the site is built, so it can never drift from what is shipped;
//   • the `dashboard-data` branch — evaluation evidence and recorded agent
//     sessions, refreshed by evaluation runs without rebuilding the site.
//
// A skill with no runtime evidence is shown as such. No data is not a pass.

const summaryNode = document.querySelector('#summary')
const catalogNode = document.querySelector('#catalog')
const statusNode = document.querySelector('#status')
const searchNode = document.querySelector('#search')
const replayCallout = document.querySelector('#replay-callout')
const replayLink = document.querySelector('#replay-link')
const qualityGrid = document.querySelector('#quality-grid')
const efficiencyGrid = document.querySelector('#efficiency-grid')
const tabs = [...document.querySelectorAll('.tab')]

const escapeHtml = (value = '') =>
  String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])

const badge = (state, text = state) => `<span class="badge ${escapeHtml(state)}">${escapeHtml(text)}</span>`

// The judged score of the skilled variant, with the interval around it. Shown
// only when the run actually reported one — an absent score is left absent.
const score = (entry) => {
  if (entry?.meanScore == null) return ''
  const { low, high } = entry.confidenceInterval ?? {}
  const interval = low == null || high == null ? '' : ` (${low.toFixed(2)}–${high.toFixed(2)})`
  return `<div class="profile">score ${escapeHtml(entry.meanScore.toFixed(2))}${escapeHtml(interval)}</div>`
}

const number = (value, digits = 2) => (value == null ? '—' : Number(value).toLocaleString('en-US', { maximumFractionDigits: digits }))
const percent = (value) => (value == null ? '—' : `${value > 0 ? '+' : ''}${number(value, 1)}%`)
const deltaClass = (value, inverse = false) => {
  if (value == null || value === 0) return 'neutral'
  const positive = inverse ? value < 0 : value > 0
  return positive ? 'positive' : 'negative'
}

// One bar per recorded evaluation, oldest to newest (last 5). Each bar sits in
// a full-height track so a single run still reads as a chart, its colour is the
// verdict and its fill is how decisive that verdict was. A floor keeps every
// bar legible: a near-zero net win must still be visible, not a hairline.
const sparkline = (entries) => {
  if (!entries.length) return '<span class="spark-label">No run yet</span>'
  const recent = entries.slice(-5)
  const bars = recent
    .map((entry) => {
      const netWin = entry.netWin ?? 0
      const fill = Math.round(38 + Math.min(1, Math.abs(netWin)) * 62)
      const title = `${entry.state} — ${entry.model} — net win ${netWin > 0 ? '+' : ''}${netWin.toFixed(2)} over ${entry.trialCount ?? 0} trial(s): ${entry.reason}`
      return `<span class="spark-slot" title="${escapeHtml(title)}"><i class="${escapeHtml(entry.state)}" style="height:${fill}%"></i></span>`
    })
    .join('')
  return `<div class="spark-wrap">
    <div class="spark">${bars}</div>
    <span class="spark-label">${recent.length} run${recent.length === 1 ? '' : 's'}</span>
  </div>`
}

let data
const repositoryUrl = () => `https://github.com/${data.repository}`
const sourceUrl = (file) => `${repositoryUrl()}/blob/main/${file}`

const renderSummary = () => {
  const evaluated = data.skills.filter((skill) => skill.evaluation.path).length
  const withEvidence =
    data.skills.filter((skill) => (data.history[skill.directory] ?? []).length).length +
    data.agents.filter((agent) => (data.agentHistory[agent.id] ?? []).length).length
  const agentTotal = data.summary.agents + data.summary.workers + data.summary.lenses

  const metrics = [
    [data.summary.skills, 'Distributed skills'],
    [agentTotal, 'Agents, workers and review lenses'],
    [`${evaluated}/${data.summary.skills}`, 'Skills with an evaluation spec'],
    [withEvidence, 'Subjects with published runtime evidence'],
  ]
  summaryNode.innerHTML = metrics
    .map(([value, label]) => `<article class="metric"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></article>`)
    .join('')
}

const metricBar = (label, baseline, skilled, formatter = number) => {
  const max = Math.max(Number(baseline ?? 0), Number(skilled ?? 0), 1)
  return `<div class="comparison-row">
    <div class="comparison-label">${escapeHtml(label)}</div>
    <div class="bar-pair">
      <div class="bar-line"><span>Baseline</span><i class="baseline" style="width:${Math.max(2, (Number(baseline ?? 0) / max) * 100)}%"></i><strong>${escapeHtml(formatter(baseline))}</strong></div>
      <div class="bar-line"><span>Skilled</span><i class="skilled" style="width:${Math.max(2, (Number(skilled ?? 0) / max) * 100)}%"></i><strong>${escapeHtml(formatter(skilled))}</strong></div>
    </div>
  </div>`
}

const evidenceEntries = () => data.skills
  .map((skill) => ({ skill, history: data.history[skill.directory] ?? [] }))
  .map(({ skill, history }) => ({ skill, history, latest: history.at(-1) }))
  .filter(({ latest }) => latest?.metrics)

const renderQuality = () => {
  const entries = evidenceEntries()
  if (!entries.length) {
    qualityGrid.innerHTML = '<div class="empty">No aggregate quality evidence published yet.</div>'
    return
  }

  qualityGrid.innerHTML = entries.map(({ skill, latest }) => {
    const quality = latest.metrics.quality ?? {}
    const activation = latest.metrics.activation ?? {}
    const activationRate = activation.rate == null ? null : activation.rate * 100
    return `<article class="evidence-card">
      <header>
        <div><p class="eyebrow">${escapeHtml(latest.model)}</p><h3>${escapeHtml(skill.name)}</h3></div>
        ${badge(latest.state)}
      </header>
      <div class="score-strip">
        <div><span>Baseline</span><strong>${number(quality.baseline, 3)}</strong></div>
        <div><span>Skilled</span><strong>${number(quality.skilled, 3)}</strong></div>
        <div><span>Lift</span><strong class="${deltaClass(quality.delta)}">${quality.delta > 0 ? '+' : ''}${number(quality.delta, 3)}</strong></div>
      </div>
      ${metricBar('Rubric score', quality.baseline, quality.skilled, (value) => number(value, 3))}
      <div class="activation">
        <div><span>Expected activations</span><strong>${number(activation.expected, 0)}</strong></div>
        <div><span>Observed</span><strong>${number(activation.actual, 0)}</strong></div>
        <div><span>Unexpected</span><strong class="${activation.unexpected ? 'negative' : 'positive'}">${number(activation.unexpected, 0)}</strong></div>
        <div><span>Activation rate</span><strong>${number(activationRate, 1)}%</strong></div>
      </div>
      <p class="card-note">${escapeHtml(latest.reason)}</p>
    </article>`
  }).join('')
}

const renderEfficiency = () => {
  const entries = evidenceEntries()
  if (!entries.length) {
    efficiencyGrid.innerHTML = '<div class="empty">No aggregate efficiency evidence published yet.</div>'
    return
  }

  efficiencyGrid.innerHTML = entries.map(({ skill, latest }) => {
    const efficiency = latest.metrics.efficiency ?? {}
    const baseline = efficiency.baseline ?? {}
    const skilled = efficiency.skilled ?? {}
    return `<article class="evidence-card">
      <header>
        <div><p class="eyebrow">Median per trial</p><h3>${escapeHtml(skill.name)}</h3></div>
        <div class="delta-stack">
          <span class="${deltaClass(efficiency.tokenDeltaPercent, true)}">${percent(efficiency.tokenDeltaPercent)} tokens</span>
          <span class="${deltaClass(efficiency.durationDeltaPercent, true)}">${percent(efficiency.durationDeltaPercent)} time</span>
        </div>
      </header>
      ${metricBar('Duration', baseline.durationMs, skilled.durationMs, (value) => value == null ? '—' : `${number(value / 1000, 1)}s`)}
      ${metricBar('Tokens', baseline.tokens, skilled.tokens, (value) => number(value, 0))}
      ${metricBar('Turns', baseline.turns, skilled.turns, (value) => number(value, 1))}
      ${metricBar('Tool calls', baseline.toolCalls, skilled.toolCalls, (value) => number(value, 1))}
    </article>`
  }).join('')
}

// Evidence cell shared by skills and agents: the verdict badge, why it was
// reached, and the judged score when the run reported one.
const evidenceCell = (history, hasSpec) => {
  const latest = history.at(-1)
  if (!latest) return badge(hasSpec ? 'no-data' : 'no-eval', hasSpec ? 'No runtime data' : 'Not evaluated')
  // Only a real, followable URL (e.g. a CI run) is worth linking — a local
  // placeholder is not a page the browser can navigate to.
  const verdict = /^https?:\/\//.test(latest.url ?? '')
    ? `<a href="${escapeHtml(latest.url)}" aria-label="Open the evaluation run">${badge(latest.state)}</a>`
    : badge(latest.state)
  return `${verdict}<div class="profile">${escapeHtml(latest.reason)}</div>${score(latest)}`
}

const skillRow = (skill) => {
  const history = data.history[skill.directory] ?? []

  return `<tr>
    <td data-label="Skill">
      <div class="item-name"><a href="${escapeHtml(sourceUrl(skill.path))}">${escapeHtml(skill.name)}</a></div>
      <div class="item-description">${escapeHtml(skill.description || 'No description available')}</div>
    </td>
    <td data-label="Profile"><div class="profile">${escapeHtml(skill.profile.tier)} · ~${escapeHtml(skill.profile.estimatedTokens)} tokens · ${escapeHtml(skill.profile.lineCount)} lines</div></td>
    <td data-label="Evaluation"><div class="profile">${skill.evaluation.path ? `${escapeHtml(skill.evaluation.stimuli)} stimuli · ${escapeHtml(skill.evaluation.trials)} trials` : '—'}</div></td>
    <td data-label="Evidence">${evidenceCell(history, Boolean(skill.evaluation.path))}</td>
    <td data-label="Trend">${sparkline(history)}</td>
  </tr>`
}

const agentRow = (agent) => {
  const history = data.agentHistory[agent.id] ?? []

  return `<tr>
    <td data-label="Agent">
      <div class="item-name"><a href="${escapeHtml(sourceUrl(agent.path))}">${escapeHtml(agent.name)}</a></div>
      <div class="item-description">${escapeHtml(agent.description || 'No description available')}</div>
    </td>
    <td data-label="Kind">${badge('neutral', agent.kind)}</td>
    <td data-label="Model"><div class="profile">${escapeHtml(agent.model ?? 'inherited')}</div></td>
    <td data-label="Evidence">${evidenceCell(history, false)}</td>
    <td data-label="Trend">${sparkline(history)}</td>
  </tr>`
}

const matches = (query, ...fields) => fields.join(' ').toLowerCase().includes(query)

const render = () => {
  const query = searchNode.value.trim().toLowerCase()
  const skills = data.skills.filter((skill) => matches(query, skill.name, skill.description, skill.profile.tier))
  const agents = data.agents.filter((agent) => matches(query, agent.name, agent.description, agent.kind))

  statusNode.textContent = `${skills.length} skill${skills.length === 1 ? '' : 's'} and ${agents.length} agent${agents.length === 1 ? '' : 's'} shown`
  if (!skills.length && !agents.length) {
    catalogNode.innerHTML = '<div class="empty">Nothing in the catalogue matches this search.</div>'
    return
  }

  const families = []
  if (skills.length) {
    families.push(`
      <article class="family">
        <header class="family-header">
          <div>
            <p class="eyebrow">${escapeHtml(data.plugin.name)} · version ${escapeHtml(data.plugin.version)}</p>
            <h3>Skills</h3>
            <p>Craft knowledge an agent loads on demand. The profile is its context cost; the evidence is what a controlled run proved.</p>
          </div>
          <div class="family-actions"><a class="button" href="${escapeHtml(repositoryUrl())}/tree/main/plugins/skraft-framework/skills">Browse sources</a></div>
        </header>
        <table class="rows">
          <thead><tr><th>Skill</th><th>Profile</th><th>Evaluation</th><th>Evidence</th><th>Trend</th></tr></thead>
          <tbody>${skills.map(skillRow).join('')}</tbody>
        </table>
      </article>`)
  }
  if (agents.length) {
    families.push(`
      <article class="family">
        <header class="family-header">
          <div>
            <p class="eyebrow">Orchestration</p>
            <h3>Agents, workers and review lenses</h3>
            <p>Who runs the pipeline, which sub-agents they fan out to, and which lenses review the result.</p>
          </div>
          <div class="family-actions"><a class="button" href="${escapeHtml(repositoryUrl())}/tree/main/plugins/skraft-framework/agents">Browse sources</a></div>
        </header>
        <table class="rows">
          <thead><tr><th>Agent</th><th>Kind</th><th>Model</th><th>Evidence</th><th>Trend</th></tr></thead>
          <tbody>${agents.map(agentRow).join('')}</tbody>
        </table>
      </article>`)
  }
  catalogNode.innerHTML = families.join('')
}

const switchPanel = (name) => {
  tabs.forEach((tab) => {
    const active = tab.dataset.panel === name
    tab.classList.toggle('active', active)
    tab.setAttribute('aria-selected', String(active))
  })
  document.querySelectorAll('.panel').forEach((panel) => panel.classList.toggle('active', panel.id === `panel-${name}`))
}

// Evidence is published independently of the site: refresh it from the data
// branch when it is reachable, and fall back to whatever was inlined at build
// time otherwise.
const refresh = async (url, onLoaded) => {
  if (!url) return
  try {
    const response = await fetch(url, { cache: 'no-store' })
    if (response.ok) onLoaded(await response.json())
  } catch {
    // Offline, or the data branch does not exist yet — keep the inlined data.
  }
}

// Per subject, keep whichever side has the freshest entry. A run inlined at
// build time (e.g. a local preview of a not-yet-published evaluation) must
// survive a successful fetch of an older published history — the remote
// branch not knowing about it yet is not a reason to hide it.
const mergeHistoryBucket = (local = {}, remote = {}) => {
  const merged = { ...local }
  for (const [subject, remoteEntries] of Object.entries(remote)) {
    const localEntries = local[subject]
    const remoteLatest = remoteEntries.at(-1)?.timestamp ?? ''
    const localLatest = localEntries?.at(-1)?.timestamp ?? ''
    if (!localEntries || remoteLatest > localLatest) merged[subject] = remoteEntries
  }
  return merged
}

const showReplay = async () => {
  const manifest = data.sources?.replayManifest
  const replay = data.sources?.replay
  if (!manifest || !replay) return
  try {
    const response = await fetch(manifest, { cache: 'no-store' })
    if (!response.ok) return
    const { sessions = [] } = await response.json()
    if (!sessions.length) return
    // The replay app is built into the site at deploy time, so it is absent
    // from a local preview. Offering a link that leads nowhere is worse than
    // offering none: check it resolves before showing the entry point.
    const available = await fetch(replay, { method: 'HEAD', cache: 'no-store' })
      .then((probe) => probe.ok)
      .catch(() => false)
    if (!available) return
    replayLink.href = `${replay}?manifest=${encodeURIComponent(manifest)}`
    replayCallout.hidden = false
  } catch {
    // No recorded session yet — the replay entry point stays hidden.
  }
}

try {
  const response = await fetch('data/dashboard.json', { cache: 'no-store' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  data = await response.json()

  await refresh(data.sources?.history, (history) => {
    data.history = mergeHistoryBucket(data.history, history.skills)
    data.agentHistory = mergeHistoryBucket(data.agentHistory, history.agents)
  })

  renderSummary()
  render()
  renderQuality()
  renderEfficiency()
  searchNode.addEventListener('input', render)
  tabs.forEach((tab) => tab.addEventListener('click', () => switchPanel(tab.dataset.panel)))
  await showReplay()
} catch (error) {
  statusNode.textContent = 'Dashboard data could not be loaded.'
  catalogNode.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`
}
