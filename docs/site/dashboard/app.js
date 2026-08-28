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
const modelGrid = document.querySelector('#model-grid')
const topologyNode = document.querySelector('#topology')
const tabs = [...document.querySelectorAll('.tab')]
const modelFilterNode = document.querySelector('#model-filter')
const clearFiltersNode = document.querySelector('#clear-filters')
const lang = document.body.dataset.lang === 'fr' ? 'fr' : 'en'
const dashboardBase = document.body.dataset.dashboardBase || './'

const messages = {
  en: {
    skills: 'Distributed skills', agents: 'Agents, workers and review lenses', evaluated: 'Skills with an evaluation spec', evidence: 'Subjects with published runtime evidence',
    skillsHint: 'Everything an agent can load on demand.', agentsHint: 'Every orchestrator, specialist, worker and review lens.', evaluatedHint: 'Skills covered by repeatable controlled trials.', evidenceHint: 'Skills and agents with published execution data.',
    optional: 'optional', required: 'engineering entrypoint', roots: 'Independent roots', product: 'Product preflight', engineering: 'Engineering pipeline', specialist: 'Specialist', reviewer: 'Reviewer',
    shown: (skills, agents) => `${skills} skill${skills === 1 ? '' : 's'} and ${agents} agent${agents === 1 ? '' : 's'} shown`,
    noMatch: 'Nothing in the catalogue matches this search.', loadingError: 'Dashboard data could not be loaded.',
    score: 'score', netWin: 'net win', overTrials: (count) => `over ${count} paired trial${count === 1 ? '' : 's'}`, runs: (count) => `${count} run${count === 1 ? '' : 's'}`, noRun: 'No run yet',
    baseline: 'Baseline', skilled: 'Skilled', model: 'Model', verdict: 'Verdict', lift: 'Lift', activation: 'Activation', tokens: 'Tokens', time: 'Time', duration: 'Duration', turns: 'Turns', toolCalls: 'Tool calls', rubricScore: 'Rubric score',
    expectedActivations: 'Expected activations', observed: 'Observed', unexpected: 'Unexpected', activationRate: 'Activation rate', medianPerTrial: 'Median per trial',
    agentModelsJudged: (count, judge) => `${count} agent model${count === 1 ? '' : 's'} · judged by ${judge}`,
    sameCohort: 'Same skill and stimuli, one arm per agent model. Compare these models here because the same judge scored them.',
    noModels: 'No model comparison matches these filters. At least two agent models for the same skill and judge are needed.',
    noQuality: 'No quality evidence matches these filters.', noEfficiency: 'No efficiency evidence matches these filters.',
    highestScore: 'highest score', judge: (model) => `Judged by ${model}`, pairedResult: (wins, ties, losses) => `${wins} wins · ${ties} ties · ${losses} losses`,
    noRuntimeData: 'No runtime data', notEvaluated: 'Not evaluated', openRun: 'Open the evaluation run', noDescription: 'No description available', inherited: 'inherited',
    skill: 'Skill', profile: 'Profile', evaluation: 'Evaluation', evidenceColumn: 'Evidence', trend: 'Trend', agent: 'Agent', kind: 'Kind',
    stimuliTrials: (stimuli, trials) => `${stimuli} stimuli · ${trials} trials`, profileValue: (tier, tokens, lines) => `${tier} · ~${tokens} tokens · ${lines} lines`,
    skillsTitle: 'Skills', skillsDescription: 'Craft knowledge an agent loads on demand. The profile is its context cost; the evidence is what controlled runs proved.',
    orchestration: 'Orchestration', agentsTitle: 'Agents, workers and review lenses', agentsDescription: 'Who runs the pipeline, which sub-agents they fan out to, and which lenses review the result.', browseSources: 'Browse sources',
    zoomQuality: 'View quality', zoomEfficiency: 'View efficiency', zoomModels: 'Compare models',
    allModels: 'All evaluated models',
    states: { pass: 'pass', regression: 'regression', inconclusive: 'inconclusive', 'no-improvement': 'no improvement', 'no-data': 'no data', 'no-eval': 'not evaluated', neutral: 'neutral' },
  },
  fr: {
    skills: 'Skills distribués', agents: 'Agents, workers et lentilles de revue', evaluated: "Skills avec une spec d'évaluation", evidence: "Sujets avec preuves d'exécution publiées",
    skillsHint: "Tout ce qu'un agent peut charger à la demande.", agentsHint: 'Chaque orchestrateur, spécialiste, worker et lentille de revue.', evaluatedHint: 'Skills couverts par des essais contrôlés reproductibles.', evidenceHint: "Skills et agents disposant de données d'exécution publiées.",
    optional: 'optionnel', required: "point d'entrée ingénierie", roots: 'Racines indépendantes', product: 'Préparation produit', engineering: "Pipeline d'ingénierie", specialist: 'Spécialiste', reviewer: 'Relecteur',
    shown: (skills, agents) => `${skills} skill${skills === 1 ? '' : 's'} et ${agents} agent${agents === 1 ? '' : 's'} affichés`,
    noMatch: 'Aucun élément du catalogue ne correspond à cette recherche.', loadingError: 'Les données du dashboard ne peuvent pas être chargées.',
    score: 'score', netWin: 'gain net', overTrials: (count) => `sur ${count} essai${count === 1 ? '' : 's'} apparié${count === 1 ? '' : 's'}`, runs: (count) => `${count} exécution${count === 1 ? '' : 's'}`, noRun: 'Aucune exécution',
    baseline: 'Baseline', skilled: 'Avec skill', model: 'Modèle', verdict: 'Verdict', lift: 'Gain', activation: 'Activation', tokens: 'Tokens', time: 'Temps', duration: 'Durée', turns: 'Tours', toolCalls: "Appels d'outils", rubricScore: 'Score de la grille',
    expectedActivations: 'Activations attendues', observed: 'Observées', unexpected: 'Inattendues', activationRate: "Taux d'activation", medianPerTrial: 'Médiane par essai',
    agentModelsJudged: (count, judge) => `${count} modèle${count === 1 ? '' : 's'} agent · évalué${count === 1 ? '' : 's'} par ${judge}`,
    sameCohort: 'Même skill et mêmes stimuli, un bras par modèle agent. Ces modèles sont comparables ici car le même juge les a évalués.',
    noModels: 'Aucune comparaison de modèles ne correspond à ces filtres. Il faut au moins deux modèles agents pour le même skill et le même juge.',
    noQuality: 'Aucune preuve de qualité ne correspond à ces filtres.', noEfficiency: "Aucune preuve d'efficacité ne correspond à ces filtres.",
    highestScore: 'score le plus élevé', judge: (model) => `Évalué par ${model}`, pairedResult: (wins, ties, losses) => `${wins} victoires · ${ties} égalités · ${losses} défaites`,
    noRuntimeData: "Aucune donnée d'exécution", notEvaluated: 'Non évalué', openRun: "Ouvrir l'exécution d'évaluation", noDescription: 'Aucune description disponible', inherited: 'hérité',
    skill: 'Skill', profile: 'Profil', evaluation: 'Évaluation', evidenceColumn: 'Preuve', trend: 'Tendance', agent: 'Agent', kind: 'Type',
    stimuliTrials: (stimuli, trials) => `${stimuli} stimuli · ${trials} essais`, profileValue: (tier, tokens, lines) => `${tier} · ~${tokens} tokens · ${lines} lignes`,
    skillsTitle: 'Skills', skillsDescription: "Savoir-faire chargé à la demande par un agent. Le profil indique son coût de contexte ; les preuves montrent le résultat des essais contrôlés.",
    orchestration: 'Orchestration', agentsTitle: 'Agents, workers et lentilles de revue', agentsDescription: 'Qui exécute le pipeline, vers quels sous-agents le travail est distribué et quelles lentilles relisent le résultat.', browseSources: 'Voir les sources',
    zoomQuality: 'Voir la qualité', zoomEfficiency: "Voir l'efficacité", zoomModels: 'Comparer les modèles',
    allModels: 'Tous les modèles évalués',
    states: { pass: 'validé', regression: 'régression', inconclusive: 'non concluant', 'no-improvement': "pas d'amélioration", 'no-data': 'aucune donnée', 'no-eval': 'non évalué', neutral: 'neutre' },
  },
}
const t = messages[lang]

const escapeHtml = (value = '') =>
  String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])

const badge = (state, text = t.states[state] ?? state) => `<span class="badge ${escapeHtml(state)}">${escapeHtml(text)}</span>`

// The judged score of the skilled variant, with the interval around it. Shown
// only when the run actually reported one — an absent score is left absent.
const score = (entry) => {
  if (entry?.meanScore == null) return ''
  const { low, high } = entry.confidenceInterval ?? {}
  const interval = low == null || high == null ? '' : ` (${low.toFixed(2)}–${high.toFixed(2)})`
  return `<div class="profile">${escapeHtml(t.score)} ${escapeHtml(entry.meanScore.toFixed(2))}${escapeHtml(interval)}</div>`
}

const number = (value, digits = 2) => (value == null ? '—' : Number(value).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', { maximumFractionDigits: digits }))
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
  if (!entries.length) return `<span class="spark-label">${escapeHtml(t.noRun)}</span>`
  const recent = entries.slice(-5)
  const bars = recent
    .map((entry) => {
      const netWin = entry.netWin ?? 0
      const fill = Math.round(38 + Math.min(1, Math.abs(netWin)) * 62)
      const title = `${t.states[entry.state] ?? entry.state} — ${entry.model} — ${t.netWin} ${netWin > 0 ? '+' : ''}${netWin.toFixed(2)} ${t.overTrials(entry.trialCount ?? 0)}: ${evidenceReason(entry)}`
      return `<span class="spark-slot" title="${escapeHtml(title)}"><i class="${escapeHtml(entry.state)}" style="height:${fill}%"></i></span>`
    })
    .join('')
  return `<div class="spark-wrap">
    <div class="spark">${bars}</div>
    <span class="spark-label">${escapeHtml(t.runs(recent.length))}</span>
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
    [data.summary.skills, t.skills, t.skillsHint],
    [agentTotal, t.agents, t.agentsHint],
    [`${evaluated}/${data.summary.skills}`, t.evaluated, t.evaluatedHint],
    [withEvidence, t.evidence, t.evidenceHint],
  ]
  summaryNode.innerHTML = metrics
    .map(([value, label, hint]) => `<article class="metric"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span><small>${escapeHtml(hint)}</small></article>`)
    .join('')
}

const metricBar = (label, baseline, skilled, formatter = number) => {
  const max = Math.max(Number(baseline ?? 0), Number(skilled ?? 0), 1)
  return `<div class="comparison-row">
    <div class="comparison-label">${escapeHtml(label)}</div>
    <div class="bar-pair">
      <div class="bar-line"><span>${escapeHtml(t.baseline)}</span><i class="baseline" style="width:${Math.max(2, (Number(baseline ?? 0) / max) * 100)}%"></i><strong>${escapeHtml(formatter(baseline))}</strong></div>
      <div class="bar-line"><span>${escapeHtml(t.skilled)}</span><i class="skilled" style="width:${Math.max(2, (Number(skilled ?? 0) / max) * 100)}%"></i><strong>${escapeHtml(formatter(skilled))}</strong></div>
    </div>
  </div>`
}

// Model arms grouped by skill and judge. Scores from different judges are not
// on the same scale, so Quality, Efficiency and Models all use this same cohort
// builder. Within one cohort, only the latest run per agent model is retained.
const evidenceCohorts = () => data.skills.flatMap((skill) => {
  const cohorts = new Map()
  for (const entry of data.history[skill.directory] ?? []) {
    if (!entry.metrics) continue
    const cohort = cohorts.get(entry.judgeModel) ?? new Map()
    const current = cohort.get(entry.model)
    if (!current || String(entry.timestamp) > String(current.timestamp)) cohort.set(entry.model, entry)
    cohorts.set(entry.judgeModel, cohort)
  }
  return [...cohorts.entries()]
    .map(([judge, arms]) => ({
      skill,
      judge,
      arms: [...arms.values()].sort((left, right) => String(left.model).localeCompare(String(right.model))),
    }))
    .sort((left, right) => String(right.arms.at(-1).timestamp).localeCompare(String(left.arms.at(-1).timestamp)))
})

const normalized = (value = '') => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '')
const selectedModel = () => modelFilterNode.value
const filterCohorts = (cohorts, minimumArms = 1) => {
  const query = searchNode.value.trim().toLowerCase()
  const model = selectedModel()
  return cohorts
    .map((cohort) => {
      const cohortMatches = matches(query, cohort.skill.name, cohort.skill.description, cohort.judge)
      const arms = cohort.arms.filter((arm) =>
        (!model || arm.model === model) &&
        (!query || cohortMatches || matches(query, arm.model, arm.reason)))
      return { ...cohort, arms }
    })
    .filter(({ arms }) => arms.length >= minimumArms)
}

const evidenceReason = (entry) => entry.signTest
  ? t.pairedResult(entry.signTest.wins ?? 0, entry.signTest.ties ?? 0, entry.signTest.losses ?? 0)
  : entry.reason

const renderModels = () => {
  const cohorts = filterCohorts(evidenceCohorts(), selectedModel() ? 1 : 2)
  if (!cohorts.length) {
    modelGrid.innerHTML = `<div class="empty">${escapeHtml(t.noModels)}</div>`
    return
  }

  modelGrid.innerHTML = cohorts.map(({ skill, judge, arms }) => {
    const bestScore = Math.max(...arms.map((arm) => arm.metrics.quality?.skilled ?? Number.NEGATIVE_INFINITY))
    const rows = arms.map((arm) => {
      const quality = arm.metrics.quality ?? {}
      const efficiency = arm.metrics.efficiency ?? {}
      const activation = arm.metrics.activation ?? {}
      const best = quality.skilled != null && quality.skilled === bestScore
      return `<tr${best ? ' class="best"' : ''}>
        <td data-label="${escapeHtml(t.model)}">
          <div class="item-name">${escapeHtml(arm.model)}${best ? ` <span class="pill">${escapeHtml(t.highestScore)}</span>` : ''}</div>
          <div class="profile">${escapeHtml(evidenceReason(arm))}</div>
        </td>
        <td data-label="${escapeHtml(t.verdict)}">${badge(arm.state)}</td>
        <td data-label="${escapeHtml(t.baseline)}">${number(quality.baseline, 3)}</td>
        <td data-label="${escapeHtml(t.skilled)}">${number(quality.skilled, 3)}</td>
        <td data-label="${escapeHtml(t.lift)}"><strong class="${deltaClass(quality.delta)}">${quality.delta > 0 ? '+' : ''}${number(quality.delta, 3)}</strong></td>
        <td data-label="${escapeHtml(t.activation)}">${activation.rate == null ? '—' : `${number(activation.rate * 100, 0)}%`}</td>
        <td data-label="${escapeHtml(t.tokens)}"><span class="${deltaClass(efficiency.tokenDeltaPercent, true)}">${percent(efficiency.tokenDeltaPercent)}</span></td>
        <td data-label="${escapeHtml(t.time)}"><span class="${deltaClass(efficiency.durationDeltaPercent, true)}">${percent(efficiency.durationDeltaPercent)}</span></td>
      </tr>`
    }).join('')

    return `<article class="family">
      <header class="family-header">
        <div>
          <p class="eyebrow">${escapeHtml(t.agentModelsJudged(arms.length, judge))}</p>
          <h3>${escapeHtml(skill.name)}</h3>
          <p>${escapeHtml(t.sameCohort)}</p>
        </div>
      </header>
      <table class="rows">
        <thead><tr><th>${escapeHtml(t.model)}</th><th>${escapeHtml(t.verdict)}</th><th>${escapeHtml(t.baseline)}</th><th>${escapeHtml(t.skilled)}</th><th>${escapeHtml(t.lift)}</th><th>${escapeHtml(t.activation)}</th><th>${escapeHtml(t.tokens)}</th><th>${escapeHtml(t.time)}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </article>`
  }).join('')
}

const renderQuality = () => {
  const cohorts = filterCohorts(evidenceCohorts())
    .map((cohort) => ({ ...cohort, arms: cohort.arms.filter((arm) => arm.metrics.quality) }))
    .filter(({ arms }) => arms.length)
  if (!cohorts.length) {
    qualityGrid.innerHTML = `<div class="empty">${escapeHtml(t.noQuality)}</div>`
    return
  }

  qualityGrid.innerHTML = cohorts.map(({ skill, judge, arms }) => {
    const bestScore = Math.max(...arms.map((arm) => arm.metrics.quality?.skilled ?? Number.NEGATIVE_INFINITY))
    const cards = arms.map((arm) => {
      const quality = arm.metrics.quality ?? {}
      const activation = arm.metrics.activation ?? {}
      const activationRate = activation.rate == null ? null : activation.rate * 100
      const best = arms.length > 1 && quality.skilled != null && quality.skilled === bestScore
      return `<article class="evidence-card">
      <header>
        <div><p class="eyebrow">${escapeHtml(skill.name)}</p><h3>${escapeHtml(arm.model)}</h3><p class="judge">${escapeHtml(t.judge(judge))}</p></div>
        <div class="evidence-verdict">${best ? `<span class="pill">${escapeHtml(t.highestScore)}</span>` : ''}${badge(arm.state)}</div>
      </header>
      <div class="score-strip">
        <div><span>${escapeHtml(t.baseline)}</span><strong>${number(quality.baseline, 3)}</strong></div>
        <div><span>${escapeHtml(t.skilled)}</span><strong>${number(quality.skilled, 3)}</strong></div>
        <div><span>${escapeHtml(t.lift)}</span><strong class="${deltaClass(quality.delta)}">${quality.delta > 0 ? '+' : ''}${number(quality.delta, 3)}</strong></div>
      </div>
      ${metricBar(t.rubricScore, quality.baseline, quality.skilled, (value) => number(value, 3))}
      <div class="activation">
        <div><span>${escapeHtml(t.expectedActivations)}</span><strong>${number(activation.expected, 0)}</strong></div>
        <div><span>${escapeHtml(t.observed)}</span><strong>${number(activation.actual, 0)}</strong></div>
        <div><span>${escapeHtml(t.unexpected)}</span><strong class="${activation.unexpected ? 'negative' : 'positive'}">${number(activation.unexpected, 0)}</strong></div>
        <div><span>${escapeHtml(t.activationRate)}</span><strong>${number(activationRate, 1)}%</strong></div>
      </div>
      <p class="card-note">${escapeHtml(evidenceReason(arm))}</p>
    </article>`
    }).join('')
    return `<article class="family evidence-cohort"><header class="family-header"><div><p class="eyebrow">${escapeHtml(t.agentModelsJudged(arms.length, judge))}</p><h3>${escapeHtml(skill.name)}</h3></div></header><div class="evidence-grid">${cards}</div></article>`
  }).join('')
}

const renderEfficiency = () => {
  const cohorts = filterCohorts(evidenceCohorts())
    .map((cohort) => ({ ...cohort, arms: cohort.arms.filter((arm) => arm.metrics.efficiency) }))
    .filter(({ arms }) => arms.length)
  if (!cohorts.length) {
    efficiencyGrid.innerHTML = `<div class="empty">${escapeHtml(t.noEfficiency)}</div>`
    return
  }

  efficiencyGrid.innerHTML = cohorts.map(({ skill, judge, arms }) => {
    const cards = arms.map((arm) => {
      const efficiency = arm.metrics.efficiency ?? {}
      const baseline = efficiency.baseline ?? {}
      const skilled = efficiency.skilled ?? {}
      return `<article class="evidence-card">
      <header>
        <div><p class="eyebrow">${escapeHtml(t.medianPerTrial)}</p><h3>${escapeHtml(arm.model)}</h3><p class="judge">${escapeHtml(skill.name)} · ${escapeHtml(t.judge(judge))}</p></div>
        <div class="delta-stack">
          <span class="${deltaClass(efficiency.tokenDeltaPercent, true)}">${percent(efficiency.tokenDeltaPercent)} ${escapeHtml(t.tokens.toLowerCase())}</span>
          <span class="${deltaClass(efficiency.durationDeltaPercent, true)}">${percent(efficiency.durationDeltaPercent)} ${escapeHtml(t.time.toLowerCase())}</span>
        </div>
      </header>
      ${metricBar(t.duration, baseline.durationMs, skilled.durationMs, (value) => value == null ? '—' : `${number(value / 1000, 1)}s`)}
      ${metricBar(t.tokens, baseline.tokens, skilled.tokens, (value) => number(value, 0))}
      ${metricBar(t.turns, baseline.turns, skilled.turns, (value) => number(value, 1))}
      ${metricBar(t.toolCalls, baseline.toolCalls, skilled.toolCalls, (value) => number(value, 1))}
    </article>`
    }).join('')
    return `<article class="family evidence-cohort"><header class="family-header"><div><p class="eyebrow">${escapeHtml(t.agentModelsJudged(arms.length, judge))}</p><h3>${escapeHtml(skill.name)}</h3></div></header><div class="evidence-grid">${cards}</div></article>`
  }).join('')
}

// Evidence cell shared by skills and agents: the verdict badge, why it was
// reached, and the judged score when the run reported one.
const evidenceCell = (history, hasSpec) => {
  const latest = history.at(-1)
  if (!latest) return badge(hasSpec ? 'no-data' : 'no-eval', hasSpec ? t.noRuntimeData : t.notEvaluated)
  // Only a real, followable URL (e.g. a CI run) is worth linking — a local
  // placeholder is not a page the browser can navigate to.
  const verdict = /^https?:\/\//.test(latest.url ?? '')
    ? `<a href="${escapeHtml(latest.url)}" aria-label="${escapeHtml(t.openRun)}">${badge(latest.state)}</a>`
    : badge(latest.state)
  return `${verdict}<div class="profile">${escapeHtml(evidenceReason(latest))}</div>${score(latest)}`
}

const zoomActions = (skill) => {
  const history = data.history[skill.directory] ?? []
  const hasQuality = history.some((entry) => entry.metrics?.quality)
  const hasEfficiency = history.some((entry) => entry.metrics?.efficiency)
  const hasModelComparison = evidenceCohorts().some((cohort) => cohort.skill.directory === skill.directory && cohort.arms.length > 1)
  const actions = [
    hasQuality && ['quality', t.zoomQuality],
    hasEfficiency && ['efficiency', t.zoomEfficiency],
    hasModelComparison && ['models', t.zoomModels],
  ].filter(Boolean)
  if (!actions.length) return ''
  return `<div class="zoom-actions">${actions.map(([panel, label]) => `<button class="zoom-action" type="button" data-open-panel="${panel}" data-skill="${escapeHtml(skill.name)}">${escapeHtml(label)}</button>`).join('')}</div>`
}

const skillRow = (skill) => {
  const history = data.history[skill.directory] ?? []

  return `<tr id="${escapeHtml(skill.anchor)}">
    <td data-label="${escapeHtml(t.skill)}">
      <div class="item-name"><a href="${escapeHtml(sourceUrl(skill.path))}">${escapeHtml(skill.name)}</a></div>
      <div class="item-description">${escapeHtml(skill.description || t.noDescription)}</div>
    </td>
    <td data-label="${escapeHtml(t.profile)}"><div class="profile">${escapeHtml(t.profileValue(skill.profile.tier, skill.profile.estimatedTokens, skill.profile.lineCount))}</div></td>
    <td data-label="${escapeHtml(t.evaluation)}"><div class="profile">${skill.evaluation.path ? escapeHtml(t.stimuliTrials(skill.evaluation.stimuli, skill.evaluation.trials)) : '—'}</div></td>
    <td data-label="${escapeHtml(t.evidenceColumn)}">${evidenceCell(history, Boolean(skill.evaluation.path))}${zoomActions(skill)}</td>
    <td data-label="${escapeHtml(t.trend)}">${sparkline(history)}</td>
  </tr>`
}

const agentRow = (agent) => {
  const history = data.agentHistory[agent.id] ?? []

  return `<tr id="${escapeHtml(agent.anchor)}">
    <td data-label="${escapeHtml(t.agent)}">
      <div class="item-name"><a href="${escapeHtml(sourceUrl(agent.path))}">${escapeHtml(agent.name)}</a></div>
      <div class="item-description">${escapeHtml(agent.description || t.noDescription)}</div>
    </td>
    <td data-label="${escapeHtml(t.kind)}">${badge('neutral', agent.kind)}</td>
    <td data-label="${escapeHtml(t.model)}"><div class="profile">${escapeHtml(agent.model ?? t.inherited)}</div></td>
    <td data-label="${escapeHtml(t.evidenceColumn)}">${evidenceCell(history, false)}</td>
    <td data-label="${escapeHtml(t.trend)}">${sparkline(history)}</td>
  </tr>`
}

const matches = (query, ...fields) => fields.join(' ').toLowerCase().includes(query)

const render = () => {
  const query = searchNode.value.trim().toLowerCase()
  const model = selectedModel()
  const skills = data.skills.filter((skill) => {
    const history = data.history[skill.directory] ?? []
    const matchesModel = !model || history.some((entry) => entry.model === model)
    return matchesModel && matches(query, skill.name, skill.description, skill.profile.tier, ...history.map((entry) => entry.model))
  })
  const agents = data.agents.filter((agent) =>
    (!model || normalized(agent.model).includes(normalized(model))) && matches(query, agent.name, agent.description, agent.kind, agent.model))

  statusNode.textContent = t.shown(skills.length, agents.length)
  if (!skills.length && !agents.length) {
    catalogNode.innerHTML = `<div class="empty">${escapeHtml(t.noMatch)}</div>`
    return
  }

  const families = []
  if (skills.length) {
    families.push(`
      <article class="family" id="catalog-skills">
        <header class="family-header">
          <div>
            <p class="eyebrow">${escapeHtml(data.plugin.name)} · version ${escapeHtml(data.plugin.version)}</p>
            <h3>${escapeHtml(t.skillsTitle)}</h3>
            <p>${escapeHtml(t.skillsDescription)}</p>
          </div>
          <div class="family-actions"><a class="button" href="${escapeHtml(repositoryUrl())}/tree/main/plugins/skraft-framework/skills">${escapeHtml(t.browseSources)}</a></div>
        </header>
        <table class="rows">
          <thead><tr><th>${escapeHtml(t.skill)}</th><th>${escapeHtml(t.profile)}</th><th>${escapeHtml(t.evaluation)}</th><th>${escapeHtml(t.evidenceColumn)}</th><th>${escapeHtml(t.trend)}</th></tr></thead>
          <tbody>${skills.map((skill) => skillRow({ ...skill, anchor: skill.anchor ?? `skill-${skill.directory}` })).join('')}</tbody>
        </table>
      </article>`)
  }
  if (agents.length) {
    families.push(`
      <article class="family" id="catalog-agents">
        <header class="family-header">
          <div>
            <p class="eyebrow">${escapeHtml(t.orchestration)}</p>
            <h3>${escapeHtml(t.agentsTitle)}</h3>
            <p>${escapeHtml(t.agentsDescription)}</p>
          </div>
          <div class="family-actions"><a class="button" href="${escapeHtml(repositoryUrl())}/tree/main/plugins/skraft-framework/com.anthropic.claude-code/agents">${escapeHtml(t.browseSources)}</a></div>
        </header>
        <table class="rows">
          <thead><tr><th>${escapeHtml(t.agent)}</th><th>${escapeHtml(t.kind)}</th><th>${escapeHtml(t.model)}</th><th>${escapeHtml(t.evidenceColumn)}</th><th>${escapeHtml(t.trend)}</th></tr></thead>
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
    tab.tabIndex = active ? 0 : -1
  })
  document.querySelectorAll('.panel').forEach((panel) => panel.classList.toggle('active', panel.id === `panel-${name}`))
  if (['overview', 'quality', 'efficiency', 'models'].includes(name)) history.replaceState(null, '', `#${name}`)
}

const entityLink = (id, label = id) => {
  const entity = data.agents.find((agent) => agent.id === id)
  const anchor = entity?.anchor ?? `agent-${id}`
  return `<a href="#${escapeHtml(anchor)}">${escapeHtml(label)}</a>`
}

const renderTopology = () => {
  const topology = data.topology
  const product = topology.journeys.productToEngineering.steps.map((step) => {
    const agent = data.agents.find((candidate) => candidate.id === step.agent)
    return `<li class="journey-step"><span>${step.optional ? escapeHtml(t.optional) : escapeHtml(t.required)}</span>${entityLink(step.agent, agent?.name)}</li>`
  }).join('<li class="journey-arrow" aria-hidden="true">→</li>')
  const phases = topology.journeys.engineering.phases.map((entry) => {
    const specialist = data.agents.find((agent) => agent.id === entry.specialist)
    const reviewer = data.agents.find((agent) => agent.id === entry.reviewer)
    return `<article class="phase-card" id="phase-${escapeHtml(entry.phase.toLowerCase())}">
      <p class="eyebrow">${escapeHtml(entry.phase)}</p>
      <div><strong>${escapeHtml(t.specialist)}</strong>${entry.specialist ? entityLink(entry.specialist, specialist?.name) : '—'}</div>
      <div><strong>${escapeHtml(t.reviewer)}</strong>${entry.reviewer ? entityLink(entry.reviewer, reviewer?.name) : '—'}</div>
    </article>`
  }).join('')
  const roots = topology.roots.map((id) => {
    const agent = data.agents.find((candidate) => candidate.id === id)
    return `<li>${entityLink(id, agent?.name)}</li>`
  }).join('')
  topologyNode.innerHTML = `<article class="journey-card"><p class="eyebrow">${escapeHtml(t.product)}</p><ol class="journey">${product}</ol></article>
    <section><p class="eyebrow">${escapeHtml(t.engineering)}</p><div class="phase-grid">${phases}</div></section>
    <article class="root-card"><p class="eyebrow">${escapeHtml(t.roots)}</p><ul>${roots}</ul></article>`
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

const populateModelFilter = () => {
  const current = modelFilterNode.value
  const models = [...new Set(Object.values(data.history)
    .flat()
    .filter((entry) => entry.metrics && entry.model)
    .map((entry) => entry.model))]
    .sort((left, right) => left.localeCompare(right))
  modelFilterNode.innerHTML = `<option value="">${escapeHtml(t.allModels)}</option>${models.map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join('')}`
  if (models.includes(current)) modelFilterNode.value = current
}

const renderFilteredViews = () => {
  render()
  renderQuality()
  renderEfficiency()
  renderModels()
  clearFiltersNode.disabled = !searchNode.value && !modelFilterNode.value
}

const openEvidenceView = (button) => {
  searchNode.value = button.dataset.skill
  modelFilterNode.value = ''
  renderFilteredViews()
  switchPanel(button.dataset.openPanel)
  document.querySelector(`#panel-${button.dataset.openPanel} .view-heading`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
    const replayUrl = new URL(replay, new URL(dashboardBase, document.baseURI))
    const available = await fetch(replayUrl, { method: 'HEAD', cache: 'no-store' })
      .then((probe) => probe.ok)
      .catch(() => false)
    if (!available) return
    replayLink.href = `${replayUrl}?manifest=${encodeURIComponent(manifest)}`
    replayCallout.hidden = false
  } catch {
    // No recorded session yet — the replay entry point stays hidden.
  }
}

try {
  const response = await fetch(new URL('data/dashboard.json', new URL(dashboardBase, document.baseURI)), { cache: 'no-store' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  data = await response.json()

  await refresh(data.sources?.history, (history) => {
    data.history = mergeHistoryBucket(data.history, history.skills)
    data.agentHistory = mergeHistoryBucket(data.agentHistory, history.agents)
  })

  renderSummary()
  renderTopology()
  populateModelFilter()
  renderFilteredViews()
  searchNode.addEventListener('input', renderFilteredViews)
  modelFilterNode.addEventListener('change', renderFilteredViews)
  clearFiltersNode.addEventListener('click', () => {
    searchNode.value = ''
    modelFilterNode.value = ''
    renderFilteredViews()
    searchNode.focus()
  })
  catalogNode.addEventListener('click', (event) => {
    const button = event.target.closest('[data-open-panel]')
    if (button) openEvidenceView(button)
  })
  tabs.forEach((tab) => tab.addEventListener('click', () => switchPanel(tab.dataset.panel)))
  const requestedPanel = location.hash.slice(1)
  if (['quality', 'efficiency', 'models'].includes(requestedPanel)) switchPanel(requestedPanel)
  await showReplay()
} catch (error) {
  statusNode.textContent = t.loadingError
  catalogNode.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`
}
