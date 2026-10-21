// The story map the slicer writes, checked before anyone reads it: every PRD requirement lands in
// a story or is deferred with a reason, dependencies point at stories that exist, run one way only
// and never into a later milestone, and each epic opens with its tracer bullet.

export const EFFORTS = Object.freeze([1, 2, 3, 5, 8])
export const MOSCOW = Object.freeze(['must', 'should', 'could'])
export const MAX_STORIES_PER_EPIC = 12

/**
 * @typedef {{ id: string, title: string, dueOn?: string, description?: string }} Milestone
 * @typedef {{ id: string, title: string, persona: string, description: string, covers: string[], after: string[],
 *   milestone: string, moscow: string, effort: number, tracer?: boolean }} MapStory
 * @typedef {{ id: string, title: string, outcome: string, doneWhen: string[], covers: string[], stories: MapStory[] }} MapEpic
 * @typedef {{ schemaVersion: number, milestones: Milestone[], epics: MapEpic[], deferred?: { id: string, reason: string }[], decisions?: string[] }} StoryMap
 * @typedef {{ problems: string[], warnings: string[] }} Findings
 */

/** A story covering more FRs than this, or sized 8, is flagged to the human before approval. */
export const MAX_FR_PER_STORY = 4

/** @param {StoryMap} map @returns {MapStory[]} */
export const storiesOf = (map) => map.epics.flatMap((epic) => epic.stories)

const isText = (value) => typeof value === 'string' && value.trim() !== ''
const isTextList = (value) => Array.isArray(value) && value.every(isText)
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/**
 * What a script can fix in a story map without asking the slicer again: a milestone written as a
 * bare string, a milestone a story names but the map does not declare, the tracer flag (always the
 * first story of an epic, never another), a MoSCoW in capitals, an effort written as text, a
 * missing `after`. The slicer decides the order; the order decides the tracer.
 * @param {unknown} map
 * @returns {{ map: unknown, changes: string[] }}
 */
export const normalizeStoryMap = (map) => {
  if (!isRecord(map) || !Array.isArray(/** @type {any} */ (map).epics)) return { map, changes: [] }
  const copy = structuredClone(/** @type {any} */ (map))
  const changes = []
  for (const epic of copy.epics) if (isRecord(epic) && Array.isArray(epic.stories)) normalizeStories(epic, changes)
  normalizeMilestones(copy, changes)
  return { map: copy, changes }
}

/** @param {any} map @param {string[]} changes */
const normalizeMilestones = (map, changes) => {
  const declared = Array.isArray(map.milestones) ? map.milestones : []
  map.milestones = declared.map((milestone) => {
    if (!isText(milestone)) return milestone
    changes.push(`milestone "${milestone}" was a bare string: declared as { id: "${milestone}", title: "${milestone}" }`)
    return { id: milestone, title: milestone }
  })
  const ids = new Set(map.milestones.map((m) => m?.id))
  for (const story of map.epics.flatMap((e) => (Array.isArray(e?.stories) ? e.stories : []))) {
    if (!isText(story?.milestone) || ids.has(story.milestone)) continue
    ids.add(story.milestone)
    map.milestones.push({ id: story.milestone, title: story.milestone })
    changes.push(`milestone ${story.milestone} is used by ${story.id} but was not declared: declared after the others`)
  }
}

/** @param {any} epic @param {string[]} changes */
const normalizeStories = (epic, changes) => {
  epic.stories.forEach((story, index) => {
    if (!isRecord(story)) return
    normalizeTracer(story, index === 0, epic.id, changes)
    if (isText(story.moscow) && story.moscow !== story.moscow.trim().toLowerCase() && MOSCOW.includes(story.moscow.trim().toLowerCase())) {
      changes.push(`${story.id}: moscow ${story.moscow} written ${story.moscow.trim().toLowerCase()}`)
      story.moscow = story.moscow.trim().toLowerCase()
    }
    if (isText(story.effort) && EFFORTS.includes(Number(story.effort))) {
      changes.push(`${story.id}: effort "${story.effort}" written as a number`)
      story.effort = Number(story.effort)
    }
    if (story.after === undefined) story.after = []
  })
}

/** @param {any} story @param {boolean} first @param {string} epic @param {string[]} changes */
const normalizeTracer = (story, first, epic, changes) => {
  if (first && story.tracer !== true) {
    story.tracer = true
    changes.push(`${story.id} opens ${epic}: marked as its tracer bullet`)
  } else if (!first && 'tracer' in story) {
    if (story.tracer === true) changes.push(`${story.id} does not open ${epic}: tracer flag removed`)
    delete story.tracer
  }
}

/**
 * @param {unknown} map
 * @param {import('./prd-inventory.mjs').Inventory} inventory
 * @returns {Findings}
 */
export const checkStoryMap = (map, inventory) => {
  const findings = { problems: [], warnings: [] }
  if (!shapeHolds(map, findings)) return findings
  const typed = /** @type {StoryMap} */ (map)
  checkIds(typed, findings)
  checkCoverage(typed, inventory, findings)
  checkMilestones(typed, findings)
  checkEpics(typed, findings)
  checkDependencies(typed, findings)
  checkSizes(typed, findings)
  return findings
}

/**
 * Stories likely too big for one review: sized 8, or carrying more FRs than one story usually
 * delivers. A warning for the human who approves the map, not a refusal.
 * @param {StoryMap} map @param {Findings} findings
 */
const checkSizes = (map, { warnings }) => {
  for (const story of storiesOf(map)) {
    const frs = story.covers.filter((id) => /^FR-/.test(id)).length
    if (story.effort === 8) warnings.push(`${story.id} is sized 8: check it against the split patterns before approving`)
    else if (frs > MAX_FR_PER_STORY) warnings.push(`${story.id} carries ${frs} FRs: check it against the split patterns before approving`)
  }
}

/** @param {unknown} map @param {Findings} findings */
const shapeHolds = (map, { problems }) => {
  const record = /** @type {Record<string, any>} */ (map)
  if (!record || typeof record !== 'object') return problems.push('the story map is not a JSON object') && false
  if (record.schemaVersion !== 1) problems.push('schemaVersion must be 1')
  if (!Array.isArray(record.milestones) || record.milestones.length === 0) problems.push('milestones must list at least one milestone')
  if (!Array.isArray(record.epics) || record.epics.length === 0) problems.push('epics must list at least one epic')
  if (problems.length) return false
  record.epics.forEach((epic, index) => epicShape(epic, `epics[${index}]`, problems))
  return problems.length === 0
}

/** @param {any} epic @param {string} at @param {string[]} problems */
const epicShape = (epic, at, problems) => {
  for (const field of ['id', 'title', 'outcome']) if (!isText(epic?.[field])) problems.push(`${at}.${field} must be a non-empty string`)
  if (!isTextList(epic?.doneWhen) || epic.doneWhen.length === 0) problems.push(`${at}.doneWhen must list at least one end check`)
  if (!isTextList(epic?.covers)) problems.push(`${at}.covers must be a list of requirement ids`)
  if (!Array.isArray(epic?.stories) || epic.stories.length === 0) return problems.push(`${at}.stories must list at least one story`)
  epic.stories.forEach((story, index) => storyShape(story, `${epic.id ?? at}.stories[${index}]`, problems))
}

/** @param {any} story @param {string} at @param {string[]} problems */
const storyShape = (story, at, problems) => {
  for (const field of ['id', 'title', 'persona', 'description', 'milestone']) if (!isText(story?.[field])) problems.push(`${at}.${field} must be a non-empty string`)
  if (!isTextList(story?.covers) || story.covers.length === 0) problems.push(`${at}.covers must name at least one requirement`)
  if (!isTextList(story?.after)) problems.push(`${at}.after must be a list of story ids ([] when none)`)
  if (!MOSCOW.includes(story?.moscow)) problems.push(`${at}.moscow must be one of ${MOSCOW.join(', ')}`)
  if (!EFFORTS.includes(story?.effort)) problems.push(`${at}.effort must be one of ${EFFORTS.join(', ')} (above 8: split the story)`)
}

/** @param {StoryMap} map @param {Findings} findings */
const checkIds = (map, { problems }) => {
  const ids = [...map.epics.map((e) => e.id), ...storiesOf(map).map((s) => s.id), ...map.milestones.map((m) => m.id)]
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))]
  for (const id of duplicates) problems.push(`${id} is used more than once`)
}

/**
 * @param {StoryMap} map
 * @param {import('./prd-inventory.mjs').Inventory} inventory
 * @param {Findings} findings
 */
const checkCoverage = (map, inventory, { problems, warnings }) => {
  const known = new Set(inventory.requirements.map((r) => r.id))
  const deferred = new Map((map.deferred ?? []).map((d) => [d.id, d.reason]))
  const covered = new Set(storiesOf(map).flatMap((s) => s.covers))
  for (const story of storiesOf(map)) {
    for (const id of story.covers) if (!known.has(id)) problems.push(`${story.id} covers ${id}, which the PRD does not define`)
  }
  for (const [id, reason] of deferred) {
    if (!known.has(id)) problems.push(`deferred ${id} is not defined by the PRD`)
    if (!isText(reason)) problems.push(`deferred ${id} has no reason`)
    if (covered.has(id)) problems.push(`${id} is both deferred and covered by a story`)
  }
  for (const requirement of inventory.requirements.filter((r) => r.kind === 'FR')) {
    if (!covered.has(requirement.id) && !deferred.has(requirement.id)) problems.push(`${requirement.id} is covered by no story and not deferred`)
  }
  const nfrs = inventory.requirements.filter((r) => r.kind === 'NFR' && !covered.has(r.id) && !deferred.has(r.id)).map((r) => r.id)
  if (nfrs.length) warnings.push(`no story carries ${nfrs.length} NFR(s): ${nfrs.slice(0, 10).join(', ')}${nfrs.length > 10 ? '…' : ''}`)
}

/** @param {StoryMap} map @param {Findings} findings */
const checkMilestones = (map, { problems }) => {
  const milestones = new Set(map.milestones.map((m) => m.id))
  for (const story of storiesOf(map)) if (!milestones.has(story.milestone)) problems.push(`${story.id} is in milestone ${story.milestone}, which the map does not declare`)
}

/** @param {StoryMap} map @param {Findings} findings */
const checkEpics = (map, { problems, warnings }) => {
  for (const epic of map.epics) {
    const own = new Set(epic.covers)
    for (const story of epic.stories) {
      for (const id of story.covers) if (!own.has(id)) problems.push(`${story.id} covers ${id}, which its epic ${epic.id} does not list in covers`)
    }
    const tracers = epic.stories.filter((s) => s.tracer === true)
    if (tracers.length !== 1 || epic.stories[0].tracer !== true) problems.push(`${epic.id} must open with exactly one tracer story (tracer: true on its first story)`)
    if (epic.stories.length > MAX_STORIES_PER_EPIC) warnings.push(`${epic.id} has ${epic.stories.length} stories: offer a split of the epic`)
  }
}

/** @param {StoryMap} map @param {Findings} findings */
const checkDependencies = (map, { problems }) => {
  const stories = new Map(storiesOf(map).map((s) => [s.id, s]))
  const order = new Map(map.milestones.map((m, index) => [m.id, index]))
  for (const story of stories.values()) {
    for (const dependency of story.after) {
      const target = stories.get(dependency)
      if (!target) problems.push(`${story.id} waits on ${dependency}, which is no story of the map`)
      else if (dependency === story.id) problems.push(`${story.id} waits on itself`)
      else if ((order.get(target.milestone) ?? 0) > (order.get(story.milestone) ?? 0)) {
        problems.push(`${story.id} (${story.milestone}) waits on ${dependency}, planned in the later milestone ${target.milestone}`)
      }
    }
  }
  for (const cycle of cyclesOf(stories)) problems.push(`dependency cycle: ${cycle.join(' -> ')}`)
}

/**
 * Each cycle of the `after` graph once, as the path that closes it.
 * @param {Map<string, MapStory>} stories
 * @returns {string[][]}
 */
export const cyclesOf = (stories) => {
  const state = new Map()
  const cycles = []
  const visit = (id, path) => {
    state.set(id, 'open')
    for (const next of stories.get(id)?.after ?? []) {
      if (!stories.has(next)) continue
      if (state.get(next) === 'open') cycles.push([...path.slice(path.indexOf(next)), next])
      else if (!state.has(next)) visit(next, [...path, next])
    }
    state.set(id, 'done')
  }
  for (const id of stories.keys()) if (!state.has(id)) visit(id, [id])
  return cycles
}

/**
 * The stories in an order that never puts a story before one it waits on: milestones first, then
 * the map's own order. Stories caught in a cycle keep the map's order.
 * @param {StoryMap} map
 * @returns {MapStory[]}
 */
export const buildOrder = (map) => {
  const order = new Map(map.milestones.map((m, index) => [m.id, index]))
  const all = storiesOf(map)
  const position = new Map(all.map((s, index) => [s.id, index]))
  const byId = new Map(all.map((s) => [s.id, s]))
  const placed = new Set()
  const result = []
  const place = (story, trail = new Set()) => {
    if (placed.has(story.id) || trail.has(story.id)) return
    trail.add(story.id)
    for (const id of story.after) if (byId.has(id)) place(/** @type {MapStory} */ (byId.get(id)), trail)
    placed.add(story.id)
    result.push(story)
  }
  const sorted = [...all].sort((a, b) => (order.get(a.milestone) ?? 0) - (order.get(b.milestone) ?? 0) || (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0))
  for (const story of sorted) place(story)
  return result
}
