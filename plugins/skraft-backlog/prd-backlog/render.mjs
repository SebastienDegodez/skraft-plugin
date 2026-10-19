// Everything a human or a lens reads is rendered from the JSON the agents wrote, never written by
// hand: the story map for the first review, the stories and criteria files the planning lenses
// judge, and the GitHub issue bodies.
import { buildOrder, storiesOf } from './story-map.mjs'

/** @typedef {'fr' | 'en'} Language */

const WORDS = Object.freeze({
  fr: {
    asA: 'En tant que', iWant: 'je veux', soThat: 'afin de', story: 'Story', examples: 'Exemples du domaine',
    criteria: "Critères d'acceptation", tasks: 'Tâches', devNotes: 'Notes de développement', context: 'Contexte',
    references: 'Références du PRD', testing: 'Preuve', technical: 'Notes techniques', dependencies: 'Dépendances',
    none: 'Aucune', effort: 'Taille', dor: 'Definition of Ready', related: 'Liens', parent: 'Parent',
    blockedBy: 'Bloquée par', prd: 'PRD', outcome: 'Résultat', doneWhen: 'Terminé quand', children: 'Stories',
    openQuestions: 'Questions ouvertes', points: 'points',
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
    openQuestions: 'Open questions', points: 'points',
    dorItems: ['User problem stated', 'Specific persona', 'At least 3 domain examples', 'Given / When / Then scenarios',
      'Each criterion derives from an example', 'Sized 1 to 8 points', 'Technical notes filled in', 'Dependencies listed'],
    given: 'Given', when: 'When', then: 'Then', and: 'And',
  },
})

/** @param {Language} language */
export const wordsOf = (language) => WORDS[language] ?? WORDS.en

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
 * The stories file of one epic, the input of the planning lenses (`depends_on` per story).
 * @param {import('./story-map.mjs').MapEpic} epic
 * @param {import('./story-map.mjs').StoryMap} map
 * @param {Map<string, import('./story.mjs').StoryFile>} files
 */
export const renderStoriesFile = (epic, map, files) => {
  const milestones = [...new Set(epic.stories.map((s) => s.milestone))]
  const titles = milestones.map((id) => map.milestones.find((m) => m.id === id)?.title ?? id)
  const lines = [
    '<!-- markdownlint-disable-file -->',
    `# Stories — ${epic.id} ${epic.title}`,
    '',
    '## Milestone summary',
    '',
    `Theme: ${epic.outcome}`,
    `Milestones: ${titles.join(', ')}`,
    '',
    '## Sprint plan',
    '',
    '| Story | MoSCoW | Points | Milestone | depends_on |',
    '|-------|--------|--------|-----------|------------|',
    ...epic.stories.map((s) => `| ${s.id} | ${s.moscow} | ${files.get(s.id)?.effort?.points ?? s.effort} | ${s.milestone} | ${s.after.join(', ') || 'none'} |`),
    '',
    `Capacity: ${epic.stories.reduce((sum, s) => sum + (files.get(s.id)?.effort?.points ?? s.effort), 0)} points.`,
    '',
    '## Stories',
    '',
    ...epic.stories.flatMap((s) => storyEntry(s, files.get(s.id))),
  ]
  return `${lines.join('\n')}\n`
}

/** @param {import('./story-map.mjs').MapStory} planned @param {import('./story.mjs').StoryFile | undefined} file */
const storyEntry = (planned, file) => [
  `### ${planned.id} — ${file?.title ?? planned.title}`,
  '',
  `- id: ${planned.id}`,
  `- persona: ${file?.persona ?? planned.persona}`,
  `- story: ${file ? `As a ${file.story.asA}, I want ${file.story.iWant}, so that ${file.story.soThat}` : planned.description}`,
  `- effort: ${file?.effort?.points ?? planned.effort}`,
  `- priority: ${planned.moscow}`,
  `- depends_on: [${planned.after.join(', ')}]`,
  `- dor: ${file ? 'checked' : 'not written'}`,
  '',
]

/**
 * One story in the canonical template of the issue-refinement skill: the acceptance-criteria
 * draft the planning lenses read.
 * @param {import('./story.mjs').StoryFile} story
 */
export const renderAcDraft = (story) => {
  const lines = [
    '<!-- markdownlint-disable-file -->',
    `## Story: ${story.id} — ${story.title}`,
    '',
    `**As a** ${story.story.asA},`,
    `**I want** ${story.story.iWant},`,
    `**So that** ${story.story.soThat}.`,
    '',
    '### Domain Examples',
    '',
    ...story.examples.map((e, index) => `${index + 1}. (${e.id}) ${e.text}`),
    '',
    '### Acceptance Criteria',
    '',
    ...story.acceptanceCriteria.flatMap((c) => [
      `**${c.id}:** ${c.title} (from ${c.example})`,
      `Given ${c.given}`,
      `When ${c.when}`,
      ...c.then.map((t, index) => `${index === 0 ? 'Then' : 'And'} ${t}`),
      '',
    ]),
    '### Technical Notes',
    '',
    list(story.technicalNotes),
    '',
    '### Dependencies',
    '',
    story.dependencies.length ? list(story.dependencies.map((d) => `${d.story} — ${d.reason}`)) : 'None',
    '',
    '### Effort',
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
    ...(story.openQuestions?.length ? [`## ${w.openQuestions}`, '', list(story.openQuestions), ''] : []),
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
