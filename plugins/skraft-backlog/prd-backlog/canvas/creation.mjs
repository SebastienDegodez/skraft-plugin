// Creating issues from the canvas: a selection of reviewed stories, closed on what they wait on,
// becomes a sub-plan of the workflow's plan.json and goes through the workflow's own publisher.
// The order is fixed: a dry run of the exact selection first, then the creation of that same
// selection; a story is created with every story it waits on, or not at all.
import { createGitHub, publish, publishedItems } from '../publish.mjs'

/**
 * @typedef {ReturnType<typeof import('./assess.mjs').assessBacklog>} Assessment
 * @typedef {Assessment['stories'][number]} AssessedStory
 * @typedef {{ id: string, reason: 'unknown' | 'not-ready' | 'not-reviewed' | 'review-stale' | 'not-planned', via: string | null }} Missing
 * @typedef {{ stories: string[], existing: string[], epics: string[], missing: Missing[] }} Selection
 */

/**
 * The stories to create for the stories asked for: those, and every story they wait on that is not
 * published yet. A story that cannot be created (not ready, not reviewed, its review older than its
 * file) is listed in `missing` with the story that needed it.
 * @param {Assessment} assessment @param {string[]} ids
 * @returns {Selection}
 */
export const selectionOf = (assessment, ids) => {
  const byId = new Map(assessment.stories.map((s) => [s.id, s]))
  const chosen = new Set()
  const existing = new Set()
  /** @type {Missing[]} */
  const missing = []
  const seen = new Set()
  /** @param {string} id @param {string | null} via */
  const visit = (id, via) => {
    if (seen.has(id)) return
    seen.add(id)
    const story = byId.get(id)
    if (!story) return void missing.push({ id, reason: 'unknown', via })
    if (story.state === 'published') return void existing.add(id)
    const reason = story.state !== 'ready' ? 'not-ready' : story.review === 'none' ? 'not-reviewed' : story.review === 'stale' ? 'review-stale' : null
    if (reason) return void missing.push({ id, reason, via })
    chosen.add(id)
    for (const dependency of story.after) visit(dependency, id)
  }
  for (const id of ids) visit(id, null)
  const order = assessment.stories.map((s) => s.id)
  const stories = order.filter((id) => chosen.has(id))
  return {
    stories,
    existing: order.filter((id) => existing.has(id)),
    epics: [...new Set(stories.map((id) => /** @type {AssessedStory} */ (byId.get(id)).epic))],
    missing,
  }
}

/**
 * Every ready story a human reviewed and that is not published: what "create the reviewed stories"
 * means.
 * @param {Assessment} assessment
 */
export const reviewedStories = (assessment) => assessment.stories.filter((s) => s.state === 'ready' && s.review === 'reviewed').map((s) => s.id)

/**
 * The part of the workflow's plan that creates the selection: its epics and stories, the stories it
 * waits on that already exist (found again by their marker, so the links can be made), and the
 * links whose both ends are in it.
 * @param {NonNullable<import('./assess.mjs').RawBacklog['plan']>} plan @param {Selection} selection
 * @returns {{ plan: import('../handoff.mjs').Plan, problems: string[] }}
 */
export const subPlanOf = (plan, selection) => {
  const wanted = new Set([...selection.epics, ...selection.stories, ...selection.existing])
  const issues = plan.issues.filter((issue) => wanted.has(issue.id))
  const present = new Set(issues.map((issue) => issue.id))
  const problems = [...wanted].filter((id) => !present.has(id)).map((id) => `${id} is not in plan.json: run the workflow's handoff again`)
  const milestones = new Set(issues.map((issue) => issue.milestone))
  return {
    plan: {
      labels: plan.labels,
      milestones: plan.milestones.filter((m) => milestones.has(m.id)),
      issues,
      links: plan.links.filter((link) => present.has(link.from) && present.has(link.to) && selection.stories.includes(link.type === 'sub-issue' ? link.to : link.from)),
      notReady: new Map(),
    },
    problems,
  }
}

/**
 * The identity of a selection as the files read now: a preview stands for this selection only.
 * @param {Assessment} assessment @param {Selection} selection @param {string} repo
 */
export const selectionKey = (assessment, selection, repo) => {
  const fingerprints = new Map(assessment.stories.map((s) => [s.id, s.fingerprint]))
  return JSON.stringify({ repo, stories: selection.stories.map((id) => [id, fingerprints.get(id)]), existing: selection.existing })
}

/**
 * Runs the publisher on the sub-plan of a selection: a dry run, or the creation.
 * @param {{ raw: import('./assess.mjs').RawBacklog, assessment: Assessment, ids: string[], repo: string | null,
 *   gh: import('../publish.mjs').GhRun, dryRun: boolean }} request
 */
export const runSelection = async ({ raw, assessment, ids, repo, gh, dryRun }) => {
  const selection = selectionOf(assessment, ids)
  const refuse = (reason) => ({ status: /** @type {const} */ ('refused'), reason, selection })
  if (!raw.plan) return refuse('no plan.json yet: the workflow has not reached its handoff')
  if (!repo) return refuse('no repository to publish to')
  if (selection.missing.length) return refuse(`${selection.missing.length} story(ies) cannot be created`)
  if (!selection.stories.length) return refuse('nothing to create')
  const sub = subPlanOf(raw.plan, selection)
  if (sub.problems.length) return refuse(sub.problems.join('; '))
  const report = await publish({ plan: sub.plan, repo, github: createGitHub(gh), dryRun })
  const status = report.failed + report.skipped ? 'blocked' : dryRun ? 'simulated' : 'published'
  return {
    status: /** @type {const} */ (status), selection, report, key: selectionKey(assessment, selection, repo),
    published: dryRun ? {} : publishedItems(sub.plan, report, repo),
    issues: sub.plan.issues.map(({ ref, kind, id, title, parentId }) => ({ ref, kind, id, title, parentId })),
    links: sub.plan.links.map(({ ref, type, from, to }) => ({ ref, type, from, to })),
  }
}
