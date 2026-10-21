// The planning review of one epic, read story by story. Before any verdict, the lens defects that
// talk about a dependency are sorted by what the approved map already says:
//   - every story the defect names is planned before or after this one (its `after`, followed
//     through the map): the dependency is declared and ordered, it passes Independent and G2
//     (invest-checklist) — the defect is dismissed;
//   - the defect names a story the map does not order against this one: the map misses a
//     dependency — only the map's owner can add it, so the defect goes to SLICE as a proposal,
//     never to the story writer.
// Then each story gets its own verdict from review-verdict.mjs: one weak story no longer holds
// back the stories of its epic that pass.
import { computeVerdict } from '../skills/backlog-review-lenses/scripts/review-verdict.mjs'
import { storiesOf } from './story-map.mjs'

const DEPENDENCY_TALK = /independen|indépendan|depend|dépend|waits? on|prerequisite|prérequis|landing first/i
// A defect that also fails another INVEST letter is kept whole: its other cause still holds.
const OTHER_LETTER = /\b(?:negotiable|valuable|estimable|small|testable|n[ée]gociable|valeur|petite?\b|testabilit)/i
const STORY_REF = /\b[A-Z][A-Z0-9]*-\d+-S\d+\b/g

/**
 * @typedef {{ id?: string, gate?: string, severity: string, story?: string, location?: string, description?: string, suggestion?: string }} Defect
 * @typedef {{ lens: string, verdict: string, defects: Defect[], error?: string }} LensResult
 * @typedef {{ story: string, add: string[], lens: string, gate?: string, description: string, after: string[], proposed: string[] }} SliceProposal
 */

/**
 * @param {LensResult[]} results the parsed lens results of one review
 * @param {import('./story-map.mjs').StoryMap} map the approved map
 * @returns {{ results: LensResult[], dismissed: Array<Defect & { lens: string, reason: string }>, slice: SliceProposal[] }}
 */
export const triageDefects = (results, map) => {
  const graph = orderOf(map)
  const dismissed = []
  const slice = []
  const kept = results.map((result) => {
    if (!Array.isArray(result.defects)) return result
    const defects = result.defects.filter((defect) => {
      const sorted = sortDefect(defect, graph)
      if (sorted.kind === 'declared') dismissed.push({ ...defect, lens: result.lens, reason: `${sorted.refs.join(', ')} declared and ordered in the approved story map` })
      if (sorted.kind === 'undeclared') slice.push(proposalOf(defect, result.lens, sorted.refs, graph))
      return sorted.kind === 'kept'
    })
    return { ...result, defects, verdict: verdictAfter(result, defects) }
  })
  return { results: kept, dismissed, slice }
}

/** A lens that failed only on defects now gone passes. @param {LensResult} result @param {Defect[]} defects */
const verdictAfter = (result, defects) => (result.verdict === 'fail' && result.defects.length > 0 && !defects.some(atLeastMedium) ? 'pass' : result.verdict)

/** @param {Defect} defect */
const atLeastMedium = (defect) => ['medium', 'high', 'blocker'].includes(String(defect.severity).toLowerCase())

/**
 * @param {Defect} defect @param {Map<string, { after: string[], before: Set<string>, ordered: Set<string> }>} graph
 * @returns {{ kind: 'kept' | 'declared' | 'undeclared', refs: string[] }}
 */
const sortDefect = (defect, graph) => {
  const story = String(defect.story ?? '').trim()
  const text = `${defect.location ?? ''} ${defect.description ?? ''}`
  if (!graph.has(story) || !DEPENDENCY_TALK.test(text) || OTHER_LETTER.test(text)) return { kind: 'kept', refs: [] }
  const refs = [...new Set(text.match(STORY_REF) ?? [])].filter((id) => id !== story && graph.has(id))
  if (!refs.length) return { kind: 'kept', refs }
  const ordered = /** @type {{ ordered: Set<string> }} */ (graph.get(story)).ordered
  const undeclared = refs.filter((id) => !ordered.has(id))
  return undeclared.length ? { kind: 'undeclared', refs: undeclared } : { kind: 'declared', refs }
}

/** @param {Defect} defect @param {string} lens @param {string[]} add @param {Map<string, { after: string[] }>} graph @returns {SliceProposal} */
const proposalOf = (defect, lens, add, graph) => {
  const story = String(defect.story)
  const after = /** @type {{ after: string[] }} */ (graph.get(story)).after
  return { story, add, lens, gate: defect.gate, description: String(defect.description ?? ''), after, proposed: [...after, ...add] }
}

/**
 * For each story, the stories the map orders against it: those it waits on and those that wait
 * on it, followed through `after`.
 * @param {import('./story-map.mjs').StoryMap} map
 */
const orderOf = (map) => {
  const after = new Map(storiesOf(map).map((s) => [s.id, s.after]))
  const waiters = (id) => [...after].filter(([, list]) => list.includes(id)).map(([other]) => other)
  const waitsOn = (id) => after.get(id) ?? []
  return new Map([...after].map(([id, list]) => [id, { after: list, ordered: new Set([...reach(id, waitsOn), ...reach(id, waiters)]) }]))
}

/** Every id reached from `start` through `next`. @param {string} start @param {(id: string) => string[]} next */
const reach = (start, next) => {
  const seen = new Set()
  const stack = [...next(start)]
  while (stack.length) {
    const id = /** @type {string} */ (stack.pop())
    if (seen.has(id)) continue
    seen.add(id)
    stack.push(...next(id))
  }
  return seen
}

/**
 * The verdict of each story: the lens results narrowed to the defects that name it, plus those
 * that name no story under review (they apply to all).
 * @param {LensResult[]} results @param {string[]} ids the stories under review
 * @returns {Map<string, { verdict: string, findings: Defect[] }>}
 */
export const storyVerdicts = (results, ids) => new Map(ids.map((id) => {
  const narrowed = results.map((result) => narrowTo(result, id, ids))
  const review = computeVerdict('discuss', narrowed)
  const findings = Object.values(review.lenses).flatMap((lens) => lens.findings).filter(atLeastMedium)
  return [id, { verdict: review.verdict, findings }]
}))

/** @param {LensResult} result @param {string} id @param {string[]} ids */
const narrowTo = (result, id, ids) => {
  if (!Array.isArray(result.defects)) return result
  const defects = result.defects.filter((d) => String(d.story ?? '') === id || !ids.includes(String(d.story ?? '')))
  return { ...result, defects, verdict: verdictAfter(result, defects) }
}
