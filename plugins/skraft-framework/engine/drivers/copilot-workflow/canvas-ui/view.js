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

const STEP_ICONS = { done: 'pass', closed: 'pass', open: 'open', pending: 'pending' }

/** The question the run waits on, where to answer it. */
const renderQuestion = (question, lang) => (question === null ? '' : `<section class="callout" aria-labelledby="question-head">
    <h2 id="question-head">${icon('question')}<span>${esc(ui(lang, 'waitingOn'))}</span><code>${esc(question.key)}</code><span class="pill">${esc(question.header)}</span></h2>
    <p class="callout-text">${esc(question.text)}</p>
    <p class="callout-how">${esc(question.how)}</p>
  </section>`)

/** One phase: its state, then its steps. */
const renderPhase = (phase) => `<li class="phase p-${esc(phase.state)}">
    <h3 class="phase-head">${icon(STEP_ICONS[phase.state] ?? 'pending')}<span>${esc(phase.text.replace(/^\S+\s/, ''))}</span></h3>
    <ol class="steps">${phase.steps.map((step) => `<li class="step-line s-${esc(step.state)}" data-key="${esc(step.key)}">${icon(STEP_ICONS[step.state] ?? 'pending')}<span>${esc(step.text.replace(/^\S+\s/, ''))}</span></li>`).join('')}</ol>
  </li>`

/** The Run tab: the question first, the phases, then what the steps came to. */
export const renderRun = (content, lang) => `<div class="inner">
    ${renderQuestion(content.question, lang)}
    <p class="reason">${esc(content.reason)}</p>
    <section class="section"><h2 class="section-head">${esc(ui(lang, 'phases'))}</h2>
      ${content.phases.length === 0 ? `<p class="muted">${esc(ui(lang, 'noPhases'))}</p>` : `<ol class="phases">${content.phases.map(renderPhase).join('')}</ol>`}
    </section>
    <section class="section"><h2 class="section-head">${esc(ui(lang, 'facts'))}</h2>
      ${content.details.length === 0 ? `<p class="muted">${esc(ui(lang, 'noFacts'))}</p>` : `<ul class="facts">${content.details.map((line) => `<li class="fact f-${esc(line.key.split('-')[0])} s-${esc(line.state)}">${esc(line.text)}</li>`).join('')}</ul>`}
    </section>
  </div>`

// ── Configuration ────────────────────────────────────────────────────────

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

const renderModels = (configuration, draft, lang) => {
  const { agents } = configuration.models
  const table = agents === null ? `<p class="muted">${esc(ui(lang, 'noAgents'))}</p>` : `<table class="grid"><thead><tr><th>${esc(ui(lang, 'agent'))}</th><th>${esc(ui(lang, 'type'))}</th><th>${esc(ui(lang, 'yourRule'))}</th><th>claude-code</th><th>copilot</th></tr></thead>
    <tbody>${agentRows(agents).map((row) => renderAgentRow(row, draft, configuration.choices, agents, lang)).join('')}</tbody></table>`
  return `<section class="section"><h2 class="section-head">${esc(ui(lang, 'models'))}</h2><p class="section-note">${esc(ui(lang, 'modelsNote', { file: configuration.files.local }))}</p>
    <div class="scroll">${table}</div>
    <h3 class="sub-head">${esc(ui(lang, 'byType'))}</h3>${renderTypeRules(draft, configuration.choices, lang)}
    <h3 class="sub-head">${esc(ui(lang, 'families'))}</h3><div class="scroll">${renderFamilies(draft, configuration.choices, lang)}</div></section>`
}

const renderBar = (configuration, lang) => `<section class="section"><h2 class="section-head">${esc(ui(lang, 'bar'))}</h2><p class="section-note">${esc(ui(lang, 'barNote'))}</p>
    <dl class="figures">${configuration.thresholds.map(({ scope, bar }) => `<div class="figure"><dt>${esc(ui(lang, scope))}</dt><dd class="figure-value">${esc(bar)}%</dd></div>`).join('')}</dl>
    <p class="muted small-note">${icon('lock')} ${esc(ui(lang, 'coverage'))}</p></section>`

/** The Configuration tab: what a run starts with, the person's draft of it in the fields. */
export const renderConfiguration = (configuration, draft, lang) => {
  if (configuration.status !== 'ok') return `<div class="inner"><div class="notice n-fail"><p>${esc(configuration.reason)}</p></div></div>`
  return `<div class="inner">
    <div class="notice ${configuration.confirmed ? 'n-pass' : 'n-warn'}">${icon(configuration.confirmed ? 'pass' : 'question')}<p>${esc(ui(lang, configuration.confirmed ? 'confirmed' : 'unconfirmed'))}</p></div>
    <section class="section"><h2 class="section-head">${esc(ui(lang, 'components'))}</h2><p class="section-note">${esc(ui(lang, 'componentsNote', { file: configuration.files.team }))}</p>
      ${draft.components.length === 0 ? `<p class="muted">${esc(ui(lang, 'noComponents'))}</p>` : `<div class="cards">${draft.components.map((component, index) => renderComponent(component, index, configuration.choices, lang)).join('')}</div>`}
    </section>
    <section class="section"><h2 class="section-head">${esc(ui(lang, 'consents'))}</h2><p class="section-note">${esc(ui(lang, 'consentsNote', { file: configuration.files.team }))}</p>
      <div class="consents">${configuration.consents.map((consent) => renderConsent(consent, draft.consents[consent.key], lang)).join('')}</div>
    </section>
    ${renderModels(configuration, draft, lang)}
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

/** The edges that leave a step, but the one to the next card, which the connector draws. */
const branches = (step, next, edges, lang) => {
  const out = edges.filter((edge) => edge.from === step.id && !(edge.label === null && edge.to === next))
  if (out.length === 0) return ''
  return `<ul class="branches">${out.map((edge) => `<li class="branch${edge.taken > 0 ? ' taken' : ''}${/REWORK|FAIL|REJECTED/.test(edge.label ?? '') ? ' back' : ''}">${icon(/REWORK|FAIL|REJECTED/.test(edge.label ?? '') ? 'loop' : 'arrow')}<span class="label">${esc(edge.label ?? '')}</span><span class="to">${esc(edge.to)}</span>${edge.maxVisits === null ? '' : `<span class="max">${esc(ui(lang, 'maxVisits', { count: edge.maxVisits }))}</span>`}${edge.taken > 0 ? `<span class="count">${esc(ui(lang, 'taken', { count: edge.taken }))}</span>` : ''}</li>`).join('')}</ul>`
}

/** One step as a card of the flow. */
const renderStepCard = (step, next, edges, lang) => `<li class="flow-item">
    <article class="node k-${esc(step.kind)} st-${esc(step.state)}" id="node-${esc(step.id)}"${step.state === 'open' ? ' aria-current="step"' : ''}>
      <header class="node-head"><span class="kind">${icon(KIND_ICONS[step.kind] ?? 'agent')}${esc(ui(lang, `kind_${step.kind}`))}</span><h3 class="node-id">${esc(step.id)}</h3>
        <span class="badges">${step.mandatory ? `<span class="badge">${esc(ui(lang, 'mandatory'))}</span>` : ''}${step.locked ? `<span class="badge">${icon('lock')}${esc(ui(lang, 'locked'))}</span>` : ''}${step.state === 'open' ? `<span class="badge now">${esc(ui(lang, 'now'))}</span>` : step.state === 'done' ? `<span class="badge done">${icon('pass')}${esc(ui(lang, 'done'))}${step.visits > 1 ? ` ×${esc(step.visits)}` : ''}</span>` : ''}</span>
      </header>
      ${stepBody(step, lang)}
      ${branches(step, next, edges, lang)}
    </article>
  </li>`

/** The steps, a phase heading where a new phase starts. */
const renderFlow = (workflow, lang) => {
  let phase = null
  const items = workflow.steps.map((step, index) => {
    const heading = step.phase !== null && step.phase !== phase ? `<li class="flow-phase"><span>${esc(step.phase)}</span></li>` : ''
    phase = step.phase ?? phase
    return heading + renderStepCard(step, workflow.steps[index + 1]?.id ?? 'exit', workflow.edges, lang)
  })
  return `<ol class="flow"><li class="terminal">${esc(ui(lang, 'start'))}</li>${items.join('')}<li class="terminal">${esc(ui(lang, 'exit'))}</li></ol>`
}

/** The Workflow tab: one workflow at a time, the one the run follows first. */
export const renderWorkflows = (workflows, chosen, lang) => {
  if (workflows.length === 0) return `<div class="inner"><div class="notice n-fail"><p>${esc(ui(lang, 'noWorkflow'))}</p></div></div>`
  const shown = workflows.find(({ name }) => name === chosen) ?? workflows[0]
  const picks = workflows.map(({ name }) => `<button type="button" class="filter" data-action="workflow" data-workflow="${esc(name)}" aria-pressed="${name === shown.name}">${esc(name)}</button>`).join('')
  return `<div class="inner narrow">
    <div class="flow-tools"><div class="filters" role="group">${picks}</div><p class="source">${icon('file')}<code>${esc(shown.file ?? ui(lang, 'plugin'))}</code></p></div>
    ${shown.goal ? `<p class="goal"><span>${esc(ui(lang, 'goal'))}</span> ${esc(shown.goal)}</p>` : ''}
    ${renderFlow(shown, lang)}
  </div>`
}
