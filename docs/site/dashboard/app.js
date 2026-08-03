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

const REPOSITORY = 'https://github.com/SebastienDegodez/skraft-plugin'

const escapeHtml = (value = '') =>
  String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])

const badge = (state, text = state) => `<span class="badge ${escapeHtml(state)}">${escapeHtml(text)}</span>`

const sparkline = (entries) => {
  if (!entries.length) return ''
  const bars = entries
    .slice(-5)
    .map((entry) => {
      const height = Math.max(5, Math.round(Math.abs(entry.netWin ?? 0) * 20 + 6))
      return `<i class="${escapeHtml(entry.state)}" style="height:${height}px" title="${escapeHtml(entry.state)}: ${escapeHtml(entry.reason)}"></i>`
    })
    .join('')
  return `<div class="spark" title="Last ${Math.min(entries.length, 5)} evaluation(s)">${bars}</div>`
}

const sourceUrl = (file) => `${REPOSITORY}/blob/main/${file}`

let data

const renderSummary = () => {
  const evaluated = data.skills.filter((skill) => skill.evaluation.path).length
  const withEvidence = data.skills.filter((skill) => (data.history[skill.directory] ?? []).length).length
  const agentTotal = data.summary.agents + data.summary.workers + data.summary.lenses

  const metrics = [
    [data.summary.skills, 'Distributed skills'],
    [agentTotal, 'Agents, workers and review lenses'],
    [`${evaluated}/${data.summary.skills}`, 'Skills with an evaluation spec'],
    [withEvidence, 'Skills with published runtime evidence'],
  ]
  summaryNode.innerHTML = metrics
    .map(([value, label]) => `<article class="metric"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></article>`)
    .join('')
}

const skillRow = (skill) => {
  const history = data.history[skill.directory] ?? []
  const latest = history.at(-1)
  const evidence = latest
    ? latest.url
      ? `<a href="${escapeHtml(latest.url)}" aria-label="Open the evaluation run">${badge(latest.state)}</a>`
      : badge(latest.state)
    : badge(skill.evaluation.path ? 'no-data' : 'no-eval', skill.evaluation.path ? 'No runtime data' : 'No eval')

  return `<tr>
    <td data-label="Skill">
      <div class="item-name"><a href="${escapeHtml(sourceUrl(skill.path))}">${escapeHtml(skill.name)}</a></div>
      <div class="item-description">${escapeHtml(skill.description || 'No description available')}</div>
    </td>
    <td data-label="Profile"><div class="profile">${escapeHtml(skill.profile.tier)} · ~${escapeHtml(skill.profile.estimatedTokens)} tokens · ${escapeHtml(skill.profile.lineCount)} lines</div></td>
    <td data-label="Evaluation"><div class="profile">${skill.evaluation.path ? `${escapeHtml(skill.evaluation.stimuli)} stimuli · ${escapeHtml(skill.evaluation.trials)} trials` : '—'}</div></td>
    <td data-label="Evidence">${evidence}${latest ? `<div class="profile">${escapeHtml(latest.reason)}</div>` : ''}</td>
    <td data-label="Trend">${sparkline(history)}</td>
  </tr>`
}

const agentRow = (agent) => `<tr>
    <td data-label="Agent">
      <div class="item-name"><a href="${escapeHtml(sourceUrl(agent.path))}">${escapeHtml(agent.name)}</a></div>
      <div class="item-description">${escapeHtml(agent.description || 'No description available')}</div>
    </td>
    <td data-label="Kind">${badge('neutral', agent.kind)}</td>
    <td data-label="Model"><div class="profile">${escapeHtml(agent.model ?? 'inherited')}</div></td>
    <td data-label="Invocable"><div class="profile">${agent.userInvocable ? 'user invocable' : 'internal subagent'}</div></td>
  </tr>`

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
          <div class="family-actions"><a class="button" href="${escapeHtml(REPOSITORY)}/tree/main/plugins/skills">Browse sources</a></div>
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
          <div class="family-actions"><a class="button" href="${escapeHtml(REPOSITORY)}/tree/main/plugins/agents">Browse sources</a></div>
        </header>
        <table class="rows">
          <thead><tr><th>Agent</th><th>Kind</th><th>Model</th><th>Invocation</th></tr></thead>
          <tbody>${agents.map(agentRow).join('')}</tbody>
        </table>
      </article>`)
  }
  catalogNode.innerHTML = families.join('')
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

const showReplay = async () => {
  const manifest = data.sources?.replayManifest
  const replay = data.sources?.replay
  if (!manifest || !replay) return
  try {
    const response = await fetch(manifest, { cache: 'no-store' })
    if (!response.ok) return
    const { sessions = [] } = await response.json()
    if (!sessions.length) return
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
    data.history = history.skills ?? data.history
  })

  renderSummary()
  render()
  searchNode.addEventListener('input', render)
  await showReplay()
} catch (error) {
  statusNode.textContent = 'Dashboard data could not be loaded.'
  catalogNode.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`
}
