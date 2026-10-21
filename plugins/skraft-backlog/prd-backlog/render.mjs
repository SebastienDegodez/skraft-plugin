// Everything a human or a lens reads is rendered from the JSON the agents wrote, never written by
// hand: the story map for the first review, the stories and criteria files the planning lenses
// judge, and the GitHub issue bodies.
import { buildOrder, storiesOf } from './story-map.mjs'
import { openQuestionsOf } from './story.mjs'

/** @typedef {'fr' | 'en'} Language */

const WORDS = Object.freeze({
  fr: {
    asA: 'En tant que', iWant: 'je veux', soThat: 'afin de', story: 'Story', examples: 'Exemples du domaine',
    criteria: "Critères d'acceptation", tasks: 'Tâches', devNotes: 'Notes de développement', context: 'Contexte',
    references: 'Références du PRD', testing: 'Preuve', technical: 'Notes techniques', dependencies: 'Dépendances',
    none: 'Aucune', effort: 'Taille', dor: 'Definition of Ready', related: 'Liens', parent: 'Parent',
    blockedBy: 'Bloquée par', prd: 'PRD', outcome: 'Résultat', doneWhen: 'Terminé quand', children: 'Stories',
    openQuestions: 'Questions ouvertes', points: 'points', answer: 'Réponse :', why: 'Pourquoi :',
    dorItems: ['Problème utilisateur énoncé', 'Persona précis', 'Au moins 3 exemples du domaine', 'Scénarios Étant donné / Quand / Alors',
      'Chaque critère dérive d\'un exemple', 'Taille de 1 à 8 points', 'Notes techniques renseignées', 'Dépendances listées'],
    given: 'Étant donné', when: 'Quand', then: 'Alors', and: 'Et',
  },
  en: {
    asA: 'As a', iWant: 'I want', soThat: 'so that', story: 'Story', examples: 'Domain examples',
    criteria: 'Acceptance criteria', tasks: 'Tasks', devNotes: 'Dev notes', context: 'Context',
    references: 'PRD references', testing: 'Proof', technical: 'Technical notes', dependencies: 'Dependencies',
    none: 'None', effort: 'Effort', dor: 'Definition of Ready', related: 'Related', parent: 'Parent',
    blockedBy: 'Blocked by', prd: 'PRD', outcome: 'Outcome', doneWhen: 'Done when', children: 'Stories',
    openQuestions: 'Open questions', points: 'points', answer: 'Answer:', why: 'Why:',
    dorItems: ['User problem stated', 'Specific persona', 'At least 3 domain examples', 'Given / When / Then scenarios',
      'Each criterion derives from an example', 'Sized 1 to 8 points', 'Technical notes filled in', 'Dependencies listed'],
    given: 'Given', when: 'When', then: 'Then', and: 'And',
  },
})

/** @param {Language} language */
export const wordsOf = (language) => WORDS[language] ?? WORDS.en

/**
 * What the workflow itself writes for a human — the lens inputs and the reasons a story is held
 * back — in the language of the PRD. Ids, YAML keys and the `depends_on` field stay as they are.
 */
const TEXTS = Object.freeze({
  fr: {
    milestoneSummary: 'Synthèse des jalons', theme: 'Thème', milestones: 'Jalons', sprintPlan: 'Plan de sprint',
    capacity: 'Capacité : {points} points.', stories: 'Stories', persona: 'persona', story: 'story', effort: 'effort',
    priority: 'priorité', criteria: "critères d'acceptation", dor: 'dor', checked: 'vérifiée', notWritten: 'non écrite',
    statement: 'En tant que {asA}, je veux {iWant}, afin de {soThat}',
    plannedLine: 'dépendances : planifiées dans la carte approuvée, construites avant — {list}',
    plannedDependencies: 'Chaque `depends_on` ci-dessous est déclaré dans la carte de stories approuvée, contrôlée par un script : '
      + "la story nommée existe, est construite avant (même jalon ou jalon antérieur, sans cycle) et peut appartenir à une autre épic. "
      + 'Une dépendance déclarée et ordonnée satisfait Indépendante (I) et G2.',
    examples: 'Exemples du domaine', acceptance: "Critères d'acceptation", from: 'depuis {example}', technical: 'Notes techniques',
    dependencies: 'Dépendances', none: 'Aucune', effortTitle: 'Taille', asA: 'En tant que', iWant: 'je veux', soThat: 'afin de',
    given: 'Étant donné', when: 'Quand', then: 'Alors', and: 'Et',
    heldBehind: 'attend {blocker}, qui est retenue',
    reviewEnded: "la revue de planification de {story} ({epic}) s'est terminée {verdict}",
    sliceMissing: "SLICE : {lens} constate que {story} s'appuie sur {add}, que son `after` n'ordonne pas — ajouter {add} à son `after` "
      + 'dans story-map.json (ou rejeter le constat), puis relancer ({description})',
    writerFailed: 'le rédacteur de la story a échoué',
    unreadable: '{story}.json est illisible : {error}',
    notElaborated: "son épic n'a pas été élaborée dans ce run",
    elaborationFailed: "l'élaboration de {epic} a échoué",
    notReviewed: 'retenue avant la revue, non jugée',
    notCorrected: "aucune correction acceptée ne la touche : elle reste où la revue l'a laissée",
  },
  en: {
    milestoneSummary: 'Milestone summary', theme: 'Theme', milestones: 'Milestones', sprintPlan: 'Sprint plan',
    capacity: 'Capacity: {points} points.', stories: 'Stories', persona: 'persona', story: 'story', effort: 'effort',
    priority: 'priority', criteria: 'acceptance criteria', dor: 'dor', checked: 'checked', notWritten: 'not written',
    statement: 'As a {asA}, I want {iWant}, so that {soThat}',
    plannedLine: 'dependencies: planned in the approved story map, built first — {list}',
    plannedDependencies: 'Every `depends_on` below is declared in the approved story map, which a script checked: '
      + 'the story it names exists, is built first (same or earlier milestone, no cycle), and may sit in another epic. '
      + 'A declared, ordered dependency passes Independent (I) and G2.',
    examples: 'Domain Examples', acceptance: 'Acceptance Criteria', from: 'from {example}', technical: 'Technical Notes',
    dependencies: 'Dependencies', none: 'None', effortTitle: 'Effort', asA: 'As a', iWant: 'I want', soThat: 'So that',
    given: 'Given', when: 'When', then: 'Then', and: 'And',
    heldBehind: 'waits on {blocker}, which is held back',
    reviewEnded: 'the planning review of {story} ({epic}) ended {verdict}',
    sliceMissing: 'SLICE: {lens} finds that {story} relies on {add}, which its `after` does not order — add {add} to its `after` '
      + 'in story-map.json (or reject the finding), then run again ({description})',
    writerFailed: 'the story writer failed',
    unreadable: '{story}.json cannot be read: {error}',
    notElaborated: 'its epic was not elaborated in this run',
    elaborationFailed: 'the elaboration of {epic} failed',
    notReviewed: 'held before the review, not judged',
    notCorrected: 'no accepted correction touches it: it stays where the review left it',
  },
})

/**
 * One text of the workflow in a language, its `{name}` replaced (lists read "a, b").
 * @param {string} language @param {keyof typeof TEXTS.en} key @param {Record<string, unknown>} [params]
 */
export const say = (language, key, params = {}) => (TEXTS[language] ?? TEXTS.en)[key]
  .replace(/\{(\w+)\}/g, (_, name) => (Array.isArray(params[name]) ? params[name].join(', ') : String(params[name] ?? '')))

/** The hidden marker that makes a published issue findable again: one per story or epic. */
export const markerOf = (id) => `<!-- skraft-backlog:item=${id} -->`
export const MARKER = /<!-- skraft-backlog:item=([^\s]+) -->/

const list = (items) => items.map((item) => `- ${item}`).join('\n')
const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')

/**
 * The story map as the reviewer reads it before any story is written.
 * @param {import('./story-map.mjs').StoryMap} map
 * @param {{ prd: string, findings: import('./story-map.mjs').Findings }} context
 */
export const renderStoryMap = (map, { prd, findings }) => {
  const stories = buildOrder(map)
  const lines = [
    '<!-- markdownlint-disable-file -->',
    '# Story map',
    '',
    `Source: \`${prd}\`. ${map.epics.length} epics, ${stories.length} stories, ${map.milestones.length} milestones.`,
    'Edit `story-map.json`, not this file; the workflow renders it again on resume.',
    '',
    '## Milestones',
    '',
    '| Milestone | Title | Due | Stories | Points |',
    '|-----------|-------|-----|---------|--------|',
    ...map.milestones.map((m) => {
      const own = stories.filter((s) => s.milestone === m.id)
      return `| ${m.id} | ${cell(m.title)} | ${m.dueOn ?? ''} | ${own.length} | ${own.reduce((sum, s) => sum + s.effort, 0)} |`
    }),
    '',
    '## Build order',
    '',
    '| # | Story | Epic | Milestone | MoSCoW | Points | Waits on | Covers |',
    '|---|-------|------|-----------|--------|--------|----------|--------|',
    ...stories.map((s, index) => `| ${index + 1} | ${s.id}${s.tracer ? ' (tracer)' : ''} — ${cell(s.title)} | ${epicOf(map, s.id)} | ${s.milestone} | ${s.moscow} | ${s.effort} | ${s.after.join(', ') || '—'} | ${s.covers.join(', ')} |`),
    '',
    '## Epics',
    '',
    ...map.epics.flatMap((e) => [`### ${e.id} — ${e.title}`, '', e.outcome, '', list(e.doneWhen.map((d) => `[ ] ${d}`)), '']),
    ...(map.deferred?.length ? ['## Deferred', '', list(map.deferred.map((d) => `${d.id}: ${d.reason}`)), ''] : []),
    ...(map.decisions?.length ? ['## Decisions', '', list(map.decisions), ''] : []),
    ...(findings.warnings.length ? ['## Warnings', '', list(findings.warnings), ''] : []),
  ]
  return `${lines.join('\n')}\n`
}

/** @param {import('./story-map.mjs').StoryMap} map @param {string} storyId */
const epicOf = (map, storyId) => map.epics.find((e) => e.stories.some((s) => s.id === storyId))?.id ?? ''

/**
 * The stories file of one epic, the input of the planning lenses (`depends_on` per story), in the
 * language of the PRD.
 * @param {import('./story-map.mjs').MapEpic} epic
 * @param {import('./story-map.mjs').StoryMap} map
 * @param {Map<string, import('./story.mjs').StoryFile>} files
 * @param {Language} [language]
 */
export const renderStoriesFile = (epic, map, files, language = 'en') => {
  const milestones = [...new Set(epic.stories.map((s) => s.milestone))]
  const titles = milestones.map((id) => map.milestones.find((m) => m.id === id)?.title ?? id)
  const points = epic.stories.reduce((sum, s) => sum + (files.get(s.id)?.effort?.points ?? s.effort), 0)
  const lines = [
    '<!-- markdownlint-disable-file -->',
    `# ${say(language, 'stories')} — ${epic.id} ${epic.title}`,
    '',
    `## ${say(language, 'milestoneSummary')}`,
    '',
    `${say(language, 'theme')}: ${epic.outcome}`,
    `${say(language, 'milestones')}: ${titles.join(', ')}`,
    '',
    `## ${say(language, 'sprintPlan')}`,
    '',
    '| Story | MoSCoW | Points | Milestone | depends_on |',
    '|-------|--------|--------|-----------|------------|',
    ...epic.stories.map((s) => `| ${s.id}${files.has(s.id) ? '' : ` (${say(language, 'notReviewed')})`} | ${s.moscow} | ${files.get(s.id)?.effort?.points ?? s.effort} | ${s.milestone} | ${s.after.join(', ') || 'none'} |`),
    '',
    say(language, 'capacity', { points }),
    '',
    say(language, 'plannedDependencies'),
    '',
    `## ${say(language, 'stories')}`,
    '',
    ...epic.stories.filter((s) => files.has(s.id)).flatMap((s) => storyEntry(s, files.get(s.id), map, language)),
  ]
  return `${lines.join('\n')}\n`
}

/** The note above the stories of a stories file, in English: what every `depends_on` is. */
export const PLANNED_DEPENDENCIES = say('en', 'plannedDependencies')

/**
 * @param {import('./story-map.mjs').MapStory} planned @param {import('./story.mjs').StoryFile | undefined} file
 * @param {import('./story-map.mjs').StoryMap} map @param {Language} language
 */
const storyEntry = (planned, file, map, language) => [
  `### ${planned.id} — ${file?.title ?? planned.title}`,
  '',
  `- id: ${planned.id}`,
  `- ${say(language, 'persona')}: ${file?.persona ?? planned.persona}`,
  `- ${say(language, 'story')}: ${file ? say(language, 'statement', file.story) : planned.description}`,
  `- ${say(language, 'effort')}: ${file?.effort?.points ?? planned.effort}`,
  `- ${say(language, 'priority')}: ${planned.moscow}`,
  `- depends_on: [${planned.after.join(', ')}]`,
  ...(planned.after.length ? [`- ${say(language, 'plannedLine', { list: planned.after.map((id) => plannedDependency(map, id)) })}`] : []),
  ...criteriaEntry(file, language),
  `- ${say(language, 'dor')}: ${say(language, file ? 'checked' : 'notWritten')}`,
  '',
]

/** @param {import('./story-map.mjs').StoryMap} map @param {string} id */
const plannedDependency = (map, id) => `${id} (${epicOf(map, id)}, ${storiesOf(map).find((s) => s.id === id)?.milestone ?? '?'})`

/**
 * The criteria a lens judges Testable on: their count and titles.
 * @param {import('./story.mjs').StoryFile | undefined} file @param {Language} language
 */
const criteriaEntry = (file, language) => {
  const criteria = Array.isArray(file?.acceptanceCriteria) ? file.acceptanceCriteria : []
  if (!file) return []
  return [`- ${say(language, 'criteria')}: ${criteria.length}`, ...criteria.map((c) => `  - ${c.id}: ${c.title}`)]
}

/**
 * One story in the canonical template of the issue-refinement skill: the acceptance-criteria
 * draft the planning lenses read, in the language of the PRD.
 * @param {import('./story.mjs').StoryFile} story @param {Language} [language]
 */
export const renderAcDraft = (story, language = 'en') => {
  const t = (key, params) => say(language, key, params)
  const lines = [
    '<!-- markdownlint-disable-file -->',
    `## Story: ${story.id} — ${story.title}`,
    '',
    `**${t('asA')}** ${story.story.asA},`,
    `**${t('iWant')}** ${story.story.iWant},`,
    `**${t('soThat')}** ${story.story.soThat}.`,
    '',
    `### ${t('examples')}`,
    '',
    ...story.examples.map((e, index) => `${index + 1}. (${e.id}) ${e.text}`),
    '',
    `### ${t('acceptance')}`,
    '',
    ...story.acceptanceCriteria.flatMap((c) => [
      `**${c.id}:** ${c.title} (${t('from', { example: c.example })})`,
      `${t('given')} ${c.given}`,
      `${t('when')} ${c.when}`,
      ...c.then.map((then, index) => `${index === 0 ? t('then') : t('and')} ${then}`),
      '',
    ]),
    `### ${t('technical')}`,
    '',
    list(story.technicalNotes),
    '',
    `### ${t('dependencies')}`,
    '',
    story.dependencies.length ? list(story.dependencies.map((d) => `${d.story} — ${d.reason ?? ''}`)) : t('none'),
    '',
    `### ${t('effortTitle')}`,
    '',
    `${story.effort.points} — ${story.effort.rationale}`,
  ]
  return `${lines.join('\n')}\n`
}

/**
 * The body of a story issue: the story, its examples and criteria as checkboxes, the tasks and
 * dev notes a builder needs, then the links. Ids are kept; no local path ever appears.
 * @param {import('./story.mjs').StoryFile} story
 * @param {{ language: Language, prdUrl: string, parent?: string, refs?: Record<string, string> }} context
 *   parent: the epic issue reference; refs: the issue reference of each story it waits on
 */
export const renderStoryIssue = (story, { language, prdUrl, parent, refs = {} }) => {
  const w = wordsOf(language)
  const lines = [
    markerOf(story.id),
    '',
    story.description,
    '',
    `## ${w.story}`,
    '',
    `**${w.asA}** ${story.story.asA}, **${w.iWant}** ${story.story.iWant}, **${w.soThat}** ${story.story.soThat}.`,
    '',
    `## ${w.examples}`,
    '',
    ...story.examples.map((e, index) => `${index + 1}. ${e.text}`),
    '',
    `## ${w.criteria}`,
    '',
    ...story.acceptanceCriteria.flatMap((c) => [
      `- [ ] **${c.id} — ${c.title}** (${c.covers.join(', ')})`,
      `  ${w.given} ${c.given}`,
      `  ${w.when} ${c.when}`,
      ...c.then.map((t, index) => `  ${index === 0 ? w.then : w.and} ${t}`),
    ]),
    '',
    `## ${w.tasks}`,
    '',
    ...story.tasks.map((t) => `- [ ] ${t.text} (${t.acceptanceCriteria.join(', ')})`),
    '',
    `## ${w.devNotes}`,
    '',
    `### ${w.context}`,
    '',
    list(story.devNotes.context),
    '',
    `### ${w.references}`,
    '',
    list(story.devNotes.references.map((r) => `${r.id} — ${r.note}`)),
    '',
    `### ${w.testing}`,
    '',
    list(story.devNotes.testing),
    '',
    `## ${w.technical}`,
    '',
    list(story.technicalNotes),
    '',
    `## ${w.effort}`,
    '',
    `${story.effort.points} ${w.points} — ${story.effort.rationale}`,
    '',
    ...(story.openQuestions?.length ? [`## ${w.openQuestions}`, '', ...renderQuestions(story.openQuestions, w), ''] : []),
    `## ${w.dor}`,
    '',
    ...w.dorItems.map((item) => `- [x] ${item}`),
    '',
    `## ${w.related}`,
    '',
    ...(parent ? [`- ${w.parent}: ${parent}`] : []),
    ...(story.dependencies.length
      ? story.dependencies.map((d) => `- ${w.blockedBy}: ${refs[d.story] ?? d.story} (${d.story}) — ${d.reason}`)
      : [`- ${w.dependencies}: ${w.none}`]),
    `- ${w.prd}: ${prdUrl}`,
  ]
  return `${lines.join('\n')}\n`
}

/**
 * Each open question with its answer when the product owner gave one: answered ones are checked.
 * @param {unknown} questions @param {ReturnType<typeof wordsOf>} w
 */
const renderQuestions = (questions, w) => openQuestionsOf(questions).flatMap((q) => [
  `- [${q.answer ? 'x' : ' '}] **${q.id}** — ${q.question}`,
  ...(q.why ? [`  ${w.why} ${q.why}`] : []),
  ...(q.answer ? [`  ${w.answer} ${q.answer}`] : []),
])

/**
 * The body of an epic tracking issue.
 * @param {import('./story-map.mjs').MapEpic} epic
 * @param {{ language: Language, prdUrl: string, children?: string[] }} context children: `#12 title` lines once known
 */
export const renderEpicIssue = (epic, { language, prdUrl, children = [] }) => {
  const w = wordsOf(language)
  const lines = [
    markerOf(epic.id),
    '',
    epic.outcome,
    '',
    ...(children.length ? [`## ${w.children}`, '', list(children), ''] : []),
    `## ${w.doneWhen}`,
    '',
    ...epic.doneWhen.map((d) => `- [ ] ${d}`),
    '',
    `## ${w.related}`,
    '',
    `- ${w.prd}: ${prdUrl} (${epic.id}; ${epic.covers.length} ${language === 'fr' ? 'exigences' : 'requirements'})`,
  ]
  return `${lines.join('\n')}\n`
}

/**
 * The text that must never leave the workflow for GitHub, found in an outbound body.
 * @param {string} body
 * @returns {string[]}
 */
export const leaksOf = (body, { placeholders = true } = {}) => [
  ...(/\.copilot-tracking\//.test(body) ? ['a local .copilot-tracking path'] : []),
  ...(placeholders && /\{\{(?:[A-Z]+-)?TEMP-\d+\}\}/.test(body) ? ['an unresolved {{TEMP-N}} placeholder'] : []),
  ...(/\bIS\d{3}\b/.test(body) ? ['a planning reference id (IS###)'] : []),
]

export { storiesOf }
