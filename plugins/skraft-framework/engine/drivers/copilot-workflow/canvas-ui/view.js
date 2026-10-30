// What the panel draws, as markup: every value is escaped; the texts the engine wrote come as it
// wrote them, the panel's own words from i18n.js. Pure functions of the content the server
// streams and of the view state the page keeps (tab, workflow shown, draft of the configuration).
import { dictionary, ui } from './i18n.js'

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
/** @param {unknown} value */
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c])

const ICONS = {
  pass: '<path d="M3.5 8.5l3 3 6-7"/>',
  fail: '<circle cx="8" cy="8" r="6"/><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4"/>',
  pending: '<circle cx="8" cy="8" r="6" stroke-dasharray="2.2 2.6"/>',
  open: '<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2.2" fill="currentColor"/>',
  question: '<circle cx="8" cy="8" r="6"/><path d="M6.2 6.4a1.85 1.85 0 1 1 2.5 1.7c-.45.2-.7.55-.7 1.05v.35"/><path d="M8 11.3v.1"/>',
  agent: '<circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5a5 5 0 0 1 10 0"/>',
  review: '<circle cx="7" cy="7" r="4"/><path d="M10 10l3.5 3.5"/>',
  ask: '<path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/>',
  gate: '<path d="M3 13.5v-8l5-3 5 3v8"/><path d="M6 13.5v-4h4v4"/>',
  publish: '<path d="M8 11V2.5"/><path d="M4.5 6L8 2.5 11.5 6"/><path d="M3 10.5v3h10v-3"/>',
  call: '<path d="M6.5 4.5h-3v8h8v-3"/><path d="M9 2.5h4.5V7"/><path d="M13.5 2.5L7.5 8.5"/>',
  loop: '<path d="M12.5 6.5A5 5 0 1 0 13 9"/><path d="M13 3v3.5H9.5"/>',
  arrow: '<path d="M3 8h9.5"/><path d="M9 4.5L12.5 8 9 11.5"/>',
  lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
  file: '<path d="M4 2.5h5.5l2.5 2.5v8.5H4z"/><path d="M9.5 2.5V5H12"/>',
}
/** @param {keyof typeof ICONS} name @param {string} [label] */
export const icon = (name, label) => `<svg class="icon icon-${name}" viewBox="0 0 16 16" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'}>${ICONS[name]}</svg>`

export const TABS = Object.freeze(['run', 'configuration', 'workflow'])

/** The top bar: the brand, the slug, the tabs, where the run stands. */
export const renderHeader = (content, view, lang) => {
  const words = dictionary(lang)
  const slug = content?.title?.startsWith('skraft ') && content.title !== 'skraft pipeline' ? content.title.slice('skraft '.length) : ''
  const tabs = TABS.map((tab) => `<button type="button" role="tab" class="tab" id="tab-${tab}" data-action="tab" data-tab="${tab}" aria-selected="${view.tab === tab}" aria-controls="panel" tabindex="${view.tab === tab ? 0 : -1}">${esc(words.tabs[tab])}</button>`).join('')
  const status = content?.status ?? 'idle'
  return `<div class="brand"><span class="brand-mark">skraft</span><span class="brand-sep">/</span><span class="slug">${esc(slug || 'pipeline')}</span></div>
    <div class="tabs" role="tablist">${tabs}</div>
    <p class="run-status s-${esc(status)}"><span class="dot"></span>${esc(words.status[status] ?? status)}</p>`
}

// ── Run ──────────────────────────────────────────────────────────────────

/**
 * What the live region says when the content changes: the run's new status, a question that came
 * to wait; nothing when neither moved. The first content counts as a change.
 * @param {any} before the content drawn, null at first @param {any} after the content received @param {string} lang
 */
export const announcement = (before, after, lang) => {
  const parts = []
  if (before?.status !== after.status) parts.push(ui(lang, 'announceStatus', { status: dictionary(lang).status[after.status] ?? after.status }))
  if (after.question && before?.question?.key !== after.question.key) parts.push(ui(lang, 'announceQuestion', { key: after.question.key, header: after.question.header }))
  return parts.join(' ')
}

const STEP_ICONS = { done: 'pass', closed: 'pass', open: 'open', pending: 'pending' }

/** The question the run waits on, where to answer it. */
const renderQuestion = (question, lang) => (question === null ? '' : `<section class="callout" aria-labelledby="question-head">
    <h2 id="question-head">${icon('question')}<span>${esc(ui(lang, 'waitingOn'))}</span><code>${esc(question.key)}</code><span class="pill">${esc(question.header)}</span></h2>
    <p class="callout-text">${esc(question.text)}</p>
    <p class="callout-how">${esc(question.how)}</p>
  </section>`)

/** One phase: its state, then its steps. */
const renderPhase = (phase, lang) => `<li class="phase p-${esc(phase.state)}">
    <h3 class="phase-head">${icon(STEP_ICONS[phase.state] ?? 'pending')}<span>${esc(phase.text.replace(/^\S+\s/, ''))}</span><span class="state-word">${esc(ui(lang, `phase_${phase.state}`))}</span></h3>
    <ol class="steps">${phase.steps.map((step) => `<li class="step-line s-${esc(step.state)}" data-key="${esc(step.key)}">${icon(STEP_ICONS[step.state] ?? 'pending')}<span class="sr-only">${esc(ui(lang, `step_${step.state}`))}: </span><span>${esc(step.text.replace(/^\S+\s/, ''))}</span></li>`).join('')}</ol>
  </li>`

/** The share of each part, of a bar 100 wide. */
const segments = (parts) => {
  const total = parts.reduce((sum, [, count]) => sum + count, 0) || 1
  let at = 0
  return parts.map(([kind, count]) => {
    const width = (100 * count) / total
    const rect = `<rect class="seg-${kind}" x="${at}" y="0" width="${width}" height="4"/>`
    at += width
    return rect
  }).join('')
}

/** The run in figures, as the backlog canvas sums up its stories: steps, phases, the step under way, the question waited on; then a bar of the steps. */
const renderSummary = (content, lang) => {
  const steps = content.phases.flatMap((phase) => phase.steps)
  const count = (state) => steps.filter((step) => step.state === state).length
  const current = steps.find((step) => step.state === 'open')?.key.replace(/^step-/, '') ?? '—'
  const closed = content.phases.filter((phase) => phase.state === 'closed').length
  const figures = [['stepsDone', `${count('done')}/${steps.length}`], ['phasesClosed', `${closed}/${content.phases.length}`], ['current', current], ['waiting', content.question?.key ?? '—']]
  return `<dl class="figures run-figures">${figures.map(([key, value]) => `<div class="figure${key === 'waiting' && content.question ? ' f-warn' : ''}"><dt>${esc(ui(lang, key))}</dt><dd class="figure-value">${esc(value)}</dd></div>`).join('')}</dl>
    <div class="progress"><svg class="progress-bar" viewBox="0 0 100 4" preserveAspectRatio="none" role="img" aria-label="${esc(ui(lang, 'stepsDone'))} ${count('done')}/${steps.length}">${segments([['done', count('done')], ['open', count('open')], ['pending', count('pending')]])}</svg></div>
    <p class="legend">${['done', 'open', 'pending'].map((kind) => `<span class="legend-item"><svg class="swatch" viewBox="0 0 10 10" aria-hidden="true"><rect class="seg-${kind}" width="10" height="10" rx="2"/></svg>${esc(ui(lang, `legend_${kind}`))} ${count(kind)}</span>`).join('')}</p>`
}

const factLine = (line) => `<li class="fact f-${esc(line.key.split('-')[0])} s-${esc(line.state)}">${esc(line.text)}</li>`

/** What the steps came to: reviews, gates and edges in sight; what each agent started ran on, folded. */
const renderFacts = (details, lang) => {
  if (details.length === 0) return `<p class="muted">${esc(ui(lang, 'noFacts'))}</p>`
  const agents = details.filter((line) => line.key.startsWith('agent-'))
  const facts = details.filter((line) => !line.key.startsWith('agent-'))
  const folded = agents.length === 0 ? '' : `<details class="group agents-group">
      <summary><span class="group-name">${esc(ui(lang, 'agentModels'))}</span><span class="count">${esc(ui(lang, agents.length === 1 ? 'agentCount' : 'agentsCount', { count: agents.length }))}</span></summary>
      <ul class="facts">${agents.map(factLine).join('')}</ul>
    </details>`
  return `${facts.length === 0 ? '' : `<ul class="facts">${facts.map(factLine).join('')}</ul>`}${folded}`
}

/** The Run tab: the run in figures, the question, the phases, then what the steps came to. */
export const renderRun = (content, lang) => `<div class="inner">
    ${content.phases.length === 0 ? '' : renderSummary(content, lang)}
    ${renderQuestion(content.question, lang)}
    ${content.question === null || content.reason !== content.question.text ? `<p class="reason">${esc(content.reason)}</p>` : ''}
    <section class="section"><h2 class="section-head">${esc(ui(lang, 'phases'))}</h2>
      ${content.phases.length === 0 ? `<p class="muted">${esc(ui(lang, 'noPhases'))}</p>` : `<ol class="phases">${content.phases.map((phase) => renderPhase(phase, lang)).join('')}</ol>`}
    </section>
    <section class="section"><h2 class="section-head">${esc(ui(lang, 'facts'))}</h2>
      ${renderFacts(content.details, lang)}
    </section>
  </div>`

// ── Configuration ────────────────────────────────────────────────────────

const FORGE_NAMES = Object.freeze({ github: 'GitHub', 'azure-devops': 'Azure DevOps' })

const options = (values, chosen, labels = {}) => values.map((value) => `<option value="${esc(value)}"${value === chosen ? ' selected' : ''}>${esc(labels[value] ?? value)}</option>`).join('')

/** A component: its fields, then each command it may run. */
const renderComponent = (component, index, choices, lang) => `<article class="card">
    <header class="card-head"><h3 class="card-title"><code>${esc(component.name)}</code></h3>
      <label class="toggle"><input type="checkbox" data-field="components.${index}.contractTesting"${component.contractTesting ? ' checked' : ''}><span>${esc(ui(lang, 'contractTesting'))}</span></label>
    </header>
    <div class="fields">
      <label class="field"><span>${esc(ui(lang, 'root'))}</span><input type="text" spellcheck="false" data-field="components.${index}.root" value="${esc(component.root)}"></label>
      <label class="field"><span>${esc(ui(lang, 'stack'))}</span><select data-field="components.${index}.stack">${options(choices.stacks, component.stack)}</select></label>
      <label class="field"><span>${esc(ui(lang, 'mocking'))}</span><select data-field="components.${index}.mocking">${options(choices.mocking, component.mocking)}</select></label>
    </div>
    <h4 class="sub-head">${esc(ui(lang, 'commands'))}</h4>
    <dl class="commands">${choices.commands.map((name) => `<div class="command${component.commands[name] ? '' : ' unset'}"><dt><label for="cmd-${index}-${esc(name)}">${esc(name)}</label></dt>
      <dd><input id="cmd-${index}-${esc(name)}" type="text" spellcheck="false" autocomplete="off" data-field="components.${index}.commands.${esc(name)}" value="${esc(component.commands[name] ?? '')}" placeholder="${esc(ui(lang, 'notSet'))}"></dd></div>`).join('')}</dl>
  </article>`

const CONSENT_VALUES = Object.freeze([['ask', null], ['yes', true], ['no', false]])

/** A consent as three choices: asked at the run, given, refused. */
const renderConsent = (consent, value, lang) => `<div class="consent">
    <p class="consent-text">${esc(ui(lang, `consent_${consent.key}`))}${consent.state === 'outdated' && value === true ? `<span class="note">${esc(ui(lang, 'outdated'))}</span>` : ''}</p>
    <div class="segmented" role="radiogroup" aria-label="${esc(ui(lang, `consent_${consent.key}`))}">${CONSENT_VALUES.map(([label, given]) => `<button type="button" role="radio" class="seg" data-action="consent" data-consent="${esc(consent.key)}" data-value="${label}" aria-checked="${value === given}">${esc(ui(lang, label))}</button>`).join('')}</div>
  </div>`

/** `planner · frontier · opus → sonnet · effort high`, or the host deciding. */
const assignmentText = (row, lang) => {
  if (row === undefined) return ''
  const parts = [row.family, row.tier && row.tier !== row.family ? row.tier : null, row.model === null ? ui(lang, 'hostDecides') : row.model.join(' → '), row.effort ? `effort ${row.effort}` : null]
  return parts.filter((part) => part !== null && part !== undefined).join(' · ')
}

/** The family a rule of the person's own layer names, '' without one. */
const ruleFamily = (rule) => (rule === undefined || rule === null ? '' : typeof rule === 'string' ? rule : rule.family ?? '')

/** One agent the workflow dispatches: the person's rule, then what it runs on, on each host. */
const renderAgentRow = (row, draft, choices, agents, lang) => {
  const copilot = agents.copilot.find((other) => other.step === row.step && other.agent === row.agent)
  return `<tr><td><code>${esc(row.agent)}</code><span class="muted"> ${esc(row.step)}</span></td><td class="muted">${esc(row.type)}</td>
    <td><select data-field="assign.agents.${esc(row.agent)}"><option value="">${esc(ui(lang, 'teamRule'))}</option>${options(choices.families, ruleFamily(draft.assign.agents?.[row.agent]))}</select></td>
    <td class="resolved">${esc(assignmentText(row, lang))}</td><td class="resolved">${esc(assignmentText(copilot, lang))}</td></tr>`
}

/** Each agent once, in the order the workflow dispatches them. */
const agentRows = (agents) => agents['claude-code'].filter((row, index, rows) => rows.findIndex((other) => other.agent === row.agent) === index)

/** The agents by the phase of the step that dispatches them, in the order the phases come. */
const byPhase = (rows, phaseOf) => {
  const groups = new Map()
  for (const row of rows) groups.set(phaseOf(row.step), [...(groups.get(phaseOf(row.step)) ?? []), row])
  return [...groups]
}

const agentTable = (rows, configuration, draft, lang) => `<table class="grid"><thead><tr><th>${esc(ui(lang, 'agent'))}</th><th>${esc(ui(lang, 'type'))}</th><th>${esc(ui(lang, 'yourRule'))}</th><th>claude-code</th><th>copilot</th></tr></thead>
    <tbody>${rows.map((row) => renderAgentRow(row, draft, configuration.choices, configuration.models.agents, lang)).join('')}</tbody></table>`

/** One phase's agents, folded unless one of them has a rule of the person's own, or the person opened it. */
const renderAgentGroup = ([phase, rows], configuration, draft, { open }, lang) => {
  const ruled = rows.filter((row) => draft.assign.agents?.[row.agent] !== undefined).length
  const families = [...new Set(rows.map((row) => row.family ?? ui(lang, 'hostDecides')))].join(', ')
  return `<details class="group" data-group="${esc(phase)}"${ruled > 0 || open.has(phase) ? ' open' : ''}>
    <summary><span class="group-name">${esc(phase)}</span><span class="count">${esc(ui(lang, rows.length === 1 ? 'agentCount' : 'agentsCount', { count: rows.length }))}</span><span class="group-families">${esc(families)}</span>${ruled > 0 ? `<span class="pill">${esc(ui(lang, 'ruled', { count: ruled }))}</span>` : ''}</summary>
    <div class="scroll">${agentTable(rows, configuration, draft, lang)}</div>
  </details>`
}

const renderTypeRules = (draft, choices, lang) => `<div class="fields">
    <label class="field"><span>${esc(ui(lang, 'byDefault'))}</span><select data-field="assign.default"><option value="">${esc(ui(lang, 'teamRule'))}</option>${options(choices.families, ruleFamily(draft.assign.default))}</select></label>
    ${choices.types.map((type) => `<label class="field"><span>${esc(type)}</span><select data-field="assign.types.${esc(type)}"><option value="">${esc(ui(lang, 'teamRule'))}</option>${options(choices.families, ruleFamily(draft.assign.types?.[type]))}</select></label>`).join('')}
  </div>`

/** Each family's models and effort on each host, as the person's own layer sets them. */
const renderFamilies = (draft, choices, lang) => `<table class="grid families"><thead><tr><th>${esc(ui(lang, 'family'))}</th>${choices.hosts.map((host) => `<th>${esc(host)} — ${esc(ui(lang, 'model'))}</th><th>${esc(ui(lang, 'effort'))}</th>`).join('')}</tr></thead>
    <tbody>${choices.families.filter((family) => family !== 'inherit').map((family) => `<tr><td><code>${esc(family)}</code></td>${choices.hosts.map((host) => {
    const setting = draft.models[family]?.[host] ?? {}
    return `<td><input type="text" spellcheck="false" data-field="models.${esc(family)}.${esc(host)}.model" value="${esc((setting.model ?? []).join(', '))}" placeholder="—"></td><td><select data-field="models.${esc(family)}.${esc(host)}.effort"><option value="">—</option>${options(choices.efforts, setting.effort ?? '')}</select></td>`
  }).join('')}</tr>`).join('')}</tbody></table>`

const renderModels = (configuration, draft, layout, lang) => {
  const { agents } = configuration.models
  const groups = agents === null ? `<p class="muted">${esc(ui(lang, 'noAgents'))}</p>` : byPhase(agentRows(agents), layout.phaseOf).map((group) => renderAgentGroup(group, configuration, draft, layout, lang)).join('')
  return `<section class="section"><h2 class="section-head">${esc(ui(lang, 'models'))}</h2><p class="section-note">${esc(ui(lang, 'modelsNote', { file: configuration.files.local }))}</p>
    <div class="groups">${groups}</div>
    <h3 class="sub-head">${esc(ui(lang, 'byType'))}</h3>${renderTypeRules(draft, configuration.choices, lang)}
    <h3 class="sub-head">${esc(ui(lang, 'families'))}</h3><div class="scroll">${renderFamilies(draft, configuration.choices, lang)}</div></section>`
}

const renderBar = (configuration, lang) => `<section class="section"><h2 class="section-head">${esc(ui(lang, 'bar'))}</h2><p class="section-note">${esc(ui(lang, 'barNote'))}</p>
    <dl class="figures">${configuration.thresholds.map(({ scope, bar }) => `<div class="figure"><dt>${esc(ui(lang, scope))}</dt><dd class="figure-value">${esc(bar)}%</dd></div>`).join('')}</dl>
    <p class="muted small-note">${icon('lock')} ${esc(ui(lang, 'coverage'))}</p></section>`

/** The forge: the one the developer names, else the first choice, which the Git remote decides and names. */
const renderForge = (configuration, draft, lang) => `<section class="section"><h2 class="section-head">${esc(ui(lang, 'forge'))}</h2><p class="section-note">${esc(ui(lang, 'forgeNote', { file: configuration.files.team }))}</p>
      <div class="fields is-wide"><label class="field"><span>${esc(ui(lang, 'forgeUsed'))}</span><select data-field="forge"><option value="">${esc(ui(lang, 'fromRemote', { forge: FORGE_NAMES[configuration.forge.deduced] }))}</option>${options(configuration.choices.forges, draft.forge ?? '', FORGE_NAMES)}</select></label></div>${configuration.forge.namedIn === null ? '' : `<p class="muted small-note">${esc(ui(lang, 'forgeNamedIn', { file: configuration.forge.namedIn }))}</p>`}
    </section>`

/**
 * The Configuration tab: what a run starts with, the person's draft of it in the fields.
 * @param {{ phaseOf: (step: string) => string, open: Set<string> }} layout the phase of each step; the agent groups the person opened
 */
export const renderConfiguration = (configuration, draft, lang, layout) => {
  if (configuration.status !== 'ok') return `<div class="inner"><div class="notice n-fail"><p>${esc(configuration.reason)}</p></div></div>`
  return `<div class="inner">
    <div class="notice ${configuration.confirmed ? 'n-pass' : 'n-warn'}">${icon(configuration.confirmed ? 'pass' : 'question')}<p>${esc(ui(lang, configuration.confirmed ? 'confirmed' : 'unconfirmed'))}</p></div>
    ${renderForge(configuration, draft, lang)}
    <section class="section"><h2 class="section-head">${esc(ui(lang, 'components'))}</h2><p class="section-note">${esc(ui(lang, 'componentsNote', { file: configuration.files.team }))}</p>
      ${draft.components.length === 0 ? `<p class="muted">${esc(ui(lang, 'noComponents'))}</p>` : `<div class="cards">${draft.components.map((component, index) => renderComponent(component, index, configuration.choices, lang)).join('')}</div>`}
    </section>
    <section class="section"><h2 class="section-head">${esc(ui(lang, 'consents'))}</h2><p class="section-note">${esc(ui(lang, 'consentsNote', { file: configuration.files.team }))}</p>
      <div class="consents">${configuration.consents.map((consent) => renderConsent(consent, draft.consents[consent.key], lang)).join('')}</div>
    </section>
    ${renderModels(configuration, draft, layout, lang)}
    ${renderBar(configuration, lang)}
  </div>`
}

/** The save bar of the Configuration tab. */
export const renderSaveBar = (state, lang) => `<div class="bar-inner">
    <p class="bar-state${state.dirty ? ' is-dirty' : ''}">${esc(ui(lang, state.dirty ? 'dirty' : 'clean'))}${state.stale ? `<span class="note">${esc(ui(lang, 'changedOnDisk'))}</span>` : ''}${state.error ? `<span class="error" role="alert">${esc(state.error)}</span>` : ''}</p>
    <div class="bar-actions"><button type="button" class="ghost" data-action="discard"${state.dirty ? '' : ' disabled'}>${esc(ui(lang, 'discard'))}</button>
    <button type="button" class="primary" data-action="save"${state.dirty && !state.saving ? '' : ' disabled'}>${esc(ui(lang, state.saving ? 'saving' : 'save'))}</button></div>
  </div>`

// ── Workflow ─────────────────────────────────────────────────────────────

const KIND_ICONS = { agent: 'agent', review: 'review', ask: 'ask', gate: 'gate', publish: 'publish', call: 'call' }

/** What a step runs, asks, checks or publishes. */
const stepBody = (step, lang) => {
  if (step.kind === 'agent') return `<p class="what"><code>${esc(step.agent)}</code></p>`
  if (step.kind === 'ask') return `<p class="what">${esc(step.question)}</p>`
  if (step.kind === 'gate') return `<p class="chips">${step.gates.map((gate) => `<span class="chip">${esc(gate)}</span>`).join('')}</p>`
  if (step.kind === 'publish') return `<p class="what">${esc(step.publish)}</p>`
  const lenses = `<p class="chips">${step.lenses.map(({ lens, when }) => `<span class="chip">${esc(lens)}${when ? ` <em>${esc(ui(lang, 'runsWhen', { when }))}</em>` : ''}</span>`).join('')}</p>`
  return step.kind === 'call' ? `<p class="what">${icon('call')} ${esc(ui(lang, 'calls', { name: step.calls }))}</p>${lenses}` : lenses
}

/** Whether an edge sends the run back: a refusal, a rework, a failed gate. */
const isBack = (edge) => /REWORK|FAIL|REJECTED/.test(edge.label ?? '')

/** `NEEDS_REWORK · max 3 · ×1`: the label, the loop budget, how often the run took it. */
const edgeText = (edge, lang) => [edge.label, edge.maxVisits === null ? null : ui(lang, 'maxVisits', { count: edge.maxVisits }), edge.taken > 0 ? ui(lang, 'taken', { count: edge.taken }) : null]
  .filter((part) => part !== null).join(' · ')

/** The edges that leave a step but the one to the next card, listed in the card: what the side arrows say, on a panel too narrow to draw them. */
const branches = (step, next, edges, lang) => {
  const out = edges.filter((edge) => edge.from === step.id && edge.to !== next)
  if (out.length === 0) return ''
  return `<ul class="branches">${out.map((edge) => `<li class="branch${edge.taken > 0 ? ' taken' : ''}${isBack(edge) ? ' back' : ''}">${icon(isBack(edge) ? 'loop' : 'arrow')}<span class="label">${esc(edge.label ?? '')}</span><span class="to">${esc(edge.to)}</span>${edge.maxVisits === null ? '' : `<span class="max">${esc(ui(lang, 'maxVisits', { count: edge.maxVisits }))}</span>`}${edge.taken > 0 ? `<span class="count">${esc(ui(lang, 'taken', { count: edge.taken }))}</span>` : ''}</li>`).join('')}</ul>`
}

/** The badges of a step: mandatory, locked, where the run stands on it. */
const badges = (step, lang) => [
  step.mandatory ? `<span class="badge">${esc(ui(lang, 'mandatory'))}</span>` : '',
  step.locked ? `<span class="badge">${icon('lock')}${esc(ui(lang, 'locked'))}</span>` : '',
  step.state === 'open' ? `<span class="badge now">${esc(ui(lang, 'now'))}</span>` : '',
  step.state === 'done' ? `<span class="badge done">${icon('pass')}${esc(ui(lang, 'done'))}${step.visits > 1 ? ` ×${esc(step.visits)}` : ''}</span>` : '',
].join('')

/** One step as a card of the flow. */
const renderStepCard = (step, next, edges, lang) => `<li class="flow-item">
    <article class="node k-${esc(step.kind)} st-${esc(step.state)}" id="node-${esc(step.id)}" data-node="${esc(step.id)}"${step.state === 'open' ? ' aria-current="step"' : ''}>
      <header class="node-head"><span class="kind">${icon(KIND_ICONS[step.kind] ?? 'agent')}${esc(ui(lang, `kind_${step.kind}`))}</span><h3 class="node-id">${esc(step.id)}</h3><span class="badges">${badges(step, lang)}</span></header>
      ${stepBody(step, lang)}
      ${branches(step, next, edges, lang)}
    </article>
  </li>`

/** The steps between a start and an exit, a phase heading where a new phase starts; the arrows are drawn over them once measured. */
const renderFlow = (workflow, lang) => {
  let phase = null
  const items = workflow.steps.map((step, index) => {
    const heading = step.phase !== null && step.phase !== phase ? `<li class="flow-phase"><span>${esc(step.phase)}</span></li>` : ''
    phase = step.phase ?? phase
    return heading + renderStepCard(step, workflow.steps[index + 1]?.id ?? 'exit', workflow.edges, lang)
  })
  const terminal = (id) => `<li class="terminal-item"><span class="terminal" data-node="${id}">${esc(ui(lang, id))}</span></li>`
  return `<div class="flow-area"><svg class="arrows" aria-hidden="true"></svg><ol class="flow">${terminal('start')}${items.join('')}${terminal('exit')}</ol></div>`
}

// ── the arrows, drawn once the cards are measured ──────────────────────

const LANE = 18
const CORNER = 6

/**
 * Where each edge goes: down the column to the card right after it; out on the left and back up
 * for an edge to an earlier card; out on the right for one that skips cards ahead. Each side
 * edge takes the first lane that none of the edges it overlaps holds, the shortest first.
 * @param {string[]} order start, the steps, exit @param {any[]} edges
 */
export const routeEdges = (order, edges) => {
  const lanes = { left: [], right: [] }
  const routes = edges.map((edge) => ({ edge, from: order.indexOf(edge.from), to: order.indexOf(edge.to) }))
    .filter(({ from, to }) => from >= 0 && to >= 0)
    .map((route) => ({ ...route, side: route.to === route.from + 1 ? 'down' : route.to <= route.from ? 'left' : 'right', lane: 0 }))
  const sides = routes.filter(({ side }) => side !== 'down').sort((a, b) => Math.abs(a.to - a.from) - Math.abs(b.to - b.from))
  for (const route of sides) route.lane = laneOf(lanes[route.side], Math.min(route.from, route.to), Math.max(route.from, route.to))
  return routes
}

/** The first lane free over [low, high], now taken there. */
const laneOf = (lanes, low, high) => {
  let lane = lanes.findIndex((spans) => spans.every(([a, b]) => high < a || low > b))
  if (lane < 0) lane = lanes.push([]) - 1
  lanes[lane].push([low, high])
  return lane
}

/** The height at which each side edge leaves its card and reaches its target, spread along the card's side. */
const portsOf = (routes, boxes, order) => {
  const ports = new Map()
  const add = (id, side, entry) => ports.set(`${id}|${side}`, [...(ports.get(`${id}|${side}`) ?? []), entry])
  for (const route of routes.filter(({ side }) => side !== 'down')) {
    add(route.edge.from, route.side, { route, end: 'from', other: order.indexOf(route.edge.to) })
    add(route.edge.to, route.side, { route, end: 'to', other: order.indexOf(route.edge.from) })
  }
  const ys = new Map()
  for (const [key, list] of ports) {
    const box = boxes[key.split('|')[0]]
    list.sort((a, b) => a.other - b.other)
    list.forEach(({ route, end }, index) => ys.set(`${route.edge.from}>${route.edge.to}|${end}`, box.top + ((index + 1) * (box.bottom - box.top)) / (list.length + 1)))
  }
  return ys
}

/** A path through the points given, its corners rounded. */
const roundedPath = (points) => points.map(([x, y], index) => {
  if (index === 0) return `M${x},${y}`
  if (index === points.length - 1) return `L${x},${y}`
  const [px, py] = points[index - 1]
  const [nx, ny] = points[index + 1]
  return `L${x - Math.sign(x - px) * CORNER},${y - Math.sign(y - py) * CORNER} Q${x},${y} ${x + Math.sign(nx - x) * CORNER},${y + Math.sign(ny - y) * CORNER}`
}).join(' ')

/** down the column; back, a refusal or a rework to an earlier step; loop, any other edge to an earlier step; skip, ahead past steps. */
const kindOf = ({ edge, side }) => {
  if (side === 'down') return 'down'
  if (side === 'right') return 'skip'
  return isBack(edge) ? 'back' : 'loop'
}

/** An edge down the column, from the bottom of a card to the top of the next, its label beside it. */
const downEdge = (route, boxes, lang) => {
  const from = boxes[route.edge.from]
  const to = boxes[route.edge.to]
  const x = Math.round((from.left + from.right) / 2)
  const text = edgeText(route.edge, lang)
  const label = text === '' ? null : { text, x: x + 8, y: Math.round((from.bottom + to.top) / 2) + 4, anchor: 'start', kind: kindOf(route) }
  return { path: `<path class="edge e-down${route.edge.taken > 0 ? ' taken' : ''}" d="M${x},${from.bottom + 2} L${x},${to.top - 3}" marker-end="url(#head-down)"/>`, label }
}

/** An edge out of the column: it leaves its card on one side, runs along its lane, and comes back into its target card; its label where it leaves. */
const sideEdge = (route, boxes, ys, column, lang) => {
  const key = `${route.edge.from}>${route.edge.to}`
  const [y1, y2] = [ys.get(`${key}|from`), ys.get(`${key}|to`)]
  const left = route.side === 'left'
  const edgeOf = (id) => (left ? boxes[id].left : boxes[id].right)
  const lane = left ? column.left - LANE * (route.lane + 1) : column.right + LANE * (route.lane + 1)
  const path = roundedPath([[edgeOf(route.edge.from), y1], [lane, y1], [lane, y2], [edgeOf(route.edge.to) + (left ? -3 : 3), y2]])
  // the label stands beyond every lane, on the height its edge leaves at, a dotted leader back to its lane
  const outer = left ? column.outerLeft : column.outerRight
  const leader = `<path class="leader" d="M${lane},${y1} L${outer},${y1}"/>`
  const label = { text: edgeText(route.edge, lang), x: outer + (left ? -6 : 6), y: y1 + 4, anchor: left ? 'end' : 'start', kind: kindOf(route) }
  return { path: `${leader}<path class="edge e-${kindOf(route)}${route.edge.taken > 0 ? ' taken' : ''}" d="${path}" marker-end="url(#head-${kindOf(route)})"/>`, label }
}

/** The width of a character of a label (11px monospace), a little more than it takes, and the height of a line. */
const CHAR = 7
const LINE = 13
/** The moves tried, in order, to set a label clear of the cards and of the labels already set. */
const NUDGES = Object.freeze([0, -LINE, LINE, -2 * LINE, 2 * LINE, -3 * LINE, 3 * LINE, -4 * LINE, 4 * LINE, -5 * LINE, 5 * LINE])

/** @returns {{ left: number, right: number, top: number, bottom: number }} */
const rectOf = ({ text, x, y, anchor }) => {
  const width = text.length * CHAR + 4
  return { left: anchor === 'end' ? x - width : x, right: anchor === 'end' ? x : x + width, top: y - LINE + 2, bottom: y + 3 }
}

const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

/** Each label at the first height near its own where it overlaps no card and no label set before it. */
const placed = (labels, cards) => {
  const taken = [...cards]
  return labels.map((label) => {
    const at = NUDGES.map((dy) => ({ ...label, y: label.y + dy })).find((moved) => !taken.some((other) => overlaps(rectOf(moved), other))) ?? label
    taken.push(rectOf(at))
    return at
  })
}

const labelMarkup = ({ text, x, y, anchor, kind }) => `<text class="edge-label l-${kind}" x="${x}" y="${y}" text-anchor="${anchor}">${esc(text)}</text>`

const MARKERS = ['down', 'back', 'loop', 'skip'].map((kind) => `<marker id="head-${kind}" class="head head-${kind}" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker>`).join('')

/**
 * The arrows of a workflow over its measured cards: every edge between two of them; on a panel
 * too narrow for the side lanes, the arrows down the column only, the others listed in their cards.
 * @param {{ order: string[], edges: any[], boxes: Record<string, { top: number, bottom: number, left: number, right: number }>, wide: boolean, lang: string }} drawn
 */
export const renderArrows = ({ order, edges, boxes, wide, lang }) => {
  const routes = routeEdges(order, edges).filter(({ side }) => wide || side === 'down')
  const cards = order.map((id) => boxes[id]).filter(Boolean)
  const lanes = (side) => Math.max(0, ...routes.filter((route) => route.side === side).map((route) => route.lane + 1))
  const column = { left: Math.min(...cards.map((box) => box.left)), right: Math.max(...cards.map((box) => box.right)) }
  Object.assign(column, { outerLeft: column.left - LANE * lanes('left') - 4, outerRight: column.right + LANE * lanes('right') + 4 })
  const ys = portsOf(routes, boxes, order)
  const drawn = routes.map((route) => (route.side === 'down' ? downEdge(route, boxes, lang) : sideEdge(route, boxes, ys, column, lang)))
  const labels = placed(drawn.map(({ label }) => label).filter((label) => label !== null), cards)
  return `<defs>${MARKERS}</defs>${drawn.map(({ path }) => path).join('')}${labels.map(labelMarkup).join('')}`
}

/** The workflow the tab shows: the one picked, else the one the run follows. */
export const shownWorkflow = (workflows, chosen) => workflows.find(({ name }) => name === chosen) ?? workflows[0] ?? null

/** The Workflow tab: one workflow at a time, the one the run follows first. */
export const renderWorkflows = (workflows, chosen, lang) => {
  if (workflows.length === 0) return `<div class="inner"><div class="notice n-fail"><p>${esc(ui(lang, 'noWorkflow'))}</p></div></div>`
  const shown = shownWorkflow(workflows, chosen)
  const picks = workflows.map(({ name }) => `<button type="button" class="filter" data-action="workflow" data-workflow="${esc(name)}" aria-pressed="${name === shown.name}">${esc(name)}</button>`).join('')
  return `<div class="inner">
    <div class="flow-tools"><div class="filters" role="group">${picks}</div><p class="source">${icon('file')}<code>${esc(shown.file ?? ui(lang, 'plugin'))}</code></p></div>
    ${shown.goal ? `<p class="goal"><span>${esc(ui(lang, 'goal'))}</span> ${esc(shown.goal)}</p>` : ''}
    ${renderFlow(shown, lang)}
  </div>`
}
