// The planning review of one epic, read story by story. Before any verdict, the lens defects that
// talk about a dependency are sorted by what the approved map already says:
//   - every story the defect names is one this story waits on (its `after`, followed through the
//     map): the dependency is declared and ordered, it passes Independent and G2
//     (invest-checklist) — the defect is dismissed;
//   - the defect names a story that waits on this one: the map orders them the other way round,
//     and adding the dependency would make a cycle — the defect is kept;
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
 * @param {Defect} defect @param {Map<string, { after: string[], waitsOn: Set<string>, waiters: Set<string> }>} graph
 * @returns {{ kind: 'kept' | 'declared' | 'undeclared', refs: string[] }}
 */
const sortDefect = (defect, graph) => {
  const story = String(defect.story ?? '').trim()
  const text = `${defect.location ?? ''} ${defect.description ?? ''}`
  if (!graph.has(story) || !DEPENDENCY_TALK.test(text) || OTHER_LETTER.test(text)) return { kind: 'kept', refs: [] }
  const refs = [...new Set(text.match(STORY_REF) ?? [])].filter((id) => id !== story && graph.has(id))
  if (!refs.length) return { kind: 'kept', refs }
  const { waitsOn, waiters } = /** @type {{ waitsOn: Set<string>, waiters: Set<string> }} */ (graph.get(story))
  const undeclared = refs.filter((id) => !waitsOn.has(id))
  if (!undeclared.length) return { kind: 'declared', refs }
  return undeclared.some((id) => waiters.has(id)) ? { kind: 'kept', refs: [] } : { kind: 'undeclared', refs: undeclared }
}

/** @param {Defect} defect @param {string} lens @param {string[]} add @param {Map<string, { after: string[] }>} graph @returns {SliceProposal} */
const proposalOf = (defect, lens, add, graph) => {
  const story = String(defect.story)
  const after = /** @type {{ after: string[] }} */ (graph.get(story)).after
  return { story, add, lens, gate: defect.gate, description: String(defect.description ?? ''), after, proposed: [...after, ...add] }
}

/**
 * For each story, the stories the map orders against it, followed through `after`: those it waits
 * on, and apart those that wait on it.
 * @param {import('./story-map.mjs').StoryMap} map
 */
const orderOf = (map) => {
  const after = new Map(storiesOf(map).map((s) => [s.id, s.after]))
  const waitersOf = (id) => [...after].filter(([, list]) => list.includes(id)).map(([other]) => other)
  const waitsOnOf = (id) => after.get(id) ?? []
  return new Map([...after].map(([id, list]) => [id, { after: list, waitsOn: reach(id, waitsOnOf), waiters: reach(id, waitersOf) }]))
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
 * Only the stories under review are judged: a defect naming another story of the epic — one held
 * before the review, or one already approved — is discarded, whatever the lens saw of it.
 * @param {LensResult[]} results @param {string[]} judged the stories under review @param {string[]} epic every story of the epic
 * @returns {{ results: LensResult[], discarded: Array<Defect & { lens: string }> }}
 */
export const judgedOnly = (results, judged, epic) => {
  const discarded = []
  const kept = results.map((result) => {
    if (!Array.isArray(result.defects)) return result
    const defects = result.defects.filter((defect) => {
      const story = String(defect.story ?? '').trim()
      const outside = epic.includes(story) && !judged.includes(story)
      if (outside) discarded.push({ ...defect, lens: result.lens })
      return !outside
    })
    return { ...result, defects, verdict: verdictAfter(result, defects) }
  })
  return { results: kept, discarded }
}

/**
 * The verdict of each story: the lens results narrowed to the defects that name it, plus those
 * that name no story of the epic (they apply to all). A defect naming another story of the epic
 * never lands on this one.
 * @param {LensResult[]} results @param {string[]} ids the stories under review @param {string[]} [epic] every story of the epic
 * @returns {Map<string, { verdict: string, findings: Defect[] }>}
 */
export const storyVerdicts = (results, ids, epic = ids) => new Map(ids.map((id) => {
  const narrowed = results.map((result) => narrowTo(result, id, [...new Set([...ids, ...epic])]))
  const review = computeVerdict('discuss', narrowed)
  const findings = Object.values(review.lenses).flatMap((lens) => lens.findings).filter(atLeastMedium)
  return [id, { verdict: review.verdict, findings }]
}))

/** @param {LensResult} result @param {string} id @param {string[]} ids the stories a defect may name */
const narrowTo = (result, id, ids) => {
  if (!Array.isArray(result.defects)) return result
  const defects = result.defects.filter((d) => String(d.story ?? '') === id || !ids.includes(String(d.story ?? '')))
  return { ...result, defects, verdict: verdictAfter(result, defects) }
}
