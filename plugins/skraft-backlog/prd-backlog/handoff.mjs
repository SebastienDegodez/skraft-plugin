// The HVE handoff: the planned GitHub operations as planning files a human reviews before anything
// is created. The plan holds only stories whose file passed its checks and whose epic the review
// approved; everything else is listed as needing review, never published.
import { buildOrder } from './story-map.mjs'
import { leaksOf, renderEpicIssue, renderStoryIssue, say } from './render.mjs'

export const BASE_LABELS = Object.freeze([
  { name: 'skraft-backlog', color: '1f6feb', description: 'Story or epic published by the skraft-backlog PRD workflow' },
  { name: 'type/epic', color: '5319e7', description: 'Tracking issue of an epic' },
  { name: 'type/story', color: '0e8a16', description: 'User story ready for design' },
  { name: 'status/ready', color: '0e8a16', description: 'Passed the Definition of Ready and the planning review' },
  { name: 'priority/must', color: 'b60205', description: 'MoSCoW: must have' },
  { name: 'priority/should', color: 'd93f0b', description: 'MoSCoW: should have' },
  { name: 'priority/could', color: 'fbca04', description: 'MoSCoW: could have' },
  ...[1, 2, 3, 5, 8].map((points) => ({ name: `effort/${points}`, color: 'c5def5', description: `Effort: ${points} point(s)` })),
])

export const REVIEWED = /^>?\s*-\s+\[[xX]\]\s+Reviewed and validated by a qualified human reviewer\s*$/m

/**
 * @typedef {{
 *   slug: string, prd: string, repo: string | null, language: 'fr' | 'en', prdUrl: string,
 *   map: import('./story-map.mjs').StoryMap,
 *   files: Map<string, import('./story.mjs').StoryFile>,
 *   ready: Set<string>, notReady: Map<string, string[]>,
 * }} Backlog ready: story ids to publish; notReady: story id → why it is held back
 * @typedef {{ ref: string, temp: string, kind: 'epic' | 'story', id: string, title: string, labels: string[],
 *   milestone: string | null, body: string, parentId: string | null, after: string[], blockedBy: string[] }} PlannedIssue
 * @typedef {{ labels: typeof BASE_LABELS, milestones: import('./story-map.mjs').Milestone[], issues: PlannedIssue[],
 *   links: { ref: string, type: 'sub-issue' | 'blocked-by', from: string, to: string }[], notReady: Map<string, string[]> }} Plan
 */

/**
 * The operations of the handoff, in the HVE GitHub order: creates (epics before their stories,
 * stories in build order), then links once both ends exist.
 * @param {Backlog} backlog
 * @returns {Plan}
 */
export const planOperations = (backlog) => {
  const { map, ready } = backlog
  const issues = []
  const counter = { n: 0 }
  const next = () => { counter.n += 1; return { ref: `IS${String(counter.n).padStart(3, '0')}`, temp: `{{TEMP-${counter.n}}}` } }
  const epics = map.epics.filter((e) => e.stories.some((s) => ready.has(s.id)))
  const temps = {}
  for (const epic of epics) issues.push(epicIssue(epic, backlog, remember(temps, epic.id, next())))
  for (const story of buildOrder(map).filter((s) => ready.has(s.id))) issues.push(storyIssue(story, backlog, remember(temps, story.id, next()), temps))
  const links = []
  for (const issue of issues.filter((i) => i.kind === 'story')) {
    links.push({ ...next(), type: 'sub-issue', from: /** @type {string} */ (issue.parentId), to: issue.id })
    for (const dependency of issue.blockedBy) links.push({ ...next(), type: 'blocked-by', from: issue.id, to: dependency })
  }
  const used = new Set(issues.map((i) => i.milestone))
  return { labels: BASE_LABELS, milestones: map.milestones.filter((m) => used.has(m.id)), issues, links: links.map(({ temp, ...link }) => link), notReady: backlog.notReady }
}

/** @param {Record<string, string>} temps @param {string} id @param {{ ref: string, temp: string }} ids */
const remember = (temps, id, ids) => { temps[id] = ids.temp; return ids }

/** @param {import('./story-map.mjs').MapEpic} epic @param {Backlog} backlog @param {{ ref: string, temp: string }} ids */
const epicIssue = (epic, { language, prdUrl }, ids) => ({
  ...ids, kind: /** @type {const} */ ('epic'), id: epic.id, title: `feat(${epic.id.toLowerCase()}): ${epic.title}`,
  labels: ['skraft-backlog', 'type/epic'], milestone: null, body: renderEpicIssue(epic, { language, prdUrl }), parentId: null, after: [], blockedBy: [],
})

/**
 * A story's body names its epic and the stories it waits on by their `{{TEMP-N}}`: the publisher
 * replaces each with the issue number once that issue exists.
 * @param {import('./story-map.mjs').MapStory} planned @param {Backlog} backlog
 * @param {{ ref: string, temp: string }} ids @param {Record<string, string>} temps
 */
const storyIssue = (planned, { map, files, ready, language, prdUrl }, ids, temps) => {
  const file = /** @type {import('./story.mjs').StoryFile} */ (files.get(planned.id))
  const epic = /** @type {import('./story-map.mjs').MapEpic} */ (map.epics.find((e) => e.stories.includes(planned)))
  return {
    ...ids, kind: /** @type {const} */ ('story'), id: planned.id, title: `feat(${epic.id.toLowerCase()}): ${file.title}`,
    labels: ['skraft-backlog', 'type/story', 'status/ready', `priority/${planned.moscow}`, `effort/${file.effort.points}`],
    milestone: planned.milestone, body: renderStoryIssue(file, { language, prdUrl, parent: temps[epic.id], refs: temps }), parentId: epic.id,
    after: planned.after, blockedBy: planned.after.filter((id) => ready.has(id)),
  }
}

/**
 * Problems that forbid publishing the plan: a body that would leak local planning text, or a
 * story waiting on a story the plan holds back.
 * @param {Plan} plan
 * @returns {string[]}
 */
export const planProblems = (plan) => [
  ...plan.issues.flatMap((issue) => leaksOf(issue.body, { placeholders: false }).map((leak) => `${issue.id}: the body carries ${leak}`)),
  ...[...plan.notReady.keys()].flatMap((held) => plan.issues
    .filter((issue) => issue.after.includes(held))
    .map((issue) => `${issue.id} waits on ${held}, which is held back: publish both or neither`)),
]

/**
 * Holds back every story that waits, directly or not, on a held-back story: a story is published
 * with all it waits on, or not at all.
 * @param {import('./story-map.mjs').StoryMap} map
 * @param {Map<string, string[]>} notReady
 * @param {'fr' | 'en'} [language] the language of the reason a human reads
 * @returns {Map<string, string[]>}
 */
export const holdBackDependents = (map, notReady, language = 'en') => {
  const held = new Map(notReady)
  const stories = map.epics.flatMap((e) => e.stories)
  let changed = true
  while (changed) {
    changed = false
    for (const story of stories.filter((s) => !held.has(s.id))) {
      const blocker = story.after.find((id) => held.has(id))
      if (blocker) { held.set(story.id, [say(language, 'heldBehind', { blocker })]); changed = true }
    }
  }
  return held
}

/**
 * The four planning files of the HVE contract, under `.copilot-tracking/github-issues/prds/<slug>/`.
 * @param {Plan} plan
 * @param {Backlog} backlog
 * @param {{ now: string, autonomy?: string }} context now: an ISO timestamp
 * @returns {Record<string, string>}
 */
export const renderHandoffFiles = (plan, backlog, { now, autonomy = 'partial' }) => {
  const guard = ['<!-- markdownlint-disable-file -->', '<!-- markdown-table-prettify-ignore-start -->']
  const end = '<!-- markdown-table-prettify-ignore-end -->'
  const project = backlog.repo ?? 'unresolved'
  return {
    'planning-log.md': [...guard, `# Planning Log - ${backlog.slug}`, '', '* **Planning Type**: prds', `* **Project**: ${project}`, '* **Status**: Waiting for Review', '',
      '## Progress Log', '', `* [${now}] Story map checked and approved; stories written and reviewed by the planning lenses.`, `* [${now}] Handoff written; waiting for human review.`, '',
      '## Resume Context', '', '* **Current Phase**: Phase 5 — Finalize handoff', '* **Platform**: github', `* **Autonomy**: ${autonomy}`,
      `* **Pending Items**: ${plan.issues.length} creates, ${plan.links.length} links`, `* **Open Questions**: ${plan.notReady.size} stories held back`, '', end, ''].join('\n'),
    'artifact-analysis.md': [...guard, `# PRD Analysis - ${backlog.slug}`, '', `* **Artifact(s)**: ${backlog.prd}`, `* **Project**: ${project}`, '', '## Planned Items', '',
      ...plan.issues.flatMap((issue) => [`### ${issue.ref} - Create - ${issue.title}`, '', `* **Working Item Type**: ${issue.kind === 'epic' ? 'tracking issue (parent)' : 'sub-issue (story)'}`,
        `* **Working Labels**: ${issue.labels.join(', ')}`, `* **Milestone**: ${issue.milestone ?? 'none'}`, `* **Requirements**: ${requirementsOf(issue, backlog)}`, '']),
      ...(plan.notReady.size ? ['## Held back (needs_review)', '', ...[...plan.notReady].map(([id, reasons]) => `* ${id}: ${reasons.join('; ')}`), ''] : []), end, ''].join('\n'),
    'issues-plan.md': [...guard, '# Issues Plan', '', `* **Project**: ${project}`, `* **Source Scope**: ${backlog.prd}`, '',
      ...plan.issues.flatMap((issue) => issueEntry(issue, plan)), end, ''].join('\n'),
    'handoff.md': [...guard, `# Handoff - ${backlog.slug}`, '', `* **Project**: ${project}`, `* **Autonomy**: ${autonomy}`, '',
      '## Repository setup', '', ...plan.labels.map((l) => `* [ ] Label \`${l.name}\``), ...plan.milestones.map((m) => `* [ ] Milestone \`${m.title}\`${m.dueOn ? ` (due ${m.dueOn})` : ''}`), '',
      '## Planned Operations', '', '### Create', '', ...plan.issues.map((i) => `* [ ] ${i.ref} - Create - \`${i.temp}\` - ${i.title}`), '',
      '### Link', '', ...plan.links.map((l) => `* [ ] ${l.ref} - Link - \`${l.from}\` - ${l.type === 'sub-issue' ? `sub-issue \`${l.to}\`` : `blocked by \`${l.to}\``}`), '',
      '### No Change', '', ...(plan.notReady.size ? [...plan.notReady.keys()].map((id) => `* [ ] ${id} - held back (needs_review)`) : ['* [ ] none']), '',
      '## Planning Files', '', '* `artifact-analysis.md`', '* `issues-plan.md`', '* `planning-log.md`', '',
      '## Human Review', '', 'This section is the execution gate. Only a human may check the box below; the workflow publishes nothing while it is unchecked.', '',
      '> **Note** — The author created this content with assistance from AI. All outputs should be reviewed and validated by a qualified human reviewer before use.', '',
      '> - [ ] Reviewed and validated by a qualified human reviewer', '', end, ''].join('\n'),
  }
}

/** @param {PlannedIssue} issue @param {Backlog} backlog */
const requirementsOf = (issue, backlog) => {
  if (issue.kind === 'epic') return backlog.map.epics.find((e) => e.id === issue.id)?.covers.join(', ') ?? ''
  return [...new Set(backlog.files.get(issue.id)?.acceptanceCriteria.flatMap((c) => c.covers) ?? [])].join(', ')
}

/** @param {PlannedIssue} issue @param {Plan} plan */
const issueEntry = (issue, plan) => [
  `## ${issue.ref} - Create - ${issue.title}`, '',
  `${issue.kind === 'epic' ? 'Tracking issue of' : 'Story of'} ${issue.kind === 'epic' ? issue.id : `${issue.parentId}, ${issue.id}`}.`, '',
  `* ${issue.ref} - item_key: ${issue.temp}`,
  `* ${issue.ref} - summary: ${issue.title}`,
  `* ${issue.ref} - item_type: ${issue.kind === 'epic' ? 'tracking issue' : 'sub-issue'}`,
  `* ${issue.ref} - labels: ${issue.labels.join(', ')}`,
  `* ${issue.ref} - milestone: ${issue.milestone ?? 'none'}`,
  `* ${issue.ref} - parent: ${issue.parentId ? plan.issues.find((i) => i.id === issue.parentId)?.temp ?? issue.parentId : 'none'}`,
  `* ${issue.ref} - blocked_by: ${issue.blockedBy.map((id) => plan.issues.find((i) => i.id === id)?.temp ?? id).join(', ') || 'none'}`,
  '* needs_review: false', '',
  `### ${issue.ref} - body`, '', '```markdown', issue.body.trimEnd(), '```', '',
]

/** @param {string} handoff @returns {boolean} the human checked the review box */
export const isReviewed = (handoff) => REVIEWED.test(handoff)
