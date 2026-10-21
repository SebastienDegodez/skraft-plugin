// The reviewer's reading of a backlog: every story of the map with, for each INVEST letter and each
// of the eight Definition of Ready items, a status and the evidence behind it. The evidence comes
// from three places only, never from a guess: the story-file checks (story.mjs), the story map
// (after, effort, held-back stories) and the findings of the planning lenses.
import { STORY_RULES, checkStory, openQuestionsOf } from '../story.mjs'
import { buildOrder, checkStoryMap } from '../story-map.mjs'

export const INVEST = Object.freeze(['I', 'N', 'V', 'E', 'S', 'T'])
export const DOR = Object.freeze(['1', '2', '3', '4', '5', '6', '7', '8'])
export const LINES = Object.freeze([...INVEST, ...DOR])

/** The lines the map alone can judge, before the story file is written. */
const FROM_MAP = new Set(['I', 'S'])

/** Where each antipattern a lens names lands (planning-review-criteria, G8). */
export const ANTIPATTERNS = Object.freeze({
  'Implement-X': { dor: ['1'], invest: ['N', 'V'] },
  'Giant Story': { dor: ['6'], invest: ['S'] },
  'No Examples': { dor: ['3'], invest: ['T'] },
  'Technical AC': { dor: ['4'], invest: ['N'] },
  'Generic Data': { dor: ['3'], invest: ['T'] },
  'Tests After Code': { dor: [], invest: ['T'] },
  'Vague Persona': { dor: ['2'], invest: ['V'] },
  'Missing Dependencies': { dor: ['8'], invest: ['I'] },
})

const LETTER_WORDS = Object.freeze({
  I: /independen|ind[ée]pendan/i,
  N: /negotiab|n[ée]gociab/i,
  V: /valuable|valeur/i,
  E: /estimab/i,
  S: /\bsmall\b|\bpetite?\b/i,
  T: /testab/i,
})

const DOR_WORDS = Object.freeze([
  ['1', /problem statement|[ée]nonc[ée] du probl[èe]me/i],
  ['2', /persona/i],
  ['3', /domain examples?|exemples? du domaine/i],
  ['4', /\bUAT\b|scenario|sc[ée]nario/i],
  ['5', /derived|d[ée]riv/i],
  ['6', /right-?sized|bien dimensionn/i],
  ['7', /technical notes?|notes? techniques?/i],
  ['8', /dependenc|d[ée]pendance/i],
])

/** Gates whose place does not depend on the finding's words (planning-review-criteria). */
const GATE_PLACES = Object.freeze({
  G2: { invest: ['I'], dor: [] },
  G3: { invest: ['T'], dor: ['4'] },
  G4: { invest: ['T'], dor: ['4'] },
  G5: { invest: ['S'], dor: [] },
  G6: { invest: ['I'], dor: [] },
})

/** @typedef {'pass' | 'pending' | 'warn' | 'fail'} Status */
/**
 * @typedef {{ source: 'check' | 'lens' | 'map', status: 'warn' | 'fail', message: string, rule?: string,
 *   params?: Record<string, unknown>, target: string, gate?: string, severity?: string, lens?: string, suggestion?: string }} Evidence
 * @typedef {{ status: Status, facts: Record<string, unknown>, evidence: Evidence[] }} Line
 * @typedef {{ gate: string, severity: string, lens: string, epic: string, story?: string, location?: string, description: string, suggestion?: string }} LensFinding
 */

const RANK = Object.freeze({ pass: 0, pending: 1, warn: 2, fail: 3 })

/** @param {Status[]} statuses @returns {Status} the most severe status, pass when none */
export const worst = (statuses) => statuses.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), /** @type {Status} */ ('pass'))

/**
 * The antipatterns a text names.
 * @param {string} text
 */
export const antipatternsIn = (text) => Object.keys(ANTIPATTERNS).filter((name) => text.toLowerCase().includes(name.toLowerCase()))

/**
 * The INVEST letters and DoR items a lens finding accuses: by its gate, then by its words.
 * @param {{ gate: string, location?: string, description?: string }} finding
 * @returns {{ invest: string[], dor: string[] }}
 */
export const placesOf = (finding) => {
  const text = `${finding.location ?? ''} ${finding.description ?? ''}`
  const named = antipatternsIn(text).map((name) => ANTIPATTERNS[name])
  const fixed = GATE_PLACES[finding.gate]
  if (fixed) return fixed
  if (finding.gate === 'G1') return { invest: unique([...INVEST.filter((l) => LETTER_WORDS[l].test(text)), ...named.flatMap((p) => p.invest)]), dor: [] }
  if (finding.gate === 'G7') {
    const numbered = [...text.matchAll(/DoR\s*(?:item\s*)?#?([1-8])\b/gi)].map((m) => m[1])
    return { invest: [], dor: unique(numbered.length ? numbered : DOR_WORDS.filter(([, words]) => words.test(text)).map(([item]) => item)) }
  }
  if (finding.gate === 'G8') return { invest: unique(named.flatMap((p) => p.invest)), dor: unique(named.flatMap((p) => p.dor)) }
  return { invest: [], dor: [] }
}

/** @template T @param {T[]} values @returns {T[]} */
const unique = (values) => [...new Set(values)]

/**
 * @typedef {{
 *   slug: string,
 *   inventory: import('../prd-inventory.mjs').Inventory | null,
 *   map: import('../story-map.mjs').StoryMap,
 *   files: Map<string, any>,
 *   fingerprints: Map<string, string>,
 *   contents?: Map<string, string>,
 *   progress?: { run: { phase: string, status: string, startedAt: string, endedAt?: string, mode?: string }, stories: Record<string, { step: string, attempt?: number, at: string }> } | null,
 *   reviews: Map<string, { attempt: number, review: any }>,
 *   plan: { issues: any[], links: any[], milestones: any[], labels: any[], notReady: Record<string, string[]> } | null,
 *   published: Record<string, { number: number, url?: string }>,
 *   reviewed: Record<string, { at: string, fingerprint: string }>,
 *   repo: string | null,
 *   handoff: { exists: boolean, reviewed: boolean },
 * }} RawBacklog
 */

/** @param {RawBacklog} raw */
export const assessBacklog = (raw) => {
  const { map, inventory } = raw
  const known = new Set((inventory?.requirements ?? []).map((r) => r.id))
  const lensFindings = findingsOf(raw.reviews)
  const epicOf = new Map(map.epics.flatMap((epic) => epic.stories.map((story) => [story.id, epic.id])))
  const planned = new Set((raw.plan?.issues ?? []).filter((i) => i.kind === 'story').map((i) => i.id))
  const notReady = new Map(Object.entries(raw.plan?.notReady ?? {}))
  const stories = buildOrder(map).map((story) => {
    const own = lensFindings.filter((f) => f.story === story.id)
    const current = own.filter((f) => !isStale(raw, f))
    return {
      ...assessStory({ story, epic: /** @type {string} */ (epicOf.get(story.id)), raw, known, planned, notReady, findings: current }),
      staleFindings: own.length - current.length,
      progress: raw.progress?.stories?.[story.id] ?? null,
    }
  })
  const ids = new Set(stories.map((s) => s.id))
  const fr = (inventory?.requirements ?? []).filter((r) => r.kind === 'FR').map((r) => r.id)
  const covered = new Set(map.epics.flatMap((e) => e.stories.flatMap((s) => s.covers)))
  const deferred = new Set((map.deferred ?? []).map((d) => d.id))
  const count = (predicate) => stories.filter(predicate).length
  return {
    slug: raw.slug,
    language: inventory?.language === 'fr' ? 'fr' : 'en',
    repo: raw.repo,
    run: raw.progress?.run ?? null,
    handoff: raw.handoff,
    hasPlan: raw.plan !== null,
    mapCheck: inventory ? checkStoryMap(map, inventory) : { problems: [], warnings: [] },
    coverage: { fr: fr.length, covered: fr.filter((id) => covered.has(id)).length, deferred: fr.filter((id) => deferred.has(id)).length },
    milestones: map.milestones.map(({ id, title, dueOn }) => ({ id, title, dueOn: dueOn ?? null })),
    epics: map.epics.map((epic) => ({
      id: epic.id, title: epic.title, outcome: epic.outcome, covers: epic.covers, doneWhen: epic.doneWhen,
      verdict: raw.reviews.get(epic.id)?.review?.verdict ?? null, attempt: raw.reviews.get(epic.id)?.attempt ?? null,
      findings: lensFindings.filter((f) => f.epic === epic.id && !ids.has(String(f.story ?? ''))),
      stories: epic.stories.map((s) => s.id),
    })),
    stories,
    counts: {
      stories: stories.length,
      written: count((s) => s.file !== null),
      refused: count((s) => s.state === 'refused'),
      held: count((s) => s.state === 'held'),
      ready: count((s) => s.state === 'ready'),
      reviewed: count((s) => s.state === 'ready' && s.review === 'reviewed'),
      published: count((s) => s.state === 'published'),
    },
  }
}

/**
 * Every finding of the latest review of each epic, with its lens and its epic.
 * @param {RawBacklog['reviews']} reviews
 * @returns {LensFinding[]}
 */
const findingsOf = (reviews) => [...reviews].flatMap(([epic, { review }]) => Object.entries(review?.lenses ?? {})
  .flatMap(([lens, result]) => (Array.isArray(result?.findings) ? result.findings : []).map((f) => ({
    ...f, lens, epic, severity: String(f.severity ?? 'low').toLowerCase(), description: String(f.description ?? ''),
    ...(f.story === undefined || f.story === null ? {} : { story: String(f.story) }),
  }))))

/**
 * A lens finding made on another version of the story file than the one on disk: the story was
 * rewritten since (a correction, a rework, a split), so the finding no longer describes it.
 * @param {RawBacklog} raw @param {LensFinding} finding
 */
const isStale = (raw, finding) => {
  const judged = raw.reviews.get(finding.epic)?.review?.judged?.[/** @type {string} */ (finding.story)]
  const current = raw.contents?.get(/** @type {string} */ (finding.story))
  return typeof judged === 'string' && typeof current === 'string' && judged !== current
}

/**
 * @param {{ story: import('../story-map.mjs').MapStory, epic: string, raw: RawBacklog, known: Set<string>,
 *   planned: Set<string>, notReady: Map<string, string[]>, findings: LensFinding[] }} input
 */
const assessStory = ({ story, epic, raw, known, planned, notReady, findings }) => {
  const file = raw.files.get(story.id) ?? null
  const checks = file ? checkStory(file, { ...story, epic }, known.size ? known : new Set(story.covers)) : null
  /** @type {Record<string, Evidence[]>} */
  const evidence = Object.fromEntries(LINES.map((line) => [line, []]))
  for (const detail of checks?.details ?? []) {
    const rule = STORY_RULES[detail.rule]
    const entry = { source: /** @type {const} */ ('check'), status: detail.kind === 'problem' ? /** @type {const} */ ('fail') : /** @type {const} */ ('warn'),
      rule: detail.rule, params: detail.params, message: detail.message, target: rule.target }
    for (const line of [...rule.invest, ...(rule.dor === null ? [] : [String(rule.dor)])]) evidence[line].push(entry)
  }
  const unplaced = []
  for (const finding of findings) {
    const places = placesOf(finding)
    const entry = { source: /** @type {const} */ ('lens'), status: finding.severity === 'low' ? /** @type {const} */ ('warn') : /** @type {const} */ ('fail'),
      message: finding.description, gate: finding.gate, severity: finding.severity, lens: finding.lens, suggestion: finding.suggestion, target: targetOf(places) }
    const lines = [...places.invest, ...places.dor]
    if (!lines.length) unplaced.push(finding)
    for (const line of lines) evidence[line].push(entry)
  }
  const blockers = story.after.filter((id) => notReady.has(id))
  for (const id of blockers) evidence.I.push(mapEvidence('held-blocker', { story: id }, `waits on ${id}, which is held back`, 'dependencies'))
  const points = file?.effort?.points ?? story.effort
  if (points === 8) evidence.S.push(mapEvidence('effort-at-limit', { points }, 'effort 8 is the top of the scale', 'effort'))
  const questions = openQuestionsOf(file?.openQuestions, raw.answers?.[story.id] ?? {}).filter((q) => !q.answer)
  if (questions.length) evidence.E.push(mapEvidence('open-questions', { count: questions.length }, `${questions.length} open question(s)`, 'questions'))
  const lines = Object.fromEntries(LINES.map((line) => {
    const status = evidence[line].length ? worst(evidence[line].map((e) => e.status)) : file || FROM_MAP.has(line) ? 'pass' : 'pending'
    return [line, { status, facts: factsOf(line, story, file, blockers), evidence: evidence[line] }]
  }))
  const state = stateOf(story.id, file, checks, raw, planned, notReady)
  const fingerprint = raw.fingerprints.get(story.id) ?? null
  const mark = raw.reviewed[story.id]
  return {
    id: story.id, epic, title: file?.title ?? story.title, persona: file?.persona ?? story.persona, description: file?.description ?? story.description,
    milestone: story.milestone, moscow: story.moscow, effort: points, tracer: story.tracer === true, after: story.after, covers: story.covers,
    file, fingerprint, state,
    reasons: state === 'refused' ? /** @type {string[]} */ (checks?.problems) : state === 'held' ? notReady.get(story.id) ?? [] : [],
    published: raw.published[story.id] ?? null,
    review: !mark ? 'none' : mark.fingerprint === fingerprint ? 'reviewed' : 'stale',
    reviewedAt: mark?.at ?? null,
    invest: Object.fromEntries(INVEST.map((l) => [l, lines[l]])),
    dor: Object.fromEntries(DOR.map((d) => [d, lines[d]])),
    findings, unplaced,
    antipatterns: unique([
      ...(checks?.details ?? []).map((d) => STORY_RULES[d.rule].antipattern).filter((name) => typeof name === 'string'),
      ...findings.flatMap((f) => antipatternsIn(`${f.location ?? ''} ${f.description}`)),
    ]),
    verdict: worst(LINES.map((line) => lines[line].status)),
  }
}

/** @param {string} rule @param {Record<string, unknown>} params @param {string} message @param {string} target @returns {Evidence} */
const mapEvidence = (rule, params, message, target) => ({ source: 'map', status: 'warn', rule, params, message, target })

/** The part of the story sheet a lens finding accuses. @param {{ invest: string[], dor: string[] }} places */
const targetOf = ({ invest, dor }) => {
  if (dor.includes('3')) return 'examples'
  if (dor.includes('4') || dor.includes('5') || invest.includes('T')) return 'criteria'
  if (dor.includes('8') || invest.includes('I')) return 'dependencies'
  if (dor.includes('7')) return 'notes'
  if (dor.includes('6') || invest.includes('S') || invest.includes('E')) return 'effort'
  return 'statement'
}

/**
 * The values a line answers with, whether it holds or not.
 * @param {string} line @param {import('../story-map.mjs').MapStory} story @param {any} file @param {string[]} blockers
 */
const factsOf = (line, story, file, blockers) => {
  const criteria = Array.isArray(file?.acceptanceCriteria) ? file.acceptanceCriteria : []
  const examples = Array.isArray(file?.examples) ? file.examples : []
  const exampleIds = new Set(examples.map((e) => e?.id))
  const written = file !== null
  const facts = {
    I: () => ({ after: story.after, held: blockers }),
    N: () => ({ iWant: file?.story?.iWant ?? null }),
    V: () => ({ persona: file?.persona ?? story.persona, soThat: file?.story?.soThat ?? null }),
    E: () => ({ points: file?.effort?.points ?? story.effort, tasks: written ? (file.tasks ?? []).length : null }),
    S: () => ({ points: file?.effort?.points ?? story.effort, criteria: written ? criteria.length : null }),
    T: () => ({ criteria: written ? criteria.length : null, linked: written ? criteria.filter((c) => exampleIds.has(c?.example)).length : null, examples: written ? examples.length : null }),
    1: () => ({ iWant: file?.story?.iWant ?? null }),
    2: () => ({ persona: file?.persona ?? story.persona }),
    3: () => ({ examples: written ? examples.length : null }),
    4: () => ({ criteria: written ? criteria.length : null }),
    5: () => ({ linked: written ? criteria.filter((c) => exampleIds.has(c?.example)).length : null, criteria: written ? criteria.length : null }),
    6: () => ({ points: file?.effort?.points ?? story.effort }),
    7: () => ({ notes: written ? (file.technicalNotes ?? []).length : null }),
    8: () => ({ dependencies: written && Array.isArray(file.dependencies) ? file.dependencies.map((d) => d?.story) : story.after }),
  }
  return facts[line]()
}

/**
 * Where the story stands in the workflow.
 * @param {string} id @param {any} file @param {import('../story.mjs').StoryFindings | null} checks
 * @param {RawBacklog} raw @param {Set<string>} planned @param {Map<string, string[]>} notReady
 * @returns {'unwritten' | 'refused' | 'written' | 'held' | 'ready' | 'published'}
 */
const stateOf = (id, file, checks, raw, planned, notReady) => {
  if (raw.published[id]) return 'published'
  if (planned.has(id)) return 'ready'
  if (notReady.has(id)) return checks?.problems.length ? 'refused' : 'held'
  if (!file) return 'unwritten'
  return checks?.problems.length ? 'refused' : 'written'
}
